// 刻度｜紙本考卷拍照 OCR（2026-11-05）。老師上傳題目卷（常是手機拍照）與選填的答案卷，
// 由 Gemini 視覺模型「照抄」成整齊的題目，老師在前端審閱後變成線上測驗。
//
// 為什麼獨立成一個檔：index.js 已超過 2500 行。共用的 json／CORS／金鑰／模型清單／驗證由 index.js 以 deps 傳進來，
// 不從 index.js import，避免循環引用（跟 bank.js 同一套做法）。
//
// 兩種模式（前端分兩批呼叫）：
//   mode=answers   答案卷頁面 → [{ n, a, e }]（題號、答案、原卷有寫才有的解析）
//   mode=questions 題目頁面   → [{ n, q, o, a, s, flag }]；solve=true（沒有答案卷）時 AI 自己解題並標 aiGuess
// 不保存任何圖片：收到、送 Gemini、回傳，結束。
// 部署：只要 worker/ 底下有 commit 推到 main，deploy-workers.yml 就會部署到 hunglun2026（luno-api.hunglun.com）。

const MAX_BODY_BYTES = 12 * 1024 * 1024;     // 一次請求本文上限
const MAX_PAGES_PER_CALL = 4;                // 一次最多幾頁（多了容易逾時、輸出截斷）
const MAX_PAGE_B64_CHARS = 5 * 1024 * 1024;  // 單頁 base64 上限（約 3.7MB 原檔）
const MAX_ITEMS_PER_CALL = 80;
const OCR_USER_PER_HOUR = 40;                // 每位登入教師每小時最多幾次呼叫
const OCR_IP_PER_HOUR = 80;                  // 每個 IP 每小時最多幾次（擋一直換帳號洗額度）
const CALL_TIMEOUT_MS = 70000;               // 單次 Gemini 呼叫逾時
const TOTAL_BUDGET_MS = 110000;              // 整個請求的時間預算（含換 Key、換模型）
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FLAGS = new Set(["lowConf", "figure", "aiGuess", "noAnswer"]);
const DEFAULT_BASE = "https://generativelanguage.googleapis.com";

// ---------- 純函式（不碰網路，可單獨測） ----------

function str(v, max) {
  return String(v == null ? "" : v).slice(0, max || 4000);
}

// 選項前面若被模型帶了「A.」「(B)」「甲、」之類標號，拿掉；前端自己會依序補 A B C D
function stripOptionLabel(s) {
  return String(s).replace(/^\s*[\(（]?\s*([A-Ha-h]|[甲乙丙丁戊己]|[１-９1-9])\s*[\)）\.\．、:：]\s*/, "").trim();
}

// 把模型回傳的答案整理成字母（A、AC）；選擇題以外原樣回字串
function normalizeAnswer(a, optCount) {
  if (Array.isArray(a)) a = a.join("");
  let s = String(a == null ? "" : a).trim();
  if (optCount >= 2) {
    const m = { 甲: "A", 乙: "B", 丙: "C", 丁: "D", 戊: "E", 己: "F", "○": "A", "〇": "A", O: "A", o: "A", "✓": "A", "✔": "A", "×": "B", "✕": "B", "✗": "B", X: "B", x: "B" };
    // 是非題：O/X、○/×
    if (optCount === 2 && /^[OoXx○〇×✕✗✓✔]$/.test(s)) return m[s];
    let out = "";
    for (const ch of s) {
      const u = m[ch] || ch.toUpperCase();
      if (/[A-H]/.test(u) && out.indexOf(u) === -1) out += u;
    }
    return out.split("").sort().join("");
  }
  return s;
}

// 把 Gemini 回傳的題目整理成固定格式；不丟掉任何「看起來有問題」的題，只加旗標讓老師決定
function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw.slice(0, MAX_ITEMS_PER_CALL)) {
    if (!r || typeof r !== "object") continue;
    const q = str(r.q, 3000).trim();
    if (!q) continue;
    let o = Array.isArray(r.o) ? r.o.map((x) => stripOptionLabel(str(x, 500))).filter(Boolean).slice(0, 8) : [];
    if (o.length === 1) o = [];                      // 只有 1 個選項不成立，當非選擇題
    const flag = [];
    if (Array.isArray(r.flag)) for (const f of r.flag) if (ALLOWED_FLAGS.has(f) && flag.indexOf(f) === -1) flag.push(f);
    const n = Number.isFinite(Number(r.n)) ? Math.max(0, Math.floor(Number(r.n))) : 0;
    const s = Number(r.s);
    out.push({ n, q, o, a: normalizeAnswer(r.a, o.length), s: Number.isFinite(s) && s > 0 ? s : 0, flag });
  }
  return out;
}

function normalizeAnswers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw.slice(0, 300)) {
    if (!r || typeof r !== "object") continue;
    const n = Math.floor(Number(r.n));
    if (!Number.isFinite(n) || n <= 0) continue;
    const a = Array.isArray(r.a) ? r.a.join("") : str(r.a, 1500).trim();
    if (!a) continue;
    out.push({ n, a, e: str(r.e, 1500).trim() });
  }
  return out;
}

