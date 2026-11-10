// Luno 綸諾｜帳號系統：登入註冊、班級歷史、監考式即時監看。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // ==================== 帳號系統：登入/註冊/班級歷史/監考式即時監看 ====================
        // session token每個分頁各存一份（common.js 的 lqGetToken/lqSetToken），每次要驗證身分的請求帶X-Session-Token header。
        // 登入非必要：學生/家長不登入一樣能用既有分享連結作答/查看，登入是額外功能(存班級歷史/監考監看)。
        window.currentUser = null;

        async function initAuthUI() {
            const token = lqGetToken();
            if (!token) {
                updateAccountUI();
                // 2026-11-05 起學生也要登入：不再用本機的免登入學生資料自動進首頁
                return;
            }
            try {
                // 網路抖一下或 Worker 暫時回 5xx 時重試,不要馬上當成沒登入(F5 被踢回選身分頁的可能原因)
                let data = null;
                for (let attempt = 0; attempt < 3 && !data; attempt++) {
                    try {
                        const res = await fetch(API_BASE + "/api/auth/me", { headers: { 'X-Session-Token': token } });
                        if (res.status >= 500) throw new Error('server ' + res.status);
                        data = await res.json();
                    } catch (e) {
                        if (attempt < 2) await new Promise(function (r) { setTimeout(r, 600 * (attempt + 1)); });
                    }
                }
                if (!data) { window.currentUser = null; window.authCheckFailed = true; }   // 連不上:不清 token
                else if (data.error) { lqClearToken(); window.currentUser = null; }
                else {
                    window.currentUser = data.user;   // 要進哪個畫面由 core.js 啟動流程與 guide.js 決定
                }
            } catch (e) { window.currentUser = null; }
            updateAccountUI();
        }

        function updateAccountUI() {
            const statusEl = document.getElementById('accountStatus');
            const btnEl = document.getElementById('accountBtn');
            const roleLabel = { student: '學生', parent: '家長', teacher: '老師', superadmin: '超級管理員' };
            // 頂部列：沒登入時顯示「登入」(點了才把進場頁叫回來)，
            // 登入後換成「我的帳號」(查看班級歷史/連結孩子/登出等)
            btnEl.classList.toggle('hidden', !window.currentUser);
            const loginBtn = document.getElementById('lqLoginBtn');
            if (loginBtn) loginBtn.classList.toggle('hidden', !!window.currentUser);
            if (window.currentUser) {
                statusEl.textContent = window.currentUser.displayName + '（' + (roleLabel[window.currentUser.role] || window.currentUser.role) + '）' +
                    (window.currentUser.role === 'teacher' && window.currentUser.classCode ? '　班級代碼 ' + window.currentUser.classCode : '');
                showClassCodeOnce();
            } else {
                statusEl.textContent = '';
            }
            const saveBtn = document.getElementById('btnSaveHistory');
            // 老師看得到「存入班級歷史」；沒登入的也顯示，但按下去是帶去註冊（註冊成功會把這台裝置的試卷一起存進去）
            const canSave = !window.currentUser || window.currentUser.role === 'teacher';
            if (saveBtn) saveBtn.classList.toggle('hidden', !canSave);
            const saveLabel = document.getElementById('btnSaveHistoryLabel');
            if (saveLabel) saveLabel.textContent = window.currentUser ? '存入班級歷史' : '註冊帳號，把試卷存起來';
            const adminPanelBtn = document.getElementById('superadminBtn');
            if (adminPanelBtn) adminPanelBtn.classList.toggle('hidden', !(window.currentUser && window.currentUser.role === 'superadmin'));
            refreshAnswerLoginBox();
        }

        // 作答頁登入狀態區塊：學生用分享連結進來時，提示登入學生帳號才能讓家長即時監看
        function buildAnswerLoginBoxHtml() {
            const u = window.currentUser;
            if (u && u.role === 'student') {
                return "<div class='lq-card p-3 mb-4 text-sm flex items-center justify-between gap-2 flex-wrap' style='border-color:var(--hl-green);'>" +
                    "<span>✅ 已登入：" + escapeHtml(u.displayName) + "，這次的成績會存進你的紀錄</span>" +
                    "<button onclick='doLogout()' class='lq-btn lq-btn-ghost text-xs px-2 py-1'>登出</button></div>";
            }
            if (u) {
                return "<div class='lq-card p-3 mb-4 text-sm text-gray-500 flex items-center justify-between gap-2 flex-wrap'>" +
                    "<span>目前登入身分為「" + escapeHtml(u.displayName) + "」，成績要存進學生自己的紀錄請改用學生帳號登入</span>" +
                    "<button onclick='doLogout()' class='lq-btn lq-btn-ghost text-xs px-2 py-1'>登出</button></div>";
            }
            // 未登入不再單獨放一塊登入邀請：下面的作答模式選擇已經在該講的位置講了，
            // 學生一進來就被推銷登入只會被略過（而且原文案講的是「讓家長監看」，對學生根本不是好處）
            return "";
        }
        function refreshAnswerLoginBox() {
            const box = document.getElementById('ansLoginBox');
            if (box) box.innerHTML = buildAnswerLoginBoxHtml();
            // 登入狀態變了就重畫作答模式選項（「每題即時看結果」要登入才開放），
            // 只在還沒開始作答(仍停在開始畫面)時重畫，免得寫到一半整頁被洗掉
            const startScreen = document.getElementById('ansStartScreen');
            const ansContainer = document.getElementById('answerModeContainer');
            if (startScreen && ansContainer && ansContainer.dataset.rendered) {
                renderAnswerMode();
                ansContainer.dataset.rendered = '1';
            }
        }

        function doLogout() {
            lqClearToken();
            window.currentUser = null;
            updateAccountUI();
            // 畫面內容都是依身分算出來的，登出後直接回選身分頁（除了訪客，其他身分都要登入）
            localStorage.removeItem(STUDENT_PROFILE_KEY);
            try { sessionStorage.removeItem('lun_role_session'); } catch (e) {}
            location.href = '/start?switch=1';
        }

        function openAccountModal() {
            document.getElementById('accountModal').classList.remove('hidden');
            if (window.currentUser) renderAccountLoggedInBody();
            else renderAccountAuthForm('login');
        }
        function closeAccountModal() { document.getElementById('accountModal').classList.add('hidden'); }

        function renderAccountAuthForm(mode) {
            document.getElementById('accountModalTitle').textContent = mode === 'login' ? '👤 登入' : '👤 註冊';
            const isLogin = mode === 'login';
            let html = "<div class='space-y-3'>";
            const credAttrs = isLogin ? "" : CRED_INPUT_ATTRS;
            html += "<input id='authUsername' class='lq-input' placeholder='" + (isLogin ? '帳號' : CRED_USER_HINT) + "'" + credAttrs + ">";
            html += "<input id='authPassword' type='password' class='lq-input' placeholder='" + (isLogin ? '密碼' : CRED_PASS_HINT) + "'" + credAttrs + ">";
            if (!isLogin) {
                html += "<input id='authPasswordConfirm' type='password' class='lq-input' placeholder='再輸入一次密碼'" + credAttrs + ">";
                html += "<input id='authDisplayName' class='lq-input' placeholder='顯示名稱（例如：王小明）'>";
                html += "<select id='authRole' class='lq-input' onchange='onAuthRoleChange()'>" +
                    "<option value=''>請選擇角色...</option>" +
                    "<option value='teacher'>老師</option>" +
                    "<option value='student'>學生</option>" +
                    "<option value='parent'>家長</option>" +
                    "</select>";
                html += "<input id='authClassName' class='lq-input hidden' placeholder='幫班級取個名字（例如：六年1班，全站需唯一，重複會被擋下）'>";
                html += "<input id='authJoinCode' class='lq-input hidden' maxlength='10' autocapitalize='characters' placeholder='想自己設班級代碼？（選填，4 到 10 個英文字母或數字，例如 LIN602；不填系統幫你取一組好唸的）'>";
                html += "<input id='authClassCode' class='lq-input hidden' placeholder='老師給的班級代碼（選填，之後也可以在帳號頁面補填）'>";
                html += "<label class='flex gap-2 items-start text-xs text-gray-600 cursor-pointer'><input type='checkbox' id='authPrivacyOk' class='mt-1'><span>我已閱讀並同意<a href='privacy.html' target='_blank' rel='noopener' class='text-blue-600 underline'>《個人資料蒐集告知》</a>。未滿 18 歲請在家長或老師陪同下註冊。</span></label>";
            }
            html += "<div id='authErrorMsg' class='text-sm text-red-600 hidden'></div>";
            html += "<button onclick=\"" + (isLogin ? 'doLogin()' : 'doRegister()') + "\" class='lq-btn lq-btn-primary w-full py-2'>" + (isLogin ? '登入' : '註冊') + "</button>";
            html += "<button onclick=\"renderAccountAuthForm('" + (isLogin ? 'register' : 'login') + "')\" class='lq-btn lq-btn-ghost w-full text-sm'>" +
                (isLogin ? '還沒有帳號？點此註冊' : '已經有帳號？點此登入') + "</button>";
            html += "</div>";
            document.getElementById('accountModalBody').innerHTML = html;
        }

        function onAuthRoleChange() {
            const role = document.getElementById('authRole').value;
            document.getElementById('authClassName').classList.toggle('hidden', role !== 'teacher');
            document.getElementById('authJoinCode').classList.toggle('hidden', role !== 'teacher');
            document.getElementById('authClassCode').classList.toggle('hidden', role !== 'student');
        }

        function showAuthError(msg) {
            const el = document.getElementById('authErrorMsg');
            el.textContent = msg;
            el.classList.remove('hidden');
        }

        async function doRegister() {
            const username = document.getElementById('authUsername').value.trim();
            const password = document.getElementById('authPassword').value;
            const passwordConfirm = (document.getElementById('authPasswordConfirm') || {}).value || '';
            const credErr = credentialInputError(username, password);
            if (credErr) { showAuthError(credErr); return; }
            if (password !== passwordConfirm) { showAuthError('兩次密碼輸入不一致'); return; }
            if (!(document.getElementById('authPrivacyOk') || {}).checked) { showAuthError('請先閱讀並勾選同意《個人資料蒐集告知》'); return; }
            const displayName = document.getElementById('authDisplayName').value.trim();
            const role = document.getElementById('authRole').value;
            const className = (document.getElementById('authClassName') || {}).value || '';
            const classCode = (document.getElementById('authClassCode') || {}).value || '';
            const joinCode = (document.getElementById('authJoinCode') || {}).value || '';
            try {
                const res = await fetch(API_BASE + "/api/auth/register", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, displayName, role, className, classCode, joinCode, privacyVersion: PRIVACY_VERSION })
                });
                const data = await res.json();
                if (data.error) { showAuthError(data.error.message); return; }
                lqSetToken(data.token);
                window.currentUser = data.user;
                updateAccountUI();
                renderAccountLoggedInBody();
            } catch (e) { showAuthError('註冊失敗：' + e.message); }
        }

        async function doLogin() {
            const username = document.getElementById('authUsername').value.trim();
            const password = document.getElementById('authPassword').value;
            try {
                const res = await fetch(API_BASE + "/api/auth/login", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.error) { showAuthError(data.error.message); return; }
                lqSetToken(data.token);
                window.currentUser = data.user;
                updateAccountUI();
                renderAccountLoggedInBody();
            } catch (e) { showAuthError('登入失敗：' + e.message); }
        }

        // 老師自己設定班級代碼：已加入的學生不受影響，只有「之後」註冊或加入的人要輸入新代碼；舊代碼立刻失效
        async function saveClassCode(payload) {
            try {
                const res = await fetch(API_BASE + "/api/class/code", {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': lqGetToken() || '' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.error) { await lqAlert(data.error.message); return; }
                window.currentUser.classCode = data.classCode;
                updateAccountUI();
                renderAccountLoggedInBody();
            } catch (e) { lqAlert('修改失敗：' + e.message); }
        }
        async function editClassCode() {
            const v = await askText('設定你的班級代碼（4 到 10 個英文字母或數字，例如 LIN602）。\n改了之後，舊代碼就不能再用；已經加入的學生不受影響。', { value: (window.currentUser && window.currentUser.classCode) || '' });
            if (v === null || v === undefined || !String(v).trim()) return;
            saveClassCode({ code: String(v).trim() });
        }
        async function randomClassCode() {
            const ok = await askConfirm('換一組新的班級代碼？舊代碼會立刻失效，已經加入的學生不受影響。', { okText: '換一組', cancelText: '取消' });
            if (ok) saveClassCode({ random: true });
        }

        // 老師登入後每次開啟都先跳一次大字班級代碼（同一個分頁只跳一次），報給學生用
        function showClassCodeOnce() {
            const u = window.currentUser;
            if (!u || u.role !== 'teacher' || !u.classCode) return;
            try { if (sessionStorage.getItem('lun_code_seen')) return; sessionStorage.setItem('lun_code_seen', '1'); } catch (e) { return; }
            lqAlert('你的班級代碼：' + u.classCode + '\n\n學生註冊或加入班級時輸入這組代碼。\n頂端列隨時看得到，到「我的帳號」可以複製、自己改。');
        }

        // 複製班級代碼：瀏覽器不給剪貼簿權限時不假裝成功
        function copyClassCode(code, btn) {
            if (!(navigator.clipboard && navigator.clipboard.writeText)) return;
            navigator.clipboard.writeText(code).then(function () {
                btn.textContent = '已複製';
                setTimeout(function () { btn.textContent = '複製代碼'; }, 1500);
            }, function () {});
        }

        async function renderAccountLoggedInBody() {
            const u = window.currentUser;
            document.getElementById('accountModalTitle').textContent = '👤 我的帳號';
            let html = "<div class='space-y-3'>";
            html += "<div class='lq-card p-3 text-sm'><b>" + escapeHtml(u.displayName) + "</b>（" + escapeHtml(u.username) + "）</div>";
            if (u.role === 'teacher') {
                // 給學生的加入代碼：大字、可複製；後端沒給代碼（舊版）時退回顯示班級名稱，學生輸入名稱一樣能加入
                const joinCode = u.classCode || '';
                html += "<div class='lq-card p-3 text-center'>" +
                    "<div class='text-xs text-gray-500 mb-1'>班級代碼（學生註冊或加入班級時輸入）</div>" +
                    "<div class='font-black' style='font-size:2rem; letter-spacing:0.18em; color:var(--hl-blue);'>" + escapeHtml(joinCode || u.className || '') + "</div>" +
                    "<div class='text-xs text-gray-500 mt-1'>班級：" + escapeHtml(u.className || '') + "</div>" +
                    (joinCode ? "<div class='flex gap-2 justify-center flex-wrap mt-2'>" +
                        "<button type='button' onclick=\"copyClassCode('" + escapeHtml(joinCode) + "', this)\" class='lq-btn lq-btn-secondary text-xs px-3 py-1'>複製代碼</button>" +
                        "<button type='button' onclick='editClassCode()' class='lq-btn lq-btn-secondary text-xs px-3 py-1'>自己設定</button>" +
                        "<button type='button' onclick='randomClassCode()' class='lq-btn lq-btn-secondary text-xs px-3 py-1'>換一組好唸的</button></div>" : "") +
                    "</div>";
                html += "<button onclick=\"closeAccountModal(); openClassHistory();\" class='lq-btn lq-btn-secondary w-full py-2'>📚 查看班級歷史</button>";
            } else if (u.role === 'student') {
                html += "<div class='lq-card p-3'><div class='text-sm font-bold mb-1'>👨‍👩‍👧 讓家長看我的作答</div>" +
                    "<div class='text-xs text-gray-500 mb-2'>按下產生綁定碼，把 6 位數字告訴家長；家長登入後輸入就能連結。10 分鐘內有效，只能用一次。</div>" +
                    "<div id='bindCodeBox'><button onclick='doMakeBindCode()' class='lq-btn lq-btn-secondary w-full py-2 text-sm'>產生綁定碼</button></div></div>";
                if (u.classId) {
                    html += "<div class='text-sm text-gray-500'>班級：" + escapeHtml(u.className || '') + "</div>";
                } else {
                    html += "<div class='text-sm text-gray-500'>尚未加入班級（選填，不影響作答/家長監看）</div>";
                    html += "<div class='flex gap-2'><input id='joinClassCode' class='lq-input' placeholder='老師給的班級代碼（6 碼，例如：K7M3QX）'>" +
                        "<button onclick='doJoinClass()' class='lq-btn lq-btn-primary px-4'>加入</button></div>";
                }
            } else if (u.role === 'parent') {
                html += "<div id='parentChildrenBox'></div>";
                html += "<div class='flex gap-2'><input id='linkChildUsername' class='lq-input' inputmode='numeric' maxlength='6' placeholder='孩子產生的 6 位數綁定碼'>" +
                    "<button onclick='doLinkChild()' class='lq-btn lq-btn-primary px-4'>連結</button></div>";
            }
            html += "<button onclick='doLogout(); closeAccountModal();' class='lq-btn lq-btn-danger w-full py-2'>登出</button>";
            html += "</div>";
            document.getElementById('accountModalBody').innerHTML = html;
            if (u.role === 'parent') loadMyChildren();
        }

        async function doJoinClass() {
            const classCode = document.getElementById('joinClassCode').value.trim();
            if (!classCode) return;
            const token = lqGetToken() || '';
            try {
                const res = await fetch(API_BASE + "/api/auth/join-class", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ classCode })
                });
                const data = await res.json();
                if (data.error) { lqAlert(data.error.message); return; }
                window.currentUser.classId = data.classId;
                window.currentUser.className = data.className;
                renderAccountLoggedInBody();
            } catch (e) { lqAlert('加入班級失敗：' + e.message); }
        }

        // 學生端:產生給家長用的 6 位綁定碼(10 分鐘、用一次)
        async function doMakeBindCode() {
            const box = document.getElementById('bindCodeBox');
            if (!box) return;
            try {
                const res = await fetch(API_BASE + "/api/student/bind-code", { method: 'POST', headers: { 'X-Session-Token': lqGetToken() || '' } });
                const data = await res.json();
                if (data.error) { lqAlert(data.error.message); return; }
                box.innerHTML = "<div class='text-center'><div style='font-size:2rem;letter-spacing:.3em;font-weight:800;'>" + escapeHtml(data.code) + "</div>" +
                    "<div class='text-xs text-gray-500 mt-1'>10 分鐘內有效，家長輸入後就會作廢</div>" +
                    "<button onclick='doMakeBindCode()' class='lq-btn lq-btn-ghost text-xs mt-2'>重新產生</button></div>";
            } catch (e) { lqAlert('產生失敗：' + e.message); }
        }

        async function doLinkChild() {
            const bindCode = document.getElementById('linkChildUsername').value.trim();
            if (!bindCode) return;
            const token = lqGetToken() || '';
            try {
                const res = await fetch(API_BASE + "/api/parent/link-child", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ bindCode })
                });
                const data = await res.json();
                if (data.error) { lqAlert(data.error.message); return; }
                document.getElementById('linkChildUsername').value = '';
                loadMyChildren();
            } catch (e) { lqAlert('連結失敗：' + e.message); }
        }

        async function loadMyChildren() {
            const token = lqGetToken() || '';
            const box = document.getElementById('parentChildrenBox');
            if (!box) return;
            try {
                const res = await fetch(API_BASE + "/api/parent/children", { headers: { 'X-Session-Token': token } });
                const data = await res.json();
                const children = data.children || [];
                if (children.length === 0) { box.innerHTML = "<div class='text-sm text-gray-400 mb-2'>還沒有連結任何孩子帳號</div>"; return; }
                box.innerHTML = children.map(c =>
                    "<div class='flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2'>" +
                    "<span class='text-sm font-semibold'>" + escapeHtml(c.displayName) + "（" + escapeHtml(c.username) + "）</span>" +
                    "<button onclick=\"openProctorDetailParent(" + jsArg(c.username) + ")\" class='lq-btn lq-btn-primary text-xs px-3 py-1'>🔍 即時監看</button>" +
                    "</div>"
                ).join('');
            } catch (e) {}
        }

        // ---- 班級歷史(老師登入後專用，每班上限50份) ----
        async function saveToClassHistory() {
            if (!window.currentUser) { openIdentitySplash(true); return; }   // 沒登入：去註冊，註冊後 login.js 會把這台裝置的試卷搬進帳號
            if (window.currentUser.role !== 'teacher') return;
            if (!window.currentItems || window.currentItems.length === 0) { lqAlert('目前沒有題目可以存'); return; }
            const token = lqGetToken() || '';
            const title = window.docTitle || '測驗';
            try {
                const res = await fetch(API_BASE + "/api/history", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ title, items: window.currentItems })
                });
                const data = await res.json();
                if (data.error) { lqAlert(data.error.message); return; }
                lqAlert('✅ 已存入班級歷史「' + title + '」');
            } catch (e) { lqAlert('存入失敗：' + e.message); }
        }

        async function openClassHistory() {
            const token = lqGetToken() || '';
            const list = document.getElementById('classHistoryList');
            list.innerHTML = "<div class='text-center text-gray-500 py-8'>⏳ 載入中...</div>";
            document.getElementById('classHistoryModal').classList.remove('hidden');
            try {
                const res = await fetch(API_BASE + "/api/history", { headers: { 'X-Session-Token': token } });
                const data = await res.json();
                if (data.error) { list.innerHTML = "<p class='text-red-600 text-center py-8'>" + escapeHtml(data.error.message) + "</p>"; return; }
                const history = data.history || [];
                window.__classHistoryCache = history;
                if (history.length === 0) {
                    list.innerHTML = "<p class='text-gray-500 text-center py-8'>班級還沒有出題歷史</p>";
                    return;
                }
                list.innerHTML = history.map((h, i) =>
                    "<div class='flex justify-between items-center bg-gray-50 p-3 rounded-xl mb-2 border border-gray-100'>" +
                    "<div class='truncate mr-2'><div class='font-bold truncate'>" + escapeHtml(h.title) + "</div><div class='text-xs text-gray-500'>" + new Date(h.createdAt).toLocaleString() + "・" + h.items.length + "題</div></div>" +
                    "<div class='flex gap-2 flex-shrink-0'>" +
                    "<button onclick='loadClassHistoryItem(" + i + ")' class='lq-btn lq-btn-primary px-3 py-1 text-sm'>開啟</button>" +
                    "<button onclick=\"deleteClassHistoryItem(" + h.id + ")\" class='lq-btn lq-btn-danger px-3 py-1 text-sm'>刪除</button>" +
                    "</div></div>"
                ).join('');
            } catch (e) { list.innerHTML = "<p class='text-red-600 text-center py-8'>載入失敗：" + escapeHtml(e.message) + "</p>"; }
        }
        function closeClassHistory() { document.getElementById('classHistoryModal').classList.add('hidden'); }

        function loadClassHistoryItem(i) {
            const h = (window.__classHistoryCache || [])[i];
            if (!h) return;
            window.currentItems = mathClean(h.items);
            closeClassHistory();
            renderPaperFixed(h.items, h.title);
            window.itemsVersion = (window.itemsVersion || 0) + 1;
            switchSheet('answer');
        }

        async function deleteClassHistoryItem(id) {
            if (!(await askConfirm('確定刪除這筆班級歷史記錄？', { danger: true }))) return;
            const token = lqGetToken() || '';
            try {
                const res = await fetch(API_BASE + "/api/history/" + id, {
                    method: 'DELETE', headers: { 'X-Session-Token': token }
                });
                const data = await res.json();
                if (data.error) { lqAlert(data.error.message); return; }
                openClassHistory();
            } catch (e) { lqAlert('刪除失敗：' + e.message); }
        }

