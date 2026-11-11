import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req, registerUser } from "./helpers.js";

const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});
const auth = (u) => ({ "X-Session-Token": u.token });
const items = [{ q: "第一題", o: ["甲", "乙"], a: "A", e: "解析", s: 5 }];

// 家長綁定孩子:孩子先產生 6 位綁定碼,家長輸入後才連結
async function linkChild(env, student, parent, code) {
  if (code === undefined) code = (await (await call(env, "/api/student/bind-code", { method: "POST", headers: auth(student) })).json()).code;
  return call(env, "/api/parent/link-child", { method: "POST", body: { bindCode: code }, headers: auth(parent) });
}

// 一個老師（含班級）、一個學生、一個家長
async function world() {
  const env = makeEnv();
  const teacher = await registerUser(worker, env);
  const student = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined, classCode: "六年1班" });
  const parent = await registerUser(worker, env, { username: "par1", role: "parent", className: undefined });
  return { env, teacher, student, parent };
}

describe("學生加入班級", () => {
  it("只有學生能加入；班級代碼要存在；成功後 me 看得到班級", async () => {
    const { env, teacher } = await world();
    const s2 = await registerUser(worker, env, { username: "stu2", role: "student", className: undefined });
    expect((await call(env, "/api/auth/join-class", { method: "POST", body: { classCode: "六年1班" } })).status).toBe(401);
    expect((await call(env, "/api/auth/join-class", { method: "POST", body: { classCode: "六年1班" }, headers: auth(teacher) })).status).toBe(403);
    expect((await call(env, "/api/auth/join-class", { method: "POST", body: { classCode: "" }, headers: auth(s2) })).status).toBe(400);
    expect((await call(env, "/api/auth/join-class", { method: "POST", body: { classCode: "沒這班" }, headers: auth(s2) })).status).toBe(400);
    const ok = await call(env, "/api/auth/join-class", { method: "POST", body: { classCode: "六年1班" }, headers: auth(s2) });
    expect((await ok.json()).className).toBe("六年1班");
    expect((await (await call(env, "/api/auth/me", { headers: auth(s2) })).json()).user.className).toBe("六年1班");
    expect((await call(env, "/api/auth/join-class", { method: "GET" })).status).toBe(405);
  });
});

describe("班級出題歷史", () => {
  it("只有老師能存、能看、能刪；學生和沒登入都不行", async () => {
    const { env, teacher, student } = await world();
    for (const h of [{}, auth(student)]) {
      expect((await call(env, "/api/history", { method: "POST", body: { title: "t", items }, headers: h })).status).toBe(401);
      expect((await call(env, "/api/history", { headers: h })).status).toBe(401);
      expect((await call(env, "/api/history/1", { method: "DELETE", headers: h })).status).toBe(401);
    }
    expect((await call(env, "/api/history", { method: "POST", body: { title: "t", items: [] }, headers: auth(teacher) })).status).toBe(400);
    expect((await call(env, "/api/history", { method: "POST", body: { title: "小考", items }, headers: auth(teacher) })).status).toBe(200);
    const list = await (await call(env, "/api/history", { headers: auth(teacher) })).json();
    expect(list.history).toHaveLength(1);
    expect(list.history[0].items).toEqual(items);
  });
  it("每班最多 50 份，超過自動刪最舊的", async () => {
    const { env, teacher } = await world();
    for (let i = 0; i < 52; i++) {
      await call(env, "/api/history", { method: "POST", body: { title: "t" + i, items }, headers: auth(teacher) });
    }
    const list = await (await call(env, "/api/history", { headers: auth(teacher) })).json();
    expect(list.history).toHaveLength(50);
  });
  it("不能刪別班老師的歷史（回 404，不透露存在）", async () => {
    const { env, teacher } = await world();
    const other = await registerUser(worker, env, { username: "teacher2", className: "五年2班" });
    await call(env, "/api/history", { method: "POST", body: { title: "t", items }, headers: auth(teacher) });
    const id = (await (await call(env, "/api/history", { headers: auth(teacher) })).json()).history[0].id;
    expect((await call(env, "/api/history/" + id, { method: "DELETE", headers: auth(other) })).status).toBe(404);
    expect((await call(env, "/api/history/" + id, { method: "DELETE", headers: auth(teacher) })).status).toBe(200);
    expect((await call(env, "/api/history/" + id, { method: "GET", headers: auth(teacher) })).status).toBe(405);
  });
});

