// Luno 綸諾｜超級管理員後台。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // ==================== 超級管理員後台：帳號列表/搜尋/建立/編輯(改角色/重設密碼)/刪除 ====================
        const ADMIN_ROLE_LABEL = { student: '學生', parent: '家長', teacher: '老師', superadmin: '超級管理員' };

        async function openSuperadminPanel() {
            document.getElementById('superadminModal').classList.remove('hidden');
            document.getElementById('adminSearchInput').value = '';
            await loadAdminUsers();
        }
        function closeSuperadminPanel() { document.getElementById('superadminModal').classList.add('hidden'); }

        let adminSearchTimer = null;
        function debounceAdminSearch() {
            clearTimeout(adminSearchTimer);
            adminSearchTimer = setTimeout(loadAdminUsers, 300);
        }

        async function loadAdminUsers() {
            const token = localStorage.getItem('lun_session_token') || '';
            const q = (document.getElementById('adminSearchInput').value || '').trim();
            const listEl = document.getElementById('adminUsersList');
            listEl.innerHTML = "<div class='text-center text-gray-500 py-8'>⏳ 載入中...</div>";
            try {
                const res = await fetch(API_BASE + "/api/admin/users?q=" + encodeURIComponent(q), { headers: { 'X-Session-Token': token } });
                const data = await res.json();
                if (data.error) { listEl.innerHTML = "<p class='text-red-600 text-center py-8'>" + escapeHtml(data.error.message) + "</p>"; return; }
                window.__adminUsersCache = data.users;
                if (data.users.length === 0) { listEl.innerHTML = "<p class='text-gray-500 text-center py-8'>沒有符合的帳號</p>"; return; }
                listEl.innerHTML = "<div class='overflow-x-auto'><table class='w-full text-sm'><thead><tr class='text-left text-gray-500 border-b'>" +
                    "<th class='py-2 pr-2'>帳號</th><th class='py-2 pr-2'>角色</th><th class='py-2 pr-2'>顯示名稱</th><th class='py-2 pr-2'>班級</th><th class='py-2 pr-2'>建立時間</th><th class='py-2'>操作</th></tr></thead><tbody>" +
                    data.users.map(function(u) {
                        return "<tr class='border-b border-gray-100'>" +
                            "<td class='py-2 pr-2 font-bold'>" + escapeHtml(u.username) + "</td>" +
                            "<td class='py-2 pr-2'>" + (ADMIN_ROLE_LABEL[u.role] || u.role) + "</td>" +
                            "<td class='py-2 pr-2'>" + escapeHtml(u.displayName) + "</td>" +
                            "<td class='py-2 pr-2'>" + escapeHtml(u.className || '-') + "</td>" +
                            "<td class='py-2 pr-2 text-xs text-gray-500'>" + new Date(u.createdAt).toLocaleDateString() + "</td>" +
                            "<td class='py-2'><div class='flex gap-1 flex-wrap'>" +
                            "<button onclick='openAdminEditForm(" + u.id + ")' class='lq-btn lq-btn-secondary text-xs px-2 py-1'>編輯</button>" +
                            "<button onclick='deleteAdminUser(" + u.id + ", \"" + escapeHtml(u.username).replace(/"/g, '&quot;') + "\")' class='lq-btn lq-btn-danger text-xs px-2 py-1'>刪除</button>" +
                            "</div></td></tr>";
                    }).join('') + "</tbody></table></div>";
            } catch (e) { listEl.innerHTML = "<p class='text-red-600 text-center py-8'>載入失敗：" + escapeHtml(e.message) + "</p>"; }
        }

        function openAdminCreateForm() {
            let html = "<div class='space-y-3'>";
            html += "<input id='adminNewUsername' class='lq-input' placeholder='帳號'>";
            html += "<input id='adminNewPassword' type='password' class='lq-input' placeholder='密碼（至少6碼）'>";
            html += "<input id='adminNewDisplayName' class='lq-input' placeholder='顯示名稱'>";
            html += "<select id='adminNewRole' class='lq-input' onchange='onAdminNewRoleChange()'>" +
                "<option value=''>請選擇角色...</option>" +
                "<option value='teacher'>老師</option>" +
                "<option value='student'>學生</option>" +
                "<option value='parent'>家長</option>" +
                "<option value='superadmin'>超級管理員</option>" +
                "</select>";
            html += "<input id='adminNewClassName' class='lq-input hidden' placeholder='班級名稱（老師帳號必填，例如：六年1班，全站需唯一）'>";
            html += "<div id='adminCreateError' class='text-sm text-red-600 hidden'></div>";
            html += "<button onclick='doAdminCreateUser()' class='lq-btn lq-btn-primary w-full py-2'>建立</button>";
            html += "</div>";
            document.getElementById('adminCreateBody').innerHTML = html;
            document.getElementById('adminCreateModal').classList.remove('hidden');
        }
        function closeAdminCreateForm() { document.getElementById('adminCreateModal').classList.add('hidden'); }

        function onAdminNewRoleChange() {
            const role = document.getElementById('adminNewRole').value;
            document.getElementById('adminNewClassName').classList.toggle('hidden', role !== 'teacher');
        }

        function showAdminCreateError(msg) {
            const el = document.getElementById('adminCreateError');
            el.textContent = msg; el.classList.remove('hidden');
        }

        async function doAdminCreateUser() {
            const token = localStorage.getItem('lun_session_token') || '';
            const username = document.getElementById('adminNewUsername').value.trim();
            const password = document.getElementById('adminNewPassword').value;
            const displayName = document.getElementById('adminNewDisplayName').value.trim();
            const role = document.getElementById('adminNewRole').value;
            const className = (document.getElementById('adminNewClassName') || {}).value || '';
            try {
                const res = await fetch(API_BASE + "/api/admin/users", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ username, password, displayName, role, className })
                });
                const data = await res.json();
                if (data.error) { showAdminCreateError(data.error.message); return; }
                closeAdminCreateForm();
                loadAdminUsers();
            } catch (e) { showAdminCreateError('建立失敗：' + e.message); }
        }

        function openAdminEditForm(id) {
            const u = (window.__adminUsersCache || []).find(function(x) { return x.id === id; });
            if (!u) return;
            let html = "<div class='space-y-3'>";
            html += "<div class='text-sm text-gray-500'>帳號：<b>" + escapeHtml(u.username) + "</b></div>";
            html += "<input id='adminEditDisplayName' class='lq-input' placeholder='顯示名稱' value=\"" + escapeHtml(u.displayName).replace(/"/g, '&quot;') + "\">";
            html += "<select id='adminEditRole' class='lq-input'>" +
                ["teacher", "student", "parent", "superadmin"].map(function(r) {
                    return "<option value='" + r + "'" + (r === u.role ? " selected" : "") + ">" + ADMIN_ROLE_LABEL[r] + "</option>";
                }).join('') + "</select>";
            html += "<input id='adminEditNewPassword' type='password' class='lq-input' placeholder='重設密碼（留空代表不變更，至少6碼）'>";
            html += "<div id='adminEditError' class='text-sm text-red-600 hidden'></div>";
            html += "<button onclick='doAdminUpdateUser(" + id + ")' class='lq-btn lq-btn-primary w-full py-2'>儲存</button>";
            html += "</div>";
            document.getElementById('adminEditBody').innerHTML = html;
            document.getElementById('adminEditModal').classList.remove('hidden');
        }
        function closeAdminEditForm() { document.getElementById('adminEditModal').classList.add('hidden'); }

        function showAdminEditError(msg) {
            const el = document.getElementById('adminEditError');
            el.textContent = msg; el.classList.remove('hidden');
        }

        async function doAdminUpdateUser(id) {
            const token = localStorage.getItem('lun_session_token') || '';
            const displayName = document.getElementById('adminEditDisplayName').value.trim();
            const role = document.getElementById('adminEditRole').value;
            const newPassword = document.getElementById('adminEditNewPassword').value;
            const body = { displayName, role };
            if (newPassword) body.newPassword = newPassword;
            try {
                const res = await fetch(API_BASE + "/api/admin/users/" + id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (data.error) { showAdminEditError(data.error.message); return; }
                closeAdminEditForm();
                loadAdminUsers();
            } catch (e) { showAdminEditError('更新失敗：' + e.message); }
        }

        async function deleteAdminUser(id, username) {
            if (!confirm('確定要刪除帳號「' + username + '」？此動作無法復原，若是老師帳號會一併刪除其班級與歷史記錄。')) return;
            const token = localStorage.getItem('lun_session_token') || '';
            try {
                const res = await fetch(API_BASE + "/api/admin/users/" + id, {
                    method: 'DELETE', headers: { 'X-Session-Token': token }
                });
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                loadAdminUsers();
            } catch (e) { alert('刪除失敗：' + e.message); }
        }

        // ---- 監考式即時監看：老師從班級儀表板點學生詳情 / 家長從已連結孩子點監看 ----
        // 兩邊都需要拿到該份題目的實際內容(才知道學生選的字母對應哪個選項)，
        // shareId對應/api/share，是公開的capability-URL端點，直接fetch即可
        async function fetchShareItems(shareId) {
            if (window.__shareItemsCache && window.__shareItemsCache.id === shareId) return window.__shareItemsCache.items;
            const res = await fetch(API_BASE + "/api/share/" + encodeURIComponent(shareId));
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            window.__shareItemsCache = { id: shareId, items: data.items };
            return data.items;
        }

        function renderProctorAnswersHtml(items, answers) {
            const map = {};
            (answers || []).forEach(a => { map[a.i] = a.selected; });
            let html = "";
            items.forEach((q, i) => {
                const sel = map[i];
                let selDisplay = '';
                if (sel) {
                    if (q.o && q.o.length > 0) {
                        selDisplay = sel.split('').map(l => {
                            const idx = l.charCodeAt(0) - 65;
                            return q.o[idx] ? ('(' + l + ') ' + q.o[idx]) : l;
                        }).join('、');
                    } else {
                        selDisplay = sel;
                    }
                }
                html += "<div class='lq-card p-3 mb-2'>" +
                    "<div class='font-semibold text-sm mb-1'>" + (i + 1) + ". " + escapeHtml(q.q) + "</div>" +
                    (selDisplay
                        ? "<div class='text-sm' style='color:var(--hl-blue);'>✍️ " + escapeHtml(selDisplay) + "</div>"
                        : "<div class='text-xs text-gray-400'>尚未作答</div>") +
                    "</div>";
            });
            return html;
        }

        // 停止/恢復「某一位學生」的監看連結。學生自己不能按(被監考的人不該關掉監考)，
        // 後端要求儀表板金鑰(老師)、老師/管理員帳號、或已連結該學生的家長帳號
        window.studentWatchStopped = {};
        function revokeStudentBtnHtml(shareId, studentId) {
            const stopped = !!window.studentWatchStopped[shareId + ':' + studentId];
            return "<button type='button' onclick=\"toggleRevokeStudentWatch('" + escapeHtml(shareId) + "','" + escapeHtml(studentId) + "', this)\" class='lq-btn lq-btn-ghost text-xs px-3 py-1 mb-3'>" +
                (stopped ? '▶️ 恢復監看' : '⏹ 停止監看（讓這條連結失效）') + "</button>";
        }
        async function toggleRevokeStudentWatch(shareId, studentId, btnEl) {
            const mapKey = shareId + ':' + studentId;
            const next = !window.studentWatchStopped[mapKey];
            if (btnEl) btnEl.disabled = true;
            try {
                const headers = { 'Content-Type': 'application/json' };
                const token = localStorage.getItem('lun_session_token') || '';
                if (token) headers['X-Session-Token'] = token;
                if (window.currentDashKey) headers['X-Dash-Key'] = window.currentDashKey;
                const res = await fetch(API_BASE + "/api/live-revoke", {
                    method: 'POST', headers,
                    body: JSON.stringify({ shareId, studentId, revoked: next })
                });
                if (!res.ok && res.status === 404) { alert('這個功能需要後端更新後才能使用，請稍後再試。'); return; }
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                window.studentWatchStopped[mapKey] = next;
                if (btnEl) btnEl.innerHTML = next ? '▶️ 恢復監看' : '⏹ 停止監看（讓這條連結失效）';
                alert(next ? '已停止監看，發出去的這條連結暫時看不到作答內容了。' : '已恢復監看。');
            } catch (e) {
                alert('操作失敗：' + e.message);
            } finally {
                if (btnEl) btnEl.disabled = false;
            }
        }

        window.proctorPollTimer = null;
        function closeProctorModal() {
            document.getElementById('proctorModal').classList.add('hidden');
            if (window.proctorPollTimer) { clearInterval(window.proctorPollTimer); window.proctorPollTimer = null; }
        }

        async function openProctorDetailTeacher(shareId, studentId) {
            document.getElementById('proctorModal').classList.remove('hidden');
            const refresh = async () => {
                const bodyEl = document.getElementById('proctorModalBody');
                try {
                    const items = await fetchShareItems(shareId);
                    // 帶上儀表板金鑰：學生就算按了「停止監看」(那是針對家長連結)，老師的監考視角仍看得到
                    const headers = window.currentDashKey ? { 'X-Dash-Key': window.currentDashKey } : {};
                    const res = await fetch(API_BASE + "/api/live-progress/" + encodeURIComponent(shareId) + "/" + encodeURIComponent(studentId), { headers });
                    const data = await res.json();
                    if (data.error) { bodyEl.innerHTML = "<div class='text-center text-gray-500 py-8'>" + escapeHtml(data.error.message) + "</div>"; return; }
                    bodyEl.innerHTML = revokeStudentBtnHtml(shareId, studentId) + renderProctorAnswersHtml(items, data.answers || []);
                } catch (e) {
                    bodyEl.innerHTML = "<div class='text-center text-red-600 py-8'>載入失敗：" + escapeHtml(e.message) + "</div>";
                }
            };
            await refresh();
            if (window.proctorPollTimer) clearInterval(window.proctorPollTimer);
            window.proctorPollTimer = setInterval(refresh, 5000);
        }

        async function openProctorDetailParent(studentUsername) {
            document.getElementById('proctorModal').classList.remove('hidden');
            const token = localStorage.getItem('lun_session_token') || '';
            const refresh = async () => {
                const bodyEl = document.getElementById('proctorModalBody');
                try {
                    const liveRes = await fetch(API_BASE + "/api/parent/child-live/" + encodeURIComponent(studentUsername), {
                        headers: { 'X-Session-Token': token }
                    });
                    const data = await liveRes.json();
                    if (data.error) { bodyEl.innerHTML = "<div class='text-center text-gray-500 py-8'>" + escapeHtml(data.error.message) + "</div>"; return; }
                    const items = await fetchShareItems(data.shareId);
                    bodyEl.innerHTML = revokeStudentBtnHtml(data.shareId, data.studentId) + renderProctorAnswersHtml(items, data.answers || []);
                } catch (e) {
                    bodyEl.innerHTML = "<div class='text-center text-red-600 py-8'>載入失敗：" + escapeHtml(e.message) + "</div>";
                }
            };
            await refresh();
            if (window.proctorPollTimer) clearInterval(window.proctorPollTimer);
            window.proctorPollTimer = setInterval(refresh, 5000);
        }
    