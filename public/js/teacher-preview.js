// 老師／訪客出完題後的「題目預覽」：唯讀列出每一題與正確答案、解析，下面接「發送給學生」。
// 2026-11-11 Steve：出完題要先看到題目才能發送，不是一個藏著題目的學生開始畫面。
// 只在 answerStartScreenHtml() 的 teacherPreview 分支用到；學生作答、交接、自己練習不經過這裡。
// 答案文字一律用 sheet.js 的 answerKeyText、題型判斷用 qtypes.js 的 qKind（不要直接看 o.length）。

function teacherPreviewItemHtml(q, i) {
    const kind = qKind(q);
    let h = "<div class='lq-card p-4 mb-3 lq-tp-q' id='tp-q-" + i + "'>";
    h += "<div class='lq-tp-qhead'><div class='font-bold'>" + (i + 1) + ". " + escapeHtml(q.q) +
        " <span class='lq-tp-score no-print'>(<input type='number' min='0' step='1' inputmode='numeric' value='" + (Number(q.s) || 0) + "' onchange='tpSetScore(" + i + ", this.value)' aria-label='第 " + (i + 1) + " 題配分'>分)</span></div>" +
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
    let h = "<div class='lq-tp-list'><div class='lq-tp-head'>共 " + items.length + " 題（綠色是正確答案，學生看不到）" +
        (typeof lqTotalScore === 'function' ? "・滿分 <b id='tpTotal'>" + lqTotalScore(items) + "</b> 分" : "") + "</div>" + tpScorePanelHtml();
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

// 老師正要把東西給學生時，順手列出目前班的代碼（學生註冊或加入班級要用），取代原本頂列常駐的膠囊
function giveClassCodeHtml() {
    const u = window.currentUser;
    if (!(u && u.role === 'teacher' && u.classCode)) return '';
    const name = u.className ? escapeHtml(u.className) + ' 的班級代碼' : '班級代碼';
    return "<div style='display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:.25rem 0 .75rem;padding:.6rem .8rem;border-radius:.75rem;background:var(--ld-soft,#e8f0fe);'>" +
        "<span style='font-size:.9rem;'>" + name + " <b style='letter-spacing:.15em;font-size:1.1rem;'>" + escapeHtml(u.classCode) + "</b></span>" +
        "<button type='button' onclick=\"copyClassCode(" + jsArg(u.classCode) + ", this)\" class='lq-btn lq-btn-secondary text-sm px-3 py-1'>複製代碼</button></div>";
}

// 「給學生寫」三選一：老師不用先分辨「發送測驗」與「交給學生作答」，在這裡選一次就好。
// 傳連結或代碼 → openSendQuizModal（share.js，要登入）；同一支手機 → openHandoffSetup（handoff.js，免登入）；
// 投影到大屏 → openProjector（projector.js，唯讀、不用登入）。
function openGiveToStudents() {
    if (document.querySelector('.lq-give-overlay')) return;
    const loggedIn = !!window.currentUser;
    const isParent = (window.currentUser && window.currentUser.role === 'parent') || (!window.currentUser && window.guestRole === 'parent');
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'lq-dlg-overlay lq-give-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
        "<div class='lq-dlg-box'>" +
        "<div class='lq-dlg-msg' style='font-weight:700;font-size:1.05rem;'>" + (isParent ? "要怎麼給孩子寫？" : "要怎麼給學生寫？") + "</div>" +
        giveClassCodeHtml() +
        "<div id='giveKidBox'></div>" +
        "<button type='button' data-give='link' class='lq-give-opt'><b>📤 " + (isParent ? "發送測驗給孩子" : "傳連結或代碼給全班") + "</b><span>" +
        (isParent ? (loggedIn ? "孩子用自己的手機或電腦寫，你可以看他寫到哪" : "要先登入家長帳號；孩子用自己的手機或電腦寫，你可以看他寫到哪") : loggedIn ? "學生用自己的手機或電腦寫，你可以看全班進度" : "要先登入教師帳號；學生用自己的手機或電腦寫，你可以看全班進度") + "</span></button>" +
        "<button type='button' data-give='phone' class='lq-give-opt'><b>📱 " + (isParent ? "直接拿手機給孩子寫" : "這支手機直接遞給學生") + "</b><span>不用登入，設一組 4 位數密碼，" + (isParent ? "孩子" : "學生") + "寫完你再解鎖看成績</span></button>" +
        (isParent ? "" : "<button type='button' data-give='project' class='lq-give-opt'><b>🖥️ 投影到大屏</b><span>接投影機或電視，一次一題、字放很大，大家一起看（可顯示答案）</span></button>") +
        "<div class='lq-dlg-row'><button type='button' data-give='cancel' class='lq-btn lq-btn-ghost'>取消</button></div>" +
        "</div>";
    function close(next) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { } }
        if (next === 'link') openSendQuizModal();
        else if (next === 'phone') openHandoffSetup();
        else if (next === 'project') openProjector();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    overlay.addEventListener('click', function (e) {
        const chip = e.target.closest ? e.target.closest('[data-kid]') : null;
        if (chip) {   // 家長選這份是給哪個孩子
            window._giveKid = chip.getAttribute('data-kid');
            overlay.querySelectorAll('[data-kid]').forEach(function (c) { c.classList.toggle('is-on', c === chip); });
            return;
        }
        const b = e.target.closest ? e.target.closest('[data-give]') : null;
        if (b) close(b.getAttribute('data-give'));   // 點遮罩外面不關，避免手指誤觸
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    fillGiveKids(overlay);
    overlay.querySelector('[data-give=link]').focus();
}

// 家長指定這份卷子是給哪個孩子（2026-11-16 Steve）：選了之後，交給孩子時暱稱自動帶入、發出去的公告標題前面加「孩子名字」。
// 登入的家長用已連結的孩子帳號清單；沒登入的用這台裝置存的孩子（home.js parentKids）。老師、訪客不顯示。
async function fillGiveKids(overlay) {
    window._giveKid = '';
    const u = window.currentUser;
    const isParent = (u && u.role === 'parent') || (!u && window.guestRole === 'parent');
    if (!isParent) return;
    let names = [];
    try {
        if (u) {
            const res = await fetch(API_BASE + "/api/parent/children", { headers: { 'X-Session-Token': lqGetToken() || '' } });
            const data = await res.json();
            names = (data.children || []).map(function (c) { return c.displayName || c.username; });
        } else {
            names = parentKids().map(function (k) { return k.name; });
        }
    } catch (e) { names = []; }
    const box = overlay.querySelector('#giveKidBox');
    if (!box || !names.length) return;
    box.innerHTML = "<div class='text-sm font-bold mt-2'>這份是給哪個孩子？</div><div class='lq-kid-chips'>" +
        names.map(function (n) { return "<button type='button' class='lq-kid-chip' data-kid='" + escapeHtml(n) + "'>" + escapeHtml(n) + "</button>"; }).join('') + "</div>";
}

// ===== 配分設定（2026-11-16）：總分＋分配方式一鍵套用，每題旁邊的數字也能直接改 =====
function tpScorePanelHtml() {
    if (typeof lqSpreadScores !== 'function') return '';
    return "<details class='lq-card p-3 mb-3 lq-tp-score-panel no-print'><summary class='font-bold cursor-pointer'>⚖️ 配分設定</summary>" +
        "<div class='lq-tp-score-row'>" +
        "<label>總分 <select id='tpTotalSel' onchange=\"document.getElementById('tpTotalCustom').style.display=this.value==='x'?'':'none'\"><option>100</option><option>50</option><option>20</option><option>10</option><option value='x'>自訂</option></select>" +
        "<input id='tpTotalCustom' type='number' min='1' step='1' inputmode='numeric' style='display:none;width:5rem' placeholder='分數'></label>" +
        "<label>分配方式 <select id='tpModeSel'><option value='even'>每題一樣</option><option value='ramp'>後面的題目加重</option><option value='typed'>填充、簡答加倍</option></select></label>" +
        "<button type='button' onclick='tpApplyScores()' class='lq-btn lq-btn-primary px-4 py-1.5 text-sm'>套用</button></div>" +
        "<div class='text-xs text-gray-500 mt-2'>套用後每題分數都是整數、加起來剛好是總分。想微調，直接改下面每題旁邊的數字。</div></details>";
}
function tpApplyScores() {
    const items = window.currentItems || [];
    let total = document.getElementById('tpTotalSel').value;
    if (total === 'x') total = document.getElementById('tpTotalCustom').value;
    const scores = lqSpreadScores(items, total, document.getElementById('tpModeSel').value);
    if (!scores.length) { lqAlert('請輸入大於 0 的總分'); return; }
    items.forEach(function (q, i) { q.s = scores[i]; });
    touchItems();
    if (typeof saveQuizToHistory === 'function') saveQuizToHistory(true);   // 改了配分，出題紀錄也要跟著更新
    renderAnswerMode();
}
function tpSetScore(i, v) {
    const items = window.currentItems || [];
    const n = Number(v);
    if (!items[i] || !(n >= 0)) { renderAnswerMode(); return; }
    items[i].s = n;
    touchItems();
    if (typeof saveQuizToHistory === 'function') saveQuizToHistory(true);
    const t = document.getElementById('tpTotal');
    if (t) t.textContent = lqTotalScore(items);
}