describe("家長連結孩子(要孩子產生綁定碼)", () => {
  it("只有學生能產生綁定碼；只有家長能用它連結；連結後孩子清單看得到", async () => {
    const { env, teacher, student, parent } = await world();
    expect((await call(env, "/api/student/bind-code", { method: "POST", headers: auth(parent) })).status).toBe(401);
    expect((await call(env, "/api/student/bind-code", { method: "POST" })).status).toBe(401);
    const { code } = await (await call(env, "/api/student/bind-code", { method: "POST", headers: auth(student) })).json();
    expect(code).toMatch(/^[1-9]\d{5}$/);
    expect((await call(env, "/api/parent/link-child", { method: "POST", body: { bindCode: code }, headers: auth(student) })).status).toBe(401);
    expect((await call(env, "/api/parent/link-child", { method: "POST", body: { bindCode: "" }, headers: auth(parent) })).status).toBe(400);
    expect((await call(env, "/api/parent/link-child", { method: "POST", body: { studentUsername: "stu1" }, headers: auth(parent) })).status).toBe(400);   // 只猜帳號名稱不能連結
    expect((await linkChild(env, student, parent, code)).status).toBe(200);
    expect((await linkChild(env, student, parent, code)).status).toBe(404);   // 綁定碼只能用一次
    const kids = await (await call(env, "/api/parent/children", { headers: auth(parent) })).json();
    expect(kids.children.map((c) => c.username)).toEqual(["stu1"]);
    expect((await call(env, "/api/parent/children", { headers: auth(teacher) })).status).toBe(401);
  });
  it("猜錯綁定碼每小時 10 次後被擋，連正確的也要等", async () => {
    const { env, student, parent } = await world();
    for (let i = 0; i < 10; i++) expect((await linkChild(env, student, parent, String(100000 + i))).status).toBe(404);
    expect((await linkChild(env, student, parent)).status).toBe(429);
  });
});

