// 老師／訪客出完題後的「題目預覽」：唯讀列出每一題與正確答案、解析，下面接「發送給學生」。
// 2026-11-11 Steve：出完題要先看到題目才能發送，不是一個藏著題目的學生開始畫面。
// 只在 answerStartScreenHtml() 的 teacherPreview 分支用到；學生作答、交接、自己練習不經過這裡。
// 答案文字一律用 sheet.js 的 answerKeyText、題型判斷用 qtypes.js 的 qKind（不要直接看 o.length）。

function teacherPreviewItemHtml(q, i) {
    const kind = qKind(q);
    let h = "<div class='lq-card p-4 mb-3 lq-tp-q' id='tp-q-" + i + "'>";
    h += "<div class='lq-tp-qhead'><div class='font-bold'>" + (i + 1) + ". " + escapeHtml(q.q) +
        " <span class='text-xs text-gray-400'>(" + (Number(q.s) || 0) + "分)</span></div>" +
        "<div class='lq-tp-acts no-print'>" +
        "<button type='button' class='lq-btn lq-btn-secondary lq-tp-act' onclick='tpRegen(" + i + ", this)' aria-label='只換第 " + (i + 1) + " 題'>🎲 換這題</button>" +
        "<button type='button' class='lq-btn lq-btn-secondary lq-tp-act' onclick='tpEdit(" + i + ")' aria-label='編輯第 " + (i + 1) + " 題'>✏️ 編輯</button>" +
        "</div></div>" + qImgHtml(q);
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

// 吸頂操作列（2026-11-13）：題目再多，「給學生寫」都在手邊，不用捲到最底
function teacherPreviewBarHtml() {
    return "<div class='lq-tp-bar no-print' id='tpBar'>" +
        "<button onclick='openGiveToStudents()' class='lq-btn lq-cta lq-btn-primary lq-tp-main'>📤 給學生寫</button>" +
        "<button onclick='startAnswerQuiz()' class='lq-btn lq-btn-secondary lq-tp-side'>▶ 自己先試寫</button></div>";
}
// 吸頂位置：上面若有釘住的深色工具列就接在它下面（它在手機的某些情況會整組藏起來，所以量實際高度）
function placeTeacherPreviewBar() {
    const bar = document.getElementById('tpBar');
    if (!bar) return;
    const hdr = document.querySelector('#resultSection .sticky-header');
    const vis = hdr && hdr.offsetParent !== null && getComputedStyle(hdr).position === 'sticky';
    bar.style.top = (vis ? Math.round(hdr.getBoundingClientRect().height) : 0) + 'px';
}
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', placeTeacherPreviewBar);

// 單題換題：沿用 sheet.js 的 regenerateQuestion（會問確認、處理冷卻與失敗），成功後重畫預覽
async function tpRegen(i, btn) {
    const before = window.itemsVersion || 0;
    await regenerateQuestion(i, btn);
    if ((window.itemsVersion || 0) !== before) {
        renderAnswerMode();
        const card = document.getElementById('tp-q-' + i);
        if (card) { card.classList.add('is-flash'); card.scrollIntoView({ block: 'nearest' }); }
    }
}
// 單題編輯：開編輯視窗並把游標帶到那一題
function tpEdit(i) {
    openEditItems();
    const q = document.querySelectorAll('#editItemsModal .ei-q')[i];
    if (q) { q.scrollIntoView({ block: 'center' }); try { q.focus({ preventScroll: true }); } catch (e) { } }
}

// 「給學生寫」二選一：老師不用先分辨「發送測驗」與「交給學生作答」，在這裡選一次就好。
// 傳連結或代碼 → openSendQuizModal（share.js，要登入）；同一支手機 → openHandoffSetup（handoff.js，免登入）。
function openGiveToStudents() {
    if (document.querySelector('.lq-give-overlay')) return;
    const loggedIn = !!window.currentUser;
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'lq-dlg-overlay lq-give-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
        "<div class='lq-dlg-box'>" +
        "<div class='lq-dlg-msg' style='font-weight:700;font-size:1.05rem;'>要怎麼給學生寫？</div>" +
        "<button type='button' data-give='link' class='lq-give-opt'><b>📤 傳連結或代碼給全班</b><span>" +
        (loggedIn ? "學生用自己的手機或電腦寫，你可以看全班進度" : "要先登入教師帳號；學生用自己的手機或電腦寫，你可以看全班進度") + "</span></button>" +
        "<button type='button' data-give='phone' class='lq-give-opt'><b>📱 這支手機直接遞給學生</b><span>不用登入，設一組 4 位數密碼，學生寫完你再解鎖看成績</span></button>" +
        "<div class='lq-dlg-row'><button type='button' data-give='cancel' class='lq-btn lq-btn-ghost'>取消</button></div>" +
        "</div>";
    function close(next) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { } }
        if (next === 'link') openSendQuizModal();
        else if (next === 'phone') openHandoffSetup();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    overlay.addEventListener('click', function (e) {
        const b = e.target.closest ? e.target.closest('[data-give]') : null;
        if (b) close(b.getAttribute('data-give'));   // 點遮罩外面不關，避免手指誤觸
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-give=link]').focus();
}
