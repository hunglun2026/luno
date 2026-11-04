// 刻度｜題庫（2026-11-03）。AI 出過的選擇題依年級、科目、版本、範圍存進 D1，之後同條件直接抽，
// 並用「另叫一次 AI 獨立作答」過濾答案標錯的題。資料表見 migrations/0006_question_bank.sql，設計取捨見該檔開頭。
//
// 為什麼獨立成一個檔：index.js 已超過 2500 行。共用的 json／CORS／金鑰／模型清單由 index.js 以 deps 傳進來，
// 不從 index.js import，避免循環引用。
//
// 第一步（目前）只有「收題＋驗證」，使用者看到的行為完全不變；抽題、答對率下架、回報有誤是第二步。

// 自我修正口氣的解析代表 AI 邊寫邊推翻自己（2026-11-03 注音題事件），跟前端 generate.js 的 SELF_CORRECT_RE 同一條規則。
// 前端不能 import，所以這裡複製一份；兩邊要改一起改。
const SELF_CORRECT_RE = /選項\s*\d*\s*(寫錯|有誤)|讓我(再)?(想|檢查|重新)|重新(檢查|計算|確認)|等等[，,]|抱歉|更正[：:，,]/;

const MAX_BODY_CHARS = 200000;      // 一次最多收 200KB（30 題約 30KB，已經很寬鬆）
const MAX_ITEMS_PER_SUBMIT = 30;
const SUBMIT_PER_HOUR = 30;         // 每裝置每小時最多送幾次，擋灌題
const DEEP_CALL_TIMEOUT_MS = 60000; // cron 沒有 30 秒寬限，可以用高思考慢慢驗
const DEEP_BUDGET_MS = 150000;
const DEEP_BATCH = 8;               // 高思考一次驗幾題，太多會拖太久
const DEEP_PER_RUN = 80;            // 每次 cron 最多驗幾題
const VERIFY_MAX_TRIES = 3;         // 驗證 API 連續失敗幾次後不再重試（留 pending，人工看）
const CLOZE_RE = /（[\s　]*）|\([\s　]*\)/;

// ---------- 純函式（不碰資料庫，可單獨測） ----------

