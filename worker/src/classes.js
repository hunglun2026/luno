// 鴻綸 刻度｜老師的多個班級（2026-11-11）：列出、新增、改名、刪除、切換目前班。
// 班級代碼的產生與驗證在 classcode.js；歷史記錄的 classId 參數在 index.js 的 handleHistory*。
// 共用工具（json、CORS_HEADERS、verifySession）由 index.js 以 deps 傳入，跟 classcode.js 一樣的做法。
import { listTeacherClasses, ensureClassCode, validateCustomCode, codeIsFree, insertClass, newClassCode } from "./classcode.js";

const MAX_CLASSES_PER_TEACHER = 30;

function cleanName(input) {
  return String(input || "").trim().slice(0, 50);
}

// /api/classes 系列路由。rest 是 "/api/classes" 後面的部分："" 或 "/12" 或 "/12/select"
export async function handleClasses(request, env, deps, rest) {
  const { json, CORS_HEADERS, verifySession } = deps;
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const session = await verifySession(request, env);
  if (!session || session.role !== "teacher") return json({ error: { message: "只有登入的老師可以管理班級" } }, 401);

  try {
    const m = /^\/(\d+)(\/select)?$/.exec(rest);
    if (rest === "" || rest === "/") {
      if (request.method === "GET") return json({ classes: await listTeacherClasses(env, session.uid) });
      if (request.method === "POST") return await createClass(request, env, session, json);
      return json({ error: { message: "Method Not Allowed" } }, 405);
    }
    if (!m) return json({ error: { message: "Not Found" } }, 404);

    const classId = Number(m[1]);
    // 一律先確認這個班是自己的；別人的班與不存在的班都回 404，不透露差別
    const own = await env.DB.prepare("SELECT id, name FROM classes WHERE id = ? AND teacher_id = ?").bind(classId, session.uid).first();
    if (!own) return json({ error: { message: "找不到這個班級" } }, 404);

    if (m[2]) {
      if (request.method !== "POST") return json({ error: { message: "Method Not Allowed" } }, 405);
      await env.DB.prepare("UPDATE users SET class_id = ? WHERE id = ?").bind(classId, session.uid).run();
      return json({ classId, className: own.name, classCode: await ensureClassCode(env, classId) });
    }
    if (request.method === "PATCH") return await renameClass(request, env, session, own, json);
    if (request.method === "DELETE") return await deleteClass(env, session, own, json);
    return json({ error: { message: "Method Not Allowed" } }, 405);
  } catch (err) {
    return json({ error: { message: err.message } }, 500);
  }
}

async function nameTaken(env, uid, name, exceptId) {
  const row = await env.DB.prepare("SELECT id FROM classes WHERE teacher_id = ? AND name = ?").bind(uid, name).first();
  return !!row && row.id !== exceptId;
}

async function createClass(request, env, session, json) {
  const body = await request.json();
  const name = cleanName(body.name);
  if (!name) return json({ error: { message: "請輸入班級名稱" } }, 400);

  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM classes WHERE teacher_id = ?").bind(session.uid).first();
  if (count.c >= MAX_CLASSES_PER_TEACHER) {
    return json({ error: { message: "一個帳號最多 " + MAX_CLASSES_PER_TEACHER + " 個班級" } }, 400);
  }
  if (await nameTaken(env, session.uid, name, null)) {
    return json({ error: { message: "你已經有一個叫「" + name + "」的班級了，請換個名稱" } }, 400);
  }

  // 代碼：老師自訂（選填）或系統產一組好唸的
  let customCode = "";
  if (String(body.code || "").trim()) {
    const v = validateCustomCode(body.code);
    if (v.error) return json({ error: { message: v.error } }, 400);
    if (!(await codeIsFree(env, v.code, null))) return json({ error: { message: "這個班級代碼已經有人用了，請換一個" } }, 400);
    customCode = v.code;
  } else {
    for (let i = 0; i < 12 && !customCode; i++) {
      const c = newClassCode();
      if (await codeIsFree(env, c, null)) customCode = c;
    }
    if (!customCode) return json({ error: { message: "產生班級代碼失敗，請再試一次" } }, 500);
  }

  const id = await insertClass(env, name, session.uid, Date.now(), customCode);
  // 剛建的班直接成為目前班，老師接著就能存試卷進去
  await env.DB.prepare("UPDATE users SET class_id = ? WHERE id = ?").bind(id, session.uid).run();
  return json({ classId: id, className: name, classCode: customCode, classes: await listTeacherClasses(env, session.uid) });
}

async function renameClass(request, env, session, own, json) {
  const body = await request.json();
  const name = cleanName(body.name);
  if (!name) return json({ error: { message: "請輸入班級名稱" } }, 400);
  if (await nameTaken(env, session.uid, name, own.id)) {
    return json({ error: { message: "你已經有一個叫「" + name + "」的班級了，請換個名稱" } }, 400);
  }
  await env.DB.prepare("UPDATE classes SET name = ? WHERE id = ?").bind(name, own.id).run();
  return json({ classId: own.id, className: name });
}

// 刪班：該班歷史一併刪掉、學生退出該班（class_id 設回 NULL），至少要留一個班
async function deleteClass(env, session, own, json) {
  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM classes WHERE teacher_id = ?").bind(session.uid).first();
  if (count.c <= 1) return json({ error: { message: "至少要留一個班級，這是你唯一的班" } }, 400);

  // 老師自己的 users.class_id 若指向要刪的班，要先改指到剩下最早建的班（外鍵限制，不能先刪班）
  const me = await env.DB.prepare("SELECT class_id FROM users WHERE id = ?").bind(session.uid).first();
  let currentId = me && me.class_id;
  if (!currentId || currentId === own.id) {
    const first = await env.DB.prepare(
      "SELECT id FROM classes WHERE teacher_id = ? AND id != ? ORDER BY created_at ASC, id ASC LIMIT 1"
    ).bind(session.uid, own.id).first();
    currentId = first.id;   // 前面已確認至少有兩個班
    await env.DB.prepare("UPDATE users SET class_id = ? WHERE id = ?").bind(currentId, session.uid).run();
  }

  await env.DB.prepare("DELETE FROM quiz_history WHERE class_id = ?").bind(own.id).run();
  await env.DB.prepare("UPDATE users SET class_id = NULL WHERE class_id = ?").bind(own.id).run();
  await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(own.id).run();
  return json({ ok: true, currentClassId: currentId, classes: await listTeacherClasses(env, session.uid) });
}
