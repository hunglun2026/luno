// 刻度｜儀表板的「全班成績總表」（2026-11-16）：每位學生目前得分、寫到第幾題，並可匯出 Excel（.xlsx）。
// 資料來自 GET /api/live-scores/:shareId（計算在 worker/src/livescores.js）；這裡只負責畫與匯出。
// 這是「目前得分」不是交卷成績；填空、簡答只做文字比對，所以有文字題的學生會標「文字題 N 題」提醒老師再看。
// 依賴：common.js（API_BASE、escapeHtml）、core.js（loadScript、LIB_URLS）、dialog.js（lqAlert）

window._liveScoresAt = 0;
window._liveScoresData = null;

async function liveRefreshScores(shareId, headers) {
    const box = document.getElementById('liveScoresBody');
    if (!box) return;
    if (Date.now() - window._liveScoresAt < 8000 && box.dataset.ready) return;
    window._liveScoresAt = Date.now();
    try {
        const res = await fetch(API_BASE + "/api/live-scores/" + encodeURIComponent(shareId), { headers: headers });
        const data = await res.json();
        if (data.error) { box.innerHTML = ''; return; }   // 沒權限或已停止監看：主表會講原因
        window._liveScoresData = data;
        renderLiveScores(box, data);
        box.dataset.ready = '1';
    } catch (e) { /* 加值功能，抓不到就維持上一次的畫面 */ }
}

function renderLiveScores(box, d) {
    const st = d.students || [];
    if (st.length === 0) { box.innerHTML = ''; return; }
    const sm = d.summary || {};
    let html = "<div class='lq-card p-4 mb-3'>" +
        "<div class='flex items-center justify-between gap-2 flex-wrap mb-1'><div class='font-bold'>🏅 全班成績總表</div>" +
        "<button type='button' onclick='liveExportScores()' class='lq-btn lq-btn-primary text-sm px-3 py-1.5'>匯出 Excel</button></div>" +
        "<div class='text-xs text-gray-500 mb-3'>這是「目前得分」，學生還沒寫完時分數會繼續變。選擇題、配合題、排序題自動計分；填空、簡答只做文字比對，標「文字題」的請老師再看一下。</div>" +
        "<div class='text-sm mb-3'>" + sm.count + " 人　平均 <b>" + (sm.average == null ? '--' : sm.average) + "</b>　最高 <b>" +
        (sm.highest == null ? '--' : sm.highest) + "</b>　最低 <b>" + (sm.lowest == null ? '--' : sm.lowest) + "</b>　滿分 " + d.maxScore + "</div>" +
        "<div style='overflow-x:auto'><table class='lq-score-table'><thead><tr><th>座號</th><th>姓名</th><th>得分</th><th>進度</th><th></th></tr></thead><tbody>";
    st.forEach(function (s) {
        html += "<tr><td>" + escapeHtml(s.seat || '') + "</td><td>" + escapeHtml(s.name || '（未填名字）') + "</td>" +
            "<td><b>" + s.score + "</b> / " + d.maxScore + "</td><td>" + s.answered + " / " + s.total + "</td>" +
            "<td class='text-xs text-gray-500'>" + (s.textCount ? "文字題 " + s.textCount + " 題" : "") + "</td></tr>";
    });
    box.innerHTML = html + "</tbody></table></div></div>";
}

// 匯出 .xlsx（中文 CSV 在 Excel 會亂碼，所以一律匯出真正的 Excel 檔）。第一張表是總表，各題得分在後面的欄位
async function liveExportScores() {
    const d = window._liveScoresData;
    if (!d || !(d.students || []).length) { lqAlert('還沒有學生成績可以匯出'); return; }
    try { await loadScript(LIB_URLS.xlsx); } catch (e) { lqAlert('Excel 元件載入失敗，請檢查網路後再按一次'); return; }
    const head = ['座號', '姓名', '年級', '班級', '得分', '滿分', '已答題數', '總題數', '文字題數（分數僅供參考）'];
    d.questions.forEach(function (q) { head.push('第' + (q.i + 1) + '題（' + q.s + '分）'); });
    const rows = [head];
    d.students.forEach(function (s) {
        const r = [s.seat || '', s.name || '', s.grade || '', s.className || '', s.score, d.maxScore, s.answered, s.total, s.textCount];
        s.perQ.forEach(function (v) { r.push(v == null ? '' : v); });
        rows.push(r);
    });
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = head.map(function (h, i) { return { wch: i === 1 ? 12 : (i === 8 ? 22 : 10) }; });
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '成績總表');
    const t = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    window.XLSX.writeFile(wb, '成績總表_' + t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()) + '.xlsx');
}
