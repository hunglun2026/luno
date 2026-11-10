// 鴻綸 刻度｜學生版的伺服器端判分（2026-11-11）。
// 學生從連結或代碼進來時，題目不含答案（Worker 回 stripped:true），按「檢查這題」或「交卷」才把作答送到 /api/share-grade，
// 伺服器判完才公布該題的對錯、答案與解析。這樣按 F12 也看不到還沒作答的題的答案。
// 舊分享（沒有 stripped）、老師預覽、自己練習、交接模式都還是本機判分，不走這裡。
// 依賴：common.js（API_BASE）、answer.js（setAnswerFeedback、flashAnswerCard、handoffActive）、qtypes.js（qKind）
// 結果快取在 window.serverGrades[題號]；拿到後把 a／e 補回 currentItems（只補已經公布的那題），讓 AI 批改、分享結果沿用原本寫法。

window.serverGrades = window.serverGrades || {};

function serverGradeOn() {
    return !!(window.isSharedView && window.sharedMode === 'student' && window.shareStripped && window.liveShareId);
}

// 這一題目前的作答值（跟即時進度、交卷前提醒讀的是同一個欄位）
function serverAnswerValue(i) {
    const q = (window.currentItems || [])[i];
    if (!q) return '';
    if (qtIsTyped(q)) { const el = document.getElementById('ans-text-' + i); return el ? el.value : ''; }
    if (q.o && q.o.length > 0) {
        return Array.from(document.querySelectorAll('input[name="ans-' + i + '"]:checked')).map(function (el) { return el.value; }).join('');
    }
    const t = document.getElementById('ans-text-' + i);
    return t ? t.value : '';
}

// 把指定題號送去判分；成功回 true。已判過的題不重送（即時模式按過「檢查這題」的）
async function serverGradeFetch(indices) {
    const need = indices.filter(function (i) { return !window.serverGrades[i]; });
    if (need.length === 0) return true;
    try {
        const res = await fetch(API_BASE + '/api/share-grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shareId: window.liveShareId, answers: need.map(function (i) { return { i: i, v: serverAnswerValue(i) }; }) })
        });
        const data = await res.json();
        if (!res.ok || data.error || !data.results) return false;
        Object.keys(data.results).forEach(function (k) {
            const r = data.results[k];
            window.serverGrades[k] = r;
            const q = (window.currentItems || [])[Number(k)];
            if (q) { q.a = r.answerText; q.e = r.explain || ''; }   // 公布之後才補回
        });
        return need.every(function (i) { return !!window.serverGrades[i]; });
    } catch (e) {
        return false;
    }
}

// 用伺服器的結果畫回饋，回傳格式與本機判分的 result 相同（gradeOneQuestion 直接回傳它）
function gradeFromServer(i, q, fb) {
    const s = window.serverGrades[i];
    if (!s) return null;
    const ex = s.explain ? ('｜解析：' + s.explain) : '';
    let badge, restText, cls;
    if (s.kind === 'choice') {
        badge = s.isCorrect ? '✅' : '❌';
        restText = s.isCorrect ? '答對了！' : ('答錯了，正確答案：' + s.correctDisplay + ex);
        cls = 'ans-feedback mt-2 text-sm ' + (s.isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold');
    } else if (s.kind === 'text') {
        badge = s.isCorrect ? '🤔' : '📝';
        restText = (s.isCorrect ? '文字比對相符(僅供參考)' : '請自行核對') + '，參考答案：' + s.correctDisplay + ex;
        cls = 'ans-feedback mt-2 text-sm text-blue-600';
    } else {
        const partial = s.answered && !s.isCorrect && s.correct > 0;
        badge = s.isCorrect ? '✅' : (partial ? '🟡' : '❌');
        restText = s.isCorrect ? '全部答對了！'
            : ('你的答案：' + s.userDisplay + '｜正確答案：' + s.correctDisplay + (s.answered ? '（對 ' + s.correct + ' / ' + s.n + '）' : '') + ex);
        cls = 'ans-feedback mt-2 text-sm ' + (s.isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold');
    }
    if (!handoffActive()) {
        setAnswerFeedback(fb, badge, restText, cls);
        flashAnswerCard(i, s.isCorrect);
    }
    return { score: s.score, max: s.max, isCorrect: s.isCorrect, reviewNeeded: !!s.reviewNeeded, userDisplay: s.userDisplay, correctDisplay: s.correctDisplay, fb: { badge: badge, restText: restText, cls: cls } };
}
