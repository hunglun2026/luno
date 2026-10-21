// Luno 綸諾｜帳號系統：登入註冊、班級歷史、監考式即時監看。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // ==================== 帳號系統：登入/註冊/班級歷史/監考式即時監看 ====================
        // session token存在localStorage.lun_session_token，每次要驗證身分的請求帶X-Session-Token header。
        // 登入非必要：學生/家長不登入一樣能用既有分享連結作答/查看，登入是額外功能(存班級歷史/監考監看)。
        window.currentUser = null;

        async function initAuthUI() {
            const token = localStorage.getItem('lun_session_token');
            if (!token) {
                updateAccountUI();
                // 免登入學生上次填過基本資料就直接回學生首頁，不用每次重選身分
                if (getStudentProfile() && !location.search) enterMainApp();
                return;
            }
            try {
                const res = await fetch(API_BASE + "/api/auth/me", { headers: { 'X-Session-Token': token } });
                const data = await res.json();
                if (data.error) { localStorage.removeItem('lun_session_token'); window.currentUser = null; }
                else {
                    window.currentUser = data.user;
                    // 學生/家長已經登入過，重新整理時直接進他的首頁(老師仍走進場頁選Key)
                    if (!location.search && (data.user.role === 'student' || data.user.role === 'parent')) enterMainApp();
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
                statusEl.textContent = window.currentUser.displayName + '（' + (roleLabel[window.currentUser.role] || window.currentUser.role) + '）';
            } else {
                statusEl.textContent = '';
            }
            const saveBtn = document.getElementById('btnSaveHistory');
            if (saveBtn) saveBtn.classList.toggle('hidden', !(window.currentUser && window.currentUser.role === 'teacher'));
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
            localStorage.removeItem('lun_session_token');
            window.currentUser = null;
            updateAccountUI();
            // 學生首頁整頁內容都是依身分算出來的，只更新帳號列會看起來像沒登出，直接回進場頁
            const sh = document.getElementById('studentHome');
            if (sh && !sh.classList.contains('hidden')) {
                localStorage.removeItem(STUDENT_PROFILE_KEY);
                location.href = location.origin + location.pathname;
            }
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
            html += "<input id='authUsername' class='lq-input' placeholder='帳號'>";
            html += "<input id='authPassword' type='password' class='lq-input' placeholder='密碼（至少6碼）'>";
            if (!isLogin) {
                html += "<input id='authPasswordConfirm' type='password' class='lq-input' placeholder='再輸入一次密碼'>";
                html += "<input id='authDisplayName' class='lq-input' placeholder='顯示名稱（例如：王小明）'>";
                html += "<select id='authRole' class='lq-input' onchange='onAuthRoleChange()'>" +
                    "<option value=''>請選擇角色...</option>" +
                    "<option value='teacher'>老師</option>" +
                    "<option value='student'>學生</option>" +
                    "<option value='parent'>家長</option>" +
                    "</select>";
                html += "<input id='authClassName' class='lq-input hidden' placeholder='幫班級取個名字（例如：六年1班，全站需唯一，重複會被擋下）'>";
                html += "<input id='authClassCode' class='lq-input hidden' placeholder='老師的班級名稱（選填，之後也可以在帳號頁面補填）'>";
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
            if (password !== passwordConfirm) { showAuthError('兩次密碼輸入不一致'); return; }
            const displayName = document.getElementById('authDisplayName').value.trim();
            const role = document.getElementById('authRole').value;
            const className = (document.getElementById('authClassName') || {}).value || '';
            const classCode = (document.getElementById('authClassCode') || {}).value || '';
            try {
                const res = await fetch(API_BASE + "/api/auth/register", {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, displayName, role, className, classCode })
                });
                const data = await res.json();
                if (data.error) { showAuthError(data.error.message); return; }
                localStorage.setItem('lun_session_token', data.token);
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
                localStorage.setItem('lun_session_token', data.token);
                window.currentUser = data.user;
                updateAccountUI();
                renderAccountLoggedInBody();
            } catch (e) { showAuthError('登入失敗：' + e.message); }
        }

        async function renderAccountLoggedInBody() {
            const u = window.currentUser;
            document.getElementById('accountModalTitle').textContent = '👤 我的帳號';
            let html = "<div class='space-y-3'>";
            html += "<div class='lq-card p-3 text-sm'><b>" + escapeHtml(u.displayName) + "</b>（" + escapeHtml(u.username) + "）</div>";
            if (u.role === 'teacher') {
                html += "<div class='text-sm text-gray-500'>班級代碼（給學生註冊/加入用）：<b>" + escapeHtml(u.className || '') + "</b></div>";
                html += "<button onclick=\"closeAccountModal(); openClassHistory();\" class='lq-btn lq-btn-secondary w-full py-2'>📚 查看班級歷史</button>";
            } else if (u.role === 'student') {
                html += "<div class='text-sm text-gray-500'>你的帳號名稱（給家長連結用）：<b>" + escapeHtml(u.username) + "</b></div>";
                if (u.classId) {
                    html += "<div class='text-sm text-gray-500'>班級：" + escapeHtml(u.className || '') + "</div>";
                } else {
                    html += "<div class='text-sm text-gray-500'>尚未加入班級（選填，不影響作答/家長監看）</div>";
                    html += "<div class='flex gap-2'><input id='joinClassCode' class='lq-input' placeholder='老師的班級名稱（例如：六年1班）'>" +
                        "<button onclick='doJoinClass()' class='lq-btn lq-btn-primary px-4'>加入</button></div>";
                }
            } else if (u.role === 'parent') {
                html += "<div id='parentChildrenBox'></div>";
                html += "<div class='flex gap-2'><input id='linkChildUsername' class='lq-input' placeholder='孩子的帳號名稱'>" +
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
            const token = localStorage.getItem('lun_session_token') || '';
            try {
                const res = await fetch(API_BASE + "/api/auth/join-class", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ classCode })
                });
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                window.currentUser.classId = data.classId;
                window.currentUser.className = data.className;
                renderAccountLoggedInBody();
            } catch (e) { alert('加入班級失敗：' + e.message); }
        }

        async function doLinkChild() {
            const studentUsername = document.getElementById('linkChildUsername').value.trim();
            if (!studentUsername) return;
            const token = localStorage.getItem('lun_session_token') || '';
            try {
                const res = await fetch(API_BASE + "/api/parent/link-child", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ studentUsername })
                });
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                document.getElementById('linkChildUsername').value = '';
                loadMyChildren();
            } catch (e) { alert('連結失敗：' + e.message); }
        }

        async function loadMyChildren() {
            const token = localStorage.getItem('lun_session_token') || '';
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
                    "<button onclick=\"openProctorDetailParent('" + escapeHtml(c.username) + "')\" class='lq-btn lq-btn-primary text-xs px-3 py-1'>🔍 即時監看</button>" +
                    "</div>"
                ).join('');
            } catch (e) {}
        }

        // ---- 班級歷史(老師登入後專用，每班上限50份) ----
        async function saveToClassHistory() {
            if (!window.currentUser || window.currentUser.role !== 'teacher') return;
            if (!window.currentItems || window.currentItems.length === 0) { alert('目前沒有題目可以存'); return; }
            const token = localStorage.getItem('lun_session_token') || '';
            const title = window.docTitle || '測驗';
            try {
                const res = await fetch(API_BASE + "/api/history", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ title, items: window.currentItems })
                });
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                alert('✅ 已存入班級歷史「' + title + '」');
            } catch (e) { alert('存入失敗：' + e.message); }
        }

        async function openClassHistory() {
            const token = localStorage.getItem('lun_session_token') || '';
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
            window.currentItems = h.items;
            closeClassHistory();
            renderPaperFixed(h.items, h.title);
        }

        async function deleteClassHistoryItem(id) {
            if (!confirm('確定刪除這筆班級歷史記錄？')) return;
            const token = localStorage.getItem('lun_session_token') || '';
            try {
                const res = await fetch(API_BASE + "/api/history/" + id, {
                    method: 'DELETE', headers: { 'X-Session-Token': token }
                });
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                openClassHistory();
            } catch (e) { alert('刪除失敗：' + e.message); }
        }

