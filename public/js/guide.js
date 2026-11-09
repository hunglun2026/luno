// 引導式出題：App（/app）進來之後，老師「一步一頁」出題精靈，以及訪客模式（免登入、一份最多 20 題）。
//
// 2026-11-05 改成多頁式：歡迎頁（/）、選身分（/start）、登入（/login）都是獨立頁面了，
// 這裡不再管歡迎頁與選身分，只負責 /app 啟動時依身分進哪個畫面。
//
// 做法：不改任何既有函式，只在外面包一層。
// - 「進入主畫面」原本都走 enterMainApp()，這裡把它包起來：跑完之後，若出題表單在畫面上，就切成一步一頁。
// - 一步一頁只是顯示／隱藏表單裡標了 data-gstep 的區塊，欄位 id 一個都沒動，
//   startGen()、記住條件、設定連結的邏輯照舊。
// 樣式在 guide.css。由 core.js 的 window.onload 最後呼叫 Guide.start()。
(function () {
    'use strict';

    var SS_ROLE = 'lun_role_session';    // 這個分頁目前的身分（重新整理直接回到原畫面）
    var GUEST_MAX = 20;                  // 訪客一份最多幾題

    var STEP_INFO = {
        1: { title: '要怎麼出題？', hint: '選一種方式，下一步就開始填條件' },
        2: { title: '選年級和科目', hint: '兩個都選好，按下面亮起的「下一步」' },
        3: { title: '版本和範圍', hint: '都可以不填：不選版本就依一般課綱，範圍空白就是整冊' },
        4: { title: '題數、題型、難度', hint: '都有預設值，看一眼沒問題就出題' }
    };
    var STEP2_FILE = { title: '上傳課本或講義', hint: '檔案、照片或貼上文字都可以，刻度會照內容出題' };

    var cur = 1;
    var forceTeacher = false; // 選了老師，就算這台裝置以前當過學生，也要進出題畫面

    // sessionStorage／localStorage 在無痕或被封鎖時可能直接丟錯，讀寫都包起來
    function sGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function sSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
    function sDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
    function lGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function $(id) { return document.getElementById(id); }
    function reducedMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

    // ========== ① 進哪個畫面 ==========
    function loggedInTeacher() {
        var u = window.currentUser;
        return !!(u && (u.role === 'teacher' || u.role === 'superadmin'));
    }

    // role：guest 訪客、teacher 教師（含管理員）、student 學生、parent 家長。
    // step：要停在老師第幾步（設定連結用 4），沒給就從第 1 步開始
    function enterAs(role, step) {
        // 沒登入時記下這次是以什麼身分在用（home.js 判斷學生首頁、openIdentitySplash 決定登入頁用）
        window.guestRole = window.currentUser ? null : role;
        setGuest(role === 'guest');
        forceTeacher = role === 'teacher' || role === 'guest';
        cur = step || 1;
        enterMainApp();   // 已包過：出題表單顯示時會接上一步一頁；學生與家長由 enterMainApp 依登入身分分流
    }

    // ========== ② 老師一步一頁 ==========
    function sourceType() { return ($('sourceType') || {}).value || '1'; }
    function steps() { return sourceType() === '2' ? [1, 2, 4] : [1, 2, 3, 4]; }

    function valueOf(selectId, customId) {
        var v = ($(selectId) || {}).value || '';
        if (v === 'Custom') v = (($(customId) || {}).value || '').trim();
        return v;
    }

    function step2Ok() {
        if (sourceType() === '2') {
            var hasFiles = typeof uploadItems !== 'undefined' && uploadItems.length > 0;
            return hasFiles || (($('uTxt') || {}).value || '').trim() !== '';
        }
        return valueOf('grade', 'c_grade') !== '' && (($('subject') || {}).value || '').trim() !== '';
    }

    function summaryText() {
        var parts = [];
        if (sourceType() === '2') {
            parts.push('依上傳的資料出題');
        } else {
            parts.push(valueOf('grade', 'c_grade') || '（未選年級）');
            parts.push((($('subject') || {}).value || '').trim() || '（未選科目）');
            parts.push((($('scope') || {}).value || '').trim() || '整冊');
        }
        var count = valueOf('count', 'c_count');
        parts.push((count || '?') + ' 題');
        parts.push(valueOf('qType', 'c_qType'));
        parts.push(valueOf('difficulty', 'c_diff'));
        return parts.join('・');
    }

    function hasSavedSettings() {
        return !!lGet('lun_saved_settings') && step2Ok();
    }

    // 引導模式需要的外框：上方步驟標題、快速開始、第 4 步摘要、下方上一步／下一步，再接上事件。只建一次
    function buildChrome() {
        var card = document.querySelector('#inputForm .lq-card');
        if (!card || $('lgWizHead')) return;
        buildHead(card);
        buildNav();
        bindStepEvents();
    }

    function buildHead(card) {
        var head = document.createElement('div');
        head.id = 'lgWizHead';
        head.className = 'lg-wiz-head';
        head.innerHTML =
            '<div class="lg-dots" id="lgDots" aria-hidden="true"></div>' +
            '<h2 class="lg-step-title" id="lgStepTitle"></h2>' +
            '<p class="lg-step-hint" id="lgStepHint"></p>';
        card.insertBefore(head, card.firstChild);

        // 快速開始：這台裝置存過條件，第一步就給一顆直接出題
        var quick = document.createElement('button');
        quick.type = 'button';
        quick.id = 'lgQuick';
        quick.className = 'lg-quick';
        quick.hidden = true;
        quick.onclick = function () { startGen(); };
        head.insertAdjacentElement('afterend', quick);

        // 第 4 步上方的條件摘要
        var countGrid = $('count') && $('count').closest('[data-gstep]');
        if (countGrid) {
            var sum = document.createElement('div');
            sum.id = 'lgSummary';
            sum.className = 'lg-summary';
            sum.dataset.gstep = '4';
            countGrid.parentNode.insertBefore(sum, countGrid);
        }
    }

    // 上一步／下一步／用預設條件直接出題
    function buildNav() {
        var nav = document.createElement('div');
        nav.id = 'lgNav';
        nav.className = 'lg-nav';
        nav.innerHTML =
            '<button type="button" id="lgPrev" class="lq-btn lq-btn-secondary px-4 py-2">← 回上一頁</button>' +
            '<span class="lg-grow"></span>' +
            '<button type="button" id="lgNext" class="lq-btn lq-btn-primary px-5 py-2">下一步 →</button>' +
            '<p class="lg-msg" id="lgMsg" hidden></p>';
        // 放在「記住這些條件／複製設定連結」那排之後：每一步都在最底下，第 4 步也不會夾在條件和出題鈕中間
        var anchor = document.querySelector('#inputForm [onclick="saveDefaultSettings()"]');
        anchor = anchor ? anchor.closest('[data-gstep]') : $('btnGo');
        anchor.insertAdjacentElement('afterend', nav);
        $('lgPrev').onclick = prev;
        $('lgNext').onclick = next;
    }

    function bindStepEvents() {
        // 選出題方式：點完卡片（既有 toggleSource 先跑）直接到下一步；紙本卷會自己切到原卷畫面
        ['btnSourceAI', 'btnSourceFile'].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener('click', function () { if (cur === 1) setTimeout(function () { go(2); }, 150); });
        });

        // 年級、科目選好後不再自動跳下一步（2026-11-05：點錯會被瞬間帶走）；
        // 改由「下一步」按鈕亮起來（is-ready）引導視線，讓使用者自己確認
        ['gradeChips', 'subjectChips'].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener('click', refresh);
        });
        ['count', 'qType', 'difficulty', 'lang', 'scope', 'c_count', 'c_qType', 'c_diff'].forEach(function (id) {
            var el = $(id);
            if (el) { el.addEventListener('change', refresh); el.addEventListener('input', refresh); }
        });
    }

    function showMsg(text) {
        var m = $('lgMsg');
        if (!m) return;
        m.textContent = text;
        m.hidden = !text;
    }

    function renderDots() {
        var list = steps();
        var html = '';
        list.forEach(function (n, i) {
            var pos = list.indexOf(cur);
            var cls = i < pos ? 'is-done' : (i === pos ? 'is-cur' : '');
            if (i > 0) html += '<span class="lg-dot-line ' + (i <= pos ? 'is-done' : '') + '"></span>';
            html += '<span class="lg-dot ' + cls + '">' + (i + 1) + '</span>';
        });
        $('lgDots').innerHTML = html;
    }

    function stepInfo() {
        if (cur === 2 && sourceType() === '2') return STEP2_FILE;
        if (cur === 4 && window.guestMode) {
            return { title: STEP_INFO[4].title, hint: '訪客一份最多 ' + GUEST_MAX + ' 題；要出更多題，請登入教師帳號' };
        }
        return STEP_INFO[cur];
    }

    function refresh() {
        if (!$('lgWizHead')) return;
        if (typeof syncPublisherChips === 'function') syncPublisherChips();
        var list = steps();
        var info = stepInfo();
        $('lgStepTitle').textContent = '第 ' + (list.indexOf(cur) + 1) + ' 步：' + info.title;
        $('lgStepHint').textContent = info.hint;
        renderDots();

        var quick = $('lgQuick');
        if (cur === 1 && hasSavedSettings()) {
            quick.innerHTML = '<span class="ph-duotone ph-lightning" style="font-size:1.6rem;"></span>' +
                '<span><b>用上次的條件直接出題</b><small></small></span>';
            quick.querySelector('small').textContent = summaryText();
            quick.hidden = false;
        } else {
            quick.hidden = true;
        }

        var sum = $('lgSummary');
        if (sum) sum.innerHTML = '<span>這次出題：</span>' + escapeHtml(summaryText());

        $('lgNext').hidden = cur === 4;
        $('lgNext').classList.toggle('is-ready', cur === 2 && step2Ok());
        $('lgNext').classList.toggle('lg-wait', cur === 2 && !step2Ok());
        $('lgNext').classList.toggle('lg-off', cur === 1); // 第一步點卡片就會往下，不需要下一步
        $('lgPrev').textContent = '← 回上一頁';
    }

    function go(n) {
        cur = n;
        document.querySelectorAll('#inputForm [data-gstep]').forEach(function (el) {
            el.classList.toggle('lg-off', el.dataset.gstep.split(' ').indexOf(String(n)) < 0);
        });
        showMsg('');
        refresh();
        window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    function next() {
        if (cur === 2 && !step2Ok()) {
            showMsg(sourceType() === '2' ? '請先上傳檔案或貼上文字' : '請先選年級和科目');
            return;
        }
        var list = steps();
        var i = list.indexOf(cur);
        if (i < list.length - 1) go(list[i + 1]);
    }

    function prev() {
        var list = steps();
        var i = list.indexOf(cur);
        if (i <= 0) { toIdentity(); return; }
        go(list[i - 1]);
    }

    function startWizard(step) {
        $('inputForm').classList.add('lg-wizard-on');
        buildChrome();
        applyGuestLimits();
        go(step || cur || 1);
    }

    function toIdentity() {
        sDel(SS_ROLE);
        location.href = '/start?switch=1';   // 真的換頁：選身分頁，瀏覽器上一頁可以回來
    }

    // ========== ③ 訪客模式：免登入、一份最多 20 題 ==========
    // 這只管前端：藏掉超過上限的選項，並在 generate.js 的 readGenForm() 再擋一次（防改畫面）。
    // 伺服器端沒有依訪客限題，要根治得在 Worker 加；目前只靠前端與出題冷卻保護額度。
    var countHtml = null; // 題數選單原本的選項，離開訪客模式時還原

    function setGuest(on) {
        window.guestMode = !!on;
        document.body.classList.toggle('guest-mode', !!on);
    }

    function applyGuestLimits() {
        var sel = $('count');
        if (!sel) return;
        if (countHtml === null) countHtml = sel.innerHTML;
        var custom = $('c_count');
        if (!window.guestMode) {
            if (sel.innerHTML !== countHtml) {
                var keep = sel.value;
                sel.innerHTML = countHtml;
                sel.value = keep;
            }
            return;
        }
        Array.prototype.slice.call(sel.options).forEach(function (o) {
            var n = parseInt(o.value, 10);
            if (o.value === 'Custom' || (n && n > GUEST_MAX)) o.remove();
        });
        if (custom) custom.style.display = 'none';
        if (!sel.querySelector('option[value="15"]')) {
            var o15 = new Option('15 題', '15');
            var o20 = sel.querySelector('option[value="20"]');
            sel.add(o15, o20 || null);
        }
        var n = parseInt(sel.value, 10);
        if (!n || n > GUEST_MAX) sel.value = '10';
    }

    // ========== 包住既有函式 ==========
    function patch() {
        var origEnter = window.enterMainApp;
        window.enterMainApp = function () {
            origEnter.apply(this, arguments);
            var u = window.currentUser;
            if (forceTeacher && !(u && u.role === 'student')) {
                $('studentHome').classList.add('hidden');
                $('inputForm').classList.remove('hidden');
            }
            if (!$('inputForm').classList.contains('hidden')) startWizard(cur);
            updateGlobalBackBtn();
        };

        // 學生首頁的「換身分」「登出」會重新整理頁面：先清掉這個分頁記住的身分，才會回到身分頁
        ['studentLeaveHome', 'studentLogout'].forEach(function (name) {
            var orig = window[name];
            if (typeof orig !== 'function') return;
            window[name] = function () { sDel(SS_ROLE); return orig.apply(this, arguments); };
        });
    }

    function addAppbarButton() {
        var login = $('lqLoginBtn');
        if (!login || $('lgSwitchRole')) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'lgSwitchRole';
        b.className = 'lq-appbar-btn';
        b.textContent = '換身分';
        b.onclick = toIdentity;
        login.insertAdjacentElement('beforebegin', b);
    }

    // ========== 入口 ==========
    // 依序判斷：設定連結 → 這個分頁選了訪客 → 已登入 → 都不是就回選身分頁（分享、監看、原卷連結在 core.js 先處理掉，不會走到這裡）
    function start(opts) {
        opts = opts || {};
        patch();
        addAppbarButton();

        if (opts.fromSettingsLink) {
            // 「複製設定連結」帶來的：條件都填好了，直接到出題最後一步。已登入的教師照舊；沒登入的用訪客身分進
            enterAs(loggedInTeacher() ? 'teacher' : 'guest', 4);
            return;
        }
        var u = window.currentUser;
        var picked = sGet(SS_ROLE);
        if (picked === 'guest') { enterAs('guest'); return; }
        // 2026-11-09：教師、家長、學生也能免登入先用。教師與家長沒登入時走訪客出題流程（家長功能與教師相同），
        // 學生沒登入進學生首頁（輸入代碼、自己練習）。已登入的人以帳號身分為準，不看分頁記的身分
        if (!u && (picked === 'teacher' || picked === 'parent')) { enterAs('guest'); window.guestRole = picked; return; }
        if (!u && picked === 'student') { enterAs('student'); return; }
        if (u) {
            if (u.role === 'student') enterAs('student');
            else if (u.role === 'parent') enterAs('parent');
            else enterAs('teacher');
            return;
        }
        if (window.authCheckFailed && lqGetToken() && typeof askConfirm === 'function') {
            // 登入憑證還在,只是這次連不上伺服器:讓使用者重試,不要直接踢去選身分頁
            askConfirm('目前連不上伺服器,你的登入還在。要重新連線嗎?', { okText: '重新連線', cancelText: '回選身分頁' }).then(function (ok) {
                if (ok) location.reload(); else location.replace('/start?switch=1');
            });
            return;
        }
        location.replace('/start?switch=1');
    }

    window.Guide = {
        start: start,
        refresh: function () { refresh(); },
        toIdentity: toIdentity
    };
})();
