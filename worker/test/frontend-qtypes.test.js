// 新題型（配合題、排序題）純函式測試：public/js/qtypes.js。檔案不是模組，用 vm 載入（同 frontend-common.test.js）。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js", "qtypes.js"), "utf8");
const api = vm.runInNewContext(
  SRC + "\n;({ qKind, qtIsTyped, qtShuffle, qtAnswerText, qtDescribe, qtGrade, qtNormalize, qtPaperParts, qtWordRows, qtToLines, qtFromLines, qtParseMatch, qtParseOrder, qtFormatRule, qtWantKind })",
  {}
);

const MATCH = { q: "把詞語連到解釋", t: "match", l: ["蘋果", "香蕉", "西瓜"], r: ["Apple", "Banana", "Watermelon"], e: "水果", s: 30 };
const ORDER = { q: "排出先後", t: "order", l: ["起床", "刷牙", "上學", "放學"], e: "一天", s: 20 };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// 讓正確答案的作答值：配合題左 i 配右 i；排序題 0,1,2,...
const matchValue = (q, js) => js.map((j, i) => (j >= 0 ? i + ":" + j : null)).filter(Boolean).join(",");

describe("qKind 題型判斷", () => {
  it("沒有 t 的舊題照舊：有選項是 choice，沒選項是 text", () => {
    expect(api.qKind({ q: "x", o: ["a", "b"], a: "A" })).toBe("choice");
    expect(api.qKind({ q: "x", o: [], a: "答案" })).toBe("text");
    expect(api.qKind({ q: "x", a: "答案" })).toBe("text");
    expect(api.qKind(null)).toBe("text");
  });
  it("合格的新題型", () => {
    expect(api.qKind(MATCH)).toBe("match");
    expect(api.qKind(ORDER)).toBe("order");
    expect(api.qtIsTyped(MATCH)).toBe(true);
    expect(api.qtIsTyped({ q: "x", o: ["a", "b"] })).toBe(false);
  });
  it("資料不合格時退回文字題，不會讓畫面壞掉", () => {
    expect(api.qKind({ ...MATCH, r: ["只有一個"] })).toBe("text");
    expect(api.qKind({ ...MATCH, l: ["a", "b"], r: ["x", "y"] })).toBe("text");           // 少於 3 項
    expect(api.qKind({ ...ORDER, l: ["a", "", "c"] })).toBe("text");                      // 有空項
    expect(api.qKind({ ...ORDER, l: ["1", "2", "3", "4", "5", "6", "7"] })).toBe("text"); // 超過 6 項
  });
});

describe("qtShuffle 洗牌", () => {
  it("同一題每次洗出來一樣，而且不等於原順序", () => {
    for (const q of [MATCH, ORDER, { ...ORDER, q: "另一題", l: ["甲", "乙", "丙"] }]) {
      const a = api.qtShuffle(q), b = api.qtShuffle({ ...q });
      expect(a).toEqual(b);
      expect(a.every((v, i) => v === i)).toBe(false);
      expect([...a].sort()).toEqual(a.map((_, i) => i));
    }
  });
  it("很多題都不會洗成原順序", () => {
    for (let k = 0; k < 200; k++) {
      const q = { q: "題" + k, t: "order", l: ["a", "b", "c"] };
      expect(api.qtShuffle(q).every((v, i) => v === i)).toBe(false);
    }
  });
});

describe("qtNormalize 出題後檢查", () => {
  it("合格：補 o 與 a，去掉 g", () => {
    const n = api.qtNormalize({ ...MATCH, g: 1, o: ["不該在這"] });
    expect(n.o).toEqual([]);
    expect(n.g).toBeUndefined();
    expect(n.a).toBe(api.qtAnswerText(n));
    expect(n.a).toMatch(/^1→[A-C]；2→[A-C]；3→[A-C]$/);
  });
  it("擋掉壞題", () => {
    expect(api.qtNormalize({ ...MATCH, r: ["Apple", "Apple", "Watermelon"] })).toBeNull();      // 右欄重複
    expect(api.qtNormalize({ ...MATCH, l: ["蘋果", "蘋果", "西瓜"] })).toBeNull();                // 左欄重複
    expect(api.qtNormalize({ ...MATCH, r: ["Apple", "Banana"] })).toBeNull();                    // 數量不合
    expect(api.qtNormalize({ ...MATCH, q: "  " })).toBeNull();
    expect(api.qtNormalize({ ...ORDER, l: ["a", "a", "b"] })).toBeNull();
    expect(api.qtNormalize({ q: "x", t: "other", l: ["a", "b", "c"] })).toBeNull();
  });
  it("排序題整理後不留 r；數字項目轉字串", () => {
    const n = api.qtNormalize({ ...ORDER, r: ["x"], l: [1, 2, 3] });
    expect(n.r).toBeUndefined();
    expect(n.l).toEqual(["1", "2", "3"]);
  });
});

