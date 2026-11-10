// 鴻綸 刻度｜新題型（配合題、排序題）的線上作答畫面與判分回饋。純邏輯（洗牌、判分、答案文字）在 qtypes.js。
// 依賴：qtypes.js、answer.js（updateAnsProgress、onAnswerPicked、setAnswerFeedback、flashAnswerCard）、handoff.js（handoffActive）
// 作法：作答值序列化後放在隱藏欄位 #ans-text-<i>，既有的「已作答題數」「即時進度上報」「交卷前提醒」都把它當文字題讀，不用另外改。
// 手機以「點選」為主：配合題先點左再點右，排序題用上移、下移鈕，不用拖曳（拖曳在手機上容易誤觸）。
// 值只有數字進 onclick，題目文字一律 escapeHtml。

window.__qtSel = {};   // 配合題目前點住的左項：{ 題號: 左項序號 }，重畫作答頁就清空

function qtHidden(i) { return document.getElementById('ans-text-' + i); }

// 一題的作答區塊 HTML（卡片裡題幹下面那一塊）
function typedAnswerHtml(q, i) {
    window.__qtSel[i] = null;
    return "<input type='hidden' id='ans-text-" + i + "' value=''>" +
        "<div class='lq-typed' id='qt-box-" + i + "'>" + typedBoxHtml(q, i, '') + "</div>" +
        "<button type='button' onclick='confirmAnswer(" + i + ")' id='ans-confirm-" + i + "' class='ans-confirm-btn lq-btn lq-btn-primary text-sm px-3 py-1.5 mt-2' style='display:none;'>✅ 檢查這題</button>";
}

function typedBoxHtml(q, i, value) {
    return q.t === 'match' ? matchBoxHtml(q, i, value) : orderBoxHtml(q, i, value);
}

function matchBoxHtml(q, i, value) {
    const perm = qtShuffle(q);
    const pairs = qtParseMatch(q.l.length, value);
    const sel = window.__qtSel[i];
    const leftOf = {};   // 右項（原順序）目前連到哪個左項
    pairs.forEach(function (j, li) { if (j >= 0) leftOf[j] = li; });
    let left = '', right = '';
    q.l.forEach(function (text, li) {
        const j = pairs[li];
        const cls = 'lq-typed-btn qt-item' + (j >= 0 ? ' is-paired qt-c' + (li % 6) : '') + (sel === li ? ' is-sel' : '');
        left += "<button type='button' class='" + cls + "' aria-pressed='" + (sel === li) + "' onclick='qtMatchLeft(" + i + "," + li + ")'>" +
            "<b>" + (li + 1) + "</b><span class='qt-text'>" + escapeHtml(text) + "</span>" +
            (j >= 0 ? "<span class='qt-tag'>" + QT_LABELS[perm.indexOf(j)] + "</span>" : "") + "</button>";
    });
    perm.forEach(function (j, p) {
        const li = leftOf[j];
        const cls = 'lq-typed-btn qt-item' + (li !== undefined ? ' is-paired qt-c' + (li % 6) : '');
        right += "<button type='button' class='" + cls + "' onclick='qtMatchRight(" + i + "," + j + ")'>" +
            "<b>" + QT_LABELS[p] + "</b><span class='qt-text'>" + escapeHtml(q.r[j]) + "</span>" +
            (li !== undefined ? "<span class='qt-tag'>" + (li + 1) + "</span>" : "") + "</button>";
    });
    return "<div class='lq-typed-hint'>先點左邊一個，再點右邊對應的，配成一對。點已配好的可以取消。</div>" +
        "<div class='lq-typed-cols'><div class='lq-typed-col'>" + left + "</div><div class='lq-typed-col'>" + right + "</div></div>" +
        "<button type='button' class='lq-typed-btn lq-typed-clear' onclick='qtMatchClear(" + i + ")'>全部清除</button>";
}

function orderBoxHtml(q, i, value) {
    const perm = qtShuffle(q);
    const arr = qtParseOrder(q.l.length, value) || perm;   // 還沒動過就是洗牌後的樣子
    let rows = '';
    arr.forEach(function (idx, p) {
        rows += "<div class='lq-typed-row'><span class='qt-pos'>" + (p + 1) + "</span>" +
            "<span class='qt-lab'>" + QT_CIRCLED[perm.indexOf(idx)] + "</span><span class='qt-text'>" + escapeHtml(q.l[idx]) + "</span>" +
            "<button type='button' class='lq-typed-btn qt-mv' aria-label='上移' onclick='qtOrderMove(" + i + "," + p + ",-1)'" + (p === 0 ? " disabled" : "") + ">↑</button>" +
            "<button type='button' class='lq-typed-btn qt-mv' aria-label='下移' onclick='qtOrderMove(" + i + "," + p + ",1)'" + (p === arr.length - 1 ? " disabled" : "") + ">↓</button></div>";
    });
    return "<div class='lq-typed-hint'>用 ↑ ↓ 把項目排成正確的順序，左邊的數字是你排的第幾個。</div>" + rows;
}

