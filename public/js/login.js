// 鴻綸 刻度｜登入頁（login.html）：教師、家長、學生、管理員的登入與註冊表單。
// 2026-11-05 改成多頁式：原本在 entry.js 的進場頁登入表單搬到這裡，登入成功直接前往 /app。
// 網址：/login?role=teacher|parent|student|admin
        const SPLASH_ROLE_LABEL = { student: '學生', parent: '家長', teacher: '教師', admin: '管理員' };
        const SPLASH_ROLE_TO_API = { student: 'student', parent: 'parent', teacher: 'teacher', admin: 'superadmin' };
        const SS_ROLE = 'lun_role_session';   // 跟 guide.js 同一個 key：訪客身分只存在分頁，登入後要清掉
        let splashKind = null;                // 'student' | 'parent' | 'teacher' | 'admin'

        function renderSplashAuthForm(mode) {
            const kind = splashKind;
            const label = SPLASH_ROLE_LABEL[kind] || '';
            // 管理員不開放自助註冊(避免任何人自封管理員)，一律只顯示登入表單
            const isLogin = mode === 'login' || kind === 'admin';
            let html = "<h3 style='font-weight:900;font-size:1.1rem;margin-bottom:0.75rem;color:var(--hl-text);'>" +
                (kind === 'admin' ? '🛡️ 管理員登入' : (isLogin ? ('🔑 ' + label + '登入') : ('📝 ' + label + '註冊'))) + "</h3>";
            html += "<div class='space-y-3'>";
            const credAttrs = isLogin ? "" : CRED_INPUT_ATTRS;
            html += "<input id='splashUsername' class='lq-input' placeholder='" + (isLogin ? '帳號' : CRED_USER_HINT) + "'" + credAttrs + ">";
            html += "<input id='splashPassword' type='password' class='lq-input' placeholder='" + (isLogin ? '密碼' : CRED_PASS_HINT) + "'" + credAttrs + ">";
            if (!isLogin) {
                html += "<input id='splashPasswordConfirm' type='password' class='lq-input' placeholder='再輸入一次密碼'" + credAttrs + ">";
                html += "<input id='splashDisplayName' class='lq-input' placeholder='顯示名稱（例如：王小明）'>";
                if (kind === 'teacher') {
                    html += "<input id='splashClassName' class='lq-input' placeholder='幫班級取個名字（例如：六年1班，全站需唯一，重複會被擋下）'>";
                } else if (kind === 'student') {
                    html += "<input id='splashClassCode' class='lq-input' placeholder='老師給的班級代碼（選填，之後也可以在帳號頁面補填）'>";
                }
            }
            if (!isLogin) html += privacyConsentHtml();
            html += "<div id='splashAuthError' class='text-sm text-red-600 hidden'></div>";
            html += "<button onclick=\"" + (isLogin ? 'doSplashLogin()' : 'doSplashRegister()') + "\" class='lq-btn lq-btn-primary w-full py-2'>" + (isLogin ? '登入' : '註冊') + "</button>";
            if (kind !== 'admin') {
                html += "<button onclick=\"renderSplashAuthForm('" + (isLogin ? 'register' : 'login') + "')\" class='lq-btn lq-btn-ghost w-full text-sm'>" +
                    (isLogin ? '還沒有帳號？點此註冊' : '已經有帳號？點此登入') + "</button>";
            }
            if (isLogin && kind !== 'admin') {
                html += "<div class='text-xs text-gray-500 text-center'>忘記密碼？請聯絡你的老師或管理員協助重設。</div>";
            }
            html += "</div>";
            document.getElementById('hlAuthFormBody').innerHTML = html;
        }

        // 註冊要先告知並勾選（個資法第 8 條告知、第 7 條同意）；告知全文在 privacy.html
        function privacyConsentHtml() {
            return "<label style='display:flex;gap:0.5rem;align-items:flex-start;font-size:0.8rem;line-height:1.6;color:var(--hl-text-secondary,#5f6368);cursor:pointer;'>" +
                "<input type='checkbox' id='splashPrivacyOk' style='margin-top:0.25rem;flex:none;width:1rem;height:1rem;'>" +
                "<span>我已閱讀並同意<a href='privacy.html' target='_blank' rel='noopener' style='color:var(--hl-blue,#1A73E8);text-decoration:underline;'>《個人資料蒐集告知》</a>。" +
                "未滿 18 歲請在家長或老師陪同下註冊。</span></label>";
        }

        function showSplashAuthError(msg) {
            const el = document.getElementById('splashAuthError');
            if (el) { el.textContent = msg; el.classList.remove('hidden'); }
        }

        // 免登入時出的卷子存在這台裝置的 lun_history。登入或註冊成為老師後，逐份存進班級歷史（既有 POST /api/history）。
        // 成功一份就從本機移除一份，失敗的留著，所以重複登入不會重複上傳。只有老師帳號有班級歷史，家長與學生不搬。
        // 回傳 { ok, failed }，沒有東西可搬回傳 null
        async function migrateGuestHistory(token) {
            let hist = [];
            try { hist = JSON.parse(localStorage.getItem('lun_history') || '[]'); } catch (e) { return null; }
            if (!Array.isArray(hist) || hist.length === 0) return null;
            const left = [];
            let ok = 0;
            for (const h of hist.slice().reverse()) {   // 從最舊的開始存，伺服器依時間排序後新的仍在上面
                if (!h || !Array.isArray(h.items) || h.items.length === 0) continue;
                try {
                    const res = await fetch(API_BASE + "/api/history", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                        body: JSON.stringify({ title: h.title || '未命名試卷', items: h.items })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error.message);
                    ok++;
                } catch (e) { left.push(h); }
            }
            try { localStorage.setItem('lun_history', JSON.stringify(left.reverse())); } catch (e) {}
            return { ok, failed: left.length };
        }

        async function splashLoginSuccess(data) {
            lqSetToken(data.token);
            try { sessionStorage.removeItem(SS_ROLE); } catch (e) {}
            if (data.user && data.user.role === 'teacher') {
                const btn = document.querySelector('#hlAuthFormBody button.lq-btn-primary');
                if (btn) { btn.disabled = true; btn.textContent = '正在把這台裝置的試卷存進帳號…'; }
                const r = await migrateGuestHistory(data.token);
                if (r && r.failed > 0) {
                    // 沒存成的還留在這台裝置的「出題紀錄」，之後可以再開來存；停一下讓人看到再轉頁（不用瀏覽器內建 alert）
                    showSplashAuthError('已存 ' + r.ok + ' 份，有 ' + r.failed + ' 份沒存成，還留在這台裝置的出題紀錄裡，之後可以再存一次。');
                    await new Promise(function (done) { setTimeout(done, 2500); });
                }
            }
            location.href = '/app';
        }

        async function doSplashLogin() {
            const username = document.getElementById('splashUsername').value.trim();
            const password = document.getElementById('splashPassword').value;
            try {
                const res = await fetch(API_BASE + "/api/auth/login", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.error) { showSplashAuthError(data.error.message); return; }
                splashLoginSuccess(data);
            } catch (e) { showSplashAuthError('登入失敗：' + e.message); }
        }

        async function doSplashRegister() {
            const kind = splashKind;
            const username = document.getElementById('splashUsername').value.trim();
            const password = document.getElementById('splashPassword').value;
            const passwordConfirm = document.getElementById('splashPasswordConfirm').value;
            const credErr = credentialInputError(username, password);
            if (credErr) { showSplashAuthError(credErr); return; }
            if (password !== passwordConfirm) { showSplashAuthError('兩次密碼輸入不一致'); return; }
            if (!(document.getElementById('splashPrivacyOk') || {}).checked) { showSplashAuthError('請先閱讀並勾選同意《個人資料蒐集告知》'); return; }
            const displayName = document.getElementById('splashDisplayName').value.trim();
            const role = SPLASH_ROLE_TO_API[kind];
            const className = (document.getElementById('splashClassName') || {}).value || '';
            const classCode = (document.getElementById('splashClassCode') || {}).value || '';
            try {
                const res = await fetch(API_BASE + "/api/auth/register", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, displayName, role, className, classCode, privacyVersion: PRIVACY_VERSION })
                });
                const data = await res.json();
                if (data.error) { showSplashAuthError(data.error.message); return; }
                splashLoginSuccess(data);
            } catch (e) { showSplashAuthError('註冊失敗：' + e.message); }
        }


        // 啟動：讀 ?role=，已經登入同一個身分的人直接進 App，不用再登入第二次
        (async function () {
            const role = new URLSearchParams(location.search).get('role');
            if (!SPLASH_ROLE_LABEL[role]) { location.replace('/start?switch=1'); return; }
            splashKind = role;
            // 從免登入畫面按「註冊保存」來的（mode=register）先停在註冊分頁；管理員沒有註冊
            renderSplashAuthForm(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login');
        })();
