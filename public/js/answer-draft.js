// 鴻綸 刻度｜學生作答暫存（2026-11-12）。
// 問題：手機瀏覽器切去 LINE 再回來被回收分頁、或不小心下拉重新整理，寫到一半的答案全部消失。
// 做法：從連結或代碼進來的學生，每次作答變動（沿用 updateAnsProgress 的防抖）就把答案存在這台裝置，
// 重新打開同一份測驗時自動填回；交卷成功就清掉。只存在本機，不送伺服器。
// 不啟用：交接模式（同一支手機輪流給好幾位同學，留草稿會洩漏上一位的答案）、老師預覽、自己練習。
// 用「包住既有函式」的方式接上（同 guide.js），不改 answer.js。
// 依賴：answer.js（updateAnsProgress、renderAnswerMode、gradeAnswers、handoffActive）、server-grade.js（serverGradeOn、serverAnswerValue）、
//       answer-qtypes.js（qtHidden、typedBoxHtml）、qtypes.js（qtIsTyped）。載入順序在 server-grade.js 之後。

const DRAFT_TTL_MS = 3 * 24 * 3600 * 1000;   // 3 天沒動就當作廢掉
const DRAFT_INFO_IDS = ['ansStuGrade', 'ansStuClass', 'ansStuSeat', 'ansStuName'];

function draftKey(shareId) { return 'lun_draft_' + shareId; }

// 純函式：把作答值與基本資料包成要存的物件；全部是空的就回 null（不必存）
function draftPack(values, info, now) {
    const v = {};
    Object.keys(values || {}).forEach(function (k) { if (String(values[k]) !== '') v[k] = String(values[k]); });
    const inf = {};
    Object.keys(info || {}).forEach(function (k) { if (String(info[k]).trim() !== '') inf[k] = String(info[k]).slice(0, 40); });
    if (Object.keys(v).length === 0 && Object.keys(inf).length === 0) return null;
    return { t: now, v: v, info: inf };
}

// 純函式：草稿是否還能用（格式正確、沒過期）
function draftUsable(d, now) {
    return !!(d && typeof d === 'object' && typeof d.t === 'number' && now - d.t >= 0 && now - d.t < DRAFT_TTL_MS && d.v && typeof d.v === 'object');
}

function draftEnabled() {
    return serverGradeOn() && !(typeof handoffActive === 'function' && handoffActive());
}

function draftRead() {
    try {
        const d = JSON.parse(localStorage.getItem(draftKey(window.liveShareId)) || 'null');
        return draftUsable(d, Date.now()) ? d : null;
    } catch (e) { return null; }
}

function draftClear() {
    window.__draftOff = true;   // 交卷之後不要再被後續輸入寫回去
    try { localStorage.removeItem(draftKey(window.liveShareId)); } catch (e) {}
}

function draftSave() {
    if (!draftEnabled() || window.__draftOff) return;
    const values = {}, info = {};
    (window.currentItems || []).forEach(function (_, i) { values[i] = serverAnswerValue(i); });
    DRAFT_INFO_IDS.forEach(function (id) { const el = document.getElementById(id); if (el) info[id] = el.value; });
    try {
        const pack = draftPack(values, info, Date.now());
        if (pack) localStorage.setItem(draftKey(window.liveShareId), JSON.stringify(pack));
        else localStorage.removeItem(draftKey(window.liveShareId));
    } catch (e) {}   // 無痕或空間滿：存不了就算了，作答照常
}

// 把草稿填回畫面；回傳填回幾題
function draftRestore(d) {
    let n = 0;
    (window.currentItems || []).forEach(function (q, i) {
        const val = d.v[i];
        if (val === undefined) return;
        if (qtIsTyped(q)) {
            const hid = qtHidden(i);
            if (!hid) return;
            hid.value = val;
            const box = document.getElementById('qt-box-' + i);
            if (box) box.innerHTML = typedBoxHtml(q, i, val);
        } else if (q.o && q.o.length > 0) {
            document.querySelectorAll('input[name="ans-' + i + '"]').forEach(function (el) { el.checked = val.indexOf(el.value) >= 0; });
        } else {
            const t = document.getElementById('ans-text-' + i);
            if (!t) return;
            t.value = val;
        }
        n++;
    });
    DRAFT_INFO_IDS.forEach(function (id) {
        const el = document.getElementById(id);
        if (el && !el.value && d.info && d.info[id]) el.value = d.info[id];
    });
    return n;
}

(function wrapForDraft() {
    const origProgress = updateAnsProgress;
    updateAnsProgress = function () { origProgress.apply(this, arguments); draftSave(); };

    const origRender = renderAnswerMode;
    renderAnswerMode = function () {
        origRender.apply(this, arguments);
        if (!draftEnabled()) return;
        window.__draftOff = false;
        const d = draftRead();
        if (!d) return;
        const n = draftRestore(d);
        origProgress();   // 只更新進度條，不用立刻再存一次
        const start = document.getElementById('ansStartScreen');
        if (start && (n > 0 || Object.keys(d.info || {}).length)) {
            const note = document.createElement('div');
            note.className = 'text-sm text-center mb-3';
            note.style.color = 'var(--hl-blue)';
            note.textContent = n > 0 ? ('已幫你填回上次寫的內容（' + n + ' 題），按「開始測驗」繼續。') : '已幫你填回上次的基本資料。';
            start.insertBefore(note, start.firstChild);
        }
    };

    const origGrade = gradeAnswers;
    gradeAnswers = async function () {
        const before = window.lastGradeSummary;
        const r = await origGrade.apply(this, arguments);
        if (window.lastGradeSummary !== before) draftClear();   // 交卷成功才清；連線失敗時答案還在，草稿也留著
        return r;
    };
})();