// 正規化：NFKC 把全形半形統一，去掉所有空白，小寫。題幹去重與範圍比對都用它。
function normalizeText(s) {
  return String(s == null ? "" : s).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function scopeKey(scope) {
  return normalizeText(scope);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 把出題 JSON 裡各種答案寫法（字母、索引、選項原文、陣列）統一成排序後的字母陣列。
// 邏輯對應前端 answer.js 的 getCorrectLetters（複選用逗號或連寫字母），這裡簡化成伺服器要的樣子。
function correctLettersOf(item) {
  const opts = Array.isArray(item.o) ? item.o.map((x) => String(x).trim()) : [];
  if (opts.length === 0) return [];
  const fromOne = (x) => {
    if (typeof x === "number" && Number.isInteger(x)) return [String.fromCharCode(65 + x)];
    const s = String(x).trim();
    if (/^[A-Za-z]$/.test(s)) return [s.toUpperCase()];
    const idx = opts.findIndex((o) => o === s);
    if (idx >= 0) return [String.fromCharCode(65 + idx)];
    const letters = s.toUpperCase().replace(/[^A-Z]/g, "");
    return letters && letters.length <= opts.length ? letters.split("") : [];
  };
  let letters = [];
  if (Array.isArray(item.a)) item.a.forEach((x) => { letters = letters.concat(fromOne(x)); });
  else letters = fromOne(item.a);
  return [...new Set(letters)].sort();
}

function qkindOf(item, letters) {
  const opts = item.o.map((x) => String(x).trim());
  if (opts.length === 2 && opts[0] === "正確" && opts[1] === "錯誤") return "tf";
  if (letters.length > 1) return "multi";
  if (CLOZE_RE.test(String(item.q))) return "cloze";
  return "single";
}

// 伺服器端重新檢查單題（不信任前端已經檢查過）。回傳 { ok, reason, rec }
function vetBankItem(item) {
  if (!item || typeof item.q !== "string") return { ok: false, reason: "no-q" };
  const q = item.q.trim();
  if (q.length < 4 || q.length > 600) return { ok: false, reason: "q-length" };
  if (!Array.isArray(item.o) || item.o.length < 2 || item.o.length > 6) return { ok: false, reason: "options-count" };
  const opts = item.o.map((x) => String(x).trim());
  if (opts.some((o) => o.length === 0 || o.length > 200)) return { ok: false, reason: "option-length" };
  if (new Set(opts.map(normalizeText)).size !== opts.length) return { ok: false, reason: "options-duplicate" };
  const letters = correctLettersOf({ o: opts, a: item.a });
  if (letters.length === 0 || letters.some((l) => l.charCodeAt(0) - 65 >= opts.length)) return { ok: false, reason: "answer-out-of-range" };
  const explanation = typeof item.e === "string" ? item.e.trim() : "";
  // 題庫的題要連詳細解答一起存：沒有解析的題學生交卷後看不到為什麼，不收
  if (explanation.length < 5) return { ok: false, reason: "explanation-missing" };
  if (explanation.length > 600) return { ok: false, reason: "explanation-length" };
  if (SELF_CORRECT_RE.test(explanation)) return { ok: false, reason: "self-correct" };
  const kind = qkindOf({ q, o: opts }, letters);
  if (kind === "tf" && letters.length !== 1) return { ok: false, reason: "tf-answer" };
  return { ok: true, rec: { q, options: opts, answer: letters.join(""), explanation, kind } };
}

// 驗證 meta：全部都要是不超長的字串；sType 必須是 '1'（純靠年級科目範圍出題，沒有上傳內容）
function vetMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const limits = { grade: 20, subject: 20, publisher: 30, scope: 60, difficulty: 30, lang: 20 };
  const out = {};
  for (const k of Object.keys(limits)) {
    const v = meta[k] == null ? "" : meta[k];
    if (typeof v !== "string") return null;
    out[k] = v.trim();
    if (out[k].length > limits[k]) return null;
  }
  if (!out.grade || !out.subject) return null;
  if (String(meta.sType) !== "1") return null;
  return out;
}

// 驗證用的提示詞：只給題幹與選項，不給出題時的答案，讓 AI 獨立作答
function buildVerifyPrompt(meta, rows) {
  const list = rows.map((r, i) =>
    (i + 1) + ". " + r.q + "\n" + r.options.map((o, j) => "(" + String.fromCharCode(65 + j) + ") " + o).join("\n")
  ).join("\n\n");
  // 解析另列在題目之後：要求先不看解析自己作答，再審解析
  const expl = rows.map((r, i) => (i + 1) + ". " + (r.explanation || "（無）")).join("\n");
  return "你是嚴謹的審題老師。以下是「" + meta.grade + "」「" + meta.subject + "」的選擇題，請逐題獨立作答並審查。\n" +
    "對每一題回傳：\n" +
    "- n：題號\n" +
    "- a：你認為正確的選項字母陣列，例如 [\"B\"]；複選題可以有多個\n" +
    "- fit：題目內容適合該年級與科目、沒有不當內容、題意清楚，true 或 false\n" +
    "- unique：單選題是否『只有一個』選項明確正確（有兩個以上也算對就填 false）；複選題一律填 true\n" +
    "- expl_ok：先完全不參考最後面的「出題者解析」自行作答填 a；之後再讀解析，判斷解析的結論是否支持『正確選項』、內容事實是否正確、有沒有前後矛盾或邊想邊改的話，全部沒問題才填 true\n" +
    "- note：有疑慮時用一句話說明，沒有就填空字串\n" +
    "只能回傳合法 JSON 陣列，格式：[{\"n\":1,\"a\":[\"B\"],\"fit\":true,\"unique\":true,\"expl_ok\":true,\"note\":\"\"}]。\n\n" + list + "\n\n【出題者解析（作答完才可以看）】\n" + expl;
}

// 把 AI 回的驗證文字解析成陣列；解析失敗回 null
function parseVerifyJson(text) {
  if (typeof text !== "string") return null;
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s < 0 || e < s) return null;
  try {
    const arr = JSON.parse(text.slice(s, e + 1).replace(/,\s*\]/g, "]"));
    return Array.isArray(arr) ? arr : null;
  } catch (err) {
    return null;
  }
}

// 單題判定：AI 作答與出題答案一致、適合、單選唯一解 → approved；否則 suspect 並寫原因。找不到該題的回覆回 null（維持 pending）
function decideVerdict(row, answers) {
  const a = (answers || []).find((x) => x && Number(x.n) === row.n);
  if (!a) return null;
  const got = Array.isArray(a.a) ? [...new Set(a.a.map((x) => String(x).trim().toUpperCase()))].sort().join("") : String(a.a || "").trim().toUpperCase();
  const note = typeof a.note === "string" ? a.note.slice(0, 200) : "";
  if (a.fit === false) return { status: "suspect", note: "審題：不適合該年級或科目。" + note };
  if (got !== row.answer) return { status: "suspect", note: "AI 作答 " + (got || "空") + "，出題答案 " + row.answer + "。" + note };
  if (a.expl_ok === false) return { status: "suspect", note: "審題：解析與答案不一致或內容有誤。" + note };
  if (row.kind !== "multi" && a.unique === false) return { status: "suspect", note: "審題：可能不只一個正確選項。" + note };
  return { status: "approved", note: note };
}

