// 後端 key 池：主池（GEMINI_API_KEYS）＋額外池（GEMINI_API_KEYS_EXTRA）合併去重。
// getApiKeys 不是 export，透過管理者診斷端點 /api/keys-check 的 total 觀察（它是對 Google 發請求，這裡把 fetch 換成假的）。
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

async function total(extra) {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ models: [] }), { status: 200 }));
  const env = { ...makeEnv(), ADMIN_PASSWORD: "pw", ...extra };
  const r = await worker.fetch(req("/api/keys-check", { headers: { "X-Admin-Pass": "pw" } }), env, {});
  return (await r.json()).total;
}

describe("key 池合併", () => {
  it("只有主池", async () => { expect(await total({ GEMINI_API_KEYS: "a,b" })).toBe(2); });
  it("主池＋額外池合併，重複的只算一把", async () => {
    expect(await total({ GEMINI_API_KEYS: "a,b", GEMINI_API_KEYS_EXTRA: "b, c ,d" })).toBe(4);
  });
  it("只有額外池、或舊的單把 GEMINI_API_KEY 也能運作", async () => {
    expect(await total({ GEMINI_API_KEYS: "", GEMINI_API_KEYS_EXTRA: "x,y" })).toBe(2);
    expect(await total({ GEMINI_API_KEYS: "", GEMINI_API_KEY: "solo", GEMINI_API_KEYS_EXTRA: "x" })).toBe(2);
  });
});
