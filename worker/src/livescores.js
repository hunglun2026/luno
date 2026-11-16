// 刻度｜全班成績總表（2026-11-16）：老師在儀表板看每位學生目前的得分，並匯出 Excel。
// 資料來源跟「全班答題分析」一樣：學生作答時上報的 live_progress.answers（保留 8 小時）＋分享裡的題目與答案（KV，30 天）。
// 判分沿用學生版伺服器判分 gradeShareAnswers（sharegrade.js）：選擇題、配合題、排序題是確定的對錯；
// 填空、簡答只做文字比對，沒有交給 AI 批改，所以每位學生會標「文字題 N 題」讓老師知道那幾題分數僅供參考。
// 這是「目前得分」不是「交卷成績」：學生還沒寫完就已經有分數，answered／total 讓老師看得出寫了多少。
import { gradeShareAnswers } from "./sharegrade.js";
import { qKind } from "./qtypes.js";

function seatNum(s) {
  const n = parseInt(String(s || ""), 10);
  return Number.isFinite(n) ? n : Infinity;
}

// items：題目陣列（含答案）；rows：[{ studentId, grade, className, seat, name, answered, total, answers: [{i, selected}], updatedAt }]
export function buildScoreTable(items, rows) {
  const maxScore = (items || []).reduce((a, q) => a + (Number(q.s) || 0), 0);
  const students = (rows || []).map((r) => {
    const answers = (r.answers || []).map((a) => ({ i: a.i, v: a.selected }));
    const res = gradeShareAnswers(items, answers);
    let score = 0;
    let textCount = 0;
    const perQ = (items || []).map((q, i) => {
      const g = res[i];
      if (!g) return null;
      score += Number(g.score) || 0;
      if (g.reviewNeeded) textCount++;
      return Number(g.score) || 0;
    });
    return {
      studentId: r.studentId, grade: r.grade || "", className: r.className || "", seat: r.seat || "", name: r.name || "",
      answered: r.answered, total: r.total, score, textCount, perQ, updatedAt: r.updatedAt,
    };
  });
  students.sort((a, b) => seatNum(a.seat) - seatNum(b.seat) || String(a.name).localeCompare(String(b.name), "zh-Hant"));
  const done = students.filter((s) => s.answered > 0);
  const avg = done.length ? Math.round((done.reduce((a, s) => a + s.score, 0) / done.length) * 10) / 10 : null;
  return {
    maxScore,
    questions: (items || []).map((q, i) => ({ i, q: String(q.q || "").slice(0, 60), s: Number(q.s) || 0, kind: qKind(q) })),
    students,
    summary: {
      count: students.length,
      average: avg,
      highest: done.length ? Math.max(...done.map((s) => s.score)) : null,
      lowest: done.length ? Math.min(...done.map((s) => s.score)) : null,
    },
  };
}