// ---------- 呼叫 Gemini 驗證 ----------

async function callVerifyModel(prompt, deps, env) {
  const callTimeout = DEEP_CALL_TIMEOUT_MS;
  const keys = deps.getApiKeys(env);
  if (keys.length === 0) throw new Error("沒有 Gemini 金鑰");
  const base = { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: "high" } };
  const noThink = { ...base }; delete noThink.thinkingConfig;
  const call = async (url, cfg) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(callTimeout),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: cfg }) });
    return await res.json();
  };
  const start = Math.floor(Math.random() * keys.length);
  const deadline = Date.now() + DEEP_BUDGET_MS;
  let lastErr = "no response";
  for (const model of deps.GEMINI_MODELS) {
    for (let i = 0; i < keys.length; i++) {
      if (Date.now() > deadline) throw new Error("超過時間預算：" + lastErr);
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + keys[(start + i) % keys.length];
      try {
        let d = await call(url, base);
        if (d.error && /thinking/i.test(d.error.message || "")) d = await call(url, noThink);
        if (d.error) { lastErr = d.error.message || "api error"; continue; }
        const parts = d?.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts) ? parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("") : "";
        if (text) return text;
        lastErr = "empty text";
      } catch (err) {
        lastErr = err.message;
      }
    }
  }
  throw new Error(lastErr);
}

// 驗證一批同分類的 pending 題並更新狀態。rows: [{id, q, options, answer, kind}]；失敗只累加 verify_tries，題目留在 pending
async function verifyRows(env, deps, meta, rows) {
  if (rows.length === 0) return { approved: 0, suspect: 0, pending: 0 };
  const numbered = rows.map((r, i) => ({ ...r, n: i + 1 }));
  const now = Date.now();
  let answers = null, errMsg = "";
  try {
    answers = parseVerifyJson(await callVerifyModel(buildVerifyPrompt(meta, numbered), deps, env));
    if (!answers) errMsg = "回覆無法解析";
  } catch (err) {
    errMsg = err.message;
  }
  const stmts = [];
  const tally = { approved: 0, suspect: 0, pending: 0 };
  numbered.forEach((r) => {
    const v = answers ? decideVerdict(r, answers) : null;
    if (v) {
      tally[v.status]++;
      stmts.push(env.DB.prepare("UPDATE bank_questions SET status=?, verify_note=?, updated_at=? WHERE id=? AND status='pending'").bind(v.status, v.note, now, r.id));
    } else {
      tally.pending++;
      stmts.push(env.DB.prepare("UPDATE bank_questions SET verify_tries=verify_tries+1, verify_note=?, updated_at=? WHERE id=? AND status='pending'").bind("驗證未完成：" + (errMsg || "回覆缺這題").slice(0, 100), now, r.id));
    }
  });
  await env.DB.batch(stmts);
  return tally;
}

// ---------- 路由 ----------

async function handleSubmit(request, env, ctx, deps) {
  const { json } = deps;
  const declared = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (declared > MAX_BODY_CHARS) return json({ error: "內容太大" }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: "內容太大" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: "格式錯誤" }, 400); }

  const meta = vetMeta(body && body.meta);
  if (!meta) return json({ ok: true, accepted: 0, reason: "meta-rejected" });
  if (!Array.isArray(body.items) || body.items.length === 0) return json({ ok: true, accepted: 0, reason: "no-items" });

  // 限流：每裝置每小時；沿用 COOLDOWN_KV 的 key 前綴慣例
  const who = (request.headers.get("X-Client-Id") || "").trim() || request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = "bankin:" + who + ":" + Math.floor(Date.now() / 3600000);
  const used = parseInt((await env.COOLDOWN_KV.get(rlKey)) || "0", 10);
  if (used >= SUBMIT_PER_HOUR) return json({ ok: true, accepted: 0, reason: "rate-limited" });
  await env.COOLDOWN_KV.put(rlKey, String(used + 1), { expirationTtl: 3700 });

  const now = Date.now();
  const sk = scopeKey(meta.scope);
  const candidates = [];
  let rejected = 0;
  for (const item of body.items.slice(0, MAX_ITEMS_PER_SUBMIT)) {
    const v = vetBankItem(item);
    if (!v.ok) { rejected++; continue; }
    candidates.push({ ...v.rec, hash: await sha256Hex(normalizeText(v.rec.q) + "|" + v.rec.options.map(normalizeText).join("|")) });
  }

  const results = candidates.length === 0 ? [] : await env.DB.batch(candidates.map((c) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO bank_questions (hash,grade,subject,publisher,scope,scope_key,qkind,difficulty,lang,q,options_json,answer,explanation,status,created_at,updated_at) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)"
    ).bind(c.hash, meta.grade, meta.subject, meta.publisher, meta.scope, sk, c.kind, meta.difficulty, meta.lang, c.q, JSON.stringify(c.options), c.answer, c.explanation, now, now)
  ));
  const fresh = [];
  results.forEach((r, i) => { if (r.meta && r.meta.changes === 1) fresh.push({ id: r.meta.last_row_id, q: candidates[i].q, options: candidates[i].options, answer: candidates[i].answer, explanation: candidates[i].explanation, kind: candidates[i].kind }); });

  // 不當場驗：線上背景工作約 30 秒就被取消，撐不住高思考。新題留 pending，由每天的 cron 用高思考驗（也可用 /api/bank/verify-now 手動觸發）
  return json({ ok: true, accepted: fresh.length, duplicate: candidates.length - fresh.length, rejected: rejected });
}

