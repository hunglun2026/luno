// 數學式轉一般文字測試：public/js/mathtext.js。檔案不是模組，用 vm 載入（同 frontend-qtypes.test.js）。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js", "mathtext.js"), "utf8");
const api = vm.runInNewContext(SRC + "\n;({ mathPlain, mathClean })", {});
const P = api.mathPlain;

describe("mathPlain：LaTeX 轉一般文字", () => {
  it("Steve 截圖那幾題：次方與乘法", () => {
    expect(P("展開 $(a+b)^2$ 的結果")).toBe("展開 (a+b)² 的結果");
    expect(P("$a^2+2ab+b^2$")).toBe("a²+2ab+b²");
    expect(P("多項式 $3x^2 + 5x - 7$ 的次數")).toBe("多項式 3x² + 5x - 7 的次數");
    expect(P("$(a+b)(a-b)$")).toBe("(a+b)(a-b)");
  });
  it("分數、根號、角度、圓周率、符號", () => {
    expect(P("$\\frac{1}{2}$")).toBe("1/2");
    expect(P("$\\frac{a+b}{2}$")).toBe("(a+b)/2");
    expect(P("$\\sqrt{2}$")).toBe("√2");
    expect(P("$\\sqrt{x+1}$")).toBe("√(x+1)");
    expect(P("$30^\\circ$")).toBe("30°");
    expect(P("面積 $\\pi r^2$")).toBe("面積 π r²");
    expect(P("$3 \\times 4 \\div 2 \\leq 6$")).toBe("3 × 4 ÷ 2 ≤ 6");
  });
  it("指數與下標：能轉成上標下標就轉，不能就保持可讀", () => {
    expect(P("$x^{n+1}$")).toBe("xⁿ⁺¹");
    expect(P("$10^{-3}$")).toBe("10⁻³");
    expect(P("$a_1$")).toBe("a₁");
    expect(P("$x^{ab}$")).toBe("x^(ab)");
  });
  it("巢狀分數", () => {
    expect(P("$\\frac{\\frac{1}{2}}{3}$")).toBe("(1/2)/3");
  });
  it("金額與一般文字不能被誤吃", () => {
    expect(P("價格 $100 和 $200")).toBe("價格 $100 和 $200");
    expect(P("NT$100")).toBe("NT$100");
    expect(P("只有一個 $ 符號")).toBe("只有一個 $ 符號");
    expect(P("這題很簡單")).toBe("這題很簡單");
    expect(P("跳脫 \\$5 不動")).toBe("跳脫 $5 不動");
  });
  it("非字串原樣回傳", () => {
    expect(P(5)).toBe(5);
    expect(P(null)).toBe(null);
  });
});

describe("mathClean：整份題目", () => {
  const items = [
    { q: "展開 $(a+b)^2$", o: ["$a^2+b^2$", "$a^2+2ab+b^2$"], a: "B", e: "公式 $(a+b)^2=a^2+2ab+b^2$", s: 10, img: "data:image/jpeg;base64,AAA$B$" },
    { q: "配對", t: "match", l: ["$x^2$", "蘋果"], r: ["平方", "Apple"] },
  ];
  it("題幹、選項、解析、配合題欄位都轉；img 不碰；不改原陣列", () => {
    const out = api.mathClean(items);
    expect(out[0].q).toBe("展開 (a+b)²");
    expect(out[0].o).toEqual(["a²+b²", "a²+2ab+b²"]);
    expect(out[0].e).toBe("公式 (a+b)²=a²+2ab+b²");
    expect(out[0].img).toBe("data:image/jpeg;base64,AAA$B$");
    expect(out[0].s).toBe(10);
    expect(out[1].l).toEqual(["x²", "蘋果"]);
    expect(items[0].q).toBe("展開 $(a+b)^2$");
  });
  it("不是陣列就原樣回傳", () => {
    expect(api.mathClean(undefined)).toBe(undefined);
  });
});
