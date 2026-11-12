// 學生作答暫存：public/js/answer-draft.js 的純函式（打包、是否過期）。
// 檔案不是模組，用 vm 載入；包住 answer.js 函式的那段需要瀏覽器與 answer.js，這裡用最簡替身讓它能載入，不測它。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const stubs = "function updateAnsProgress(){}\nfunction renderAnswerMode(){}\nasync function gradeAnswers(){}\n";
const api = vm.runInNewContext(
  stubs + readFileSync(join(JS, "answer-draft.js"), "utf8") + "\n;({ draftKey, draftPack, draftUsable, DRAFT_TTL_MS })", {});

describe("draftPack 要存的內容", () => {
  it("空答案與空白資料不存（回 null）", () => {
    expect(api.draftPack({ 0: "", 1: "" }, { ansStuName: "  " }, 1000)).toBeNull();
  });
  it("只留有寫的題，姓名等資料截到 40 字", () => {
    const p = api.draftPack({ 0: "B", 1: "", 2: "0:1,1:0" }, { ansStuName: "小明".repeat(30) }, 1000);
    expect(Object.keys(p.v)).toEqual(["0", "2"]);
    expect(p.v[2]).toBe("0:1,1:0");
    expect(p.info.ansStuName.length).toBe(40);
    expect(p.t).toBe(1000);
  });
});

describe("draftUsable 草稿是否還能用", () => {
  const now = 10 * api.DRAFT_TTL_MS;
  it("3 天內可用，超過就作廢", () => {
    expect(api.draftUsable({ t: now - 1000, v: {} }, now)).toBe(true);
    expect(api.draftUsable({ t: now - api.DRAFT_TTL_MS - 1, v: {} }, now)).toBe(false);
  });
  it("格式不對、時間在未來都不可用", () => {
    expect(api.draftUsable(null, now)).toBe(false);
    expect(api.draftUsable({ t: "x", v: {} }, now)).toBe(false);
    expect(api.draftUsable({ t: now }, now)).toBe(false);
    expect(api.draftUsable({ t: now + 5000, v: {} }, now)).toBe(false);
  });
  it("每份分享各自一個鍵", () => {
    expect(api.draftKey("abc")).toBe("lun_draft_abc");
  });
});
