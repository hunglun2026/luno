// 配分純函式：public/js/scoring.js（用 vm 載入，同 frontend-qtypes.test.js）。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const api = vm.runInNewContext(
  readFileSync(join(JS, "qtypes.js"), "utf8") + "\n" + readFileSync(join(JS, "scoring.js"), "utf8") + "\n;({ lqSpreadScores, lqTotalScore })", {});
const mk = (n) => Array.from({ length: n }, (_, i) => ({ q: "q" + i, o: ["a", "b"], a: "A", s: 0 }));
const sum = (a) => a.reduce((x, y) => x + y, 0);

describe("lqSpreadScores 配分", () => {
  it("平均：7 題 100 分剛好加起來 100，每題差不超過 1", () => {
    const s = api.lqSpreadScores(mk(7), 100, "even");
    expect(sum(s)).toBe(100);
    expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
  });
  it("後面加重：總分不變，最後一題不低於第一題", () => {
    const s = api.lqSpreadScores(mk(10), 100, "ramp");
    expect(sum(s)).toBe(100);
    expect(s[9]).toBeGreaterThanOrEqual(s[0]);
  });
  it("非選擇題 2 倍：填充題分數高於選擇題", () => {
    const items = [{ q: "a", o: ["1", "2"], a: "A" }, { q: "b", o: [], a: "x" }];
    const s = api.lqSpreadScores(items, 30, "typed");
    expect(sum(s)).toBe(30);
    expect(s[1]).toBeGreaterThan(s[0]);
  });
  it("總分小於題數：不硬塞每題 1 分，仍然加起來等於總分", () => {
    expect(sum(api.lqSpreadScores(mk(10), 5, "even"))).toBe(5);
  });
  it("總分不合法或沒題目：回空陣列", () => {
    expect(api.lqSpreadScores(mk(3), 0, "even")).toEqual([]);
    expect(api.lqSpreadScores([], 100, "even")).toEqual([]);
  });
  it("lqTotalScore 加總各題 s", () => {
    expect(api.lqTotalScore([{ s: 10 }, { s: "5" }, {}])).toBe(15);
  });
});
