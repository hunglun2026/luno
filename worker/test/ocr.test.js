import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index.js";
import { normalizeQuestions, normalizeAnswers, normalizeAnswer, stripOptionLabel, buildQuestionsPrompt, buildAnswersPrompt, callGemini } from "../src/ocr.js";
import { makeEnv, req, geminiReply, registerUser } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());
const stubGemini = (...texts) => {
  const f = vi.fn();
  texts.forEach((t) => f.mockResolvedValueOnce(new Response(JSON.stringify(typeof t === "string" ? geminiReply(t) : t))));
  vi.stubGlobal("fetch", f);
  return f;
};

describe("選項標號與答案整理", () => {
  it("拿掉 A. (B) 甲、 1) 這類標號，但不誤刪正常內容", () => {
    expect(stripOptionLabel("A. 蘋果")).toBe("蘋果");
    expect(stripOptionLabel("（B）香蕉")).toBe("香蕉");
    expect(stripOptionLabel("甲、橘子")).toBe("橘子");
    expect(stripOptionLabel("3) 葡萄")).toBe("葡萄");
    expect(stripOptionLabel("Apple 蘋果")).toBe("Apple 蘋果");
  });
  it("選擇題答案統一成排序後的字母；是非題 O/X 轉成 A/B", () => {
    expect(normalizeAnswer("ca", 4)).toBe("AC");
    expect(normalizeAnswer(["B", "D"], 4)).toBe("BD");
    expect(normalizeAnswer("乙", 4)).toBe("B");
    expect(normalizeAnswer("○", 2)).toBe("A");
    expect(normalizeAnswer("×", 2)).toBe("B");
    expect(normalizeAnswer("AAB", 4)).toBe("AB");
  });
  it("非選擇題答案原樣保留，null 變空字串", () => {
    expect(normalizeAnswer("  光合作用 ", 0)).toBe("光合作用");
    expect(normalizeAnswer(null, 0)).toBe("");
  });
});

describe("題目整理 normalizeQuestions", () => {
  it("不是陣列回空陣列；沒有題幹的丟掉", () => {
    expect(normalizeQuestions(null)).toEqual([]);
    expect(normalizeQuestions([{ q: "" }, null, 5, { q: "有題幹" }])).toHaveLength(1);
  });
  it("只有 1 個選項視為非選擇題；選項標號被拿掉", () => {
    const [a, b] = normalizeQuestions([{ q: "一", o: ["A. 唯一"], a: "x" }, { q: "二", o: ["A. 甲", "B. 乙", "C. 丙"], a: "b" }]);
    expect(a.o).toEqual([]);
    expect(b.o).toEqual(["甲", "乙", "丙"]);
    expect(b.a).toBe("B");
  });
  it("只收允許的旗標且去重；配分不合法變 0；題號取整數", () => {
    const [x] = normalizeQuestions([{ q: "題", n: "3.7", s: "abc", flag: ["lowConf", "lowConf", "hack", "figure"] }]);
    expect(x.flag).toEqual(["lowConf", "figure"]);
    expect(x.s).toBe(0);
    expect(x.n).toBe(3);
  });
  it("附圖位置：夾在 0~1 之內；太小或格式不對就丟掉", () => {
    const ok = normalizeQuestions([{ q: "圖", fig: { p: 2, x: -0.5, y: 0.2, w: 2, h: 0.3 } }])[0].fig;
    expect(ok).toEqual({ p: 2, x: 0, y: 0.2, w: 1, h: 0.3 });
    expect(normalizeQuestions([{ q: "圖", fig: { p: 1, x: 0, y: 0, w: 0.01, h: 0.5 } }])[0].fig).toBeUndefined();
    expect(normalizeQuestions([{ q: "圖", fig: { p: 0, x: 0, y: 0, w: 0.5, h: 0.5 } }])[0].fig).toBeUndefined();
    expect(normalizeQuestions([{ q: "圖", fig: "壞" }])[0].fig).toBeUndefined();
  });
  it("一次最多收 80 題", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ q: "題" + i }));
    expect(normalizeQuestions(many)).toHaveLength(80);
  });
});

describe("答案卷整理 normalizeAnswers", () => {
  it("題號要是正整數、答案不能空", () => {
    const out = normalizeAnswers([{ n: 1, a: "B", e: "因為" }, { n: 0, a: "A" }, { n: 2, a: "" }, { n: "x", a: "C" }, { n: 3, a: ["A", "C"] }]);
    expect(out).toEqual([{ n: 1, a: "B", e: "因為" }, { n: 3, a: "AC", e: "" }]);
  });
  it("不是陣列回空陣列", () => expect(normalizeAnswers("x")).toEqual([]));
});

describe("提示詞", () => {
  it("沒答案卷（solve）時要求 AI 解題並標 aiGuess；起始題號帶進去", () => {
    expect(buildQuestionsPrompt(true, 5)).toContain("aiGuess");
    expect(buildQuestionsPrompt(false, 5)).toContain("5");
    expect(buildAnswersPrompt()).toContain("JSON");
  });
});

