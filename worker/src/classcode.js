// 鴻綸 刻度｜班級加入代碼：產生、查找、補發。
// 代碼 6 碼，字元表去掉 0/O/1/I/L 這類手寫、投影時容易看錯的字。學生輸入時不分大小寫，空白與減號會被忽略。
// 舊班級（join_code 還是 NULL）在第一次被老師讀到時補發，見 ensureClassCode。
// 向下相容：學生也可以輸入「班級名稱」加入（舊版的做法），findClassByCodeOrName 先比代碼、比不到再比名稱。

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

export function newClassCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}

export function normalizeClassCode(input) {
  return String(input || "").trim().toUpperCase().replace(/[\s-]/g, "");
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

// 新增班級並同時發一組代碼；撞到唯一索引就換一組再試。回傳新班級的 id
export async function insertClass(env, name, teacherId, now) {
  for (let i = 0; i < 8; i++) {
    try {
      const r = await env.DB.prepare(
        "INSERT INTO classes (name, teacher_id, created_at, join_code) VALUES (?, ?, ?, ?)"
      ).bind(name, teacherId, now, newClassCode()).run();
      return r.meta.last_row_id;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
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
      const r = await env.DB.prepare("UPDATE classes SET join_code = ? WHERE id = ? AND join_code IS NULL")
        .bind(newClassCode(), classId).run();
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
