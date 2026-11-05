// 鴻綸 刻度｜填空、簡答用 AI 依參考答案批改（2026-11-05）。
// 只對「標了 g 的非選擇題」啟用（紙本卷拍照轉題目的試卷，參考答案來自答案卷或老師核對過）；
// 其他出題流程維持原本的文字比對，不多耗 AI 額度。失敗或次數用完就什麼都不做，交卷照常用文字比對。
// 伺服器自己從分享讀題目與參考答案，這裡只送「題號＋學生答案」（見 worker/src/grade.js）。
// 依賴：common.js（API_BASE）、home.js（getClientId、getOrCreateShareId）、answer.js（gradedDetails、setAnswerFeedback、flashAnswerCard）

function aiGradeEligible(q) {
    return !!(q && q.g && (!q.o || q.o.length === 0) && String(q.a == null ? '' : q.a).trim());
}

// 回傳 { 題號: { score, max, comment } }；任何失敗回 {}
async function aiRegradeTextAnswers() {
    const items = window.currentItems || [];
    const list = [];
    items.forEach(function (q, i) {
        if (!aiGradeEligible(q)) return;
        const el = document.getElementById('ans-text-' + i);
        const t = ((el && el.value) || '').trim();
        if (t) list.push({ i: i, t: t.slice(0, 1000) });
    });
    if (!list.length) return {};
    try {
        // 學生從連結進來：用連結的分享代號；老師自己預覽、交接模式：先確保有一份分享
        const shareId = window.isSharedView && window.liveShareId ? window.liveShareId : await getOrCreateShareId();
        const res = await fetch(API_BASE + '/api/grade-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
            body: JSON.stringify({ shareId: shareId, answers: list })
        });
        const data = await res.json();
        if (!res.ok || data.error) return {};
        const map = {};
        (data.grades || []).forEach(function (g) { map[g.i] = g; });
        return map;
    } catch (e) {
        return {};
    }
}

// 把 AI 的給分套回 gradedDetails 與畫面上的回饋
function applyAiGrades(ai) {
    Object.keys(ai).forEach(function (k) {
        const i = Number(k);
        const g = ai[k];
        const r = window.gradedDetails && window.gradedDetails[i];
        if (!r) return;
        const full = g.max > 0 && g.score >= g.max;
        const q = (window.currentItems || [])[i] || {};
        const restText = 'AI 依參考答案批改：' + (g.comment || (full ? '答對了' : '請對照參考答案')) + '（' + g.score + ' / ' + g.max + ' 分）｜參考答案：' + String(q.a || '').trim() + (q.e ? ('｜解析：' + q.e) : '');
        const badge = full ? '✅' : (g.score > 0 ? '🟡' : '❌');
        const cls = 'ans-feedback mt-2 text-sm ' + (full ? 'text-emerald-600 font-bold' : (g.score > 0 ? 'text-amber-600 font-bold' : 'text-red-600 font-bold'));
        r.score = g.score;
        r.isCorrect = full;
        r.reviewNeeded = false;
        r.aiGraded = true;
        r.fb = { badge: badge, restText: restText, cls: cls };
        const fb = document.getElementById('ans-feedback-' + i);
        if (fb && !handoffActive()) {
            setAnswerFeedback(fb, badge, restText, cls);
            flashAnswerCard(i, full);
        }
    });
}