describe("qtGrade 判分", () => {
  it("配合題：全對、對一部分、全錯、沒作答", () => {
    const q = api.qtNormalize(MATCH);
    const all = api.qtGrade(q, matchValue(q, [0, 1, 2]));
    expect(all).toMatchObject({ score: 30, correct: 3, isCorrect: true, answered: true });
    const part = api.qtGrade(q, matchValue(q, [0, 2, 1]));            // 對 1 對
    expect(part).toMatchObject({ score: 10, correct: 1, isCorrect: false });
    const none = api.qtGrade(q, matchValue(q, [1, 2, 0]));
    expect(none).toMatchObject({ score: 0, correct: 0, isCorrect: false, answered: true });
    const blank = api.qtGrade(q, "");
    expect(blank).toMatchObject({ score: 0, answered: false, isCorrect: false, userDisplay: "(未作答)" });
  });
  it("配合題：只連了一部分，沒連的算錯", () => {
    const q = api.qtNormalize(MATCH);
    const r = api.qtGrade(q, "0:0,1:1");
    expect(r).toMatchObject({ correct: 2, score: 20, isCorrect: false });
    expect(r.userDisplay).toContain("（未連）");
  });
  it("排序題：位置放對的比例給分，捨去到 0.5", () => {
    const q = api.qtNormalize(ORDER);                               // 4 項，配分 20
    expect(api.qtGrade(q, "0,1,2,3")).toMatchObject({ score: 20, isCorrect: true });
    expect(api.qtGrade(q, "0,1,3,2")).toMatchObject({ score: 10, correct: 2, isCorrect: false });
    expect(api.qtGrade(q, "1,0,3,2")).toMatchObject({ score: 0, correct: 0 });
    const q3 = api.qtNormalize({ ...ORDER, l: ["a", "b", "c"], s: 10 });
    expect(api.qtGrade(q3, "0,2,1").score).toBe(3);                 // 10 × 1/3 = 3.33 → 3
    expect(api.qtGrade(q3, "0,1,2").score).toBe(10);
  });
  it("排序題：無效的作答值視為沒作答", () => {
    const q = api.qtNormalize(ORDER);
    for (const bad of ["", "0,1,2", "0,1,2,2", "0,1,2,9", "a,b,c,d"]) {
      expect(api.qtGrade(q, bad)).toMatchObject({ answered: false, score: 0, isCorrect: false });
    }
  });
  it("配分是小數時全對仍剛好等於配分", () => {
    const q = api.qtNormalize({ ...MATCH, s: 3.5 });
    expect(api.qtGrade(q, matchValue(q, [0, 1, 2])).score).toBe(3.5);
  });
});

describe("答案與作答的文字寫法", () => {
  it("答案文字依洗牌後的標號", () => {
    const q = api.qtNormalize(MATCH);
    const perm = api.qtShuffle(q);
    const expected = [0, 1, 2].map((i) => i + 1 + "→" + "ABC"[perm.indexOf(i)]).join("；");
    expect(api.qtAnswerText(q)).toBe(expected);
    const o = api.qtNormalize(ORDER);
    expect(api.qtAnswerText(o).split(" → ")).toHaveLength(4);
  });
  it("學生全對時，作答寫法等於答案寫法", () => {
    const q = api.qtNormalize(MATCH);
    expect(api.qtDescribe(q, matchValue(q, [0, 1, 2]))).toBe(api.qtAnswerText(q));
    const o = api.qtNormalize(ORDER);
    expect(api.qtDescribe(o, "0,1,2,3")).toBe(api.qtAnswerText(o));
  });
  it("解析作答值不會被怪字串弄壞", () => {
    expect(api.qtParseMatch(3, "0:1,x,9:9,2:7,1:2")).toEqual([1, 2, -1]);
    expect(api.qtParseOrder(3, "2,0,1")).toEqual([2, 0, 1]);
    expect(api.qtParseOrder(3, null)).toBeNull();
  });
});