describe("即時進度與監看", () => {
  // 即時進度只收真的存在的分享,測試先把假的分享代號寫進 KV
  const post = async (env, body) => { if (body.shareId && /^[A-Za-z0-9_-]+$/.test(body.shareId)) await env.COOLDOWN_KV.put("share:" + body.shareId, "{}"); return call(env, "/api/live-progress", { method: "POST", body }); };
  const progress = { shareId: "share12345", studentId: "dev-1", studentInfo: { name: "小明", seat: "3" }, answered: 2, total: 10, answers: [{ i: 0, selected: "A" }] };

  it("上報要有識別碼，且只准安全字元", async () => {
    const env = makeEnv();
    expect((await post(env, { shareId: "", studentId: "x" })).status).toBe(400);
    expect((await post(env, { shareId: "a/../b", studentId: "x" })).status).toBe(400);
    expect((await post(env, { shareId: "ok", studentId: "x'--" })).status).toBe(400);
    expect((await call(env, "/api/live-progress", { method: "PUT" })).status).toBe(405);
    expect((await post(env, progress)).status).toBe(200);
  });
  it("同一位學生重複上報是更新，不是新增", async () => {
    const env = makeEnv();
    await post(env, progress);
    await post(env, { ...progress, answered: 5 });
    const rows = (await env.DB.prepare("SELECT answered FROM live_progress").all()).results;
    expect(rows).toEqual([{ answered: 5 }]);
  });
  it("全班進度：沒憑證 401；有儀表板金鑰、老師登入、管理者密碼可看；學生登入不行", async () => {
    const { env, teacher, student } = await world();
    const { id, dashKey } = await (await call(env, "/api/share", { method: "POST", body: { items } })).json();
    await post(env, { ...progress, shareId: id });
    expect((await call(env, "/api/live-progress/" + id)).status).toBe(401);
    expect((await call(env, "/api/live-progress/" + id, { headers: auth(student) })).status).toBe(401);
    expect((await call(env, "/api/live-progress/" + id, { headers: { "X-Dash-Key": "wrong-guess" } })).status).toBe(401);
    for (const h of [{ "X-Dash-Key": dashKey }, auth(teacher), { "X-Admin-Pass": "admin-pass" }]) {
      const r = await call(env, "/api/live-progress/" + id, { headers: h });
      expect(r.status).toBe(200);
      expect((await r.json()).students[0].name).toBe("小明");
    }
    expect((await call(env, "/api/live-progress/" + id + "?k=" + dashKey)).status).toBe(200);   // 網址帶金鑰也行
  });
  it("老師停止全班監看後，金鑰連結失效，但老師登入的帳號不受影響", async () => {
    const { env, teacher } = await world();
    const { id, dashKey } = await (await call(env, "/api/share", { method: "POST", body: { items } })).json();
    expect((await call(env, "/api/live-revoke", { method: "POST", body: { shareId: id } })).status).toBe(403);
    expect((await call(env, "/api/live-revoke", { method: "POST", body: { shareId: id }, headers: { "X-Dash-Key": dashKey } })).status).toBe(200);
    expect((await call(env, "/api/live-progress/" + id, { headers: { "X-Dash-Key": dashKey } })).status).toBe(403);
    expect((await call(env, "/api/live-progress/" + id, { headers: auth(teacher) })).status).toBe(200);
    await call(env, "/api/live-revoke", { method: "POST", body: { shareId: id, revoked: false }, headers: auth(teacher) });
    expect((await call(env, "/api/live-progress/" + id, { headers: { "X-Dash-Key": dashKey } })).status).toBe(200);
  });
  it("學生不能自己關掉監看；老師可以停止單人，家長只能停止自己孩子", async () => {
    const { env, teacher, student, parent } = await world();
    const { id } = await (await call(env, "/api/share", { method: "POST", body: { items } })).json();
    await post(env, { ...progress, shareId: id, studentUsername: "stu1" });
    const revoke = (headers) => call(env, "/api/live-revoke", { method: "POST", body: { shareId: id, studentId: "dev-1" }, headers });
    expect((await revoke({})).status).toBe(403);
    expect((await revoke(auth(student))).status).toBe(403);
    expect((await revoke(auth(parent))).status).toBe(403);     // 還沒連結
    await linkChild(env, student, parent);
    expect((await revoke(auth(parent))).status).toBe(200);
    expect((await call(env, "/api/live-revoke", { method: "GET" })).status).toBe(405);
    expect((await call(env, "/api/live-revoke", { method: "POST", body: "{壞" })).status).toBe(400);
    expect((await call(env, "/api/live-revoke", { method: "POST", body: {} })).status).toBe(400);
    expect((await revoke(auth(teacher))).status).toBe(200);
  });
  it("單人進度：停止後家長連結失效，持儀表板金鑰的老師仍看得到；找不到回 404", async () => {
    const { env } = await world();
    const { id, dashKey } = await (await call(env, "/api/share", { method: "POST", body: { items } })).json();
    await post(env, { ...progress, shareId: id });
    expect((await call(env, `/api/live-progress/${id}/dev-1`)).status).toBe(200);
    expect((await call(env, `/api/live-progress/${id}/nobody`)).status).toBe(404);
    await call(env, "/api/live-revoke", { method: "POST", body: { shareId: id, studentId: "dev-1" }, headers: { "X-Dash-Key": dashKey } });
    expect((await call(env, `/api/live-progress/${id}/dev-1`)).status).toBe(403);
    expect((await call(env, `/api/live-progress/${id}/dev-1`, { headers: { "X-Dash-Key": dashKey } })).status).toBe(200);
  });
  it("家長用孩子帳號看他正在寫的那一份；沒連結的看不到", async () => {
    const { env, parent, teacher, student } = await world();
    await post(env, { ...progress, studentUsername: "stu1" });
    expect((await call(env, "/api/parent/child-live/stu1", { headers: auth(parent) })).status).toBe(403);
    await linkChild(env, student, parent);
    const r = await call(env, "/api/parent/child-live/stu1", { headers: auth(parent) });
    expect((await r.json()).answered).toBe(2);
    expect((await call(env, "/api/parent/child-live/stu1", { headers: auth(teacher) })).status).toBe(401);
    expect((await call(env, "/api/parent/child-live/stu1")).status).toBe(401);
  });
  it("孩子沒有正在作答的測驗回 404", async () => {
    const { env, parent, student } = await world();
    await linkChild(env, student, parent);
    expect((await call(env, "/api/parent/child-live/stu1", { headers: auth(parent) })).status).toBe(404);
  });
});

