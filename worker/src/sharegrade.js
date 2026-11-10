// 刻度｜學生版題目（不含答案）與伺服器端判分。2026-11-11：以前 /api/share 連正確答案與解析都送進學生瀏覽器，
// 按 F12 就看得到；現在學生拿到的題目沒有答案，作答時把答案送來這裡判分，判完才公布該題的答案與解析。
//
// 判分規則與前端 answer.js（getCorrectLetters、gradeOneQuestion）一致；配合題、排序題直接用 qtypes.js（前端同一份，
// 由 sync-qtypes.mjs 複製）。getCorrectLetters 是從 answer.js 複製的，test/sharegrade.test.js 會對照兩邊結果。
import { qKind, qtShuffle, qtGrade, qtParseMatch, qtParseOrder } from "./qtypes.js";

function matchOptionLetter(q, rawAnswer) {
  const raw = String(rawAnswer).trim();
  if (!raw) return null;
  let idx = q.o.findIndex((o) => String(o).trim() === raw);
  if (idx < 0 && /^[A-Za-z]{1,8}$/.test(raw)) return null;
  if (idx < 0) idx = q.o.findIndex((o) => raw.includes(String(o).trim()) || String(o).trim().includes(raw));
  return idx >= 0 ? String.fromCharCode(65 + idx) : null;
}

export function getCorrectLetters(q) {
  if (!q.o || q.o.length === 0) return null;
  if (Array.isArray(q.a)) {
    return q.a.map((x) => {
      if (typeof x === "number") return String.fromCharCode(65 + x);
      const s = String(x).trim();
      if (/^[A-Za-z]$/.test(s)) return s.toUpperCase();
      return matchOptionLetter(q, s) || s.toUpperCase();
    });
  } else if (typeof q.a === "number") {
    return [String.fromCharCode(65 + q.a)];
  } else if (typeof q.a === "string") {
    const raw = q.a.trim();
    const directMatch = matchOptionLetter(q, raw);
    if (directMatch) return [directMatch];
    const lettersOnly = raw.toUpperCase().replace(/[^A-Z]/g, "");
    if (lettersOnly && lettersOnly.length <= q.o.length) return lettersOnly.split("");
    return [];
  }
  return [];
}

// 學生看到的一題：只留作答需要的欄位（題幹、選項、配分、圖、是否交給 AI 批改），不含 a／e。
// 配合題、排序題把右欄／項目先洗好再送，並標 pre:1（前端看到 pre 就不再洗牌）。
export function publicItem(q) {
  const out = { q: q.q, s: Number(q.s) || 0 };
  if (q.img) out.img = q.img;
  if (q.g) out.g = q.g;
  const kind = qKind(q);
  if (kind === "match" || kind === "order") {
    const perm = qtShuffle(q);
    out.t = q.t;
    out.o = [];
    out.pre = 1;
    if (kind === "match") {
      out.l = q.l.slice();
      out.r = perm.map((j) => q.r[j]);
    } else {
      out.l = perm.map((j) => q.l[j]);
    }
    return out;
  }
  out.o = kind === "choice" ? q.o : [];
  if (kind === "choice") {
    const letters = getCorrectLetters(q) || [];
    if (letters.length > 1) out.m = 1;   // 複選題：畫面用勾選框
  }
  return out;
}

export function publicShare(share) {
  return { ...share, items: (share.items || []).map(publicItem), stripped: true };
}

function toStr(x) {
  return x == null ? "" : String(x);
}

// answers：[{ i: 題號, v: 作答值 }]。回傳 { 題號: 結果 }，結果欄位對應前端 gradeOneQuestion 的 result。
export function gradeShareAnswers(items, answers) {
  const results = {};
  for (const a of answers || []) {
    const i = Number(a && a.i);
    if (!Number.isInteger(i) || i < 0 || i >= items.length || results[i]) continue;
    const q = items[i];
    const v = toStr(a.v).slice(0, 2000);
    const max = Number(q.s) || 0;
    const explain = toStr(q.e);
    const kind = qKind(q);
    if (kind === "match" || kind === "order") {
      // 學生看到的是洗過的順序（位置 p），換回原題的序號再判分
      const perm = qtShuffle(q);
      const n = q.l.length;
      let value = "";
      if (kind === "match") {
        value = qtParseMatch(n, v).map((p, li) => (p >= 0 ? li + ":" + perm[p] : null)).filter(Boolean).join(",");
      } else {
        const arr = qtParseOrder(n, v);
        value = arr ? arr.map((p) => perm[p]).join(",") : "";
      }
      const g = qtGrade(q, value);
      results[i] = {
        kind, score: g.score, max, isCorrect: g.isCorrect, reviewNeeded: false,
        userDisplay: g.userDisplay, correctDisplay: g.correctDisplay,
        correct: g.correct, n: g.n, answered: g.answered, answerText: g.correctDisplay, explain,
      };
    } else if (kind === "choice") {
      const checked = Array.from(new Set(v.toUpperCase().replace(/[^A-Z]/g, "").split("").filter(Boolean))).sort();
      const correct = (getCorrectLetters(q) || []).slice().sort();
      const isCorrect = checked.length > 0 && checked.length === correct.length && checked.every((x, idx) => x === correct[idx]);
      const correctDisplay = correct.length > 0 ? correct.join("") : toStr(q.a).trim() || "(無法判讀，請自行核對)";
      results[i] = {
        kind, score: isCorrect ? max : 0, max, isCorrect, reviewNeeded: false,
        userDisplay: checked.length > 0 ? checked.join("") : "(未作答)",
        correctDisplay, answerText: correct.join(""), explain,
      };
    } else {
      const userAns = v.trim();
      const correctAns = toStr(q.a).trim();
      const roughMatch = userAns !== "" && userAns.replace(/\s/g, "") === correctAns.replace(/\s/g, "");
      results[i] = {
        kind, score: roughMatch ? max : 0, max, isCorrect: roughMatch, reviewNeeded: true,
        userDisplay: userAns || "(未作答)", correctDisplay: correctAns, answerText: correctAns, explain,
      };
    }
  }
  return results;
}
