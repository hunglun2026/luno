import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req, geminiReply, registerUser } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const body = { contents: [{ parts: [{ text: "出 5 題" }] }] };
const gen = (env, headers = {}, b = body) => worker.fetch(req("/api/generate", { method: "POST", body: b, headers }), env, {});
const okFetch = () => vi.fn().mockImplementation(async () => new Response(JSON.stringify(geminiReply("[]"))));

describe("出題代理 /api/generate", () => {
  it("非 POST 回 405，OPTIONS 回 CORS", async () => {
    expect((await worker.fetch(req("/api/generate"), makeEnv(), {})).status).toBe(405);
    expect((await worker.fetch(req("/api/generate", { method: "OPTIONS" }), makeEnv(), {})).status).toBe(200);
  });
  it("成功時回 Gemini 的內容；前端指定的 generationConfig 不會被轉送", async () => {
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    const r = await gen(makeEnv(), { "X-Client-Id": "c1" }, { ...body, generationConfig: { maxOutputTokens: 999999 } });
    expect(r.status).toBe(200);
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.generationConfig.maxOutputTokens).toBe(32768);
  });
  it("沒有金鑰且沒自備 Key 回 500 並說明", async () => {
    vi.stubGlobal("fetch", okFetch());
    const r = await gen(makeEnv({ GEMINI_API_KEYS: "", GEMINI_API_KEY: "" }), { "X-Client-Id": "c1" });
    expect(r.status).toBe(500);
    expect((await r.json()).error.message).toMatch(/API Key/);
  });
  it("30 秒冷卻：同裝置連按第二次回 429 COOLDOWN；換裝置不受影響", async () => {
    vi.stubGlobal("fetch", okFetch());
    const env = makeEnv();
    expect((await gen(env, { "X-Client-Id": "devA" })).status).toBe(200);
    const again = await gen(env, { "X-Client-Id": "devA" });
    expect(again.status).toBe(429);
    expect((await again.json()).error.code).toBe("COOLDOWN");
    expect((await gen(env, { "X-Client-Id": "devB" })).status).toBe(200);
  });
  it("自帶 Key 或管理員密碼不受冷卻限制", async () => {
    vi.stubGlobal("fetch", okFetch());
    const env = makeEnv();
    for (let i = 0; i < 3; i++) expect((await gen(env, { "X-Client-Id": "d", "X-Gemini-Api-Key": "mine" })).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await gen(env, { "X-Client-Id": "d", "X-Admin-Pass": "admin-pass" })).status).toBe(200);
  });
  it("後續批次只認伺服器發的額度，自己寫 X-Batch-Index 繞不過冷卻", async () => {
    vi.stubGlobal("fetch", okFetch());
    const env = makeEnv();
    const r = await gen(env, { "X-Client-Id": "sneaky", "X-Batch-Index": "1" });
    expect(r.status).toBe(429);
  });
  it("第 0 批通過後，後續批次可用，額度用完（15 次）再被擋", async () => {
    vi.stubGlobal("fetch", okFetch());
    const env = makeEnv();
    const h = { "X-Client-Id": "legit" };
    expect((await gen(env, h)).status).toBe(200);
    for (let i = 0; i < 15; i++) expect((await gen(env, { ...h, "X-Batch-Index": "1" })).status).toBe(200);
    expect((await gen(env, { ...h, "X-Batch-Index": "1" })).status).toBe(429);
  });
  it("訪客每天最多 6 次新出題；登入的老師不受此限", async () => {
    vi.stubGlobal("fetch", okFetch());
    const env = makeEnv();
    const day = Math.floor(Date.now() / 86400000);
    env.COOLDOWN_KV._m.set("guestgen:guest1:" + day, "6");
    const r = await gen(env, { "X-Client-Id": "guest1" });
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe("GUEST_LIMIT");
    const t = await registerUser(worker, env);
    env.COOLDOWN_KV._m.set("guestgen:teacher-dev:" + day, "6");
    expect((await gen(env, { "X-Client-Id": "teacher-dev", "X-Session-Token": t.token })).status).toBe(200);
  });
  it("每個 IP 每小時 60 次上限（換裝置 ID 洗額度也擋）", async () => {
    vi.stubGlobal("fetch", okFetch());
    const env = makeEnv();
    env.COOLDOWN_KV._m.set("ipgen:9.9.9.9:" + Math.floor(Date.now() / 3600000), "60");
    const r = await gen(env, { "X-Client-Id": "fresh-device", "CF-Connecting-IP": "9.9.9.9" });
    expect(r.status).toBe(429);
  });
  it("內容格式檢查：沒有 contents、parts 為空、夾帶不支援的內容都回 500 錯誤訊息", async () => {
    vi.stubGlobal("fetch", okFetch());
    const h = (n) => ({ "X-Gemini-Api-Key": "k", "X-Client-Id": "v" + n });
    expect((await gen(makeEnv(), h(1), { contents: [] })).status).toBe(500);
    expect((await gen(makeEnv(), h(2), { contents: [{ parts: [] }] })).status).toBe(500);
    expect((await gen(makeEnv(), h(3), { contents: [{ parts: [{ hack: 1 }] }] })).status).toBe(500);
    expect((await gen(makeEnv(), h(4), { contents: [{ parts: Array(41).fill({ text: "x" }) }] })).status).toBe(500);
  });
  it("宣告內容超過 20MB 直接回 413", async () => {
    const r = await worker.fetch(req("/api/generate", { method: "POST", body, headers: { "Content-Length": String(30 * 1024 * 1024), "X-Admin-Pass": "admin-pass" } }), makeEnv(), {});
    expect(r.status).toBe(413);
  });
  it("主模型失敗、備用模型成功；全部失敗回 400 帶錯誤", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "quota" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "quota" } })))
      .mockResolvedValue(new Response(JSON.stringify(geminiReply("[]"))));
    vi.stubGlobal("fetch", f);
    expect((await gen(makeEnv(), { "X-Admin-Pass": "admin-pass" })).status).toBe(200);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { message: "dead" } }))));
    const r = await gen(makeEnv(), { "X-Admin-Pass": "admin-pass" });
    expect(r.status).toBe(400);
    expect((await r.json()).error.message).toBe("dead");
  });
  it("200 但沒文字（被截斷）會換下一組 Key／模型，而不是把空內容丟給使用者", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] })))
      .mockResolvedValue(new Response(JSON.stringify(geminiReply("[1]"))));
    vi.stubGlobal("fetch", f);
    const r = await gen(makeEnv(), { "X-Admin-Pass": "admin-pass" });
    expect(r.status).toBe(200);
    expect(f.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("Key 池診斷 /api/keys-check", () => {
  it("沒帶管理者密碼被拒絕（不洩漏金鑰池狀態）", async () => {
    const r = await worker.fetch(req("/api/keys-check"), makeEnv(), {});
    expect(r.status).toBe(401);
  });
});
