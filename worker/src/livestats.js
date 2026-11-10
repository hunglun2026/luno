// 鴻綸 刻度｜全班答題分析：老師看「哪幾題最多人錯、每個選項有幾人選」（學 Wayground 的「找出學生困難點」）。
// 為什麼放後端算：每位學生的作答（每題選了什麼）只存在 live_progress.answers，總覽 API 刻意不回傳（量大）；
// 在這裡一次讀完、算成每題的小統計再回給老師，前端不用拿到全班每個人的答案。
// 只統計「有選項的選擇題、複選題」：填空、簡答、配合、排序在即時進度裡沒有可靠的對錯（文字比對只供參考），不納入，不亂算。

// 一題的正確答案字母集合（A、B、AC…）；q.a 可能是 "B"、"AC"、"A,C"，取所有 A–Z 並去重排序
export function correctLetters(q) {
  if (!q || !Array.isArray(q.o) || q.o.length === 0) return null;
  const set = new Set(String(q.a || "").toUpperCase().match(/[A-Z]/g) || []);
  const valid = [...set].filter((l) => l.charCodeAt(0) - 65 < q.o.length).sort();
  return valid.length ? valid.join("") : null;
}

// 學生選的字母：單選 "B"、複選 "AC"（前端用 value 串起來），排序後比對
function pickedLetters(selected) {
  const set = new Set(String(selected || "").toUpperCase().match(/[A-Z]/g) || []);
  return [...set].sort();
}

// items：題目陣列；rows：[{ answers: [{i, selected}] }]（已解析）。回傳每題統計與「最需要檢討」排名
export function buildStats(items, rows) {
  const perQ = [];
  (items || []).forEach((q, i) => {
    const key = correctLetters(q);
    if (!key) return;
    const counts = {};
    for (let k = 0; k < q.o.length; k++) counts[String.fromCharCode(65 + k)] = 0;
    let answered = 0;
    let correct = 0;
    rows.forEach((r) => {
      const a = (r.answers || []).find((x) => Number(x.i) === i);
      if (!a || !String(a.selected || "").trim()) return;
      const picked = pickedLetters(a.selected);
      if (!picked.length) return;
      answered++;
      picked.forEach((l) => { if (l in counts) counts[l]++; });
      if (picked.join("") === key) correct++;
    });
    perQ.push({
      i,
      q: String(q.q || "").slice(0, 80),
      key,
      answered,
      correct,
      rate: answered > 0 ? Math.round((correct / answered) * 100) : null,
      counts,
      options: q.o.map((t) => String(t).slice(0, 40)),
    });
  });
  // 最需要檢討：至少 2 人作答、答對率最低的前 3 題（作答人數太少的不排，免得 1 個人答錯就變成「全班都錯」）
  const hard = perQ
    .filter((x) => x.answered >= 2 && x.rate !== null && x.rate < 100)
    .sort((a, b) => a.rate - b.rate || b.answered - a.answered)
    .slice(0, 3)
    .map((x) => x.i);
  return { questions: perQ, hardest: hard, students: rows.length };
}
