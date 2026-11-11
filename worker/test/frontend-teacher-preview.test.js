// 老師出完題的題目預覽：public/js/teacher-preview.js。檔案不是模組，用 vm 載入（同 frontend-qtypes.test.js）。
// answer.js、sheet.js 不能單獨載入，所以 getCorrectLetters／stripOptLabel／answerKeyText 用最簡替身；
// 這裡測的是預覽自己的版面與跳脫（不能讓題目文字變成 HTML），不是判分。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const SRC = readFileSync(join(JS, "qtypes.js"), "utf8") + "\n" + readFileSync(join(JS, "teacher-preview.js"), "utf8");

const stubs = `
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function qImgHtml() { return ""; }
function getCorrectLetters(q) { return q.o && q.o.length ? String(q.a).split("") : null; }
function stripOptLabel(t) { return t; }
function answerKeyText(q) { return Array.isArray(q.a) ? q.a.join("、") : String(q.a); }
`;
const api = vm.runInNewContext(stubs + SRC + "\n;({ teacherPreviewListHtml })", {});

describe("teacherPreviewListHtml 老師題目預覽", () => {
  it("選擇題：正確選項打勾並標綠，其他不標；有答案行與解析", () => {
    const html = api.teacherPreviewListHtml([{ q: "1+1=?", o: ["1", "2", "3"], a: "B", e: "一加一等於二", s: 10 }]);
    expect(html).toContain("共 1 題");
    expect(html).toContain("is-ok'>✓ (B) 2");
    expect(html).not.toContain("✓ (A)");
    expect(html).toContain("答案：<b>B</b>");
    expect(html).toContain("解析：一加一等於二");
  });
  it("配合題與排序題：直接列出正確配對、正確順序，不重複印答案行", () => {
    const m = { q: "連連看", t: "match", l: ["蘋果", "香蕉", "西瓜"], r: ["Apple", "Banana", "Watermelon"], e: "", s: 20 };   // 題型最少 3 組（QT_MIN）
    const o = { q: "排先後", t: "order", l: ["起床", "刷牙", "上學"], e: "", s: 15 };
    const html = api.teacherPreviewListHtml([m, o]);
    expect(html).toContain("蘋果 ↔ Apple");
    expect(html).toContain("香蕉 ↔ Banana");
    expect(html).toContain("1. 起床");
    expect(html).toContain("3. 上學");
    expect(html).not.toContain("答案：");
  });
  it("填空簡答題：只有答案行", () => {
    const html = api.teacherPreviewListHtml([{ q: "台灣最高的山？", o: [], a: "玉山", s: 5 }]);
    expect(html).toContain("答案：<b>玉山</b>");
    expect(html).not.toContain("lq-tp-opt");
  });
  it("題目、選項、解析裡的 HTML 一律跳脫，不會被當成標籤", () => {
    const html = api.teacherPreviewListHtml([{ q: "<img src=x onerror=alert(1)>", o: ["<b>x</b>", "y"], a: "B", e: "<script>1</script>", s: 1 }]);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img");
  });
  it("空題目陣列不會丟錯", () => {
    expect(api.teacherPreviewListHtml([])).toContain("共 0 題");
  });
});
