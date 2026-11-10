// 學生版題目不含答案＋伺服器端判分（2026-11-11）。重點：沒有金鑰就拿不到答案；判分結果跟前端原本的本機判分一致。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import worker from "../src/index.js";
import { makeEnv, req } from "./helpers.js";
import { getCorrectLetters, publicItem, gradeShareAnswers } from "../src/sharegrade.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});

const MATCH = { q: "連連看", t: "match", l: ["蘋果", "香蕉", "西瓜"], r: ["Apple", "Banana", "Watermelon"], e: "水果", s: 30 };
const ORDER = { q: "排先後", t: "order", l: ["起床", "刷牙", "上學", "放學"], e: "一天", s: 20 };
const ITEMS = [
  { q: "單選", o: ["甲", "乙", "丙"], a: "B", e: "選乙", s: 10 },
  { q: "複選", o: ["甲", "乙", "丙"], a: ["A", "C"], e: "選甲丙", s: 10 },
  { q: "填空", o: [], a: "玉山", e: "最高峰", s: 10 },
  MATCH,
  ORDER,
];

async function makeShare(env, items = ITEMS) {
  return await (await call(env, "/api/share", { method: "POST", body: { items, title: "測" } })).json();
}

describe("學生版題目不含答案", () => {
  it("沒有金鑰：沒有 a／e，也洗過牌；回應標 stripped", async () => {
    const env = makeEnv();
    const { id } = await makeShare(env);
    const text = await (await call(env, "/api/share/" + id)).text();
    const got = JSON.parse(text);
    expect(got.stripped).toBe(true);
    for (const it of got.items) { expect(it).not.toHaveProperty("a"); expect(it).not.toHaveProperty("e"); }
    expect(text).not.toContain("選乙");
    expect(text).not.toContain("玉山");
    expect(text).not.toContain("最高峰");
    expect(got.items[1].m).toBe(1);        // 複選題要知道用勾選框
    expect(got.items[0].m).toBeUndefined();
  });
  it("配合題、排序題：送出去的順序已洗過，且不能等於原順序（不然答案就露了）", async () => {
    const env = makeEnv();
    const { id } = await makeShare(env);
    const got = await (await call(env, "/api/share/" + id)).json();
    expect(got.items[3].pre).toBe(1);
    expect(got.items[3].r).not.toEqual(MATCH.r);
    expect([...got.items[3].r].sort()).toEqual([...MATCH.r].sort());
    expect(got.items[4].l).not.toEqual(ORDER.l);
    expect([...got.items[4].l].sort()).toEqual([...ORDER.l].sort());
  });
  it("答案金鑰、儀表板金鑰都能拿完整內容；錯的金鑰不行", async () => {
    const env = makeEnv();
    const { id, ansKey, dashKey } = await makeShare(env);
    expect(ansKey).toHaveLength(16);
    expect((await (await call(env, "/api/share/" + id + "?ak=" + ansKey)).json()).items[0].a).toBe("B");
    expect((await (await call(env, "/api/share/" + id, { headers: { "X-Ans-Key": ansKey } })).json()).items[0].e).toBe("選乙");
    expect((await (await call(env, "/api/share/" + id, { headers: { "X-Dash-Key": dashKey } })).json()).items[0].a).toBe("B");
    expect((await (await call(env, "/api/share/" + id + "?ak=wrong")).json()).stripped).toBe(true);
    expect((await (await call(env, "/api/share/" + id + "?ak=" + dashKey)).json()).stripped).toBe(true);   // 儀表板金鑰不能當答案金鑰用在 ak
  });
  it("舊分享（沒有 anskey）維持原樣", async () => {
    const env = makeEnv();
    const { id } = await makeShare(env);
    await env.COOLDOWN_KV.delete("anskey:" + id);
    const got = await (await call(env, "/api/share/" + id)).json();
    expect(got.stripped).toBeUndefined();
    expect(got.items[0].a).toBe("B");
  });
});

