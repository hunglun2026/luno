// 老師／訪客出完題後的「題目預覽」：唯讀列出每一題與正確答案、解析，下面接「發送給學生」。
// 2026-11-11 Steve：出完題要先看到題目才能發送，不是一個藏著題目的學生開始畫面。
// 只在 answerStartScreenHtml() 的 teacherPreview 分支用到；學生作答、交接、自己練習不經過這裡。
// 答案文字一律用 sheet.js 的 answerKeyText、題型判斷用 qtypes.js 的 qKind（不要直接看 o.length）。

function teacherPreviewItemHtml(q, i) {
    const kind = qKind(q);
    let h = "<div class='lq-card p-4 mb-3 lq-tp-q'>";
    h += "<div class='font-bold mb-2'>" + (i + 1) + ". " + escapeHtml(q.q) +
        " <span class='text-xs text-gray-400'>(" + (Number(q.s) || 0) + "分)</span></div>" + qImgHtml(q);
    if (kind === 'choice') {
        const letters = getCorrectLetters(q) || [];
        q.o.forEach(function (o, oi) {
            const label = String.fromCharCode(65 + oi);
            const ok = letters.indexOf(label) >= 0;
            h += "<div class='lq-tp-opt" + (ok ? " is-ok" : "") + "'>" + (ok ? "✓ " : "") +
                "(" + label + ") " + escapeHtml(stripOptLabel(o, label)) + "</div>";
        });
    } else if (kind === 'match') {
        h += "<div class='text-sm' style='color:#5f6368;'>配合題，正確配對：</div>";
        q.l.forEach(function (l, li) {
            h += "<div class='lq-tp-opt is-ok'>" + escapeHtml(l) + " ↔ " + escapeHtml(q.r[li]) + "</div>";
        });
    } else if (kind === 'order') {
        h += "<div class='text-sm' style='color:#5f6368;'>排序題，正確順序：</div>";
        q.l.forEach(function (l, li) {
            h += "<div class='lq-tp-opt is-ok'>" + (li + 1) + ". " + escapeHtml(l) + "</div>";
        });
    }
    if (kind !== 'match' && kind !== 'order') {
        h += "<div class='lq-tp-ans'>答案：<b>" + escapeHtml(answerKeyText(q)) + "</b></div>";
    }
    if (q.e) h += "<div class='lq-tp-ans'>解析：" + escapeHtml(q.e) + "</div>";
    return h + "</div>";
}

function teacherPreviewListHtml(items) {
    let h = "<div class='lq-tp-list'><div class='lq-tp-head'>共 " + items.length + " 題（綠色是正確答案，學生看不到）</div>";
    items.forEach(function (q, i) { h += teacherPreviewItemHtml(q, i); });
    return h + "</div>";
}