describe("遊戲雲端存檔", () => {
  it("要登入；存了讀得到；一人只能讀到自己的；格子限 1~4", async () => {
    const { env, student, parent } = await world();
    expect((await call(env, "/api/game/save")).status).toBe(401);
    expect((await call(env, "/api/game/slots")).status).toBe(401);
    const save = { game: "mul99", slot: 9, data: { save: { lv: 7, hero: "虎", gold: 50 } } };
    const w = await (await call(env, "/api/game/save", { method: "POST", body: save, headers: auth(student) })).json();
    expect(w.slot).toBe(4);   // 9 被夾到 4
    const got = await (await call(env, "/api/game/save?slot=4", { headers: auth(student) })).json();
    expect(got.data.save.lv).toBe(7);
    const mine = await (await call(env, "/api/game/save?slot=4", { headers: auth(parent) })).json();
    expect(mine.data).toBeNull();
    const slots = await (await call(env, "/api/game/slots", { headers: auth(student) })).json();
    expect(slots.slots[0]).toMatchObject({ slot: 4, lv: 7, hero: "虎", gold: 50 });
  });
  it("壞內容與太大的存檔被擋；刪除後讀不到；亂寫的遊戲代號退回預設", async () => {
    const { env, student } = await world();
    const h = auth(student);
    expect((await call(env, "/api/game/save", { method: "POST", body: { data: null }, headers: h })).status).toBe(400);
    expect((await call(env, "/api/game/save", { method: "POST", body: "{壞", headers: h })).status).toBe(400);
    expect((await call(env, "/api/game/save", { method: "POST", body: { data: { x: "y".repeat(210000) } }, headers: h })).status).toBe(413);
    await call(env, "/api/game/save", { method: "POST", body: { game: "../../etc", slot: 1, data: { a: 1 } }, headers: h });
    expect((await (await call(env, "/api/game/save?slot=1", { headers: h })).json()).game).toBe("mul99");
    expect((await call(env, "/api/game/save?slot=1", { method: "DELETE", headers: h })).status).toBe(200);
    expect((await (await call(env, "/api/game/save?slot=1", { headers: h })).json()).data).toBeNull();
    expect((await call(env, "/api/game/save", { method: "PUT", headers: h })).status).toBe(405);
  });
});

describe("超級管理員後台", () => {
  // 沒有自助註冊管理員，所以直接在資料庫塞一個，再登入拿 token
  async function admin(env) {
    const { hash, salt } = await (async () => {
      const s = crypto.getRandomValues(new Uint8Array(16));
      const km = await crypto.subtle.importKey("raw", new TextEncoder().encode("adminpw1"), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: s, iterations: 100000, hash: "SHA-256" }, km, 256);
      const b64 = (u) => btoa(String.fromCharCode(...u));
      return { hash: b64(new Uint8Array(bits)), salt: b64(s) };
    })();
    await env.DB.prepare("INSERT INTO users (username, password_hash, salt, role, display_name, created_at) VALUES (?,?,?,?,?,?)").bind("root", hash, salt, "superadmin", "管理員", Date.now()).run();
    return (await (await call(env, "/api/auth/login", { method: "POST", body: { username: "root", password: "adminpw1" } })).json());
  }

  it("管理員可列帳號、搜尋；其他角色都被擋", async () => {
    const { env, teacher } = await world();
    const a = await admin(env);
    const all = await (await call(env, "/api/admin/users", { headers: auth(a) })).json();
    expect(all.users.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(all)).not.toMatch(/password_hash|salt/);   // 不吐出雜湊
    expect((await call(env, "/api/admin/users?q=stu", { headers: auth(a) })).status).toBe(200);
    expect((await call(env, "/api/admin/users", { headers: auth(teacher) })).status).toBe(401);
  });
  it("管理員可手動建帳號（規則同註冊），可建老師要班級名稱", async () => {
    const { env } = await world();
    const a = await admin(env);
    const make = (body) => call(env, "/api/admin/users", { method: "POST", body, headers: auth(a) });
    expect((await make({ username: "x", password: "pw1234", role: "hacker" })).status).toBe(400);
    expect((await make({ username: "王小明", password: "pw1234", role: "student" })).status).toBe(400);
    expect((await make({ username: "t9", password: "pw1234", role: "teacher" })).status).toBe(400);
    expect((await make({ username: "teacher1", password: "pw1234", role: "student" })).status).toBe(400);
    expect((await make({ username: "t9", password: "pw1234", role: "teacher", className: "新班" })).status).toBe(200);
    expect((await make({ username: "s9", password: "pw1234", role: "student" })).status).toBe(200);
    expect((await call(env, "/api/admin/users", { method: "POST", body: { username: "s8", password: "pw1234", role: "student" } })).status).toBe(401);
  });
});

