// Luno 綸諾｜依身分進首頁：學生首頁、練習、家長面板、返回鈕。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // ==================== 依身分決定進入哪個首頁 ====================
        // 老師/管理員/訪客 → 出題工具(#inputForm)；學生 → 學生首頁(#studentHome)；
        // 家長 → 出題工具，但上方多一塊孩子狀況面板。
        // 學生沒登入也能用：進場頁選「學生」可以直接填學校/年級/班級/姓名開始練習。
        const STUDENT_PROFILE_KEY = 'lun_student_profile';
        const PRACTICE_LOG_KEY = 'lun_practice_log';

        function getStudentProfile() {
            try { return JSON.parse(localStorage.getItem(STUDENT_PROFILE_KEY) || 'null'); } catch (e) { return null; }
        }
        function saveStudentProfile(prof) {
            localStorage.setItem(STUDENT_PROFILE_KEY, JSON.stringify(prof));
        }

        // 進入主畫面：所有「離開進場頁」的路徑都走這裡，才不會有的地方漏掉身分判斷
        function enterMainApp() {
            document.getElementById('hlSplash').style.display = 'none';
            document.getElementById('lqAppbar').classList.remove('hidden');
            const u = window.currentUser;
            const isStudent = (u && u.role === 'student') || (!u && !!getStudentProfile());
            const isParent = u && u.role === 'parent';

            document.getElementById('studentHome').classList.toggle('hidden', !isStudent);
            document.getElementById('inputForm').classList.toggle('hidden', isStudent);
            document.getElementById('parentPanel').classList.toggle('hidden', !isParent);

            if (isStudent) renderStudentHome();
            if (isParent) renderParentPanel();
            updateGlobalBackBtn();
        }

        function practiceGradeOptions() {
            const grades = [];
            ['一', '二', '三', '四', '五', '六'].forEach(function (g) { grades.push('國小' + g + '年級'); });
            ['一', '二', '三'].forEach(function (g) { grades.push('國中' + g + '年級'); });
            ['一', '二', '三'].forEach(function (g) { grades.push('高中' + g + '年級'); });
            return grades.map(function (g) { return "<option>" + g + "</option>"; }).join('');
        }

        function renderStudentHome() {
            const u = window.currentUser;
            const prof = getStudentProfile() || {};
            const name = u ? u.displayName : (prof.name || '同學');
            const infoLine = u ? (u.className || '') : [prof.school, prof.grade, prof.className].filter(Boolean).join('・');
            const subjects = ['國語文', '英語文', '數學', '自然科學', '社會', '理化', '生物', '地球科學', '歷史', '地理', '公民'];
            const box = document.getElementById('studentHome');

            // 身分列：頭像 + 姓名 + 「學生」標籤 + 班級資訊，右側固定放帳號/登出出口。
            // 未登入時頭像轉灰、標籤轉琥珀色「學生・未登入」，一眼看得出紀錄只在這台裝置。
            // 頭像字：英數帳號取第一個字母（大寫），中文姓名取最後一個字（王小明→明），比較符合稱呼習慣
            const rawName = (name || '同學').trim();
            const initial = escapeHtml(/^[A-Za-z0-9]/.test(rawName) ? rawName.charAt(0).toUpperCase() : rawName.slice(-1));
            const subLine = infoLine || (u ? '學生帳號：' + u.username : '練習紀錄只留在這台裝置');
            let html = "<div class='lq-appbar'>" +
                "<div class='lq-appbar-avatar" + (u ? "" : " is-guest") + "'>" + initial + "</div>" +
                "<div class='lq-appbar-id'>" +
                    "<div class='lq-appbar-name'><span class='truncate'>" + escapeHtml(name) + "</span>" +
                        "<span class='lq-role-chip" + (u ? "" : " is-guest") + "'>" + (u ? "🎒 學生" : "🎒 學生・未登入") + "</span></div>" +
                    "<div class='lq-appbar-sub'>" + escapeHtml(subLine) + "</div>" +
                "</div>" +
                "<div class='lq-appbar-actions'>" +
                (u
                    ? "<button onclick='openAccountModal()' class='lq-btn lq-btn-secondary text-xs px-2.5 py-1.5'>👤 我的帳號</button>" +
                      "<button onclick='studentLogout()' class='lq-btn lq-btn-danger text-xs px-2.5 py-1.5'>登出</button>"
                    : "<button onclick='openAccountModal()' class='lq-btn lq-btn-primary text-xs px-2.5 py-1.5'>登入</button>" +
                      "<button onclick='studentLeaveHome()' class='lq-btn lq-btn-secondary text-xs px-2.5 py-1.5'>換身分</button>") +
                "</div></div>";

            if (!u) {
                html += "<div class='lq-card p-3 mb-4 text-xs text-gray-500' style='border-color:#fde68a;background:#fffbeb;'>" +
                    "登入才有：寫一題就馬上知道對不對、換手機或電腦也看得到自己的練習紀錄與分數。" +
                    "<button onclick='openAccountModal()' class='underline font-bold' style='color:var(--hl-blue);'>現在登入</button></div>";
            }

            html += "<div class='lq-card p-5 mb-4'>" +
                "<div class='font-bold text-lg mb-1'>🎯 進入老師的測驗</div>" +
                "<div class='text-xs text-gray-500 mb-3'>輸入老師報的 6 位數代碼，或貼上老師給的連結</div>" +
                "<div class='flex gap-2 mb-2'>" +
                    "<input id='joinCodeInput' class='lq-input text-center font-black text-lg' style='letter-spacing:0.3em;' maxlength='6' inputmode='numeric' placeholder='000000'>" +
                    "<button onclick='joinByCode(this)' class='lq-btn lq-btn-primary px-5 whitespace-nowrap'>進入</button>" +
                "</div>" +
                "<div class='flex gap-2'>" +
                    "<input id='joinLinkInput' class='lq-input text-sm' placeholder='或貼上測驗連結'>" +
                    "<button onclick='joinByLink()' class='lq-btn lq-btn-secondary px-4 whitespace-nowrap'>前往</button>" +
                "</div></div>";

            html += "<div class='lq-card p-5 mb-4'>" +
                "<div class='font-bold text-lg mb-1'>📝 我要練習</div>" +
                "<div class='text-xs text-gray-500 mb-3'>Luno 幫你出一份練習卷，寫完自動對答案（每次間隔 30 秒）</div>" +
                "<div class='grid grid-cols-2 gap-2 mb-2'>" +
                    "<select id='practiceGrade' class='lq-input text-sm'>" + practiceGradeOptions() + "</select>" +
                    "<select id='practiceSubject' class='lq-input text-sm'>" + subjects.map(function (x) { return "<option>" + x + "</option>"; }).join('') + "</select>" +
                "</div>" +
                // 課本版本：學生知道自己用哪家的課本，選了出題才貼近他實際在讀的內容
                "<select id='practicePublisher' class='lq-input text-sm mb-2'>" +
                    "<option value=''>不指定課本版本</option>" +
                    ['康軒', '翰林', '南一', '部編'].map(function (x) { return "<option value='" + x + "'>" + x + "版</option>"; }).join('') +
                "</select>" +
                "<input id='practiceScope' class='lq-input text-sm mb-2' placeholder='想練哪個範圍？（例如：第三章 光的折射；留空就綜合練習）'>" +
                "<div class='grid grid-cols-2 gap-2 mb-3'>" +
                    "<select id='practiceCount' class='lq-input text-sm'>" + [5, 10, 15, 20].map(function (n) { return "<option value='" + n + "'" + (n === 10 ? " selected" : "") + ">" + n + " 題</option>"; }).join('') + "</select>" +
                    // 難度跟老師表單一樣是四階（「熟練」講的是學生狀態不是題目難度，早先已移除）
                    "<select id='practiceDiff' class='lq-input text-sm'>" + ['基礎', '普通', '進階', '挑戰'].map(function (d) { return "<option" + (d === '普通' ? " selected" : "") + ">" + d + "</option>"; }).join('') + "</select>" +
                "</div>" +
                "<button id='btnPractice' onclick='startPractice(this)' class='lq-btn lq-cta lq-btn-primary w-full py-3 text-lg'>🚀 開始練習</button></div>";

            html += "<div class='lq-card p-5 mb-4'>" +
                "<div class='font-bold text-lg mb-2'>📊 我的練習紀錄</div>" +
                renderPracticeLog() + "</div>";

            // 離開這個畫面的出口統一收在上方身分列（登出／換身分），這裡不再重複一顆按鈕
            box.innerHTML = html;

            if (!u && prof.grade) {
                const sel = document.getElementById('practiceGrade');
                if (sel) sel.value = prof.grade;
            }
        }

        function renderPracticeLog() {
            let log = [];
            try { log = JSON.parse(localStorage.getItem(PRACTICE_LOG_KEY) || '[]'); } catch (e) {}
            if (log.length === 0) return "<div class='text-sm text-gray-400'>還沒有練習紀錄，做完一份就會出現在這裡。</div>";
            return log.slice(0, 8).map(function (r) {
                return "<div class='flex justify-between items-center text-sm py-1.5 border-b border-gray-100'>" +
                    "<span class='truncate' style='max-width:60%;'>" + escapeHtml(r.title || '練習卷') + "</span>" +
                    "<span class='font-bold' style='color:var(--hl-blue);'>" + r.score + " 分</span>" +
                    "<span class='text-xs text-gray-400'>" + new Date(r.at).toLocaleDateString() + "</span></div>";
            }).join('');
        }

        function savePracticeLog(title, score) {
            let log = [];
            try { log = JSON.parse(localStorage.getItem(PRACTICE_LOG_KEY) || '[]'); } catch (e) {}
            log.unshift({ title: title, score: score, at: Date.now() });
            localStorage.setItem(PRACTICE_LOG_KEY, JSON.stringify(log.slice(0, 30)));
        }

        // 進場頁的 LINE ID：點一下複製，複製不到（舊瀏覽器/非 https）就整段選起來讓使用者自己複製
        function copyLineId(btnEl) {
            const id = btnEl.textContent.trim();
            const done = function () {
                const original = btnEl.textContent;
                btnEl.classList.add('is-copied');
                btnEl.textContent = '已複製 ✓';
                setTimeout(function () { btnEl.textContent = original; btnEl.classList.remove('is-copied'); }, 1600);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(id).then(done).catch(function () { selectElementText(btnEl); });
            } else {
                selectElementText(btnEl);
            }
        }
        function selectElementText(el) {
            try {
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (e) {}
        }

        function studentLeaveHome() {
            localStorage.removeItem(STUDENT_PROFILE_KEY);
            location.href = location.origin + location.pathname;
        }

        // 學生首頁的登出：session token 與這台裝置的學生資料一起清掉，再回到進場頁。
        // 不能只呼叫 doLogout()——那只更新出題工具那邊的帳號列，學生首頁會停在原畫面看起來沒登出。
        function studentLogout() {
            if (!confirm('要登出嗎？登出後要重新輸入帳號密碼才能看到跨裝置的練習紀錄。')) return;
            localStorage.removeItem('lun_session_token');
            localStorage.removeItem(STUDENT_PROFILE_KEY);
            window.currentUser = null;
            location.href = location.origin + location.pathname;
        }

        async function joinByCode(btnEl) {
            const raw = (document.getElementById('joinCodeInput').value || '').replace(/[^0-9]/g, '');
            if (raw.length !== 6) { alert('請輸入老師給的 6 位數代碼'); return; }
            const original = btnEl ? btnEl.innerHTML : '';
            if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '⏳'; }
            try {
                const res = await fetch(API_BASE + "/api/code/" + raw);
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                location.href = location.origin + location.pathname + "?share=" + data.shareId + "&mode=student";
            } catch (e) {
                alert('進入失敗：' + e.message);
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = original; }
            }
        }

        function joinByLink() {
            const raw = (document.getElementById('joinLinkInput').value || '').trim();
            if (!raw) return;
            let target;
            try { target = new URL(raw, location.href); } catch (e) { alert('連結格式看起來不對，請整條複製貼上'); return; }
            if (!target.searchParams.get('share')) { alert('這不是測驗連結（網址裡要有 share=）'); return; }
            location.href = target.href;
        }

        // 學生自主練習：把簡化的選項塞進既有出題表單再走同一套出題流程，
        // 不另外寫一份出題邏輯(冷卻、Key池、批次重試那些都直接沿用)
        function startPractice(btnEl) {
            const u = window.currentUser;
            const prof = getStudentProfile() || {};
            const grade = document.getElementById('practiceGrade').value;
            const subject = document.getElementById('practiceSubject').value;
            const scope = (document.getElementById('practiceScope').value || '').trim() || '綜合練習';
            const count = document.getElementById('practiceCount').value;
            const diff = document.getElementById('practiceDiff').value;

            // 這裡是把學生首頁的選擇「灌進老師那張表單」再送出。
            // 坑：<select> 設一個不在 option 清單裡的值會靜靜變成空字串，startGen 只會跳
            // 「請設定【題型】」這種看不出原因的錯誤（題型曾經寫成 '單選題'，但選項其實叫「全部單選題」）。
            // 改成設不進去就退回該欄位的「自定義」輸入框，學生首頁的選項就不必跟老師表單的清單綁死。
            const set = function (id, val) { const el = document.getElementById(id); if (el) el.value = val; };
            const setSelect = function (id, val, customId) {
                const el = document.getElementById(id);
                if (!el) return;
                el.value = val;
                if (el.value === val) return;
                const custom = document.getElementById(customId);
                if (custom) { el.value = 'Custom'; custom.value = val; }
            };
            const publisherEl = document.getElementById('practicePublisher');
            const publisher = publisherEl ? publisherEl.value : '';

            set('sourceType', '1');
            setSelect('grade', grade, 'c_grade');
            set('subject', subject);
            // 老師表單的版本只有「自由發揮 / 自訂」兩個選項，學生選了版本就走自訂那條
            if (publisher) { setSelect('publisher', publisher, 'c_publisher'); }
            else { set('publisher', '由小綸自由發揮'); }
            set('scope', scope);
            setSelect('count', count, 'c_count');
            setSelect('qType', '全部單選題', 'c_qType');
            setSelect('difficulty', diff, 'c_diff');

            // 出題完成後直接進線上作答：學生要的是「寫」，不是看考卷排版
            window.practiceMode = true;
            window.practiceStudentInfo = {
                grade: grade,
                className: u ? (u.className || '') : (prof.className || ''),
                name: u ? u.displayName : (prof.name || '')
            };
            // 不再把老師的出題表單顯示出來（學生會看到一整頁跟他無關的出題參數），
            // 改成蓋一層出題進度；renderPaperFixed() 成功後才會把學生首頁收起來
            showPracticeLoading();
            startGen();
        }

        function renderParentPanel() {
            const box = document.getElementById('parentPanel');
            box.innerHTML = "<div class='lq-card p-5'>" +
                "<div class='font-bold text-lg mb-1'>👨‍👩‍👧 我的孩子</div>" +
                "<div class='text-xs text-gray-500 mb-3'>連結孩子的帳號後，可以即時看到他正在寫哪一題。下方出題工具跟老師版本完全相同，可以自己幫孩子出練習卷。</div>" +
                "<div id='parentPanelChildren' class='mb-3'><div class='text-sm text-gray-400'>⏳ 載入中...</div></div>" +
                "<div class='flex gap-2'><input id='parentPanelChildInput' class='lq-input text-sm' placeholder='孩子的帳號名稱'>" +
                "<button onclick='parentPanelLinkChild(this)' class='lq-btn lq-btn-primary px-4 whitespace-nowrap'>連結</button></div></div>";
            loadParentPanelChildren();
        }

        async function loadParentPanelChildren() {
            const box = document.getElementById('parentPanelChildren');
            if (!box) return;
            const token = localStorage.getItem('lun_session_token') || '';
            try {
                const res = await fetch(API_BASE + "/api/parent/children", { headers: { 'X-Session-Token': token } });
                const data = await res.json();
                const children = data.children || [];
                if (children.length === 0) {
                    box.innerHTML = "<div class='text-sm text-gray-400'>還沒有連結任何孩子帳號，在下面輸入孩子的帳號名稱即可連結。</div>";
                    return;
                }
                box.innerHTML = children.map(function (c) {
                    return "<div class='flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2'>" +
                        "<span class='text-sm font-semibold'>" + escapeHtml(c.displayName) + "（" + escapeHtml(c.username) + "）</span>" +
                        "<button onclick=\"openProctorDetailParent('" + escapeHtml(c.username) + "')\" class='lq-btn lq-btn-primary text-xs px-3 py-1'>🔍 即時監看</button></div>";
                }).join('');
            } catch (e) {
                box.innerHTML = "<div class='text-sm text-red-600'>載入失敗：" + escapeHtml(e.message) + "</div>";
            }
        }

        async function parentPanelLinkChild(btnEl) {
            const studentUsername = (document.getElementById('parentPanelChildInput').value || '').trim();
            if (!studentUsername) return;
            const token = localStorage.getItem('lun_session_token') || '';
            if (btnEl) btnEl.disabled = true;
            try {
                const res = await fetch(API_BASE + "/api/parent/link-child", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ studentUsername: studentUsername })
                });
                const data = await res.json();
                if (data.error) { alert(data.error.message); return; }
                document.getElementById('parentPanelChildInput').value = '';
                loadParentPanelChildren();
            } catch (e) {
                alert('連結失敗：' + e.message);
            } finally {
                if (btnEl) btnEl.disabled = false;
            }
        }

        // ---- 全域「返回上一頁」----
        // 有瀏覽歷史就退回上一頁；沒有(例如別人直接把分享連結貼給你、這是分頁的第一頁)
        // 就回到這個站的首頁，不要讓使用者卡在單一畫面沒有出口
        // 這個站切畫面是「顯示/隱藏 div」，從頭到尾沒有寫進瀏覽器歷史，
        // 所以原本的 history.back() 退的是「進站前那一頁」——按下去直接離開網站(Steve回報)。
        // 改成照目前顯示中的畫面決定上一步，不碰瀏覽器歷史。
        function isViewVisible(el) {
            return !!el && !el.classList.contains('hidden') && el.style.display !== 'none';
        }

        function goBackOrHome() {
            const splash = document.getElementById('hlSplash');
            const studentHome = document.getElementById('studentHome');
            const inputForm = document.getElementById('inputForm');
            const resultSection = document.getElementById('resultSection');

            // 分享連結／即時監看連結開的分頁：站內沒有上一步(網址本身就是入口)，回站台首頁
            if (window.isSharedView || location.search) {
                location.href = location.origin + location.pathname;
                return;
            }

            if (isViewVisible(resultSection)) {
                // 題目還留在 window.currentItems 與出題紀錄裡，這裡只是把畫面收起來
                resultSection.classList.add('hidden');
                if (window.practiceMode && studentHome) {
                    studentHome.classList.remove('hidden');
                    renderStudentHome();
                } else if (inputForm) {
                    inputForm.classList.remove('hidden');
                }
                window.scrollTo(0, 0);
                updateGlobalBackBtn();
                return;
            }

            // 學生首頁／出題設定頁的上一步都是進場頁的身分選擇
            if (isViewVisible(studentHome) || isViewVisible(inputForm)) {
                if (studentHome) studentHome.classList.add('hidden');
                if (inputForm) inputForm.classList.add('hidden');
                if (splash) splash.style.display = '';
                splashBackToIdentity();
                window.scrollTo(0, 0);
                updateGlobalBackBtn();
                return;
            }

            location.href = location.origin + location.pathname;
        }

        function updateGlobalBackBtn() {
            const btn = document.getElementById('btnGlobalBack');
            if (!btn) return;
            const splash = document.getElementById('hlSplash');
            const splashVisible = splash && splash.style.display !== 'none' && getComputedStyle(splash).display !== 'none';
            // 進場頁是起點；出題設定頁與學生首頁各自是該身分的主畫面，
            // 上方本來就有「換身分／登出」可以離開，不再多一顆返回鈕
            const onHome = isViewVisible(document.getElementById('inputForm'))
                || isViewVisible(document.getElementById('studentHome'));
            btn.classList.toggle('hidden', splashVisible || onHome);
        }

        document.addEventListener('DOMContentLoaded', function() {
            const obs = new MutationObserver(updateGlobalBackBtn);
            ['inputForm', 'studentHome', 'resultSection'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
            });
            const splash = document.getElementById('hlSplash');
            if (splash) obs.observe(splash, { attributes: true, attributeFilter: ['class', 'style'] });
            updateGlobalBackBtn();
        });

        // 儀表板連結：帶上金鑰才不用登入/密碼。沒拿到金鑰(舊分享)就退回原本要密碼的連結
        function liveDashboardUrl(shareId) {
            const base = location.origin + location.pathname + "?live=" + shareId;
            return window.lastShareDashKey ? (base + "&k=" + window.lastShareDashKey) : base;
        }

        // ---- 「直接線上測驗」身分選擇 ----
        // 同一顆按鈕三種身分做的事完全不同：學生是自己作答，家長/老師是「看別人作答」，
        // 所以先問身分再分流，不要讓家長/老師點進去變成自己在寫考卷。
        function openQuizEntryModal() {
            if (!window.currentItems || window.currentItems.length === 0) {
                alert('目前沒有題目可以線上作答');
                return;
            }
            document.getElementById('quizEntryModal').classList.remove('hidden');
            renderQuizEntryRoleChoice();
        }

        function closeQuizEntryModal() {
            document.getElementById('quizEntryModal').classList.add('hidden');
        }

        function renderQuizEntryRoleChoice() {
            document.getElementById('quizEntryTitle').textContent = '📱 你是哪一種身分？';
            document.getElementById('quizEntryBody').innerHTML =
                "<div class='space-y-3'>" +
                "<button onclick='quizEntryAsStudent(this)' class='lq-btn lq-btn-primary w-full py-3 text-left px-4'>" +
                    "<div class='font-bold'>🎒 我是學生</div>" +
                    "<div class='text-xs opacity-80'>直接開始線上作答，答完自動評分</div></button>" +
                "<button onclick='quizEntryAsParent()' class='lq-btn lq-btn-secondary w-full py-3 text-left px-4'>" +
                    "<div class='font-bold'>👨‍👩‍👧 我是家長</div>" +
                    "<div class='text-xs opacity-80'>用孩子傳來的監看連結，或登入家長帳號選孩子</div></button>" +
                "<button onclick='quizEntryAsTeacher(this)' class='lq-btn lq-btn-secondary w-full py-3 text-left px-4'>" +
                    "<div class='font-bold'>🧑‍🏫 我是老師</div>" +
                    "<div class='text-xs opacity-80'>開這份測驗的即時進度儀表板，看全班誰寫到哪一題（免登入）</div></button>" +
                "</div>";
        }

        function quizEntryAsStudent(btnEl) {
            closeQuizEntryModal();
            // window.open必須在這次點擊的同步流程內呼叫，所以直接把這顆按鈕交給既有流程
            openAnswerModeNewTab(btnEl);
        }

        // 家長免登入路徑：孩子在作答頁按「分享即時監看連結給家長」，把連結貼進來就能看，
        // 不用註冊帳號。登入家長帳號是加值版(一次管多個孩子、不必每次重貼連結)
        function renderQuizEntryParentNoLogin(hint) {
            document.getElementById('quizEntryBody').innerHTML =
                "<div class='space-y-3'>" +
                (hint ? "<div class='lq-card p-3 text-sm'>" + escapeHtml(hint) + "</div>" : "") +
                "<div class='lq-card p-3'>" +
                    "<div class='text-sm font-semibold mb-2'>方式一：貼上孩子傳來的監看連結（免登入）</div>" +
                    "<input id='quizEntryParentLink' class='lq-input w-full mb-2' placeholder='https://.../?live=...&student=...'>" +
                    "<button onclick='quizEntryOpenParentLink()' class='lq-btn lq-btn-primary w-full py-2'>👀 開始監看</button>" +
                    "<div class='text-xs text-gray-400 mt-2'>孩子作答頁上的「📤 分享即時監看連結給家長」按鈕會產生這條連結。</div>" +
                "</div>" +
                "<div class='lq-card p-3'>" +
                    "<div class='text-sm font-semibold mb-2'>方式二：登入家長帳號</div>" +
                    "<div class='text-xs text-gray-400 mb-2'>連結過孩子的帳號後，之後不用每次重貼連結，直接選孩子就好。</div>" +
                    "<button onclick=\"closeQuizEntryModal(); openAccountModal();\" class='lq-btn lq-btn-secondary w-full py-2'>🔑 登入／註冊家長帳號</button>" +
                "</div>" +
                "<button onclick='renderQuizEntryRoleChoice()' class='lq-btn lq-btn-ghost w-full py-2'>← 重選身分</button>" +
                "</div>";
        }

        function quizEntryOpenParentLink() {
            const raw = (document.getElementById('quizEntryParentLink').value || '').trim();
            if (!raw) return;
            let u;
            try { u = new URL(raw, location.href); } catch (e) { alert('連結格式看起來不對，請整條複製貼上'); return; }
            if (!u.searchParams.get('live')) { alert('這不是即時監看連結（網址裡要有 live=）'); return; }
            window.open(u.href, '_blank');
        }

        async function quizEntryAsParent() {
            document.getElementById('quizEntryTitle').textContent = '👨‍👩‍👧 監看孩子作答';
            const u = window.currentUser;
            if (!u) {
                renderQuizEntryParentNoLogin('');
                return;
            }
            if (u.role !== 'parent') {
                renderQuizEntryParentNoLogin('目前登入的是「' + (u.displayName || u.username) + '」，不是家長帳號。可以直接貼孩子傳來的連結，或改用家長帳號登入。');
                return;
            }
            const body = document.getElementById('quizEntryBody');
            body.innerHTML = "<div class='text-center text-gray-500 py-6'>⏳ 載入已連結的孩子...</div>";
            const token = localStorage.getItem('lun_session_token') || '';
            try {
                const res = await fetch(API_BASE + "/api/parent/children", { headers: { 'X-Session-Token': token } });
                const data = await res.json();
                const children = data.children || [];
                if (children.length === 0) {
                    renderQuizEntryParentNoLogin('這個家長帳號還沒連結任何孩子。可以先貼孩子傳來的連結，或到「我的帳號」輸入孩子的帳號名稱完成連結。');
                    return;
                }
                body.innerHTML = "<div class='space-y-2'>" +
                    children.map(c =>
                        "<button onclick=\"closeQuizEntryModal(); openProctorDetailParent('" + escapeHtml(c.username) + "')\" class='lq-btn lq-btn-primary w-full py-3 text-left px-4'>" +
                        "<div class='font-bold'>🔍 " + escapeHtml(c.displayName) + "</div>" +
                        "<div class='text-xs opacity-80'>帳號：" + escapeHtml(c.username) + "</div></button>"
                    ).join('') +
                    "<div class='text-xs text-gray-400 pt-1'>孩子要用自己的帳號登入後作答，這裡才看得到即時內容。</div>" +
                    "<button onclick='renderQuizEntryRoleChoice()' class='lq-btn lq-btn-ghost w-full py-2'>← 重選身分</button></div>";
            } catch (e) {
                body.innerHTML = "<div class='text-center text-red-600 py-6'>載入失敗：" + escapeHtml(e.message) + "</div>";
            }
        }

        async function quizEntryAsTeacher(btnEl) {
            document.getElementById('quizEntryTitle').textContent = '🧑‍🏫 全班即時進度';
            // 免登入：儀表板連結會帶一把只有出題端拿得到的金鑰(?k=)，學生手上的作答連結沒有這把key
            const newTab = window.open('', '_blank');
            if (newTab) newTab.document.write('<p style="font-family:sans-serif;padding:2rem;">⏳ 準備即時進度儀表板...</p>');
            const body = document.getElementById('quizEntryBody');
            body.innerHTML = "<div class='text-center text-gray-500 py-6'>⏳ 準備即時進度儀表板...</div>";
            try {
                const shareId = await getOrCreateShareId();
                const url = liveDashboardUrl(shareId);
                if (newTab) newTab.location.href = url; else window.open(url, '_blank');
                body.innerHTML = "<div class='space-y-3'>" +
                    "<div class='lq-card p-3 text-sm'>已在新分頁開啟即時進度儀表板（免登入，不用管理者密碼）。學生要用「發送測驗」裡的學生作答連結或測驗代碼進到同一份測驗作答，儀表板才會出現他們的進度。<br><b>這條網址等於監看權限，不要轉貼給學生。</b></div>" +
                    "<button onclick='renderQuizEntryRoleChoice()' class='lq-btn lq-btn-ghost w-full py-2'>← 重選身分</button></div>";
            } catch (e) {
                if (newTab) newTab.close();
                body.innerHTML = "<div class='text-center text-red-600 py-6'>開啟失敗：" + escapeHtml(e.message) + "</div>";
            }
        }

        // 同一份題目(window.currentItems)重複分享(學生連結/家長連結/即時進度儀表板)要共用同一個shareId，
        // 這樣即時進度儀表板才能跟真正分享給學生的那個連結對上號。用currentItems的參考位址判斷是不是同一份，
        // 換題目(重新出題)後currentItems會變成新陣列，快取自然失效，下次分享會產生新的shareId
        async function getOrCreateShareId() {
            if (window.lastShareId && window.lastShareItemsRef === window.currentItems) {
                return window.lastShareId;
            }
            const title = window.docTitle || '測驗';
            const res = await fetch(API_BASE + "/api/share", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: window.currentItems, title })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            window.lastShareId = data.id;
            // 儀表板金鑰：只有出題這一端拿得到，老師不登入也能看全班進度；學生手上的作答連結沒有這把key
            window.lastShareDashKey = data.dashKey || '';
            window.lastShareItemsRef = window.currentItems;
            return data.id;
        }

