// 閱讀題組純函式：public/js/passage.js（用 vm 載入，同 frontend-scoring.test.js）。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const api = vm.runInNewContext(
  readFileSync(join(JS, "passage.js"), "utf8") +
    "\n;({ ptNormalizeBatch, ptTextFor, ptIsFirst, ptKeep, ptHandOver, ptRehome, ptHtml, ptPrompt, PT_MAX_CHARS })", {});
const esc = (s) => String(s).replace(/</g, "&lt;");
const Q = (q, extra = {}) => ({ q, o: ["甲", "乙"], a: "A", e: "解", s: 10, ...extra });

describe("ptNormalizeBatch 整理一組", () => {
  it("文章只留在第一題，全部標同一個組代號", () => {
    const out = api.ptNormalizeBatch([Q("一", { pt: "文章" }), Q("二", { pt: "多餘" }), Q("三")], 2);
    expect(out.map((q) => q.pg)).toEqual(["2", "2", "2"]);
    expect(out[0].pt).toBe("文章");
    expect(out[1].pt).toBeUndefined();
    expect(out[2].pt).toBeUndefined();
  });
  it("AI 把文章放在第二題：搬到第一題", () => {
    const out = api.ptNormalizeBatch([Q("一"), Q("二", { pt: "文章在這" })], 1);
    expect(out[0].pt).toBe("文章在這");
    expect(out[1].pt).toBeUndefined();
  });
  it("整批找不到文章：整批不要（不讓沒有文章的閱讀題混進卷子）", () => {
    expect(api.ptNormalizeBatch([Q("一"), Q("二")], 1)).toEqual([]);
    expect(api.ptNormalizeBatch([], 1)).toEqual([]);
    expect(api.ptNormalizeBatch(null, 1)).toEqual([]);
  });
  it("過長的文章截斷到上限；空白題幹的題目被丟掉", () => {
    const out = api.ptNormalizeBatch([Q("一", { pt: "字".repeat(5000) }), { q: "  ", o: ["a", "b"] }], 1);
    expect(out.length).toBe(1);
    expect(out[0].pt.length).toBe(api.PT_MAX_CHARS);
  });
  it("不改動傳進來的原物件", () => {
    const src = [Q("一", { pt: "文章" })];
    api.ptNormalizeBatch(src, 1);
    expect(src[0].pg).toBeUndefined();
  });
});

describe("文章查找與顯示", () => {
  const items = [Q("獨立"), Q("組內一", { pg: "p1", pt: "文章A" }), Q("組內二", { pg: "p1" }), Q("組二", { pg: "p2", pt: "文章B" })];
  it("ptTextFor：自己有就用自己的，否則找同組；獨立題回空字串", () => {
    expect(api.ptTextFor(items, 0)).toBe("");
    expect(api.ptTextFor(items, 1)).toBe("文章A");
    expect(api.ptTextFor(items, 2)).toBe("文章A");
    expect(api.ptTextFor(items, 3)).toBe("文章B");
    expect(api.ptTextFor(items, 99)).toBe("");
  });
  it("ptIsFirst 只有帶文章的那題是 true", () => {
    expect(items.map((_, i) => api.ptIsFirst(items, i))).toEqual([false, true, false, true]);
  });
  it("ptHtml：第一題展開、其餘收合、獨立題沒有；紙本只印第一題", () => {
    expect(api.ptHtml(items, 0, esc)).toBe("");
    expect(api.ptHtml(items, 1, esc)).toContain("pt-box");
    expect(api.ptHtml(items, 1, esc)).not.toContain("<details");
    expect(api.ptHtml(items, 2, esc)).toContain("<details");
    expect(api.ptHtml(items, 2, esc, { paper: true })).toBe("");
    expect(api.ptHtml(items, 1, esc, { paper: true })).toContain("文章A");
  });
  it("ptHtml 會跳脫文章內容（防注入）", () => {
    const evil = [Q("x", { pg: "p", pt: "<img src=x onerror=alert(1)>" })];
    const h = api.ptHtml(evil, 0, esc);
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
  });
});

describe("編輯、重出、檢查後保留文章", () => {
  it("ptKeep：新題留在同一組，原本是第一題就帶著文章", () => {
    const first = api.ptKeep(Q("舊", { pg: "p1", pt: "文" }), Q("新"));
    expect(first.pg).toBe("p1");
    expect(first.pt).toBe("文");
    const later = api.ptKeep(Q("舊", { pg: "p1" }), Q("新", { pt: "AI 亂塞" }));
    expect(later.pg).toBe("p1");
    expect(later.pt).toBeUndefined();
  });
  it("ptKeep：舊題不是題組就不動新題", () => {
    expect(api.ptKeep(Q("舊"), Q("新"))).toEqual(Q("新"));
  });
  it("ptHandOver：刪掉第一題前，文章交給同組下一題", () => {
    const items = [Q("一", { pg: "p1", pt: "文" }), Q("二", { pg: "p1" })];
    api.ptHandOver(items, 0);
    expect(items[1].pt).toBe("文");
  });
  it("ptRehome：第一題被檢查剔除後，第一個留下來的題目接手文章，其餘不帶", () => {
    const pool = [Q("一", { pg: "p1", pt: "文" }), Q("二", { pg: "p1" }), Q("三", { pg: "p1" })];
    const after = [pool[1], pool[2]].map((q) => ({ ...q }));
    api.ptRehome(after, pool);
    expect(after[0].pt).toBe("文");
    expect(after[1].pt).toBeUndefined();
  });
  it("ptRehome：多個題都帶 pt 時只留第一個", () => {
    const pool = [Q("一", { pg: "p1", pt: "文" })];
    const after = [Q("一", { pg: "p1", pt: "文" }), Q("二", { pg: "p1", pt: "文" })];
    api.ptRehome(after, pool);
    expect(after[1].pt).toBeUndefined();
  });
});

describe("ptPrompt 提示詞", () => {
  it("要求只有第 1 題帶 pt、欄位順序讓 pt 落在 s 之前（搶救截斷 JSON 的 regex 依賴 q…s）", () => {
    const p = api.ptPrompt(3, 1, "國小四年級");
    expect(p).toContain("只有第 1 題");
    expect(p).toContain("q、o、a、e、pt");
    expect(p.indexOf("pt")).toBeLessThan(p.lastIndexOf("s。"));
    expect(p).toContain("3 題");
  });
  it("文章長度依年級調整", () => {
    expect(api.ptPrompt(3, 1, "國小一年級")).toContain("80～150");
    expect(api.ptPrompt(3, 1, "國小六年級")).toContain("250～400");
    expect(api.ptPrompt(3, 1, "高中二年級")).toContain("300～500");
  });
});
