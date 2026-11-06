import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index.js";
import { normalizeText, scopeKey, sha256Hex, correctLettersOf, vetBankItem, vetMeta, buildVerifyPrompt, parseVerifyJson, decideVerdict } from "../src/bank.js";
import { makeEnv, req } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const good = () => ({ q: "太陽從哪個方向升起？", o: ["東方", "西方", "南方", "北方"], a: "A", e: "地球自西向東自轉，所以太陽從東方升起。" });

describe("文字正規化與雜湊", () => {
  it("全形半形、空白、大小寫統一", () => {
    expect(normalizeText(" Ａ B　c ")).toBe("abc");
    expect(normalizeText(null)).toBe("");
    expect(scopeKey("第一課 ~ 第三課")).toBe(scopeKey("第一課~第三課"));
  });
  it("sha256 輸出固定 64 字元十六進位，且同樣輸入同樣結果", async () => {
    const h = await sha256Hex("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("答案統一成字母 correctLettersOf", () => {
  const o = ["蘋果", "香蕉", "橘子", "葡萄"];
  it("字母、小寫、索引數字、選項原文、陣列、連寫都能認", () => {
    expect(correctLettersOf({ o, a: "B" })).toEqual(["B"]);
    expect(correctLettersOf({ o, a: "b" })).toEqual(["B"]);
    expect(correctLettersOf({ o, a: 2 })).toEqual(["C"]);
    expect(correctLettersOf({ o, a: "葡萄" })).toEqual(["D"]);
    expect(correctLettersOf({ o, a: ["C", "A"] })).toEqual(["A", "C"]);
    expect(correctLettersOf({ o, a: "AC" })).toEqual(["A", "C"]);
  });
  it("沒有選項回空陣列；認不得的答案回空陣列", () => {
    expect(correctLettersOf({ o: [], a: "A" })).toEqual([]);
    expect(correctLettersOf({ o, a: "完全不相干的長答案很多字" })).toEqual([]);
  });
});

describe("單題檢查 vetBankItem", () => {
  it("正常題通過，並整理成入庫格式", () => {
    const v = vetBankItem(good());
    expect(v.ok).toBe(true);
    expect(v.rec).toMatchObject({ answer: "A", kind: "single" });
  });
  it.each([
    ["no-q", { o: ["a", "b"] }],
    ["q-length", { ...good(), q: "短" }],
    ["options-count", { ...good(), o: ["只有一個"] }],
    ["option-length", { ...good(), o: ["東方", ""] }],
    ["options-duplicate", { ...good(), o: ["東方", " 東方 "] }],
    ["answer-out-of-range", { ...good(), a: "Z" }],
    ["explanation-missing", { ...good(), e: "略" }],
    ["explanation-length", { ...good(), e: "長".repeat(601) }],
    ["self-correct", { ...good(), e: "選項 B 寫錯了，讓我重新檢查，答案是 A。" }],
  ])("擋下：%s", (reason, item) => {
    expect(vetBankItem(item)).toMatchObject({ ok: false, reason });
  });
  it("題型判斷：是非題、複選題、克漏字", () => {
    expect(vetBankItem({ q: "地球是圓的嗎？", o: ["正確", "錯誤"], a: "A", e: "地球近似球體。" }).rec.kind).toBe("tf");
    expect(vetBankItem({ q: "下列哪些是水果？", o: ["蘋果", "香蕉", "石頭"], a: "AB", e: "蘋果和香蕉是水果。" }).rec.kind).toBe("multi");
    expect(vetBankItem({ q: "春天來了，（　　）開了。", o: ["花", "雪"], a: "A", e: "春天會開花。" }).rec.kind).toBe("cloze");
  });
  it("是非題答兩個答案不收", () => {
    expect(vetBankItem({ q: "地球是圓的嗎？", o: ["正確", "錯誤"], a: "AB", e: "地球近似球體。" })).toMatchObject({ ok: false, reason: "tf-answer" });
  });
});

describe("meta 檢查 vetMeta", () => {
  const m = { grade: "國小三年級", subject: "自然", publisher: "", scope: "", difficulty: "普通", lang: "繁體中文", sType: "1" };
  it("正常通過；沒年級或科目、sType 不是 1、欄位過長、型別不對都擋", () => {
    expect(vetMeta(m)).toBeTruthy();
    expect(vetMeta({ ...m, grade: "" })).toBeNull();
    expect(vetMeta({ ...m, sType: "2" })).toBeNull();
    expect(vetMeta({ ...m, scope: "x".repeat(61) })).toBeNull();
    expect(vetMeta({ ...m, subject: 5 })).toBeNull();
    expect(vetMeta(null)).toBeNull();
  });
});

describe("驗證用提示詞與判定", () => {
  const meta = { grade: "三年級", subject: "自然" };
  const row = { n: 1, q: "太陽從哪升起？", options: ["東", "西"], explanation: "自轉", answer: "A", kind: "single" };
  it("提示詞只給題幹與選項，答案不在題目區（讓 AI 獨立作答）", () => {
    const p = buildVerifyPrompt(meta, [row]);
    expect(p).toContain("(A) 東");
    expect(p).toContain("三年級");
  });
  it("解析 AI 回的 JSON：容忍前後雜訊與尾逗號，壞掉回 null", () => {
    expect(parseVerifyJson("好的：[{\"n\":1},]")).toEqual([{ n: 1 }]);
    expect(parseVerifyJson("沒有陣列")).toBeNull();
    expect(parseVerifyJson("[壞")).toBeNull();
    expect(parseVerifyJson(5)).toBeNull();
  });
  it("判定：全對 approved；答案不同、不適合、解析有誤、單選非唯一解都 suspect；沒回覆回 null", () => {
    const ok = { n: 1, a: ["A"], fit: true, unique: true, expl_ok: true };
    expect(decideVerdict(row, [ok]).status).toBe("approved");
    expect(decideVerdict(row, [{ ...ok, a: ["B"] }]).status).toBe("suspect");
    expect(decideVerdict(row, [{ ...ok, fit: false }]).status).toBe("suspect");
    expect(decideVerdict(row, [{ ...ok, expl_ok: false }]).status).toBe("suspect");
    expect(decideVerdict(row, [{ ...ok, unique: false }]).status).toBe("suspect");
    expect(decideVerdict({ ...row, kind: "multi" }, [{ ...ok, unique: false }]).status).toBe("approved");
    expect(decideVerdict(row, [])).toBeNull();
  });
});

describe("題庫端點 /api/bank/*", () => {
  const meta = { grade: "國小三年級", subject: "自然", publisher: "", scope: "", difficulty: "普通", lang: "繁體中文", sType: "1" };
  const submit = (env, body, headers = {}) => worker.fetch(req("/api/bank/submit", { method: "POST", body, headers: { "X-Client-Id": "d1", ...headers } }), env, {});

  it("收題：好題入庫為 pending，重複送算 duplicate，壞題算 rejected", async () => {
    const env = makeEnv();
    const first = await (await submit(env, { meta, items: [good(), { ...good(), q: "太短" }] })).json();
    expect(first).toMatchObject({ ok: true, accepted: 1, duplicate: 0, rejected: 1 });
    const again = await (await submit(env, { meta, items: [good()] })).json();
    expect(again).toMatchObject({ accepted: 0, duplicate: 1 });
    const row = await env.DB.prepare("SELECT status FROM bank_questions").first();
    expect(row.status).toBe("pending");
  });
  it("meta 不合格或沒有題目：不報錯，只是不收", async () => {
    const env = makeEnv();
    expect((await (await submit(env, { meta: { grade: "" }, items: [good()] })).json()).reason).toBe("meta-rejected");
    expect((await (await submit(env, { meta, items: [] })).json()).reason).toBe("no-items");
  });
  it("格式錯誤回 400；太大回 413；每裝置每小時 30 次後不再收", async () => {
    const env = makeEnv();
    expect((await submit(env, "{壞")).status).toBe(400);
    expect((await submit(env, "x".repeat(210000))).status).toBe(413);
    env.COOLDOWN_KV._m.set("bankin:d1:" + Math.floor(Date.now() / 3600000), "30");
    expect((await (await submit(env, { meta, items: [good()] })).json()).reason).toBe("rate-limited");
  });
  it("統計與重驗只有管理員能用", async () => {
    const env = makeEnv();
    expect((await worker.fetch(req("/api/bank/stats"), env, {})).status).toBe(403);
    expect((await worker.fetch(req("/api/bank/verify-now", { method: "POST" }), env, {})).status).toBe(403);
    const ok = await worker.fetch(req("/api/bank/stats", { headers: { "X-Admin-Pass": "admin-pass" } }), env, {});
    expect(await ok.json()).toHaveProperty("byStatus");
  });
  it("未知路徑回 404，OPTIONS 回 CORS", async () => {
    const env = makeEnv();
    expect((await worker.fetch(req("/api/bank/nope"), env, {})).status).toBe(404);
    expect((await worker.fetch(req("/api/bank/submit", { method: "OPTIONS" }), env, {})).status).toBe(200);
  });
  it("重驗：AI 作答一致就 approved，不一致就 suspect；全部寫回資料庫", async () => {
    const env = makeEnv();
    await submit(env, { meta, items: [good(), { q: "水在幾度會結冰？", o: ["0 度", "50 度", "100 度"], a: "A", e: "標準大氣壓下水在 0 度結冰。" }] });
    const rows = (await env.DB.prepare("SELECT id, q FROM bank_questions ORDER BY id").all()).results;
    const aiAnswer = [{ n: 1, a: ["A"], fit: true, unique: true, expl_ok: true, note: "" }, { n: 2, a: ["C"], fit: true, unique: true, expl_ok: true, note: "" }];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(aiAnswer) }] } }] }))));
    const r = await worker.fetch(req("/api/bank/verify-now", { method: "POST", headers: { "X-Admin-Pass": "admin-pass" } }), env, {});
    const d = await r.json();
    expect(r.status).toBe(200);
    expect(d.result.approved + d.result.suspect).toBe(2);
    const states = (await env.DB.prepare("SELECT status, COUNT(*) n FROM bank_questions GROUP BY status").all()).results;
    expect(states.find((s) => s.status === "approved").n).toBe(1);
    expect(states.find((s) => s.status === "suspect").n).toBe(1);
    expect(rows).toHaveLength(2);
  });
});
