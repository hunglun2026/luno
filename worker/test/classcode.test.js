// 班級加入代碼測試：worker/src/classcode.js ＋ 註冊／登入／me／join-class 的接線。
// D1 用 node:sqlite 跑真的 migrations（含 0008），測的是真的 SQL。
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req, registerUser } from "./helpers.js";
import { newClassCode, normalizeClassCode, findClassByCodeOrName, ensureClassCode } from "../src/classcode.js";

const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});
const auth = (u) => ({ "X-Session-Token": u.token });
const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

describe("代碼產生與正規化", () => {
  it("6 碼、只用容易分辨的字，連產 200 組都合格", () => {
    for (let i = 0; i < 200; i++) expect(newClassCode()).toMatch(CODE);
  });
  it("輸入不分大小寫，空白與減號忽略", () => {
    expect(normalizeClassCode(" k7m-3qx ")).toBe("K7M3QX");
  });
});

describe("老師註冊拿到班級代碼", () => {
  it("註冊、登入、me 都回 classCode，三次拿到同一組；學生看不到代碼", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    expect(t.user.classCode).toMatch(CODE);
    const login = await (await call(env, "/api/auth/login", { method: "POST", body: { username: "teacher1", password: "abc123" } })).json();
    expect(login.user.classCode).toBe(t.user.classCode);
    const me = await (await call(env, "/api/auth/me", { headers: auth(t) })).json();
    expect(me.user.classCode).toBe(t.user.classCode);

    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: t.user.classCode });
    const sme = await (await call(env, "/api/auth/me", { headers: auth(s) })).json();
    expect(sme.user.classCode ?? null).toBe(null);
  });
  it("兩個老師的代碼不同", async () => {
    const env = makeEnv();
    const a = await registerUser(worker, env);
    const b = await registerUser(worker, env, { username: "teacher2", className: "五年2班" });
    expect(a.user.classCode).not.toBe(b.user.classCode);
  });
});

describe("學生用代碼加入班級", () => {
  it("註冊時填代碼（小寫、帶減號也行）就進得了班", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const code = t.user.classCode;
    const typed = (code.slice(0, 3) + "-" + code.slice(3)).toLowerCase();
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: typed });
    expect(s.user.classId).toBe(t.user.classId);
  });
  it("舊做法（輸入班級名稱）照樣可以，已註冊的學生與舊說明不會失效", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: "六年1班" });
    expect(s.user.classId).toBe(t.user.classId);
  });
  it("註冊後用 join-class 補填代碼；代碼錯誤回 400", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined });
    expect((await call(env, "/api/auth/join-class", { method: "POST", body: { classCode: "ZZZZZZ" }, headers: auth(s) })).status).toBe(400);
    const ok = await call(env, "/api/auth/join-class", { method: "POST", body: { classCode: t.user.classCode }, headers: auth(s) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).classId).toBe(t.user.classId);
  });
  it("註冊時填了不存在的代碼會被擋下", async () => {
    const env = makeEnv();
    await registerUser(worker, env);
    const r = await worker.fetch(req("/api/auth/register", {
      method: "POST",
      body: { username: "stu9", password: "abc123", role: "student", classCode: "ZZZZZZ", privacyVersion: "2026-11-05" },
    }), env, {});
    expect(r.status).toBe(400);
  });
});

describe("舊班級（沒有代碼）第一次被讀到就補發", () => {
  it("模擬上線前建立的班級：join_code 是 NULL，老師 me 時補一組且之後不變", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    env.DB._db.exec("UPDATE classes SET join_code = NULL");
    expect(env.DB._db.prepare("SELECT join_code FROM classes").get().join_code).toBe(null);

    const me1 = await (await call(env, "/api/auth/me", { headers: auth(t) })).json();
    expect(me1.user.classCode).toMatch(CODE);
    const me2 = await (await call(env, "/api/auth/me", { headers: auth(t) })).json();
    expect(me2.user.classCode).toBe(me1.user.classCode);
    expect((await findClassByCodeOrName(env, me1.user.classCode)).id).toBe(t.user.classId);
    expect(await ensureClassCode(env, 99999)).toBe(null);
  });
});