// 存回隱藏欄位、重畫、通知進度（跟選擇題點選後做的事一樣）
function qtCommit(i, value) {
    const q = (window.currentItems || [])[i];
    const el = qtHidden(i);
    if (!q || !el) return;
    el.value = value;
    const box = document.getElementById('qt-box-' + i);
    if (box) box.innerHTML = typedBoxHtml(q, i, value);
    updateAnsProgress();
    onAnswerPicked(i);
}

function qtPairsToValue(pairs) {
    return pairs.map(function (j, li) { return j >= 0 ? li + ':' + j : null; }).filter(Boolean).join(',');
}

function qtMatchLeft(i, li) {
    const q = (window.currentItems || [])[i];
    const pairs = qtParseMatch(q.l.length, qtHidden(i).value);
    if (pairs[li] >= 0) {            // 點已配好的左項：取消這一對，並選住它方便重連
        pairs[li] = -1;
        window.__qtSel[i] = li;
    } else {
        window.__qtSel[i] = window.__qtSel[i] === li ? null : li;
    }
    qtCommit(i, qtPairsToValue(pairs));
}

function qtMatchRight(i, j) {
    const q = (window.currentItems || [])[i];
    const pairs = qtParseMatch(q.l.length, qtHidden(i).value);
    const sel = window.__qtSel[i];
    if (sel !== null && sel !== undefined) {
        const old = pairs.indexOf(j);   // 這個右項已經被別人連走：換成這次的
        if (old >= 0) pairs[old] = -1;
        pairs[sel] = j;
        window.__qtSel[i] = null;
    } else {
        const old = pairs.indexOf(j);   // 沒選住左項時，點已配好的右項＝取消
        if (old >= 0) pairs[old] = -1;
    }
    qtCommit(i, qtPairsToValue(pairs));
}

function qtMatchClear(i) {
    window.__qtSel[i] = null;
    qtCommit(i, '');
}

function qtOrderMove(i, p, dir) {
    const q = (window.currentItems || [])[i];
    const arr = (qtParseOrder(q.l.length, qtHidden(i).value) || qtShuffle(q)).slice();
    const k = p + dir;
    if (k < 0 || k >= arr.length) return;
    const t = arr[p]; arr[p] = arr[k]; arr[k] = t;
    qtCommit(i, arr.join(','));
}

// 即時模式按「確認這題」後鎖住這題的按鈕
function lockTypedCard(i) {
    document.querySelectorAll('#ans-card-' + i + ' .lq-typed-btn').forEach(function (b) { b.disabled = true; });
}

// 單題判分（gradeOneQuestion 遇到新題型時呼叫）：回傳格式與選擇題、文字題一樣
function gradeTypedQuestion(i, q, fb) {
    const el = qtHidden(i);
    const g = qtGrade(q, el ? el.value : '');
    const partial = g.answered && !g.isCorrect && g.correct > 0;
    const restText = g.isCorrect ? '全部答對了！'
        : ('你的答案：' + g.userDisplay + '｜正確答案：' + g.correctDisplay + (g.answered ? '（對 ' + g.correct + ' / ' + g.n + '）' : '') + (q.e ? ('｜解析：' + q.e) : ''));
    const badge = g.isCorrect ? '✅' : (partial ? '🟡' : '❌');
    const cls = 'ans-feedback mt-2 text-sm ' + (g.isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold');
    // 交接模式：交卷後連對錯都不顯示，留到家長／教師解鎖才公布（結果存在 result.fb）
    if (!handoffActive()) {
        setAnswerFeedback(fb, badge, restText, cls);
        flashAnswerCard(i, g.isCorrect);
    }
    return { score: g.score, max: g.max, isCorrect: g.isCorrect, reviewNeeded: false, userDisplay: g.userDisplay, correctDisplay: g.correctDisplay, fb: { badge: badge, restText: restText, cls: cls } };
}
