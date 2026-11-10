// 全班答題分析：worker/src/livestats.js（純函式）＋ GET /api/live-stats/:shareId 的權限與資料流。
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req, registerUser } from "./helpers.js";
import { correctLetters, buildStats } from "../src/livestats.js";

const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});
const auth = (u) => ({ "X-Session-Token": u.token });

const Q1 = { q: "1+1", o: ["1", "2", "3", "4"], a: "B", s: 10 };
const Q2 = { q: "哪些是偶數", o: ["1", "2", "3", "4"], a: "BD", s: 10 };
const Q3 = { q: "填空題", o: [], a: "答案", s: 10 };
const rows = (...list) => list.map((answers) => ({ answers }));

describe("correctLetters", () => {
  it("單選、複選、含逗號；沒有選項的題回 null；超出選項數的字母忽略", () => {
    expect(correctLetters(Q1)).toBe("B");
    expect(correctLetters(Q2)).toBe("BD");
    expect(correctLetters({ ...Q2, a: "d, b" })).toBe("BD");
    expect(correctLetters(Q3)).toBe(null);
    expect(correctLetters({ q: "x", o: ["a", "b"], a: "Z" })).toBe(null);
  });
});

describe("buildStats", () => {
  it("答對率、各選項人數；填空題不納入", () => {
    const st = buildStats([Q1, Q2, Q3], rows(
      [{ i: 0, selected: "B" }, { i: 1, selected: "BD" }],
      [{ i: 0, selected: "A" }, { i: 1, selected: "B" }],
      [{ i: 0, selected: "B" }, { i: 1, selected: "DB" }],
    ));
    expect(st.students).toBe(3);
    expect(st.questions.map((x) => x.i)).toEqual([0, 1]);
    const [a, b] = st.questions;
    expect(a).toMatchObject({ answered: 3, correct: 2, rate: 67, key: "B" });
    expect(a.counts).toEqual({ A: 1, B: 2, C: 0, D: 0 });
    expect(b).toMatchObject({ answered: 3, correct: 2, rate: 67, key: "BD" });   // 複選：選項順序不同也算對
    expect(b.counts).toEqual({ A: 0, B: 3, C: 0, D: 2 });
  });
  it("沒人作答的題 rate 是 null；沒選也不算作答", () => {
    const st = buildStats([Q1], rows([{ i: 0, selected: "  " }], []));
    expect(st.questions[0]).toMatchObject({ answered: 0, correct: 0, rate: null });
  });
  it("最需要檢討：至少 2 人作答、答對率最低的前 3 題，100% 的不列", () => {
    const items = [Q1, Q1, Q1, Q1, Q1];
    const r = rows(
      [{ i: 0, selected: "B" }, { i: 1, selected: "A" }, { i: 2, selected: "A" }, { i: 3, selected: "B" }, { i: 4, selected: "A" }],
      [{ i: 0, selected: "B" }, { i: 1, selected: "A" }, { i: 2, selected: "B" }, { i: 3, selected: "A" }],
    );
    const st = buildStats(items, r);
    expect(st.hardest).toEqual([1, 2, 3]);   // 第 1 題 0%、第 2 題 50%、第 3 題 50%（人數相同照題號）；第 0 題 100% 不列；第 4 題只有 1 人不排
  });
  it("選到不存在的字母不會讓計數壞掉", () => {
    const st = buildStats([Q1], rows([{ i: 0, selected: "Z" }, ]));
    expect(st.questions[0].counts).toEqual({ A: 0, B: 0, C: 0, D: 0 });
  });
});

describe("GET /api/live-stats/:shareId", () => {
  const items = [Q1, Q2];
  async function setup() {
    const env = makeEnv();
    const teacher = await registerUser(worker, env);
    const share = await (await call(env, "/api/share", { method: "POST", body: { items, title: "測", mode: "instant" } })).json();
    const push = (sid, answers) => call(env, "/api/live-progress", {
      method: "POST",
      body: { shareId: share.id, studentId: sid, studentInfo: { name: sid }, answered: answers.length, total: 2, answers },
    });
    await push("s1", [{ i: 0, selected: "B" }, { i: 1, selected: "BD" }]);
    await push("s2", [{ i: 0, selected: "A" }]);
    return { env, teacher, share };
  }

  it("儀表板金鑰、老師登入、管理者密碼都能看，內容正確", async () => {
    const { env, teacher, share } = await setup();
    for (const headers of [{ "X-Dash-Key": share.dashKey }, auth(teacher)]) {
      const r = await call(env, "/api/live-stats/" + share.id, { headers });
      expect(r.status).toBe(200);
      const d = await r.json();
      expect(d.students).toBe(2);
      expect(d.questions[0]).toMatchObject({ answered: 2, correct: 1, rate: 50 });
      expect(d.hardest).toEqual([0]);
    }
  });
  it("沒登入、學生、錯的金鑰都擋下（學生不能偷看全班答案）", async () => {
    const { env, share } = await setup();
    const student = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined });
    expect((await call(env, "/api/live-stats/" + share.id)).status).toBe(401);
    expect((await call(env, "/api/live-stats/" + share.id, { headers: auth(student) })).status).toBe(401);
    expect((await call(env, "/api/live-stats/" + share.id, { headers: { "X-Dash-Key": "wrong-guess" } })).status).toBe(401);
  });
  it("按過停止監看，金鑰連結失效；老師帳號仍可看", async () => {
    const { env, teacher, share } = await setup();
    await call(env, "/api/live-revoke", { method: "POST", body: { shareId: share.id }, headers: { "X-Dash-Key": share.dashKey } });
    expect((await call(env, "/api/live-stats/" + share.id, { headers: { "X-Dash-Key": share.dashKey } })).status).toBe(403);
    expect((await call(env, "/api/live-stats/" + share.id, { headers: auth(teacher) })).status).toBe(200);
  });
  it("找不到分享 404；方法不對 405；亂編 id 400", async () => {
    const { env, teacher } = await setup();
    expect((await call(env, "/api/live-stats/nosuchshare1", { headers: auth(teacher) })).status).toBe(404);
    expect((await call(env, "/api/live-stats/x", { method: "POST", headers: auth(teacher) })).status).toBe(405);
    expect((await call(env, "/api/live-stats/" + encodeURIComponent("a b/c"), { headers: auth(teacher) })).status).toBe(400);
  });
});
