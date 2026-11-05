// Luno 綸諾｜進場頁：身分、登入註冊、API Key 選擇。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 品牌進場頁：身分選擇(快速使用/學生/家長/老師/管理員) → 登入或註冊(快速使用略過) → API Key選擇 ---
        let splashKind = null; // 'guest' | 'student' | 'parent' | 'teacher' | 'admin'
        const SPLASH_ROLE_LABEL = { student: '學生', parent: '家長', teacher: '教師', admin: '管理員' };
        const SPLASH_ROLE_TO_API = { student: 'student', parent: 'parent', teacher: 'teacher', admin: 'superadmin' };

        function splashSelectIdentity(kind) {
            splashKind = kind;
            document.getElementById('hlStepIdentity').classList.add('hidden');
            if (kind === 'guest') {
                // 免登入就是直接進表單。原本這裡還會再問一次「要用內建額度還是自己的 Key」，
                // 但表單裡本來就有「我有自己的 API Key」那條連結，多問一層只是擋路
                enterMainApp();
                useBuiltinQuota();
            } else {
                document.getElementById('hlStepAuth').classList.remove('hidden');
                renderSplashAuthForm('login');
            }
        }

        // 進場流程唯一的返回鈕：身分頁回歡迎頁，登入／API Key 回身分頁
        function splashGoBack() {
            if (!document.getElementById('hlStepIdentity').classList.contains('hidden')) Guide.toWelcome();
            else splashBackToIdentity();
        }

        function splashBackToIdentity() {
            document.getElementById('hlStepAuth').classList.add('hidden');
            document.getElementById('hlStepApiKey').classList.add('hidden');
            document.getElementById('hlStepIdentity').classList.remove('hidden');
            splashKind = null;
        }

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
                    html += "<input id='splashClassCode' class='lq-input' placeholder='老師的班級名稱（選填，之後也可以在帳號頁面補填）'>";
                }
            }
            if (!isLogin) html += privacyConsentHtml();
            html += "<div id='splashAuthError' class='text-sm text-red-600 hidden'></div>";
            html += "<button onclick=\"" + (isLogin ? 'doSplashLogin()' : 'doSplashRegister()') + "\" class='lq-btn lq-btn-primary w-full py-2'>" + (isLogin ? '登入' : '註冊') + "</button>";
            if (kind !== 'admin') {
                html += "<button onclick=\"renderSplashAuthForm('" + (isLogin ? 'register' : 'login') + "')\" class='lq-btn lq-btn-ghost w-full text-sm'>" +
                    (isLogin ? '還沒有帳號？點此註冊' : '已經有帳號？點此登入') + "</button>";
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

        function splashLoginSuccess(data) {
            localStorage.setItem('lun_session_token', data.token);
            window.currentUser = data.user;
            updateAccountUI();
            document.getElementById('hlStepAuth').classList.add('hidden');
            // 學生不需要碰 API Key(他只是要練習/作答)，直接進學生首頁；
            // 老師/家長/管理員維持原本的 Key 選擇那一步
            if (data.user && data.user.role === 'student') {
                enterMainApp();
            } else {
                document.getElementById('hlStepApiKey').classList.remove('hidden');
            }
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
                    body: JSON.stringify({ username, password, displayName, role, className, classCode })
                });
                const data = await res.json();
                if (data.error) { showSplashAuthError(data.error.message); return; }
                splashLoginSuccess(data);
            } catch (e) { showSplashAuthError('註冊失敗：' + e.message); }
        }

        function showApiKeyBox() {
            const keyBox = document.getElementById('apiKeyBox');
            const showLink = document.getElementById('showKeyBoxLink');
            if (keyBox) keyBox.classList.remove('hidden');
            if (showLink) showLink.classList.add('hidden');
            const keyInput = document.getElementById('userKey');
            if (keyInput) keyInput.focus();
        }

        // 沒有自己的 Key 時把 Key 欄位收起來，避免表單上多一塊用不到的空格，
        // 但留一條小連結讓使用者隨時可以改用自己的 Key
        function useBuiltinQuota() {
            const box = document.getElementById('apiKeyBox');
            const link = document.getElementById('showKeyBoxLink');
            if (box) box.classList.add('hidden');
            if (link) link.classList.remove('hidden');
        }

        // 從頂部列的「登入」進來：把進場頁叫回來，並回到身分選擇那一步
        function openIdentitySplash() {
            const splash = document.getElementById('hlSplash');
            if (!splash) return;
            splashBackToIdentity();
            splash.style.display = '';
            document.getElementById('lqAppbar').classList.add('hidden');
            window.scrollTo({ top: 0 });
        }

        document.getElementById('hlEnterBuiltin').onclick = function() {
            enterMainApp();
            useBuiltinQuota();
        };
        document.getElementById('hlEnterOwnKey').onclick = function() {
            enterMainApp();
            setTimeout(function() {
                const keyInput = document.getElementById('userKey');
                const keyBox = document.getElementById('apiKeyBox');
                if (keyInput) keyInput.focus();
                if (keyBox) {
                    keyBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    keyBox.style.transition = 'box-shadow 0.3s';
                    keyBox.style.boxShadow = '0 0 0 4px rgba(16,185,129,0.5)';
                    setTimeout(function() { keyBox.style.boxShadow = ''; }, 2000);
                }
            }, 100);
        };

        // --- 老師自己測試「線上作答」：開一個新分頁，跟原本出題頁完全分開(不影響原畫面) ---
        async function openAnswerModeNewTab(btnEl) {
            if (!window.currentItems || window.currentItems.length === 0) {
                lqAlert('目前沒有題目可以線上作答');
                return;
            }
            const originalText = btnEl ? btnEl.innerHTML : '';
            // window.open 必須在使用者點擊當下同步呼叫，不能等fetch跑完再開，否則會被瀏覽器擋成彈出視窗
            const newTab = window.open('', '_blank');
            if (newTab) {
                newTab.document.write('<p style="font-family:sans-serif;padding:2rem;">⏳ 載入題目中...</p>');
            }
            if (btnEl) { btnEl.disabled = true; btnEl.innerText = '⏳ 準備中...'; }
            try {
                // 跟分享連結/儀表板共用同一個shareId，老師才看得到自己測試的這份進度
                const shareId = await getOrCreateShareId();
                const url = location.origin + location.pathname + "?share=" + shareId + "&mode=student";
                if (newTab) {
                    newTab.location.href = url;
                } else {
                    window.open(url, '_blank');
                }
            } catch (e) {
                if (newTab) newTab.close();
                lqAlert('開啟線上作答分頁失敗: ' + e.message);
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = originalText; }
            }
        }

