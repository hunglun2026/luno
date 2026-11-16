// 全班成績總表：worker/src/livescores.js（純函式）＋ GET /api/live-scores/:shareId 的權限與資料流。
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req, registerUser } from "./helpers.js";
import { buildScoreTable } from "../src/livescores.js";

const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});
const auth = (u) => ({ "X-Session-Token": u.token });

const Q1 = { q: "1+1", o: ["1", "2", "3", "4"], a: "B", s: 30 };
const Q2 = { q: "哪些是偶數", o: ["1", "2", "3", "4"], a: "BD", s: 30 };
const Q3 = { q: "填空", o: [], a: "答案", s: 40 };
const row = (name, seat, answers) => ({ studentId: name, name, seat, answered: answers.length, total: 3, answers });

describe("buildScoreTable", () => {
  it("選擇題與複選題計分、填空題文字比對並標記待看；總分與統計正確", () => {
    const t = buildScoreTable([Q1, Q2, Q3], [
      row("甲", "2", [{ i: 0, selected: "B" }, { i: 1, selected: "DB" }, { i: 2, selected: "答案" }]),
      row("乙", "1", [{ i: 0, selected: "A" }, { i: 1, selected: "B" }, { i: 2, selected: "錯" }]),
    ]);
    expect(t.maxScore).toBe(100);
    expect(t.students.map((s) => s.name)).toEqual(["乙", "甲"]);
    const [yi, jia] = t.students;
    expect(jia).toMatchObject({ score: 100, textCount: 1 });
    expect(yi).toMatchObject({ score: 0, textCount: 1 });
    expect(jia.perQ).toEqual([30, 30, 40]);
    expect(t.summary).toMatchObject({ count: 2, average: 50, highest: 100, lowest: 0 });
  });
  it("沒作答的題 perQ 是 null；沒人作答時統計是 null，不除以零", () => {
    const t = buildScoreTable([Q1], [{ studentId: "s", name: "丙", seat: "", answered: 0, total: 1, answers: [] }]);
    expect(t.students[0].perQ).toEqual([null]);
    expect(t.summary).toMatchObject({ count: 1, average: null, highest: null, lowest: null });
  });
  it("沒座號的排在最後", () => {
    const t = buildScoreTable([Q1], [row("無", "", [{ i: 0, selected: "B" }]), row("有", "5", [{ i: 0, selected: "B" }])]);
    expect(t.students.map((s) => s.name)).toEqual(["有", "無"]);
  });
});

describe("GET /api/live-scores/:shareId", () => {
  async function setup() {
    const env = makeEnv();
    const teacher = await registerUser(worker, env);
    const share = await (await call(env, "/api/share", { method: "POST", body: { items: [Q1, Q2], title: "測", mode: "instant" } })).json();
    await call(env, "/api/live-progress", {
      method: "POST",
      body: { shareId: share.id, studentId: "s1", studentInfo: { name: "小明", seat: "3" }, answered: 2, total: 2, answers: [{ i: 0, selected: "B" }, { i: 1, selected: "BD" }] },
    });
    return { env, teacher, share };
  }
  it("儀表板金鑰與老師登入都能看，分數正確", async () => {
    const { env, teacher, share } = await setup();
    for (const headers of [{ "X-Dash-Key": share.dashKey }, auth(teacher)]) {
      const r = await call(env, "/api/live-scores/" + share.id, { headers });
      expect(r.status).toBe(200);
      const d = await r.json();
      expect(d.maxScore).toBe(60);
      expect(d.students[0]).toMatchObject({ name: "小明", score: 60 });
    }
  });
  it("沒登入、學生、錯的金鑰都擋下", async () => {
    const { env, share } = await setup();
    const student = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined });
    expect((await call(env, "/api/live-scores/" + share.id)).status).toBe(401);
    expect((await call(env, "/api/live-scores/" + share.id, { headers: auth(student) })).status).toBe(401);
    expect((await call(env, "/api/live-scores/" + share.id, { headers: { "X-Dash-Key": "wrong-guess" } })).status).toBe(401);
  });
  it("按過停止監看，金鑰連結失效", async () => {
    const { env, share } = await setup();
    await call(env, "/api/live-revoke", { method: "POST", body: { shareId: share.id }, headers: { "X-Dash-Key": share.dashKey } });
    expect((await call(env, "/api/live-scores/" + share.id, { headers: { "X-Dash-Key": share.dashKey } })).status).toBe(403);
  });
});