function buildQuestionsPrompt(solve, startNo) {
  return [
    "你是考卷數位化助手。附上的圖片是一份紙本考卷的其中幾頁（可能是手機拍照，可能歪斜、有陰影或反光）。",
    "請把圖片裡每一道題目「照抄」成 JSON 陣列，不要改寫、不要補充、不要自己出新題。",
    "",
    "每題輸出一個物件：{\"n\":題號數字,\"q\":題幹,\"o\":[選項],\"a\":答案,\"s\":配分,\"flag\":[]}",
    "規則：",
    "1. 題幹與選項一律照原文抄寫（原文是什麼字就寫什麼字，注音符號、標點、數字、單位都照抄）。",
    "2. n 是原卷上的題號（只填數字）。看不到題號就依出現順序接續" + (startNo > 1 ? "，這一批從第 " + startNo + " 題附近開始" : "") + "。",
    "3. 選擇題：o 放各選項的內容，不要包含 A. B. C. D. 或 (1)(2) 等標號。複選題也一樣。",
    "4. 是非題：o 固定為 [\"正確\",\"錯誤\"]。",
    "5. 填空題、簡答題、計算題：o 必須是 []。填空的空格用「＿＿」表示。",
    "6. 題組（共用一段文章、說明或圖表的幾道題）：把共用的文字放在每一題 q 的最前面，格式「【題組】共用文字／題幹」，這樣每題單獨看也讀得懂。",
    "7. s 是原卷標示的配分；沒標就填 0。",
    "8. flag 只能用下列值，沒有就給 []：",
    "   - \"lowConf\"：字跡、注音、數字或選項看不清楚、你不確定抄對了。",
    "   - \"figure\"：這題需要看圖形、表格、座標圖或照片才答得出來，單靠文字無法完整表達。",
    solve
      ? "9. 原卷沒有附答案：請你自己解題，把答案填在 a（選擇題用大寫字母，複選如 \"AC\"；其他題型寫簡短答案），並在 flag 加上 \"aiGuess\"。不確定答案就把 a 留空字串，並加 \"noAnswer\"。"
      : "9. 答案由另外的答案卷提供，這裡 a 一律填空字串 \"\"，不要自己解題。",
    "10. 看不完整的題目（被截在頁面邊緣）仍然輸出，並加 \"lowConf\"。",
    "只輸出 JSON 陣列，不要任何說明文字或 markdown。",
  ].join("\n");
}

function buildAnswersPrompt() {
  return [
    "你是考卷數位化助手。附上的圖片是一份考卷的「答案卷／解答」（可能是手機拍照）。",
    "請把每一題的答案抄成 JSON 陣列：[{\"n\":題號數字,\"a\":答案,\"e\":解析}]",
    "規則：",
    "1. n 是題號（只填數字）。",
    "2. 選擇題的 a 用大寫字母（A、B、C、D），複選題連寫如 \"AC\"。原卷若用 甲乙丙丁 或 ①②③④ 或 1234，請依序對應成 A B C D。",
    "3. 是非題：○ 或 O 或 正確 = \"A\"，× 或 X 或 錯誤 = \"B\"。",
    "4. 填空、簡答、計算題：a 抄寫標準答案原文（含單位）。有多個空格時用「、」分開，依題中空格順序。",
    "5. e 只有原卷明明寫了解析、算式或評分重點才填，照抄；沒有就給 \"\"。不要自己補解析。",
    "6. 看不清楚的答案不要亂猜，直接略過那一題。",
    "只輸出 JSON 陣列，不要任何說明文字或 markdown。",
  ].join("\n");
}

// ---------- Gemini 呼叫 ----------

// 通用的 Gemini JSON 呼叫（OCR 與 grade.js 共用）：金鑰輪換、換模型、逾時、thinking 備援
async function callGemini(parts, deps, env, userKey, maxOutputTokens) {
  const keys = userKey ? [userKey] : deps.getApiKeys(env);
  if (keys.length === 0) throw new Error("伺服器未設定 Gemini 金鑰");
  const base = (env.GEMINI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
  const cfg = { responseMimeType: "application/json", temperature: 0, maxOutputTokens, thinkingConfig: { thinkingLevel: "minimal" } };
  const noThink = { ...cfg }; delete noThink.thinkingConfig;
  const call = async (url, genCfg) => {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      body: JSON.stringify({ contents: [{ parts }], generationConfig: genCfg }),
    });
    return await res.json();
  };
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const start = Math.floor(Math.random() * keys.length);
  let lastErr = "沒有回應";
  const models = deps.GEMINI_MODELS;
  for (let mi = 0; mi < models.length; mi++) {
    for (let i = 0; i < keys.length; i++) {
      if (Date.now() > deadline) throw new Error("辨識超過時間預算：" + lastErr);
      const url = base + "/v1beta/models/" + models[mi] + ":generateContent?key=" + keys[(start + i) % keys.length];
      try {
        let d = await call(url, cfg);
        if (d.error && /thinking/i.test(d.error.message || "")) d = await call(url, noThink);
        if (d.error) { lastErr = d.error.message || "API 錯誤"; continue; }
        const ps = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
        const text = Array.isArray(ps) ? ps.map((p) => (typeof p.text === "string" ? p.text : "")).join("") : "";
        if (!text) {
          const reason = (d && d.candidates && d.candidates[0] && d.candidates[0].finishReason) || "UNKNOWN";
          lastErr = "模型沒有回應文字（" + reason + "）";
          continue;
        }
        const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        let parsed;
        try { parsed = JSON.parse(cleaned); } catch (e) { lastErr = "AI 回傳的內容不是合法 JSON"; continue; }
        return { data: parsed, model: models[mi], degraded: mi > 0 };
      } catch (err) {
        lastErr = err && err.name === "TimeoutError" ? "Gemini 回應逾時" : (err.message || "呼叫失敗");
      }
    }
  }
  throw new Error(lastErr);
}