describe("超級管理員：改帳號與刪帳號", () => {
  async function adminOf(env) {
    const s = crypto.getRandomValues(new Uint8Array(16));
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode("adminpw1"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: s, iterations: 100000, hash: "SHA-256" }, km, 256);
    const b64 = (u) => btoa(String.fromCharCode(...u));
    await env.DB.prepare("INSERT INTO users (username, password_hash, salt, role, display_name, created_at) VALUES (?,?,?,?,?,?)").bind("root", b64(new Uint8Array(bits)), b64(s), "superadmin", "管理員", Date.now()).run();
    return (await call(env, "/api/auth/login", { method: "POST", body: { username: "root", password: "adminpw1" } })).json();
  }
  const patch = (env, a, id, body) => call(env, "/api/admin/users/" + id, { method: "PATCH", body, headers: auth(a) });
  const del = (env, a, id) => call(env, "/api/admin/users/" + id, { method: "DELETE", headers: auth(a) });

  it("改名、改角色、重設密碼（新密碼照規則；改完可用新密碼登入）", async () => {
    const { env, student, teacher } = await world();
    const a = await adminOf(env);
    const id = student.user.id;
    expect((await patch(env, a, 9999, { displayName: "x" })).status).toBe(404);
    expect((await patch(env, a, id, {})).status).toBe(400);
    expect((await patch(env, a, id, { newPassword: "abc" })).status).toBe(400);
    expect((await patch(env, a, id, { displayName: "新名字", role: "parent", newPassword: "newpass9" })).status).toBe(200);
    const row = await env.DB.prepare("SELECT display_name, role FROM users WHERE id = ?").bind(id).first();
    expect(row).toMatchObject({ display_name: "新名字", role: "parent" });
    expect((await call(env, "/api/auth/login", { method: "POST", body: { username: "stu1", password: "newpass9" } })).status).toBe(200);
    expect((await call(env, "/api/admin/users/" + id, { method: "PATCH", body: { displayName: "x" }, headers: auth(teacher) })).status).toBe(401);
    expect((await call(env, "/api/admin/users/" + id, { method: "OPTIONS" })).status).toBe(200);
  });
  it("不能刪自己；沒權限不能刪；找不到回 404", async () => {
    const { env, student } = await world();
    const a = await adminOf(env);
    expect((await del(env, a, a.user.id)).status).toBe(400);
    expect((await call(env, "/api/admin/users/" + student.user.id, { method: "DELETE", headers: auth(student) })).status).toBe(401);
    expect((await del(env, a, 9999)).status).toBe(404);
  });
  it("刪老師：連班級與歷史一起刪，學生的班級設回空", async () => {
    const { env, teacher, student } = await world();
    const a = await adminOf(env);
    await call(env, "/api/history", { method: "POST", body: { title: "t", items }, headers: auth(teacher) });
    expect((await del(env, a, teacher.user.id)).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM classes").first()).c).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM quiz_history").first()).c).toBe(0);
    expect((await env.DB.prepare("SELECT class_id FROM users WHERE id = ?").bind(student.user.id).first()).class_id).toBeNull();
  });
  it("刪家長或學生：連結一起清掉，不留孤兒資料", async () => {
    const { env, student, parent } = await world();
    const a = await adminOf(env);
    await linkChild(env, student, parent);
    expect((await del(env, a, parent.user.id)).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM parent_child_links").first()).c).toBe(0);
    const p2 = await registerUser(worker, env, { username: "par2", role: "parent", className: undefined });
    await linkChild(env, student, p2);
    expect((await del(env, a, student.user.id)).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) c FROM parent_child_links").first()).c).toBe(0);
  });
});