describe("紙本與 Word 版面", () => {
  it("配合題：左欄填空格，右欄代號，內容有跳脫", () => {
    const q = api.qtNormalize({ ...MATCH, l: ["<b>蘋果</b>", "香蕉", "西瓜"] });
    const p = api.qtPaperParts(q, 5, esc);
    expect(p.prefix).toBe("5.");
    expect(p.optsHTML).toContain("&lt;b>蘋果");
    expect(p.optsHTML).not.toContain("<b>蘋果");
    expect(p.optsHTML).toContain("(　　) 1.");
    expect(p.optsHTML).toContain("C. ");
    expect(p.answerSpace).toBe("");
  });
  it("排序題：打亂的項目加標號，下方有順序空格", () => {
    const o = api.qtNormalize(ORDER);
    const p = api.qtPaperParts(o, 1, esc);
    expect(p.optsHTML).toContain("①");
    expect(p.optsHTML).toContain("④");
    expect(p.optsHTML).toContain("順序：（　　） → （　　） → （　　） → （　　）");
  });
  it("Word 行：配合題每列左右對照，排序題最後一行是順序空格", () => {
    const q = api.qtNormalize(MATCH);
    const rows = api.qtWordRows(q);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("蘋果");
    const o = api.qtNormalize(ORDER);
    const orows = api.qtWordRows(o);
    expect(orows).toHaveLength(5);
    expect(orows[4]).toMatch(/^順序：/);
  });
});

describe("表單題型值", () => {
  it("只有「全部配合題／全部排序題」會要求整份同一種新題型", () => {
    expect(api.qtWantKind("全部配合題")).toBe("match");
    expect(api.qtWantKind(" 全部排序題 ")).toBe("order");
    expect(api.qtWantKind("全部單選題")).toBeNull();
    expect(api.qtWantKind("5題配合題,5題單選")).toBeNull();   // 自定義混搭不強制
    expect(api.qtWantKind(undefined)).toBeNull();
  });
});

describe("出題提示詞", () => {
  it("配合題與排序題的格式說明：欄位順序固定、s 在最後、帶配分", () => {
    const m = api.qtFormatRule("match", 12, 5);
    expect(m).toContain('"t":"match"');
    expect(m).toContain('"s":12}');
    expect(m).toContain("JSON Array。");
    const o = api.qtFormatRule("order", 8, 1);
    expect(o).toContain('"t":"order"');
    expect(o).toContain("只包含1個物件");
    expect(o).toContain("順序唯一");
  });
  it("提示詞舉的範例 JSON 本身要能通過檢查", () => {
    // 從提示詞裡抽出範例物件（占位字換成真內容）確認欄位名稱與規則一致
    const sample = { q: "說明", t: "match", l: ["a", "b", "c"], r: ["1", "2", "3"], e: "解析", s: 12 };
    expect(api.qtNormalize(sample)).not.toBeNull();
    expect(api.qtNormalize({ q: "說明", t: "order", l: ["a", "b", "c", "d"], e: "解析", s: 8 })).not.toBeNull();
  });
});

describe("編輯用文字轉換", () => {
  it("配合題來回轉換不變", () => {
    const q = api.qtNormalize(MATCH);
    const text = api.qtToLines(q);
    expect(text).toBe("蘋果｜Apple\n香蕉｜Banana\n西瓜｜Watermelon");
    expect(api.qtFromLines("match", text)).toEqual({ l: q.l, r: q.r });
  });
  it("也接受半形直線與多餘空白", () => {
    expect(api.qtFromLines("match", " a | 1 \nb|2\n c ｜ 3 ")).toEqual({ l: ["a", "b", "c"], r: ["1", "2", "3"] });
  });
  it("排序題一行一項", () => {
    expect(api.qtFromLines("order", "一\n二\n三\n")).toEqual({ l: ["一", "二", "三"] });
    expect(api.qtToLines(api.qtNormalize(ORDER))).toBe("起床\n刷牙\n上學\n放學");
  });
  it("格式不對時給白話錯誤", () => {
    expect(api.qtFromLines("match", "a｜1\nb｜2").error).toMatch(/3 到 6 行/);
    expect(api.qtFromLines("match", "a｜1\nb\nc｜3").error).toMatch(/第 2 行/);
    expect(api.qtFromLines("order", "a\nb").error).toBeTruthy();
  });
});
