// 題目朗讀的文字轉換：public/js/speak.js（純函式部分）。檔案不是模組，用 vm 連同 mathtext.js 一起載入。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const src = readFileSync(join(dir, "mathtext.js"), "utf8") + "\n" + readFileSync(join(dir, "speak.js"), "utf8");
const win = { addEventListener() {} };
const api = vm.runInNewContext(src + "\n;({ speakPlain, speakQuestionText })", { window: win });

describe("朗讀文字轉換", () => {
  it("數學符號換成唸得出來的字", () => {
    expect(api.speakPlain("a²+2ab")).toBe("a的平方加2ab");
    expect(api.speakPlain("30°")).toBe("30度");
    expect(api.speakPlain("√2 × 3 ÷ 1")).toBe("根號2 乘以 3 除以 1");
    expect(api.speakPlain("x ≤ 5")).toBe("x 小於等於 5");
    expect(api.speakPlain("a²-2ab+b²")).toBe("a的平方減2ab加b的平方");
    expect(api.speakPlain("3x²+5x-7")).toBe("3x的平方加5x減7");
  });
  it("LaTeX 先轉再唸；分數唸成幾分之幾", () => {
    expect(api.speakPlain("$(a+b)^2$")).toBe("(a加b)的平方");
    expect(api.speakPlain("$\\frac{1}{2}$")).toBe("2分之1");
    expect(api.speakPlain("1/2")).toBe("2分之1");
    expect(api.speakPlain("3/4 和 12/5")).toBe("4分之3 和 5分之12");
  });
  it("整題：題號、題幹、選項 A B C", () => {
    const t = api.speakQuestionText({ q: "1+1 等於多少？", o: ["1", "2", "3"], a: "B" }, 0);
    expect(t).toBe("第1題。1加1 等於多少？。選項A，1。選項B，2。選項C，3。");
  });
  it("沒有選項的題只唸題幹；空值不會壞", () => {
    expect(api.speakQuestionText({ q: "請寫出答案", o: [] }, 4)).toBe("第5題。請寫出答案。");
    expect(api.speakPlain(undefined)).toBe("");
  });
});