describe("/api/share-grade 判分", () => {
  const grade = async (env, id, answers) => (await call(env, "/api/share-grade", { method: "POST", body: { shareId: id, answers } })).json();

  it("單選、複選、填空", async () => {
    const env = makeEnv();
    const { id } = await makeShare(env);
    const r = (await grade(env, id, [{ i: 0, v: "B" }, { i: 1, v: "CA" }, { i: 2, v: " 玉 山 " }])).results;
    expect(r[0]).toMatchObject({ isCorrect: true, score: 10, correctDisplay: "B", explain: "選乙", answerText: "B" });
    expect(r[1]).toMatchObject({ isCorrect: true, score: 10, correctDisplay: "AC" });
    expect(r[2]).toMatchObject({ isCorrect: true, reviewNeeded: true, correctDisplay: "玉山" });
    const w = (await grade(env, id, [{ i: 0, v: "A" }, { i: 1, v: "A" }, { i: 2, v: "" }])).results;
    expect(w[0]).toMatchObject({ isCorrect: false, score: 0, userDisplay: "A", correctDisplay: "B" });
    expect(w[1].isCorrect).toBe(false);
    expect(w[2]).toMatchObject({ isCorrect: false, userDisplay: "(未作答)" });
  });
  it("只回送來的那幾題，不會順便給別題的答案", async () => {
    const env = makeEnv();
    const { id } = await makeShare(env);
    const r = (await grade(env, id, [{ i: 0, v: "B" }])).results;
    expect(Object.keys(r)).toEqual(["0"]);
  });
  it("配合題：學生看到的位置換回原題再判分，全對與部分對", async () => {
    const env = makeEnv();
    const { id } = await makeShare(env);
    const shown = (await (await call(env, "/api/share/" + id)).json()).items[3];   // 學生看到的洗過的 r
    // 對每個左項找到「正確的右項」在畫面上的位置
    const pos = MATCH.r.map((txt) => shown.r.indexOf(txt));
    const all = pos.map((p, li) => li + ":" + p).join(",");
    const r1 = (await grade(env, id, [{ i: 3, v: all }])).results[3];
    expect(r1).toMatchObject({ isCorrect: true, score: 30, correct: 3, n: 3 });
    // 只連對第 0 組，其餘故意連錯
    const wrong = [0 + ":" + pos[0], 1 + ":" + pos[2], 2 + ":" + pos[1]].join(",");
    const r2 = (await grade(env, id, [{ i: 3, v: wrong }])).results[3];
    expect(r2.isCorrect).toBe(false);
    expect(r2.correct).toBe(1);
    expect(r2.score).toBe(10);
    expect((await grade(env, id, [{ i: 3, v: "" }])).results[3]).toMatchObject({ answered: false, score: 0, userDisplay: "(未作答)" });
  });
  it("排序題：照畫面位置排出正確順序才全對；原樣不動不會剛好對", async () => {
    const env = makeEnv();
    const { id } = await makeShare(env);
    const shown = (await (await call(env, "/api/share/" + id)).json()).items[4].l;   // 洗過的項目
    const order = ORDER.l.map((txt) => shown.indexOf(txt)).join(",");   // 正確順序：依序是哪個畫面位置
    expect((await grade(env, id, [{ i: 4, v: order }])).results[4]).toMatchObject({ isCorrect: true, score: 20 });
    const untouched = shown.map((_, p) => p).join(",");
    expect((await grade(env, id, [{ i: 4, v: untouched }])).results[4].isCorrect).toBe(false);
  });
  it("錯誤輸入：沒有 shareId、沒有答案、過期、題號超出範圍、非 POST", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/share-grade", { method: "POST", body: { answers: [{ i: 0, v: "A" }] } })).status).toBe(400);
    const { id } = await makeShare(env);
    expect((await call(env, "/api/share-grade", { method: "POST", body: { shareId: id, answers: [] } })).status).toBe(400);
    expect((await call(env, "/api/share-grade", { method: "POST", body: { shareId: "nope0000000", answers: [{ i: 0, v: "A" }] } })).status).toBe(404);
    expect(Object.keys((await grade(env, id, [{ i: 99, v: "A" }, { i: -1, v: "A" }, { i: "x", v: "A" }])).results)).toEqual([]);
    expect((await call(env, "/api/share-grade")).status).toBe(405);
  });
});

describe("跟前端邏輯一致", () => {
  const src = readFileSync(join(ROOT, "answer.js"), "utf8");
  const start = src.indexOf("function matchOptionLetter");
  const end = src.indexOf("// 選擇/複選題在「即時模式」");
  const front = vm.runInNewContext(src.slice(start, end) + "\n;({ getCorrectLetters })", {});
  const samples = [
    { o: ["甲", "乙", "丙"], a: "B" }, { o: ["甲", "乙", "丙"], a: ["A", "C"] }, { o: ["甲", "乙", "丙"], a: 1 },
    { o: ["甲", "乙", "丙"], a: [0, 2] }, { o: ["眼睛看", "鼻子聞"], a: "鼻子聞" }, { o: ["B 型血", "A 型血"], a: "B" },
    { o: ["甲", "乙"], a: "ABCDE" }, { o: [], a: "x" }, { o: ["甲", "乙"] },
  ];
  it("getCorrectLetters 與 answer.js 結果相同", () => {
    for (const q of samples) expect(JSON.stringify(getCorrectLetters(q))).toBe(JSON.stringify(front.getCorrectLetters(q)));
  });
  it("src/qtypes.js 與 public/js/qtypes.js 一致（改了前端要跑 node sync-qtypes.mjs）", () => {
    const a = readFileSync(join(ROOT, "qtypes.js"), "utf8");
    const b = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "qtypes.js"), "utf8");
    expect(b.startsWith(a)).toBe(true);
  });
  it("publicItem 對沒有 t 的舊題、不合格的新題型都不會壞", () => {
    expect(publicItem({ q: "x", o: [], a: "1", s: 3 })).toEqual({ q: "x", s: 3, o: [] });
    expect(publicItem({ q: "x", t: "match", l: ["a"], r: ["b"], s: 1 }).o).toEqual([]);
    expect(gradeShareAnswers([], [{ i: 0, v: "A" }])).toEqual({});
  });
});
