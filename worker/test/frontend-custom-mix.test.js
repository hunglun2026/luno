// 自選題數的純函式：public/js/custom-mix.js（用 vm 載入，同 frontend-scoring.test.js）。
// planBatches 在 generate.js（碰 DOM，不載入），這裡用同規則的替身：簡答、填充一批 8 題，其餘 10 題。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const stub = `
function planBatches(typeVal, total) {
  const size = (typeVal.includes("簡答") || typeVal.includes("填充")) ? 8 : 10;
  return { typeVal, total, batchSize: size, batches: Math.ceil(total / size) };
}`;
const load = () => vm.runInNewContext(
  stub + "\n" + readFileSync(join(JS, "custom-mix.js"), "utf8") +
  "\n;({ cmCounts, cmTotal, cmSegments, cmSummary, cmBatchCount, CM_MAX_BATCHES, CM_KINDS })", { localStorage: undefined, window: {} });

const reset = (api, set) => { api.CM_KINDS.forEach((k) => { api.cmCounts[k.key] = set[k.key] || 0; }); };

describe("自選題數", () => {
  it("沒有 document 也能載入（單元測試環境），預設只有單選 5 題", () => {
    const api = load();
    expect(api.cmTotal()).toBe(5);
    expect(api.cmSegments()).toEqual([{ typeVal: "全部單選題", n: 5 }]);
  });
  it("基本題型併成一次呼叫：單選2＋是非3 是一段，字串含 generate.js 認得的關鍵字", () => {
    const api = load();
    reset(api, { single: 2, tf: 3 });
    const segs = api.cmSegments();
    expect(segs.length).toBe(1);
    expect(segs[0].n).toBe(5);
    expect(segs[0].typeVal).toBe("前2題單選,最後3題是非");
    expect(segs[0].typeVal).toContain("是非");
  });
  it("只有一種基本題型：維持原本「全部某某題」的提示詞（不改既有行為）", () => {
    const api = load();
    reset(api, { tf: 4 });
    expect(api.cmSegments()).toEqual([{ typeVal: "全部是非題", n: 4 }]);
  });
  it("六種基本題型併成一段，順序固定：單選→複選→是非→克漏字→填充→簡答", () => {
    const api = load();
    reset(api, { short: 1, fill: 1, cloze: 1, tf: 1, multi: 1, single: 1 });
    const segs = api.cmSegments();
    expect(segs.length).toBe(1);
    expect(segs[0].typeVal).toBe("前1題單選,接著1題複選,接著1題是非,接著1題選擇式填空,接著1題填充,最後1題簡答(計算題)");
    expect(segs[0].typeVal).toContain("題填充");
    expect(segs[0].typeVal).toContain("選擇式填空");
  });
  it("配合、排序各自一段，接在基本題型之後（格式不同不能併）", () => {
    const api = load();
    reset(api, { order: 1, single: 2, tf: 3, match: 2 });
    expect(api.cmSegments().map((s) => s.typeVal)).toEqual(["前2題單選,最後3題是非", "全部配合題", "全部排序題"]);
    expect(api.cmTotal()).toBe(8);
  });
  it("實測每次呼叫約 30 秒起跳：典型混合卷（4 種基本題型＋配合）只打 2 次", () => {
    const api = load();
    reset(api, { single: 5, multi: 2, tf: 3, fill: 2, match: 1 });
    expect(api.cmBatchCount()).toBe(3);   // 基本題型 12 題（含填充，一批 8 題）＝2 批，配合 1 批
  });
  it("摘要文字：單選 2＋是非 3，共 5 題", () => {
    const api = load();
    reset(api, { single: 2, tf: 3 });
    expect(api.cmSummary()).toBe("單選 2＋是非 3，共 5 題");
  });
  it("全部 0 題：摘要不假裝有題目", () => {
    const api = load();
    reset(api, {});
    expect(api.cmTotal()).toBe(0);
    expect(api.cmSummary()).toContain("還沒選題數");
  });
  it("批次數：每段各自切批，填充 9 題要 2 批", () => {
    const api = load();
    reset(api, { single: 10, fill: 9 });
    expect(api.cmBatchCount()).toBe(3);   // 併成一段 19 題、含填充所以一批 8 題 → 3 批
  });
  it("後端只給 15 次後續批次（含重試）：上限必須留空間，不能超過 14", () => {
    const api = load();
    expect(api.CM_MAX_BATCHES).toBeLessThanOrEqual(14);
    // 8 種題型各 50 題遠超過上限，必須被判定為太大
    reset(api, Object.fromEntries(api.CM_KINDS.map((k) => [k.key, 50])));
    expect(api.cmBatchCount()).toBeGreaterThan(api.CM_MAX_BATCHES);
  });
  it("一般用法不會誤擋：8 種題型各 5 題（共 40 題）只要 6 批（基本 6 種併成 30 題＝4 批，加配合、排序各 1 批）", () => {
    const api = load();
    // 閱讀題組一組就是一次呼叫，另有測試；這裡只算原本 8 種題型
    reset(api, Object.fromEntries(api.CM_KINDS.filter((k) => k.key !== "passage").map((k) => [k.key, 5])));
    expect(api.cmBatchCount()).toBe(6);
    expect(api.cmBatchCount()).toBeLessThanOrEqual(api.CM_MAX_BATCHES);
  });
});

describe("自選題數：閱讀題組", () => {
  it("閱讀題組的數字是組數，題數＝組數×每組題數，且每組一批", () => {
    const api = load();
    reset(api, { passage: 2 });
    api.cmCounts.perGroup = 3;
    expect(api.cmTotal()).toBe(6);
    const seg = api.cmSegments()[0];
    expect(seg).toMatchObject({ typeVal: "閱讀題組", n: 6, perBatch: 3 });
    expect(api.cmBatchCount()).toBe(2);   // 兩組＝兩次呼叫，不是 1 次
  });
  it("摘要寫出組數與每組題數", () => {
    const api = load();
    reset(api, { single: 2, passage: 1 });
    api.cmCounts.perGroup = 4;
    expect(api.cmSummary()).toBe("單選 2＋閱讀題組 1 組（每組 4 題），共 6 題");
  });
  it("閱讀題組排在最後（紙本習慣把閱讀測驗放最後）", () => {
    const api = load();
    reset(api, { passage: 1, order: 1, single: 1 });
    expect(api.cmSegments().map((s) => s.typeVal)).toEqual(["全部單選題", "全部排序題", "閱讀題組"]);
  });
  it("閱讀題組最多 8 組、8 組已經超過批次上限 12 的一半以上，併其他題型要被擋", () => {
    const api = load();
    reset(api, { passage: 8, single: 50, multi: 50 });
    api.cmCounts.perGroup = 6;
    expect(api.cmBatchCount()).toBeGreaterThan(api.CM_MAX_BATCHES);
  });
});