describe("callGemini（假 Gemini）", () => {
  const deps = { getApiKeys: () => ["k1"], GEMINI_MODELS: ["m1", "m2"] };
  it("沒有金鑰時直接丟錯", async () => {
    await expect(callGemini([], { getApiKeys: () => [], GEMINI_MODELS: ["m1"] }, {}, "", 100)).rejects.toThrow(/金鑰/);
  });
  it("成功時回解析後的 JSON；程式碼區塊外框會被拿掉", async () => {
    stubGemini("```json\n[{\"n\":1}]\n```");
    const r = await callGemini([{ text: "x" }], deps, {}, "", 100);
    expect(r.data).toEqual([{ n: 1 }]);
    expect(r.degraded).toBe(false);
  });
  it("主模型失敗自動換備用模型，並標記 degraded", async () => {
    stubGemini({ error: { message: "quota" } }, "[1]");
    const r = await callGemini([], deps, {}, "", 100);
    expect(r.model).toBe("m2");
    expect(r.degraded).toBe(true);
    expect(r.tried[0]).toMatch(/quota/);
  });
  it("所有模型都失敗時丟出最後一個原因", async () => {
    stubGemini({ error: { message: "bad1" } }, { error: { message: "bad2" } });
    await expect(callGemini([], deps, {}, "", 100)).rejects.toThrow(/bad2/);
  });
  it("模型回的不是 JSON、或沒有文字，都視為失敗並換下一個", async () => {
    stubGemini("不是 json", { candidates: [{ finishReason: "SAFETY" }] });
    await expect(callGemini([], deps, {}, "", 100)).rejects.toThrow(/沒有回應文字/);
  });
  it("thinking 參數被拒絕時，去掉它重打一次", async () => {
    const f = stubGemini({ error: { message: "thinking not supported" } }, "[2]");
    const r = await callGemini([], deps, {}, "", 100);
    expect(r.data).toEqual([2]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });
  it("網路例外也會換下一個模型", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(new Response(JSON.stringify(geminiReply("[3]"))));
    vi.stubGlobal("fetch", f);
    expect((await callGemini([], deps, {}, "", 100)).data).toEqual([3]);
  });
});

describe("POST /api/ocr-paper", () => {
  const page = { mime: "image/jpeg", data: "AAAA" };
  const post = (env, body, headers = {}) => worker.fetch(req("/api/ocr-paper", { method: "POST", body, headers }), env, {});

  it("沒登入、沒自備金鑰、不是管理員 → 401", async () => {
    expect((await post(makeEnv(), { mode: "questions", pages: [page] })).status).toBe(401);
  });
  it("教師登入後，參數檢查：mode、頁數、圖片格式", async () => {
    const env = makeEnv();
    const h = { "X-Session-Token": (await registerUser(worker, env)).token };
    expect((await post(env, { mode: "x", pages: [page] }, h)).status).toBe(400);
    expect((await post(env, { mode: "questions", pages: [] }, h)).status).toBe(400);
    expect((await post(env, { mode: "questions", pages: Array(5).fill(page) }, h)).status).toBe(400);
    expect((await post(env, { mode: "questions", pages: [{ mime: "image/gif", data: "A" }] }, h)).status).toBe(400);
    expect((await post(env, "{壞", h)).status).toBe(400);
  });
  it("學生登入不能用", async () => {
    const env = makeEnv();
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined });
    expect((await post(env, { mode: "questions", pages: [page] }, { "X-Session-Token": s.token })).status).toBe(401);
  });
  it("成功辨識題目，回傳整理後的格式", async () => {
    stubGemini(JSON.stringify([{ n: 1, q: "1+1=?", o: ["A. 1", "B. 2"], a: "B", s: 5 }]));
    const env = makeEnv();
    const h = { "X-Session-Token": (await registerUser(worker, env)).token };
    const r = await post(env, { mode: "questions", pages: [page] }, h);
    const d = await r.json();
    expect(r.status).toBe(200);
    expect(d.items[0]).toMatchObject({ n: 1, o: ["1", "2"], a: "B", s: 5 });
  });
  it("成功辨識答案卷", async () => {
    stubGemini(JSON.stringify([{ n: 1, a: "B", e: "略" }]));
    const r = await post(makeEnv(), { mode: "answers", pages: [page] }, { "X-Admin-Pass": "admin-pass" });
    expect((await r.json()).answers).toEqual([{ n: 1, a: "B", e: "略" }]);
  });
  it("Gemini 全掛時回 502 而不是整個崩潰", async () => {
    stubGemini({ error: { message: "x" } }, { error: { message: "y" } });
    const r = await post(makeEnv(), { mode: "answers", pages: [page] }, { "X-Admin-Pass": "admin-pass" });
    expect(r.status).toBe(502);
  });
  it("每位教師每小時 40 次，第 41 次回 429；自備金鑰不限", async () => {
    stubGemini(...Array(45).fill("[]"));
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const h = { "X-Session-Token": t.token };
    const hour = Math.floor(Date.now() / 3600000);
    env.COOLDOWN_KV._m.set("ocr:u:" + t.user.id + ":" + hour, "40");
    const r = await post(env, { mode: "answers", pages: [page] }, h);
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe("OCR_LIMIT");
    const ok = await post(env, { mode: "answers", pages: [page] }, { "X-Gemini-Api-Key": "my-own-key" });
    expect(ok.status).toBe(200);
  });
  it("非 POST 回 405，OPTIONS 回 CORS", async () => {
    expect((await worker.fetch(req("/api/ocr-paper"), makeEnv(), {})).status).toBe(405);
    expect((await worker.fetch(req("/api/ocr-paper", { method: "OPTIONS" }), makeEnv(), {})).status).toBe(200);
  });
});