// 給 Steve 看累積狀況：依狀態、年級、科目計數（需要管理員密碼）
async function handleStats(request, env, deps) {
  if (!deps.adminPassMatches(request, env)) return deps.json({ error: "forbidden" }, 403);
  const byStatus = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM bank_questions GROUP BY status").all();
  const byGroup = await env.DB.prepare(
    "SELECT grade, subject, status, COUNT(*) AS n FROM bank_questions GROUP BY grade, subject, status ORDER BY n DESC LIMIT 60"
  ).all();
  const suspects = await env.DB.prepare(
    "SELECT id, grade, subject, scope, q, answer, verify_note FROM bank_questions WHERE status='suspect' ORDER BY updated_at DESC LIMIT 20"
  ).all();
  return deps.json({ byStatus: byStatus.results, byGroup: byGroup.results, recentSuspects: suspects.results });
}

async function handleBank(request, env, ctx, deps) {
  if (request.method === "OPTIONS") return new Response(null, { headers: deps.CORS_HEADERS });
  const path = new URL(request.url).pathname;
  try {
    if (path === "/api/bank/submit" && request.method === "POST") return await handleSubmit(request, env, ctx, deps);
    if (path === "/api/bank/verify-now" && request.method === "POST") {
      if (!deps.adminPassMatches(request, env)) return deps.json({ error: "forbidden" }, 403);
      return deps.json({ ok: true, result: await retryPendingBank(env, deps) });
    }
    if (path === "/api/bank/stats" && request.method === "GET") return await handleStats(request, env, deps);
    return deps.json({ error: "not found" }, 404);
  } catch (err) {
    return deps.json({ error: err.message }, 500);
  }
}

// cron 用：把還在 pending（上次 AI 驗證失敗）的題照分類重驗，最多 30 題、每題最多 VERIFY_MAX_TRIES 次
async function retryPendingBank(env, deps) {
  const rows = await env.DB.prepare(
    "SELECT id, grade, subject, publisher, scope, qkind, q, options_json, answer, explanation FROM bank_questions " +
    "WHERE status='pending' AND verify_tries < ? ORDER BY created_at LIMIT " + DEEP_PER_RUN
  ).bind(VERIFY_MAX_TRIES).all();
  const groups = new Map();
  (rows.results || []).forEach((r) => {
    const k = r.grade + "|" + r.subject;
    if (!groups.has(k)) groups.set(k, { meta: { grade: r.grade, subject: r.subject, publisher: r.publisher, scope: r.scope }, rows: [] });
    groups.get(k).rows.push({ id: r.id, q: r.q, options: JSON.parse(r.options_json), answer: r.answer, explanation: r.explanation, kind: r.qkind });
  });
  const total = { approved: 0, suspect: 0, pending: 0 };
  for (const g of groups.values()) {
    for (let i = 0; i < g.rows.length; i += DEEP_BATCH) {
      const t = await verifyRows(env, deps, g.meta, g.rows.slice(i, i + DEEP_BATCH));
      total.approved += t.approved; total.suspect += t.suspect; total.pending += t.pending;
    }
  }
  return total;
}

export {
  handleBank, retryPendingBank,
  // 以下給測試用
  normalizeText, scopeKey, sha256Hex, correctLettersOf, vetBankItem, vetMeta, buildVerifyPrompt, parseVerifyJson, decideVerdict,
};
