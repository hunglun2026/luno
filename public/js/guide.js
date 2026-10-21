// 引導式進站：① 鴻綸特效歡迎頁 → ② 選身分（老師／學生）→ ③ 老師一步一頁出題。
//
// 做法：不改任何既有函式，只在外面包一層。
// - 「離開進場頁」原本都走 enterMainApp()，這裡把它包起來：跑完之後，若出題表單在畫面上，就切成一步一頁。
//   所以免登入、帳號登入、選 API Key 那幾條既有路徑都自動接上，不必一處處改。
// - 一步一頁只是顯示／隱藏表單裡標了 data-gstep 的區塊，欄位 id 一個都沒動，
//   startGen()、記住條件、設定連結的邏輯照舊。
// 樣式在 guide.css。由 index.html 的 window.onload 最後呼叫 Guide.start()。
(function () {
    'use strict';

    var SS_WELCOME = 'lun_welcome_seen'; // 這個分頁看過歡迎頁（關分頁才重播）
    var SS_ROLE = 'lun_role_session';    // 這個分頁目前的身分（重新整理直接回到原畫面）
    var LS_ROLE = 'lun_last_role';       // 這台裝置上次選的身分（給「繼續當老師」用）
    var WELCOME_MS = 2600;

    var STEP_INFO = {
        1: { title: '要怎麼出題？', hint: '選一種方式，下一步就開始填條件' },
        2: { title: '選年級和科目', hint: '兩個都選好，會自動到下一步' },
        3: { title: '版本和範圍', hint: '都可以不填：不選版本就依一般課綱，範圍空白就是整冊' },
        4: { title: '題數、題型、難度', hint: '都有預設值，看一眼沒問題就出題' }
    };
    var STEP2_FILE = { title: '上傳課本或講義', hint: '檔案、照片或貼上文字都可以，Luno 會照內容出題' };

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

    // ========== ① 歡迎特效頁 ==========
    var particlesStop = null;

    function startParticles(canvas) {
        var ctx = canvas.getContext('2d');
        var colors = ['#1A73E8', '#EA4335', '#FBBC04', '#34A853', '#ffffff'];
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var dots = [];
        var running = true;
        function resize() {
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
        }
        resize();
        for (var i = 0; i < 46; i++) {
            dots.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: (Math.random() * 1.8 + 0.6) * dpr,
                vy: -(Math.random() * 0.4 + 0.15) * dpr,
                vx: (Math.random() - 0.5) * 0.25 * dpr,
                c: colors[i % colors.length],
                a: Math.random() * 0.6 + 0.3
            });
        }
        function frame() {
            if (!running) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            dots.forEach(function (d) {
                d.x += d.vx;
                d.y += d.vy;
                if (d.y < -10) { d.y = canvas.height + 10; d.x = Math.random() * canvas.width; }
                ctx.globalAlpha = d.a;
                ctx.fillStyle = d.c;
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                ctx.fill();
            });
            requestAnimationFrame(frame);
        }
        window.addEventListener('resize', resize);
        requestAnimationFrame(frame);
        return function () { running = false; window.removeEventListener('resize', resize); };
    }

    function playWelcome(done) {
        var w = $('lqWelcome');
        if (!w) { done(); return; }
        w.hidden = false;
        if (!reducedMotion()) particlesStop = startParticles($('lqParticles'));
        var finished = false;
        function finish() {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            sSet(SS_WELCOME, '1');
            w.classList.add('is-leaving');
            done();
            setTimeout(function () {
                w.hidden = true;
                if (particlesStop) particlesStop();
            }, 650);
        }
        // 從頁面開始載入就算時間（歡迎頁那時已經蓋上去了），網路慢也不會多等一輪；至少留 0.8 秒讓字浮出來
        var remain = Math.max(800, WELCOME_MS - (window.performance ? performance.now() : 0));
        var timer = setTimeout(finish, remain);
        // 頁面還沒載完就按了「略過」（那時 guide 還沒接上），onclick 屬性先記下來，這裡一啟動就照辦
        var skip = $('lqWelcomeSkip');
        skip.addEventListener('click', finish);
        if (skip.dataset.clicked) finish();
        // 歡迎頁期間按 Enter／Esc 也能直接往下
        document.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Enter' || e.key === 'Escape') { document.removeEventListener('keydown', onKey); finish(); }
        });
    }

    // ========== ② 選身分 ==========
    var ROLE_LABEL = { teacher: '老師', student: '學生' };

    function renderContinue() {
        var btn = $('lgContinue');
        if (!btn) return;
        var last = lGet(LS_ROLE);
        if (ROLE_LABEL[last]) {
            btn.textContent = '繼續當' + ROLE_LABEL[last] + ' →';
            btn.dataset.role = last;
            btn.hidden = false;
        } else {
            btn.hidden = true;
        }
    }

    function showIdentity() {
        // openIdentitySplash() 已包過：會收起主畫面並回到身分那一步
        openIdentitySplash();
    }

    // step：要停在老師第幾步（設定連結用 4），沒給就從第 1 步開始
    function pick(role, step) {
        sSet(SS_ROLE, role);
        if (role === 'teacher' || role === 'student') lSet(LS_ROLE, role);
        forceTeacher = role === 'teacher' || role === 'teacherLogin';
        cur = step || 1;
        if (role === 'teacher') {
            splashSelectIdentity('guest');            // 免登入直接進出題（既有路徑）
        } else if (role === 'teacherLogin') {
            splashSelectIdentity('teacher');          // 老師帳號登入表單（既有）
        } else if (role === 'student') {
            var u = window.currentUser;
            if ((u && u.role === 'student') || getStudentProfile()) {
                $('hlStepIdentity').classList.add('hidden');
                enterMainApp();                       // 已有學生資料：直接到學生首頁
            } else {
                splashSelectIdentity('student');      // 先選「練習／登入」（既有）
            }
        } else {
            splashSelectIdentity(role);               // parent／admin 走既有登入
        }
    }

    // ========== ③ 老師一步一頁 ==========
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
            '<button type="button" id="lgPrev" class="lq-btn lq-btn-secondary px-4 py-2">← 上一步</button>' +
            '<span class="lg-grow"></span>' +
            '<button type="button" id="lgDirect" class="lq-btn lq-btn-ghost px-3 py-2">用預設條件直接出題</button>' +
            '<button type="button" id="lgNext" class="lq-btn lq-btn-primary px-5 py-2">下一步 →</button>' +
            '<p class="lg-msg" id="lgMsg" hidden></p>';
        // 放在「記住這些條件／複製設定連結」那排之後：每一步都在最底下，第 4 步也不會夾在條件和出題鈕中間
        var anchor = document.querySelector('#inputForm [onclick="saveDefaultSettings()"]');
        anchor = anchor ? anchor.closest('[data-gstep]') : $('btnGo');
        anchor.insertAdjacentElement('afterend', nav);
        $('lgPrev').onclick = prev;
        $('lgNext').onclick = next;
        $('lgDirect').onclick = function () {
            if (!step2Ok()) { showMsg(sourceType() === '2' ? '請先上傳檔案或貼上文字' : '請先選年級和科目'); return; }
            startGen();
        };
    }

    function bindStepEvents() {
        // 選出題方式：點完卡片（既有 toggleSource 先跑）直接到下一步；紙本卷會自己切到原卷畫面
        ['btnSourceAI', 'btnSourceFile'].forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener('click', function () { if (cur === 1) setTimeout(function () { go(2); }, 150); });
        });

        // 年級、科目都選好就自動往下（選「其他」要打字，不自動跳）
        ['gradeChips', 'subjectChips'].forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.addEventListener('click', function (e) {
                var chip = e.target.closest('.lq-chip');
                if (!chip || chip.dataset.val === 'Custom' || chip.classList.contains('lq-chip-custom')) { refresh(); return; }
                if (cur === 2 && step2Ok()) setTimeout(function () { if (cur === 2) go(3); }, 350);
                else refresh();
            });
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

    function refresh() {
        if (!$('lgWizHead')) return;
        var list = steps();
        var info = (cur === 2 && sourceType() === '2') ? STEP2_FILE : STEP_INFO[cur];
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
        $('lgNext').classList.toggle('lg-off', cur === 1); // 第一步點卡片就會往下，不需要下一步
        $('lgDirect').hidden = !(cur === 2 || cur === 3) || !step2Ok();
        $('lgPrev').textContent = cur === 1 ? '← 換身分' : '← 上一步';
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
        go(step || cur || 1);
    }

    function toIdentity() {
        sDel(SS_ROLE);
        forceTeacher = false;
        showIdentity();
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

        // 回到身分頁：把主畫面收起來（原本只把進場頁叫回來，下面的表單還在）
        var origOpen = window.openIdentitySplash;
        window.openIdentitySplash = function () {
            ['inputForm', 'studentHome', 'resultSection'].forEach(function (id) {
                var el = $(id);
                if (el) el.classList.add('hidden');
            });
            origOpen.apply(this, arguments);
            renderContinue();
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
    function start(opts) {
        opts = opts || {};
        patch();
        addAppbarButton();
        renderContinue();

        // 「複製設定連結」帶來的：條件都填好了，跳過歡迎頁直接到老師最後一步
        if (opts.fromSettingsLink) {
            pick('teacher', 4);
            return;
        }
        var role = sGet(SS_ROLE);
        if (sGet(SS_WELCOME)) {
            if (role) pick(role);
            else showIdentity();
            return;
        }
        playWelcome(showIdentity);
    }

    window.Guide = {
        start: start,
        pick: function (role) { pick(role); },
        toIdentity: toIdentity,
        continueLast: function () { var r = ($('lgContinue') || {}).dataset; if (r && r.role) pick(r.role); }
    };
})();
