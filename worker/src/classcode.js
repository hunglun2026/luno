// 鴻綸 刻度｜班級加入代碼：產生、查找、補發、老師自訂。
// 系統產的代碼 6 碼「子音＋母音」交錯（像 MOKABE），好唸、好口頭報給學生；字母避開容易看錯的 I、L、O、Q、W、Y、C、J、X。
// 老師可以改成自己的：4 到 10 個英文字母或數字（例如 LIN602），不分大小寫，全站不能重複。
// 學生輸入時不分大小寫，空白與減號會被忽略。舊班級（join_code 還是 NULL）在第一次被老師讀到時補發，見 ensureClassCode。
// 向下相容：學生也可以輸入「班級名稱」加入（最早的做法），findClassByCodeOrName 先比代碼、比不到再比名稱。

const CONSONANTS = "BDFGHKMNPRSTVZ";
const VOWELS = "AEU";
// 查找時接受的代碼形狀：涵蓋舊的 6 碼隨機碼、新的好唸碼、老師自訂的 4 到 10 碼
const CODE_RE = /^[A-Z0-9]{4,10}$/;
// 老師自訂不能用的字：太容易被亂猜或有歧義
const RESERVED = new Set(["TEST", "ADMIN", "NULL", "0000", "1234", "1111", "12345", "123456"]);

function pick(chars) {
  const b = crypto.getRandomValues(new Uint8Array(1))[0];
  return chars[b % chars.length];
}

export function newClassCode() {
  let s = "";
  for (let i = 0; i < 3; i++) s += pick(CONSONANTS) + pick(VOWELS);
  return s;
}

export function normalizeClassCode(input) {
  return String(input || "").trim().toUpperCase().replace(/[\s-]/g, "");
}

// 老師自訂代碼的檢查：回傳 { code } 或 { error }
export function validateCustomCode(input) {
  const code = normalizeClassCode(input);
  if (!code) return { error: "請輸入班級代碼" };
  if (!CODE_RE.test(code)) return { error: "班級代碼要 4 到 10 個英文字母或數字（不能有空白、中文或符號），例如 LIN602" };
  if (RESERVED.has(code)) return { error: "這個代碼太常見，請換一個" };
  return { code };
}

// 學生輸入的班級代碼（或舊的班級名稱）→ { id, name }，找不到回 null
export async function findClassByCodeOrName(env, input) {
  const raw = String(input || "").trim().slice(0, 50);
  if (!raw) return null;
  const code = normalizeClassCode(raw);
  if (CODE_RE.test(code)) {
    const byCode = await env.DB.prepare("SELECT id, name FROM classes WHERE join_code = ?").bind(code).first();
    if (byCode) return byCode;
  }
  return env.DB.prepare("SELECT id, name FROM classes WHERE name = ?").bind(raw).first();
}

// 這個代碼可不可以給班級用：沒人用、也不跟任何班級名稱相同（不然學生輸入會對到兩個班）。
// exceptClassId：老師改自己班的代碼時，排除自己
export async function codeIsFree(env, code, exceptClassId) {
  const used = await env.DB.prepare("SELECT id FROM classes WHERE join_code = ?").bind(code).first();
  if (used && used.id !== exceptClassId) return false;
  const sameName = await env.DB.prepare("SELECT id FROM classes WHERE UPPER(name) = ?").bind(code).first();
  if (sameName && sameName.id !== exceptClassId) return false;
  return true;
}

// 新增班級並同時發代碼；customCode 是老師自訂的（呼叫端已用 validateCustomCode 與 codeIsFree 檢查過）。
// 系統自己產的代碼撞到唯一索引就換一組再試。回傳新班級的 id
export async function insertClass(env, name, teacherId, now, customCode) {
  for (let i = 0; i < 8; i++) {
    const code = customCode || newClassCode();
    try {
      const r = await env.DB.prepare(
        "INSERT INTO classes (name, teacher_id, created_at, join_code) VALUES (?, ?, ?, ?)"
      ).bind(name, teacherId, now, code).run();
      return r.meta.last_row_id;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
      if (customCode) throw new Error("這個班級代碼剛被別人用走了，請換一個");
      // 班級名稱重複由呼叫端事先檢查；這裡的唯一衝突只可能是代碼撞號，換一組再試
      const dup = await env.DB.prepare("SELECT id FROM classes WHERE name = ?").bind(name).first();
      if (dup) throw e;
    }
  }
  throw new Error("產生班級代碼失敗，請再試一次");
}

// 這個班級的代碼；舊班級還沒有就補一組。找不到班級回 null
export async function ensureClassCode(env, classId) {
  const row = await env.DB.prepare("SELECT join_code FROM classes WHERE id = ?").bind(classId).first();
  if (!row) return null;
  if (row.join_code) return row.join_code;
  for (let i = 0; i < 8; i++) {
    try {
      const code = newClassCode();
      if (!(await codeIsFree(env, code, classId))) continue;
      const r = await env.DB.prepare("UPDATE classes SET join_code = ? WHERE id = ? AND join_code IS NULL")
        .bind(code, classId).run();
      if (r.meta && r.meta.changes) break;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
    }
    const again = await env.DB.prepare("SELECT join_code FROM classes WHERE id = ?").bind(classId).first();
    if (again && again.join_code) return again.join_code;
  }
  const done = await env.DB.prepare("SELECT join_code FROM classes WHERE id = ?").bind(classId).first();
  return done ? done.join_code : null;
}

// POST /api/class/code  body: { code: "LIN602" } 老師自訂；{ random: true } 換一組系統好唸的
// 只有老師能改自己班的代碼；已經加入的學生不受影響（學生記的是 class_id，不是代碼）
export async function handleSetClassCode(request, env, deps) {
  const { json, CORS_HEADERS, verifySession } = deps;
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: { message: "Method Not Allowed" } }, 405);

  const session = await verifySession(request, env);
  if (!session || session.role !== "teacher") return json({ error: { message: "只有登入的老師可以修改班級代碼" } }, 401);
  try {
    const user = await env.DB.prepare("SELECT class_id FROM users WHERE id = ?").bind(session.uid).first();
    if (!user || !user.class_id) return json({ error: { message: "找不到你的班級" } }, 400);
    const body = await request.json();

    let code;
    if (body.random) {
      for (let i = 0; i < 12; i++) {
        const c = newClassCode();
        if (await codeIsFree(env, c, user.class_id)) { code = c; break; }
      }
      if (!code) return json({ error: { message: "產生失敗，請再按一次" } }, 500);
    } else {
      const v = validateCustomCode(body.code);
      if (v.error) return json({ error: { message: v.error } }, 400);
      if (!(await codeIsFree(env, v.code, user.class_id))) return json({ error: { message: "這個代碼已經有人用了，請換一個" } }, 400);
      code = v.code;
    }
    try {
      await env.DB.prepare("UPDATE classes SET join_code = ? WHERE id = ?").bind(code, user.class_id).run();
    } catch (e) {
      if (/UNIQUE/i.test(String(e && e.message))) return json({ error: { message: "這個代碼已經有人用了，請換一個" } }, 400);
      throw e;
    }
    return json({ classCode: code });
  } catch (err) {
    return json({ error: { message: err.message } }, 500);
  }
}
