// 壓力測試情境：連續 20 次出題，攔截對 Google 的請求，確認用的 key 是輪流的、沒有連續同一把。
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req } from "./helpers.js";
import { _resetKeyCounter } from "../src/keypool.js";

afterEach(() => vi.unstubAllGlobals());

describe("出題時 key 輪流", () => {
  it("連續 20 次出題，每次用不同於上一次的 key，且 5 把都有用到", async () => {
    _resetKeyCounter();
    const used = [];
    vi.stubGlobal("fetch", async (url) => {
      const m = String(url).match(/[?&]key=([^&]+)/);
      if (m) used.push(m[1]);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "[]" }] } }] }), { status: 200 });
    });
    const env = { ...makeEnv(), GEMINI_API_KEYS: "k1,k2,k3", GEMINI_API_KEYS_EXTRA: "k4,k5" };
    for (let i = 0; i < 20; i++) {
      const r = await worker.fetch(req("/api/generate", { method: "POST", headers: { "X-Admin-Pass": "pw" }, body: { contents: [{ parts: [{ text: "hi" }] }] } }), { ...env, ADMIN_PASSWORD: "pw" }, {});
      expect(r.status).toBe(200);
    }
    expect(used.length).toBe(20);
    for (let i = 1; i < used.length; i++) expect(used[i]).not.toBe(used[i - 1]);
    expect(new Set(used).size).toBe(5);
  });
});