// ---------- 路由 ----------

async function handleOcr(request, env, ctx, deps) {
  const { json, CORS_HEADERS } = deps;
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: { message: "只接受 POST" } }, 405);

  // 誰能用：登入的教師／管理員、管理員密碼、或自備 Gemini Key（用量算他自己的）
  const userKey = (request.headers.get("X-Gemini-Api-Key") || "").trim();
  const isAdmin = deps.adminPassMatches(request, env);
  const session = await deps.verifySession(request, env);
  const isTeacher = !!(session && (session.role === "teacher" || session.role === "superadmin"));
  if (!isAdmin && !userKey && !isTeacher) {
    return json({ error: { message: "拍照轉題目要先登入教師帳號" } }, 401);
  }

  const len = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (len > MAX_BODY_BYTES) return json({ error: { message: "圖片太大，請減少頁數或重新拍照" } }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: { message: "圖片太大，請減少頁數或重新拍照" } }, 413);
  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ error: { message: "請求格式錯誤" } }, 400); }

  const mode = body && body.mode;
  if (mode !== "questions" && mode !== "answers") return json({ error: { message: "mode 要是 questions 或 answers" } }, 400);
  const pages = body && body.pages;
  if (!Array.isArray(pages) || pages.length === 0) return json({ error: { message: "沒有收到圖片" } }, 400);
  if (pages.length > MAX_PAGES_PER_CALL) return json({ error: { message: "一次最多 " + MAX_PAGES_PER_CALL + " 頁" } }, 400);
  const parts = [];
  for (const p of pages) {
    if (!p || !ALLOWED_MIME.has(p.mime) || typeof p.data !== "string" || !p.data) return json({ error: { message: "圖片格式只接受 JPEG、PNG、WebP" } }, 400);
    if (p.data.length > MAX_PAGE_B64_CHARS) return json({ error: { message: "有一頁圖片太大，請降低解析度或重新拍照" } }, 413);
    parts.push({ inline_data: { mime_type: p.mime, data: p.data } });
  }

  // 次數限制（自備 Key 與管理員不限）：每位教師每小時、每 IP 每小時各一個計數
  if (!isAdmin && !userKey) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const hour = Math.floor(Date.now() / 3600000);
    const ukey = "ocr:u:" + (session && session.uid) + ":" + hour;
    const ikey = "ocr:ip:" + ip + ":" + hour;
    const uUsed = parseInt((await env.COOLDOWN_KV.get(ukey)) || "0", 10);
    const iUsed = parseInt((await env.COOLDOWN_KV.get(ikey)) || "0", 10);
    if (uUsed >= OCR_USER_PER_HOUR || iUsed >= OCR_IP_PER_HOUR) {
      return json({ error: { code: "OCR_LIMIT", message: "這個小時辨識次數用完了，請稍後再試（或在出題頁填入自己的 Gemini API Key）" } }, 429);
    }
    await env.COOLDOWN_KV.put(ukey, String(uUsed + 1), { expirationTtl: 3700 });
    await env.COOLDOWN_KV.put(ikey, String(iUsed + 1), { expirationTtl: 3700 });
  }

  const solve = !!body.solve;
  const startNo = Math.max(1, Math.floor(Number(body.startNo) || 1));
  const prompt = mode === "answers" ? buildAnswersPrompt() : buildQuestionsPrompt(solve, startNo);
  try {
    const r = await callGemini([{ text: prompt }, ...parts], deps, env, userKey, mode === "answers" ? 8192 : 16384);
    if (mode === "answers") {
      return json({ mode, answers: normalizeAnswers(r.data), model: r.model, degraded: r.degraded });
    }
    return json({ mode, items: normalizeQuestions(r.data), model: r.model, degraded: r.degraded });
  } catch (err) {
    return json({ error: { message: "辨識失敗：" + (err.message || "未知錯誤") } }, 502);
  }
}

export { callGemini, handleOcr, normalizeQuestions, normalizeAnswers, normalizeAnswer, stripOptionLabel, buildQuestionsPrompt, buildAnswersPrompt };
