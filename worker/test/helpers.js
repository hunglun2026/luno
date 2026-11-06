// 測試用的假環境：KV 用 Map，D1 用 Node 內建的 node:sqlite 跑真的 migrations，
// 所以註冊、登入這類會碰資料庫的流程，測的是真的 SQL，不是假回應。
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export function makeKV() {
  const m = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}

// D1 的最小子集：prepare().bind().first()/all()/run()，加 batch
export function makeD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
  });
  return {
    _db: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; },
  };
}

export function makeEnv(extra = {}) {
  return {
    COOLDOWN_KV: makeKV(),
    DB: makeD1(),
    SESSION_SECRET: "test-secret",
    ADMIN_PASSWORD: "admin-pass",
    GEMINI_API_KEYS: "k1,k2",
    ...extra,
  };
}

export function req(path, { method = "GET", body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  return new Request("https://api.test" + path, init);
}

// Gemini 回應的外殼，text 放模型「說」的內容
export function geminiReply(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// 註冊並回傳 { token, user }；teacher 預設，可覆蓋欄位
export async function registerUser(worker, env, over = {}) {
  const r = await worker.fetch(req("/api/auth/register", {
    method: "POST",
    body: { username: "teacher1", password: "abc123", role: "teacher", className: "六年1班", privacyVersion: "2026-11-05", ...over },
  }), env, {});
  return r.json();
}
