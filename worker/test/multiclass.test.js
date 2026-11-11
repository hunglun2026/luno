import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req, registerUser } from "./helpers.js";

// 一個老師多個班級（2026-11-11）
const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});
const auth = (u) => ({ "X-Session-Token": u.token });
const items = [{ q: "第一題", o: ["甲", "乙"], a: "A", e: "解析", s: 5 }];
const jpost = (env, path, body, u) => call(env, path, { method: "POST", body, headers: auth(u) });

async function addClass(env, t, name, code) {
  const r = await jpost(env, "/api/classes", { name, code }, t);
  return { status: r.status, ...(await r.json()) };
}

describe("老師多班級", () => {
  it("註冊就有一個班；登入與 me 都回 classes 清單；學生沒有", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    expect(t.user.classes).toHaveLength(1);
    expect(t.user.classes[0]).toMatchObject({ id: t.user.classId, name: "六年1班", code: t.user.classCode, studentCount: 0 });
    const me = await (await call(env, "/api/auth/me", { headers: auth(t) })).json();
    expect(me.user.classes).toHaveLength(1);
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: t.user.classCode });
    expect(s.user.classes).toBeUndefined();
    const t2 = await (await call(env, "/api/auth/me", { headers: auth(t) })).json();
    expect(t2.user.classes[0].studentCount).toBe(1);
  });

  it("建第二個班：自動發不同代碼、成為目前班；自訂代碼可用、重複被擋", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const b = await addClass(env, t, "六年2班");
    expect(b.status).toBe(200);
    expect(b.classCode).toMatch(/^[A-Z0-9]{4,10}$/);
    expect(b.classCode).not.toBe(t.user.classCode);
    expect(b.classes).toHaveLength(2);
    const me = await (await call(env, "/api/auth/me", { headers: auth(t) })).json();
    expect(me.user.classId).toBe(b.classId);   // 新班成為目前班
    expect((await addClass(env, t, "六年3班", "LIN603")).classCode).toBe("LIN603");
    expect((await addClass(env, t, "六年4班", "lin603")).status).toBe(400);   // 代碼重複
    expect((await addClass(env, t, "六年2班")).status).toBe(400);              // 同老師同名
    expect((await addClass(env, t, "  ")).status).toBe(400);                    // 沒名稱
    expect((await addClass(env, t, "x", "中文")).status).toBe(400);             // 代碼格式
  });

  it("不同老師可以有同名班；學生用代碼進對的班，同名班只輸入名稱不算數", async () => {
    const env = makeEnv();
    const t1 = await registerUser(worker, env);
    const t2 = await registerUser(worker, env, { username: "teacher2", className: "六年1班" });
    expect(t2.user.classCode).not.toBe(t1.user.classCode);
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: t2.user.classCode });
    expect(s.user.classId).toBe(t2.user.classId);
    const byName = await call(env, "/api/auth/register", { method: "POST", body: { username: "stu2", password: "abc123", role: "student", classCode: "六年1班", privacyVersion: "2026-11-05" } });
    expect(byName.status).toBe(400);   // 兩個班都叫六年1班，名稱對不到唯一一班
  });

  it("學生用不同班的代碼，各進各班", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const b = await addClass(env, t, "六年2班");
    const s1 = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: t.user.classCode });
    const s2 = await registerUser(worker, env, { username: "stu2", role: "student", className: undefined, classCode: b.classCode });
    expect(s1.user.classId).toBe(t.user.classId);
    expect(s2.user.classId).toBe(b.classId);
  });

  it("改名、切換目前班、改某班的代碼；權限：別人的班一律 404 / 400", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const other = await registerUser(worker, env, { username: "teacher2", className: "五年2班" });
    const b = await addClass(env, t, "六年2班");

    const ren = await call(env, "/api/classes/" + b.classId, { method: "PATCH", body: { name: "六年乙班" }, headers: auth(t) });
    expect(ren.status).toBe(200);
    expect((await call(env, "/api/classes/" + b.classId, { method: "PATCH", body: { name: "六年1班" }, headers: auth(t) })).status).toBe(400);

    const sel = await jpost(env, "/api/classes/" + t.user.classId + "/select", {}, t);
    expect(sel.status).toBe(200);
    expect((await (await call(env, "/api/auth/me", { headers: auth(t) })).json()).user.classId).toBe(t.user.classId);

    // 改指定班的代碼，不影響目前班
    const setCode = await jpost(env, "/api/class/code", { classId: b.classId, code: "YI602" }, t);
    expect((await setCode.json()).classCode).toBe("YI602");
    const list = await (await call(env, "/api/classes", { headers: auth(t) })).json();
    expect(list.classes.find((c) => c.id === b.classId).code).toBe("YI602");
    expect(list.classes.find((c) => c.id === t.user.classId).code).toBe(t.user.classCode);

    // 別的老師碰不到
    expect((await call(env, "/api/classes/" + b.classId, { method: "PATCH", body: { name: "hack" }, headers: auth(other) })).status).toBe(404);
    expect((await call(env, "/api/classes/" + b.classId, { method: "DELETE", headers: auth(other) })).status).toBe(404);
    expect((await jpost(env, "/api/classes/" + b.classId + "/select", {}, other)).status).toBe(404);
    expect((await jpost(env, "/api/class/code", { classId: b.classId, code: "HACK99" }, other)).status).toBe(400);
    // 學生與未登入不能管理班級
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined });
    expect((await call(env, "/api/classes", { headers: auth(s) })).status).toBe(401);
    expect((await call(env, "/api/classes")).status).toBe(401);
    expect((await call(env, "/api/classes", { method: "DELETE", headers: auth(t) })).status).toBe(405);
  });

  it("歷史依班級分開：帶 classId 存進指定班，不帶存目前班；看別人的班 404", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const other = await registerUser(worker, env, { username: "teacher2", className: "五年2班" });
    const b = await addClass(env, t, "六年2班");   // 目前班變成 B

    await jpost(env, "/api/history", { title: "存A", items, classId: t.user.classId }, t);
    await jpost(env, "/api/history", { title: "存B(預設目前班)", items }, t);
    const a = await (await call(env, "/api/history?classId=" + t.user.classId, { headers: auth(t) })).json();
    const bb = await (await call(env, "/api/history?classId=" + b.classId, { headers: auth(t) })).json();
    const cur = await (await call(env, "/api/history", { headers: auth(t) })).json();
    expect(a.history.map((h) => h.title)).toEqual(["存A"]);
    expect(bb.history.map((h) => h.title)).toEqual(["存B(預設目前班)"]);
    expect(cur.history).toHaveLength(1);

    // 不能存進或查看別人的班
    expect((await jpost(env, "/api/history", { title: "x", items, classId: other.user.classId }, t)).status).toBe(400);
    expect((await call(env, "/api/history?classId=" + other.user.classId, { headers: auth(t) })).status).toBe(404);
    // 可以刪非目前班的歷史；別人不能刪
    expect((await call(env, "/api/history/" + a.history[0].id, { method: "DELETE", headers: auth(other) })).status).toBe(404);
    expect((await call(env, "/api/history/" + a.history[0].id, { method: "DELETE", headers: auth(t) })).status).toBe(200);
  });

  it("每班各自 50 份上限", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const b = await addClass(env, t, "六年2班");
    await jpost(env, "/api/history", { title: "A獨有", items, classId: t.user.classId }, t);
    for (let i = 0; i < 52; i++) await jpost(env, "/api/history", { title: "b" + i, items, classId: b.classId }, t);
    expect((await (await call(env, "/api/history?classId=" + b.classId, { headers: auth(t) })).json()).history).toHaveLength(50);
    expect((await (await call(env, "/api/history?classId=" + t.user.classId, { headers: auth(t) })).json()).history).toHaveLength(1);
  });

  it("刪班：歷史一起刪、學生退出該班；唯一的班不能刪；刪掉目前班會改成剩下的班", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    expect((await call(env, "/api/classes/" + t.user.classId, { method: "DELETE", headers: auth(t) })).status).toBe(400);
    const b = await addClass(env, t, "六年2班");   // 目前班 B
    const s = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: b.classCode });
    await jpost(env, "/api/history", { title: "t", items }, t);
    const del = await call(env, "/api/classes/" + b.classId, { method: "DELETE", headers: auth(t) });
    expect(del.status).toBe(200);
    const d = await del.json();
    expect(d.currentClassId).toBe(t.user.classId);
    expect(d.classes).toHaveLength(1);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM quiz_history").first()).c).toBe(0);
    expect((await call(env, "/api/auth/me", { headers: auth(s) }).then((x) => x.json())).user.classId).toBeNull();
    expect((await call(env, "/api/auth/me", { headers: auth(t) }).then((x) => x.json())).user.classId).toBe(t.user.classId);
  });

  it("一個帳號最多 30 個班", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    for (let i = 2; i <= 30; i++) expect((await addClass(env, t, "班" + i)).status).toBe(200);
    expect((await addClass(env, t, "班31")).status).toBe(400);
  });

  it("管理員刪老師帳號：所有班級都清掉，學生退出", async () => {
    const env = makeEnv();
    const t = await registerUser(worker, env);
    const b = await addClass(env, t, "六年2班");
    await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: b.classCode });
    await jpost(env, "/api/history", { title: "t", items, classId: t.user.classId }, t);
    // 沒有自助註冊管理員，直接在資料庫塞一個再登入拿 token（做法同 roles.test.js）
    const s = crypto.getRandomValues(new Uint8Array(16));
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode("adminpw1"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: s, iterations: 100000, hash: "SHA-256" }, km, 256);
    const b64 = (u) => btoa(String.fromCharCode(...u));
    await env.DB.prepare("INSERT INTO users (username, password_hash, salt, role, display_name, created_at) VALUES (?,?,?,?,?,?)").bind("root", b64(new Uint8Array(bits)), b64(s), "superadmin", "管理員", Date.now()).run();
    const a = await (await call(env, "/api/auth/login", { method: "POST", body: { username: "root", password: "adminpw1" } })).json();

    expect((await call(env, "/api/admin/users/" + t.user.id, { method: "DELETE", headers: auth(a) })).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM classes").first()).c).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM quiz_history").first()).c).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM users WHERE class_id IS NOT NULL").first()).c).toBe(0);
  });
});
