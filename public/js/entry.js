// Luno 綸諾｜進場頁：身分、登入註冊、API Key 選擇。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 品牌進場頁：身分選擇(快速使用/學生/家長/老師/管理員) → 登入或註冊(快速使用略過) → API Key選擇 ---
        let splashKind = null; // 'guest' | 'student' | 'parent' | 'teacher' | 'admin'
        const SPLASH_ROLE_LABEL = { student: '學生', parent: '家長', teacher: '老師', admin: '管理員' };
        const SPLASH_ROLE_TO_API = { student: 'student', parent: 'parent', teacher: 'teacher', admin: 'superadmin' };

        function splashSelectIdentity(kind) {
            splashKind = kind;
            document.getElementById('hlStepIdentity').classList.add('hidden');
            if (kind === 'guest') {
                // 免登入就是直接進表單。原本這裡還會再問一次「要用內建額度還是自己的 Key」，
                // 但表單裡本來就有「我有自己的 API Key」那條連結，多問一層只是擋路
                enterMainApp();
                useBuiltinQuota();
            } else if (kind === 'student') {
                // 學生多半沒有帳號也不想註冊，先讓他選：登入 或 填基本資料直接練習
                document.getElementById('hlStepAuth').classList.remove('hidden');
                renderStudentEntryChoice();
            } else {
                document.getElementById('hlStepAuth').classList.remove('hidden');
                renderSplashAuthForm('login');
            }
        }

        // 學生入口：登入 / 免登入直接練習
        function renderStudentEntryChoice() {
            const box = document.getElementById('hlStepAuth');
            box.innerHTML =
                "<h3 style='font-weight:900;font-size:1.1rem;margin-bottom:0.25rem;color:var(--hl-text);'>🎒 學生</h3>" +
                "<div style='font-size:0.78rem;color:#5f6368;margin-bottom:0.9rem;'>要做老師指定的測驗，或自己練習都可以</div>" +
                "<div class='space-y-3'>" +
                "<button onclick='renderStudentGuestForm()' class='lq-btn lq-btn-primary w-full py-3'>📝 我要練習（不用註冊）</button>" +
                "<button onclick=\"renderSplashAuthForm('login')\" class='lq-btn lq-btn-secondary w-full py-2'>🔑 我有帳號，要登入</button>" +
                // 誘因要講學生自己拿得到什麼。原本寫「家長能看到你的即時作答」——沒有學生會為了這個去登入
                "<div style='font-size:0.72rem;color:#80868b;line-height:1.5;'>登入才有：寫一題就馬上知道對不對、換手機或電腦也看得到自己的練習紀錄與分數。</div>" +
                "<button onclick='splashBackToIdentity()' class='lq-btn lq-btn-ghost w-full py-2 text-sm'>← 重選身分</button>" +
                "</div>";
        }

        // 免登入學生：填學校/年級/班級/姓名，資料只留在這台裝置(給練習卷抬頭與紀錄用)
        function renderStudentGuestForm() {
            const prof = getStudentProfile() || {};
            const box = document.getElementById('hlStepAuth');
            box.innerHTML =
                "<h3 style='font-weight:900;font-size:1.1rem;margin-bottom:0.25rem;color:var(--hl-text);'>📝 我要練習</h3>" +
                "<div style='font-size:0.78rem;color:#5f6368;margin-bottom:0.9rem;'>填一下基本資料，練習卷上會幫你寫好</div>" +
                "<div class='space-y-3'>" +
                "<input id='guestSchool' class='lq-input' placeholder='學校（例如：鴻綸國中）' value='" + escapeHtml(prof.school || '') + "'>" +
                "<select id='guestGrade' class='lq-input'>" + practiceGradeOptions() + "</select>" +
                "<input id='guestClass' class='lq-input' placeholder='班級（例如：七年3班）' value='" + escapeHtml(prof.className || '') + "'>" +
                "<input id='guestName' class='lq-input' placeholder='姓名' value='" + escapeHtml(prof.name || '') + "'>" +
                "<div id='guestFormError' class='text-sm text-red-600 hidden'></div>" +
                "<button onclick='doStudentGuestEnter()' class='lq-btn lq-btn-primary w-full py-3'>開始使用</button>" +
                "<button onclick='renderStudentEntryChoice()' class='lq-btn lq-btn-ghost w-full py-2 text-sm'>← 上一步</button>" +
                "</div>";
            if (prof.grade) {
                const sel = document.getElementById('guestGrade');
                if (sel) sel.value = prof.grade;
            }
        }

        function doStudentGuestEnter() {
            const name = (document.getElementById('guestName').value || '').trim();
            const err = document.getElementById('guestFormError');
            if (!name) {
                err.textContent = '請至少填姓名，練習卷才知道要寫誰的名字';
                err.classList.remove('hidden');
                return;
            }
            saveStudentProfile({
                school: (document.getElementById('guestSchool').value || '').trim(),
                grade: document.getElementById('guestGrade').value,
                className: (document.getElementById('guestClass').value || '').trim(),
                name: name
            });
            enterMainApp();
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
            html += "<input id='splashUsername' class='lq-input' placeholder='帳號'>";
            html += "<input id='splashPassword' type='password' class='lq-input' placeholder='密碼（至少6碼）'>";
            if (!isLogin) {
                html += "<input id='splashPasswordConfirm' type='password' class='lq-input' placeholder='再輸入一次密碼'>";
                html += "<input id='splashDisplayName' class='lq-input' placeholder='顯示名稱（例如：王小明）'>";
                if (kind === 'teacher') {
                    html += "<input id='splashClassName' class='lq-input' placeholder='幫班級取個名字（例如：六年1班，全站需唯一，重複會被擋下）'>";
                } else if (kind === 'student') {
                    html += "<input id='splashClassCode' class='lq-input' placeholder='老師的班級名稱（選填，之後也可以在帳號頁面補填）'>";
                }
            }
            html += "<div id='splashAuthError' class='text-sm text-red-600 hidden'></div>";
            html += "<button onclick=\"" + (isLogin ? 'doSplashLogin()' : 'doSplashRegister()') + "\" class='lq-btn lq-btn-primary w-full py-2'>" + (isLogin ? '登入' : '註冊') + "</button>";
            if (kind !== 'admin') {
                html += "<button onclick=\"renderSplashAuthForm('" + (isLogin ? 'register' : 'login') + "')\" class='lq-btn lq-btn-ghost w-full text-sm'>" +
                    (isLogin ? '還沒有帳號？點此註冊' : '已經有帳號？點此登入') + "</button>";
            }
            html += "</div>";
            document.getElementById('hlAuthFormBody').innerHTML = html;
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
            if (password !== passwordConfirm) { showSplashAuthError('兩次密碼輸入不一致'); return; }
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
                alert('目前沒有題目可以線上作答');
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
                alert('開啟線上作答分頁失敗: ' + e.message);
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = originalText; }
            }
        }

