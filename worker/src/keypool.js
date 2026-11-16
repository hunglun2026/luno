// 刻度｜Gemini key 輪流（2026-11-16 Steve：壓力測試時要輪流打，不要重複打同一把）。
// 全域計數器放在一個 Durable Object（KeyCounter，SQLite 型，免費方案也能用）：所有 Worker 執行個體都問它「現在輪到第幾把」，
// 它每次加 1，所以不管請求落在哪個執行個體都是依序換 key。
// 退路：沒綁 KEY_COUNTER（本機測試）或 Durable Object 暫時連不上時，退回「執行個體內輪流、起點隨機」，出題不會因此失敗。

export class KeyCounter {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const cur = (await this.ctx.storage.get("n")) || 0;
    // /peek 只看目前數字、不加 1（診斷用）
    if (request && String(request.url).endsWith("/peek")) return new Response(String(cur));
    await this.ctx.storage.put("n", cur + 1);
    return new Response(String(cur));
  }
}

let local = -1;
function localNext(n) {
  if (local < 0) local = Math.floor(Math.random() * n);
  local = (local + 1) % n;
  return local;
}

// 回傳這次請求的起始 key 位置；呼叫端照舊用 (start + i) % n 往下試，失敗時就換下一把
export async function nextKeyStart(n, env) {
  if (!(n > 0)) return 0;
  if (env && env.KEY_COUNTER) {
    try {
      const stub = env.KEY_COUNTER.get(env.KEY_COUNTER.idFromName("gemini-keys"));
      const r = await stub.fetch("https://key-counter/next");
      const v = parseInt(await r.text(), 10);
      if (Number.isFinite(v)) return v % n;
    } catch (e) { /* 退回本機輪流 */ }
  }
  return localNext(n);
}

// 診斷用：目前全域計數；沒綁 Durable Object 或連不上回 null（呼叫端就知道現在是退回本機輪流）
export async function peekKeyCounter(env) {
  if (!(env && env.KEY_COUNTER)) return null;
  try {
    const stub = env.KEY_COUNTER.get(env.KEY_COUNTER.idFromName("gemini-keys"));
    const v = parseInt(await (await stub.fetch("https://key-counter/peek")).text(), 10);
    return Number.isFinite(v) ? v : null;
  } catch (e) { return null; }
}

// 測試用：重設本機計數器
export function _resetKeyCounter() { local = -1; }
