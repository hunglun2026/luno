import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req } from "./helpers.js";

const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});
const reg = (env, over = {}) => call(env, "/api/auth/register", { method: "POST", body: { username: "Teacher1", password: "Abc123", role: "teacher", className: "六年1班", privacyVersion: "2026-11-05", ...over } });
const login = (env, username, password) => call(env, "/api/auth/login", { method: "POST", body: { username, password } });

describe("註冊規則", () => {
  it("缺欄位或角色不合法回 400", async () => {
    const env = makeEnv();
    expect((await reg(env, { username: "" })).status).toBe(400);
    expect((await reg(env, { role: "superadmin" })).status).toBe(400);
  });
  it("帳號超過 16 字、含中文或空白都擋", async () => {
    const env = makeEnv();
    for (const username of ["a".repeat(17), "王小明", "a b"]) {
      expect((await reg(env, { username })).status).toBe(400);
    }
  });
  it("密碼太短、太長、含中文都擋", async () => {
    const env = makeEnv();
    for (const password of ["abc", "a".repeat(17), "密碼密碼密碼密碼"]) {
      expect((await reg(env, { password })).status).toBe(400);
    }
  });
  it("沒勾個資告知（沒帶版本日期）回 400，格式不對也擋", async () => {
    const env = makeEnv();
    expect((await reg(env, { privacyVersion: "" })).status).toBe(400);
    expect((await reg(env, { privacyVersion: "昨天" })).status).toBe(400);
  });
  it("有帶班級名稱時名稱不能重複", async () => {
    const env = makeEnv();
    expect((await reg(env)).status).toBe(200);
    const dup = await reg(env, { username: "teacher2" });
    expect(dup.status).toBe(400);
    expect((await dup.json()).error.message).toMatch(/班級名稱/);
  });
  it("老師註冊可以不填班級名稱：自動命名，同名顯示名稱不會撞，代碼自動發", async () => {
    const env = makeEnv();
    const a = await (await reg(env, { username: "t1", className: "", displayName: "劉德華 老師" })).json();
    expect(a.user.className).toBe("劉德華 老師的班級");
    expect(a.user.classCode).toMatch(/^[A-Z0-9]{4,10}$/);
    const r = await reg(env, { username: "t2", className: "", displayName: "劉德華 老師" });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.user.className).toContain(b.user.classCode);
    expect(b.user.classCode).not.toBe(a.user.classCode);
  });
  it("帳號不分大小寫，重複註冊被擋", async () => {
    const env = makeEnv();
    expect((await reg(env)).status).toBe(200);
    const again = await reg(env, { username: "TEACHER1", className: "別班" });
    expect(again.status).toBe(400);
    expect((await again.json()).error.message).toMatch(/已經被使用/);
  });
  it("成功註冊：帳號存小寫、回 token、個資同意寫進資料庫、不存明文密碼", async () => {
    const env = makeEnv();
    const r = await reg(env);
    const d = await r.json();
    expect(r.status).toBe(200);
    expect(d.user.username).toBe("teacher1");
    expect(d.user.className).toBe("六年1班");
    expect(d.token).toContain(".");
    const row = await env.DB.prepare("SELECT privacy_version, privacy_consent_at, password_hash FROM users WHERE username = ?").bind("teacher1").first();
    expect(row.privacy_version).toBe("2026-11-05");
    expect(row.privacy_consent_at).toBeGreaterThan(0);
    expect(row.password_hash).not.toContain("abc123");
  });
  it("學生用不存在的班級代碼註冊被擋，用老師的班級名稱可加入", async () => {
    const env = makeEnv();
    await reg(env);
    const stu = { username: "stu1", password: "pw1234", role: "student", privacyVersion: "2026-11-05" };
    expect((await call(env, "/api/auth/register", { method: "POST", body: { ...stu, classCode: "不存在" } })).status).toBe(400);
    const ok = await call(env, "/api/auth/register", { method: "POST", body: { ...stu, classCode: "六年1班" } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).user.classId).toBeTruthy();
  });
  it("非 POST 回 405，OPTIONS 回 CORS", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/auth/register")).status).toBe(405);
    const o = await call(env, "/api/auth/register", { method: "OPTIONS" });
    expect(o.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("登入與 session", () => {
  it("密碼不分大小寫，帳號也不分", async () => {
    const env = makeEnv();
    await reg(env);
    for (const [u, p] of [["teacher1", "abc123"], ["TEACHER1", "ABC123"]]) {
      expect((await login(env, u, p)).status).toBe(200);
    }
  });
  it("密碼錯回 401；錯滿 10 次鎖住，即使之後打對也回 429", async () => {
    const env = makeEnv();
    await reg(env);
    for (let i = 0; i < 10; i++) {
      expect((await login(env, "teacher1", "wrong!" + i)).status).toBe(401);
    }
    expect((await login(env, "teacher1", "abc123")).status).toBe(429);
  });
  it("登入成功會清掉失敗計數", async () => {
    const env = makeEnv();
    await reg(env);
    await login(env, "teacher1", "nope123");
    expect(env.COOLDOWN_KV._m.get("loginfail:teacher1")).toBe("1");
    await login(env, "teacher1", "abc123");
    expect(env.COOLDOWN_KV._m.has("loginfail:teacher1")).toBe(false);
  });
  it("舊帳號（密碼含大寫）照原樣打對可登入，並自動遷移成小寫版", async () => {
    const env = makeEnv();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode("OldPass1"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, km, 256);
    const b64 = (u) => btoa(String.fromCharCode(...u));
    await env.DB.prepare("INSERT INTO users (username, password_hash, salt, role, display_name, created_at) VALUES (?,?,?,?,?,?)")
      .bind("olduser", b64(new Uint8Array(bits)), b64(salt), "student", "舊生", Date.now()).run();
    expect((await login(env, "olduser", "OldPass1")).status).toBe(200);
    expect((await login(env, "olduser", "oldpass1")).status).toBe(200);   // 已遷移，小寫也進得去
  });
  it("/api/auth/me：有效 token 取回自己；沒帶或被竄改的不行", async () => {
    const env = makeEnv();
    const { token } = await (await reg(env)).json();
    const me = await call(env, "/api/auth/me", { headers: { "X-Session-Token": token } });
    expect(me.status).toBe(200);
    expect((await me.json()).user.username).toBe("teacher1");
    expect((await call(env, "/api/auth/me", { headers: { "X-Session-Token": token.slice(0, -3) + "AAA" } })).status).toBe(401);
    expect((await call(env, "/api/auth/me")).status).toBe(401);
  });
  it("改掉內容（例如把角色改成管理員）簽章就對不上", async () => {
    const env = makeEnv();
    const { token } = await (await reg(env)).json();
    const dot = token.lastIndexOf(".");
    const data = JSON.parse(atob(token.slice(0, dot)));
    data.role = "superadmin";
    const forged = btoa(JSON.stringify(data)) + token.slice(dot);
    expect((await call(env, "/api/auth/me", { headers: { "X-Session-Token": forged } })).status).toBe(401);
  });
});

describe("沒設 SESSION_SECRET 時拒絕（fail closed）", () => {
  it("註冊與登入都不發 token，帶任何 token 都視為沒登入", async () => {
    const env = makeEnv({ SESSION_SECRET: undefined });
    const r = await reg(env);
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body.token).toBeUndefined();
    expect((await call(env, "/api/auth/me", { headers: { "X-Session-Token": "e30=.abc" } })).status).toBe(401);
  });
});
