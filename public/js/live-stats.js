// 鴻綸 刻度｜老師儀表板的「全班答題分析」卡片：每題答對率、各選項人數、最需要檢討的題目。
// 資料來自 GET /api/live-stats/:shareId（計算在 worker/src/livestats.js）；這裡只負責畫。
// 只有儀表板在輪詢時呼叫 liveRefreshStats，每 10 秒最多更新一次（比學生進度重，不必每 3 秒打一次）。

window._liveStatsAt = 0;

async function liveRefreshStats(shareId, headers) {
    const box = document.getElementById('liveStatsBody');
    if (!box) return;
    if (Date.now() - window._liveStatsAt < 10000 && box.dataset.ready) return;
    window._liveStatsAt = Date.now();
    try {
        const res = await fetch(API_BASE + "/api/live-stats/" + encodeURIComponent(shareId), { headers: headers });
        const data = await res.json();
        if (data.error) { box.innerHTML = ''; return; }   // 沒權限或已停止監看：不顯示，主表已經會講原因
        renderLiveStats(box, data);
        box.dataset.ready = '1';
    } catch (e) { /* 這是加值功能，抓不到就維持上一次的畫面 */ }
}

function lsText(s) { return escapeHtml(typeof mathPlain === 'function' ? mathPlain(String(s)) : String(s)); }

function lsBar(pct, color) {
    return "<div style='height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden;'>" +
        "<div style='width:" + Math.max(0, Math.min(100, pct)) + "%;height:100%;background:" + color + ";'></div></div>";
}

// 答對率的顏色：低於 50 紅、50 到 79 黃、80 以上綠（跟全站配色一致）
function lsRateColor(rate) {
    if (rate === null) return '#9ca3af';
    return rate < 50 ? '#ea4335' : (rate < 80 ? '#f9ab00' : '#34a853');
}

function renderLiveStats(box, st) {
    const qs = st.questions || [];
    if (qs.length === 0) { box.innerHTML = ''; return; }
    const hardSet = new Set(st.hardest || []);
    let html = "<div class='lq-card p-4 mb-3'>" +
        "<div class='font-bold mb-1'>📊 全班答題分析</div>" +
        "<div class='text-xs text-gray-500 mb-3'>只統計選擇題與複選題（填空、簡答、配合、排序沒有可靠的對錯，不列入）。作答人數太少時，答對率僅供參考。</div>";

    if (hardSet.size > 0) {
        html += "<div class='text-sm font-semibold mb-2' style='color:#b3261e;'>⚠️ 最需要檢討的題目</div>";
        (st.hardest || []).forEach(function (i) {
            const q = qs.find(function (x) { return x.i === i; });
            if (!q) return;
            html += "<div class='mb-2 text-sm'>第 " + (q.i + 1) + " 題　<b style='color:" + lsRateColor(q.rate) + ";'>答對率 " + q.rate + "%</b>" +
                "<span class='text-gray-500'>（" + q.correct + " / " + q.answered + " 人答對）</span><div class='text-gray-700'>" + lsText(q.q) + "</div></div>";
        });
        html += "<hr style='border:none;border-top:1px solid #e5e7eb;margin:0.75rem 0;'>";
    } else {
        html += "<div class='text-sm text-gray-500 mb-3'>目前沒有答對率偏低的題目（至少要 2 位學生作答才會列入）。</div>";
    }

    qs.forEach(function (q) {
        const rateTxt = q.rate === null ? '還沒有人作答' : ('答對率 ' + q.rate + '%（' + q.correct + ' / ' + q.answered + ' 人）');
        html += "<details class='mb-2' " + (hardSet.has(q.i) ? "open" : "") + ">" +
            "<summary class='cursor-pointer text-sm py-1'><b>第 " + (q.i + 1) + " 題</b>　<span style='color:" + lsRateColor(q.rate) + ";'>" + rateTxt + "</span></summary>" +
            "<div class='text-sm text-gray-700 mb-2'>" + lsText(q.q) + "</div>";
        Object.keys(q.counts).forEach(function (letter, k) {
            const n = q.counts[letter];
            const pct = q.answered > 0 ? Math.round((n / q.answered) * 100) : 0;
            const isKey = q.key.indexOf(letter) >= 0;
            html += "<div class='mb-1'><div class='flex justify-between text-xs mb-0.5'>" +
                "<span>(" + letter + ") " + lsText(q.options[k] || '') + (isKey ? " <b style='color:#137333;'>✓ 正確答案</b>" : "") + "</span>" +
                "<span class='text-gray-500'>" + n + " 人</span></div>" +
                lsBar(pct, isKey ? '#34a853' : '#cbd5e1') + "</div>";
        });
        html += "</details>";
    });
    html += "</div>";
    box.innerHTML = html;
}
