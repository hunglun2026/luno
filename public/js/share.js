// Luno 綸諾｜分享、發送測驗、即時進度儀表板、作答結果連結。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 分享題目(給學生線上作答) / 分享答案(給家長查看) ---
        // 老師常常一次出好幾份測驗、對每份都各分享學生/家長連結，光看網址完全分不出誰是誰，
        // 所以複製到剪貼簿的內容前面固定加上「【題目名稱】連結類型」，貼到LINE/Email時對方也看得出這是哪份測驗的連結
        // 分享出去的連結會佔用伺服器儲存(KV)、也可能被大量產生，所以限定登入使用者才能用。
        // 未登入者仍可自己出題、下載、預覽線上作答，只是不能發連結給別人
        function requireLoginForShare() {
            const u = window.currentUser;
            if (u && u.role === 'student') {
                lqAlert('分享測驗連結是老師／家長的功能喔。你可以把練習卷下載成 PDF 或 Word 自己印出來。');
                return false;
            }
            if (u) return true;
            lqAlert('🔒 分享功能需要登入帳號才能使用。\n\n登入後可以分享學生作答連結、家長答案連結，以及全班即時進度儀表板。');
            openAccountModal();
            return false;
        }

        // 課堂上報一組6位數字比貼網址快：學生在首頁輸入就直接進到這份測驗。
        // 代碼本身由 openSendQuizModal() 產生，這裡只負責投影用的大字視窗。
        function showQuizCodeModal(code) {
            const modal = document.getElementById('quizCodeModal');
            document.getElementById('quizCodeValue').textContent = String(code).replace(/(\d{3})(\d{3})/, '$1 $2');
            modal.classList.remove('hidden');
            navigator.clipboard.writeText(String(code)).catch(function () {});
        }

        function closeQuizCodeModal() {
            document.getElementById('quizCodeModal').classList.add('hidden');
        }

        // --- 發送測驗（單一出口）---
        // 老師分不出「學生作答連結／家長答案連結／測驗代碼／即時進度儀表板」哪個是哪個，
        // 所以不再要他先選；按一次就把四種出口一起產好攤在同一個視窗裡，各自附上「什麼時候用」。
        function closeSendQuizModal() {
            document.getElementById('sendQuizModal').classList.add('hidden');
        }

        // 工具列「即時監看」：不用先開發送視窗，直接開全班進度儀表板（沒發過就先建立分享，跟發送測驗共用同一個 shareId）。
        // 先同步開空白分頁再填網址，不然等網路回來才開會被瀏覽器當成彈出視窗擋掉。
        async function openLiveMonitor() {
            if (!window.currentItems || window.currentItems.length === 0) {
                lqAlert('目前沒有題目可以監看');
                return;
            }
            const newTab = window.open('', '_blank');
            if (newTab) newTab.document.write('<p style="font-family:sans-serif;padding:2rem;">⏳ 準備即時監看...</p>');
            try {
                const shareId = await getOrCreateShareId();
                // 題目或作答方式改過就會產生新的一份測驗：之前發給學生的代碼與連結還指向舊的一份，
                // 這個監看看不到那些學生，所以要明講（以前悄悄換掉，老師只覺得「沒反應」）
                const sent = window._sendQuizLinks && window._sendQuizLinks.shareId;
                if (sent && sent !== shareId) {
                    lqAlert('你發出代碼或連結之後，題目或作答方式有改過，這裡監看的是新的一份。請按「發送給學生」重新發一次，學生用新代碼進來才看得到。');
                }
                const url = liveDashboardUrl(shareId);
                if (newTab) newTab.location.href = url; else window.open(url, '_blank');
            } catch (e) {
                if (newTab) newTab.close();
                lqAlert('開啟即時監看失敗：' + e.message);
            }
        }

        async function openSendQuizModal() {
            if (!requireLoginForShare()) return;
            if (!window.currentItems || window.currentItems.length === 0) {
                lqAlert('目前沒有題目可以發送');
                return;
            }
            const modal = document.getElementById('sendQuizModal');
            const body = document.getElementById('sendQuizBody');
            body.innerHTML = "<div class='text-center text-gray-500 py-10'>⏳ 產生連結與代碼中...</div>";
            modal.classList.remove('hidden');

            try {
                const shareId = await getOrCreateShareId();
                const base = location.origin + location.pathname;
                const studentUrl = base + "?share=" + shareId + "&mode=student";
                const parentUrl = base + "?share=" + shareId + "&mode=key";
                const dashUrl = liveDashboardUrl(shareId);

                // 代碼要登入才產得出來，失敗不影響其他三個出口，所以單獨 try
                let code = '';
                try {
                    const res = await fetch(API_BASE + "/api/code", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Session-Token': lqGetToken() || '' },
                        body: JSON.stringify({ shareId: shareId })
                    });
                    const data = await res.json();
                    if (!data.error) code = String(data.code || '');
                } catch (e) {}

                window._sendQuizLinks = { shareId: shareId, code: code, student: studentUrl, parent: parentUrl, dash: dashUrl, title: window.docTitle || '測驗' };

                // 三個情境頁籤（2026-11-05）：傳給學生／課堂投影／家長與老師，一次只看一種，不再堆四個出口
                let cardHtml = "";
                if (code) {
                    cardHtml += "<div class='lq-card p-4 text-center mb-4' style='border:2px solid var(--hl-blue);'>" +
                        "<div class='text-xs text-gray-500 mb-1'>課堂上最快的方式：報這組代碼。學生打開刻度（" + escapeHtml(location.host) + "）→ 按「學生」→ 輸入代碼，就進得去，不用登入</div>" +
                        "<div class='font-black' style='font-size:2.6rem; letter-spacing:0.15em; color:var(--hl-blue);'>" + escapeHtml(code.replace(/(\d{3})(\d{3})/, '$1 $2')) + "</div>" +
                        "<div class='flex gap-2 justify-center mt-3'>" +
                        "<button onclick=\"copySendQuizItem('code', this)\" class='lq-btn lq-btn-primary text-sm px-3 py-1.5'>複製代碼</button>" +
                        "<button onclick=\"showQuizCodeModal(window._sendQuizLinks.code)\" class='lq-btn lq-btn-secondary text-sm px-3 py-1.5'>投影大字</button>" +
                        "</div></div>";
                }
                const panes = {
                    student: "<div class='lq-card p-3 mb-3 text-sm' style='line-height:1.7;'><b>學生會這樣考（不用登入）</b><br>點開連結 → 填姓名座號（可以不填）→ 按「開始測驗」→ 寫完按「交卷看成績」，馬上看到分數與解析。</div>" + "<button onclick=\"copySendQuizItem('notice', this)\" class='lq-btn lq-btn-primary w-full py-3 mb-3 font-bold'>📋 複製班級公告（含代碼與連結）</button>" + "<div class='mb-3'></div>" + sendQuizRow('student', '🎓 學生作答連結', '傳給學生（LINE／Google Classroom）。開啟直接線上作答＋自動評分。適合練習與平時小考，不適合正式考試（會用開發者工具的學生查得到答案）。'),
                    class: cardHtml || "<div class='lq-card p-4 text-sm text-gray-500'>這次沒有產生測驗代碼（需要登入），請改用「傳給學生」的連結。</div>",
                    adult: sendQuizRow('parent', '👨‍👩‍👧 家長答案連結', '傳給家長。可以看題目、答案與解析，唯讀不能改。') + sendQuizRow('dash', '📊 老師即時進度儀表板', '你自己留著。開啟不用登入就能看全班進度，所以<b class="text-red-600">不要轉給學生或貼到班級群組</b>。')
                };
                const tabs = [['student', '🎓 傳給學生'], ['class', '🖥️ 課堂投影'], ['adult', '👨‍👩‍👧 家長老師']];
                let html = "<div class='lq-send-tabs' role='tablist'>" + tabs.map(function (t, i) {
                    return "<button type='button' role='tab' class='lq-send-tab" + (i === 0 ? " is-on" : "") + "' data-tab='" + t[0] + "' onclick=\"sendQuizTab('" + t[0] + "')\">" + t[1] + "</button>";
                }).join('') + "</div>";
                tabs.forEach(function (t, i) {
                    html += "<div class='lq-send-pane" + (i === 0 ? "" : " hidden") + "' data-pane='" + t[0] + "'>" + panes[t[0]] + "</div>";
                });

                html += "<div class='text-xs text-gray-400 mt-4 text-center'>以上連結與代碼 30 天內有效，指向同一份測驗。</div>";
                body.innerHTML = html;
            } catch (e) {
                body.innerHTML = "<div class='text-center text-red-600 py-8'>產生失敗：" + escapeHtml(e.message) + "</div>";
            }
        }

        function sendQuizTab(k) {
            document.querySelectorAll('#sendQuizBody .lq-send-tab').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === k); });
            document.querySelectorAll('#sendQuizBody .lq-send-pane').forEach(function (p) { p.classList.toggle('hidden', p.dataset.pane !== k); });
        }

        function sendQuizRow(key, title, desc) {
            return "<div class='lq-card p-3 mb-3'>" +
                "<div class='font-bold text-sm mb-1'>" + title + "</div>" +
                "<div class='text-xs text-gray-500 mb-2'>" + desc + "</div>" +
                "<div class='flex gap-2'>" +
                "<button onclick=\"copySendQuizItem('" + key + "', this)\" class='lq-btn lq-btn-secondary text-sm px-3 py-1.5 flex-1'>複製連結</button>" +
                (key === 'dash' ? "<button onclick=\"window.open(window._sendQuizLinks.dash,'_blank')\" class='lq-btn lq-btn-primary text-sm px-3 py-1.5'>直接開啟</button>" : "") +
                "</div></div>";
        }

        async function copySendQuizItem(key, btnEl) {
            const L = window._sendQuizLinks || {};
            // 剪貼簿內容前面固定加題目名稱：老師一次出好幾份時，光看網址完全分不出誰是誰
            const labels = { code: '測驗代碼', student: '學生作答連結', parent: '家長答案連結', dash: '即時進度儀表板(老師用，勿外流)' };
            if (key === 'notice') {
                const c = L.code ? L.code.replace(/(\d{3})(\d{3})/, '$1 $2') : '';
                // 2026-11-11：學生看公告要一眼知道怎麼做。最簡單是點連結（不用登入）；代碼是備案（打開刻度、按學生、輸入）
                const site = location.origin + "/";
                const notice = "【" + L.title + "】線上測驗開始囉！\n\n" +
                    "👉 最簡單：直接點連結，不用登入就能作答\n" + L.student + "\n" +
                    (c ? "\n或是用代碼：打開 " + site + " → 按「學生」→ 輸入代碼 " + c + "\n" : "") +
                    "\n寫完按「交卷看成績」，會自動評分。加油！";
                try {
                    await navigator.clipboard.writeText(notice);
                    if (btnEl) { const o = btnEl.textContent; btnEl.textContent = '✅ 已複製，可以貼到班級群組'; setTimeout(function () { btnEl.textContent = o; }, 2000); }
                } catch (e) { await askText('複製失敗，請手動複製以下內容：', { value: notice, readonly: true }); }
                return;
            }
            const value = L[key] || '';
            if (!value) return;
            let text = key === 'code' ? value : "【" + L.title + "】" + labels[key] + "\n" + value;
            // 學生連結單獨貼出去時，要讓學生知道點了會發生什麼事
            if (key === 'student') text = "【" + L.title + "】線上測驗\n點開連結就能作答，不用登入：\n" + value + "\n寫完按「交卷看成績」，會自動評分。";
            const original = btnEl ? btnEl.textContent : '';
            try {
                await navigator.clipboard.writeText(text);
                if (btnEl) { btnEl.textContent = '✅ 已複製'; setTimeout(function () { btnEl.textContent = original; }, 1600); }
            } catch (e) {
                await askText('複製失敗，請手動複製以下內容：', { value: text, readonly: true });
            }
        }

        async function loadSharedQuizIfAny() {
            const params = new URLSearchParams(location.search);
            const shareId = params.get('share');
            if (!shareId) return false;

            window.isSharedView = true;
            window.sharedMode = params.get('mode') === 'key' ? 'key' : 'student';
            window.liveShareId = shareId;

            document.getElementById('inputForm').classList.add('hidden');
            document.getElementById('resultSection').classList.remove('hidden');
            document.getElementById('paperContainer').innerHTML = "<div class='text-center text-white py-20 text-lg'>⏳ 載入題目中...</div>";

            try {
                const res = await fetch(API_BASE + "/api/share/" + encodeURIComponent(shareId));
                const data = await res.json();
                if (data.error) throw new Error(data.error.message);

                window.currentItems = mathClean(data.items);
                window.sharedGradeMode = data.mode === 'instant' ? 'instant' : 'batch';   // 老師設定的作答方式，學生不能改
                window.currentSettings = { sType: '1' };

                renderPaperFixed(data.items, data.title);
                document.querySelectorAll('#paperContainer [contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

                switchSheet(window.sharedMode === 'student' ? 'answer' : 'key');
                applySharedViewChrome();
            } catch (e) {
                document.getElementById('paperContainer').innerHTML = "<div class='text-center text-white py-20 text-lg'>❌ 載入失敗：" + escapeHtml(e.message) + "</div>";
            }
            return true;
        }

        function applySharedViewChrome() {
            const btnQuiz = document.getElementById('btnQuiz');
            const btnKey = document.getElementById('btnKey');
            const btnAnswerMode = document.getElementById('btnAnswerMode');
            const btnReload = document.getElementById('btnReload');
            const downloadWrap = document.getElementById('downloadMenuWrap');
            const shareBtnsWrap = document.getElementById('shareBtnsWrap');
            const moreWrap = document.getElementById('moreMenuWrap');
            // 提示列原本在工具列裡（.animate-pulse），已搬到試卷正上方；
            // 分享模式借用同一條來說明「你現在看到的是什麼」
            const hintBar = document.getElementById('editHint');
            const hintText = hintBar ? hintBar.querySelector('span') : null;
            const hintClose = hintBar ? hintBar.querySelector('button') : null;

            // 學生／家長從連結進來：不能切換檢視、不能編輯題目（編輯鈕與線上作答鈕只給出題的老師）
            ['btnOnline', 'btnEditItems'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            if (window.sharedMode === 'student') {
                if (btnQuiz) btnQuiz.classList.add('hidden');
                if (btnKey) btnKey.classList.add('hidden');
                if (btnAnswerMode) btnAnswerMode.classList.add('hidden');
                if (hintText) hintText.textContent = "📱 請完成以下題目，作答完按「交卷看成績」";
            } else {
                if (btnAnswerMode) btnAnswerMode.classList.add('hidden');
                if (hintText) hintText.textContent = "👨‍👩‍👧 家長答案檢視（僅供查看，內容不可編輯）";
            }
            // 這條在分享模式是狀態說明不是提示，學生/家長不該關掉它
            if (hintBar) hintBar.classList.remove('hidden');
            if (hintClose) hintClose.classList.add('hidden');
            if (btnReload) btnReload.classList.add('hidden');
            if (downloadWrap) downloadWrap.classList.add('hidden');
            if (shareBtnsWrap) shareBtnsWrap.classList.add('hidden');
            if (moreWrap) moreWrap.classList.add('hidden');
        }

        // --- 即時進度：老師班級儀表板 / 家長單人視角(輪詢,不用WebSocket) ---
        // ?live=shareId(沒有student參數)=老師儀表板(要密碼)；?live=shareId&student=studentId=家長單人視角(不用密碼)
        window.livePollTimer = null;
        async function loadLiveViewIfAny() {
            const params = new URLSearchParams(location.search);
            const liveShareId = params.get('live');
            if (!liveShareId) return false;

            document.getElementById('inputForm').classList.add('hidden');
            document.getElementById('resultSection').classList.remove('hidden');
            const stickyHeader = document.querySelector('.sticky-header');
            if (stickyHeader) stickyHeader.classList.add('hidden');
            const ansContainer = document.getElementById('answerModeContainer');
            if (ansContainer) ansContainer.style.display = 'none';
            const paperContainer = document.getElementById('paperContainer');
            paperContainer.style.display = 'block';

            const studentId = params.get('student');
            if (studentId) {
                renderLiveParentView(liveShareId, studentId);
            } else {
                renderLiveTeacherDashboard(liveShareId);
            }

            // 分頁切到背景時暫停輪詢，省KV讀取額度，切回來才恢復
            document.addEventListener('visibilitychange', () => {
                if (!window.liveViewRefresh) return;
                if (document.hidden) {
                    if (window.livePollTimer) { clearInterval(window.livePollTimer); window.livePollTimer = null; }
                } else if (!window.livePollTimer) {
                    window.liveViewRefresh();
                    window.livePollTimer = setInterval(window.liveViewRefresh, window.livePollIntervalMs || 3000);
                }
            });

            return true;
        }

        // 老師儀表板：需要輸入管理者密碼(沿用既有的admin密碼機制)，每8-10秒輪詢一次列出全班進度
        function renderLiveTeacherDashboard(shareId) {
            const dashKey = new URLSearchParams(location.search).get('k') || '';
            window.currentDashKey = dashKey;
            const container = document.getElementById('paperContainer');
            container.innerHTML = "<div class='max-w-2xl mx-auto p-4'><div class='lq-card p-5 mb-4 text-center'>" +
                "<h2 class='font-bold text-lg mb-1'>📊 即時進度儀表板</h2>" +
                "<p class='text-sm text-gray-500'>每 3 秒自動更新" + (dashKey ? "（這條連結本身就是權限，不用登入）" : "（老師帳號登入即可，未登入才需要管理者密碼）") + "</p>" +
                "<div id='liveCodeBox' class='hidden mt-3 text-sm'></div>" +
                "<button id='btnRevokeDash' onclick='toggleRevokeDashboard()' class='lq-btn lq-btn-secondary text-xs px-3 py-1 mt-3'>⏹ 停止監看（讓這條連結失效）</button>" +
                "</div>" +
                "<div id='liveStatsBody'></div>" +
                "<div id='liveDashboardBody'><div class='text-center text-white py-10'>⏳ 載入中...</div></div></div>";

            liveShowQuizCode(shareId);
            window.livePollIntervalMs = 3000;
            window.liveViewRefresh = async function() {
                const body = document.getElementById('liveDashboardBody');
                // 授權優先序：連結金鑰(免登入) → 老師帳號的session token → 管理者密碼(沒有前兩者時才問)
                const sessionToken = lqGetToken() || '';
                let adminPass = sessionStorage.getItem('linquiz_admin') || '';
                if (!dashKey && (!sessionToken || window.__liveNeedAdminPass) && !adminPass) {
                    adminPass = (await askText('請輸入管理者密碼以查看班級即時進度：', { secret: true })) || '';
                    sessionStorage.setItem('linquiz_admin', adminPass);
                }
                try {
                    const headers = {};
                    if (dashKey) headers['X-Dash-Key'] = dashKey;
                    if (sessionToken) headers['X-Session-Token'] = sessionToken;
                    if (adminPass) headers['X-Admin-Pass'] = adminPass;
                    const res = await fetch(API_BASE + "/api/live-progress/" + encodeURIComponent(shareId), { headers });
                    const data = await res.json();
                    if (data.error) {
                        if (res.status === 401) {
                            // 登入的不是老師帳號(或密碼錯)：清掉錯的密碼，下一輪改回用密碼流程重問一次
                            sessionStorage.removeItem('linquiz_admin');
                            window.__liveNeedAdminPass = true;
                        }
                        if (res.status === 403 && window.livePollTimer) {
                            // 已被停止監看，不用再一直輪詢
                            clearInterval(window.livePollTimer); window.livePollTimer = null;
                        }
                        body.innerHTML = "<div class='lq-card p-4 text-center text-red-600'>" + escapeHtml(data.error.message) + "</div>";
                        return;
                    }
                    renderLiveDashboardTable(body, data.students || [], shareId);
                    liveRefreshStats(shareId, headers);   // 全班答題分析（每 10 秒最多更新一次）
                } catch (e) {
                    body.innerHTML = "<div class='lq-card p-4 text-center text-red-600'>載入失敗：" + escapeHtml(e.message) + "</div>";
                }
            };
            window.liveViewRefresh();
            window.livePollTimer = setInterval(window.liveViewRefresh, window.livePollIntervalMs);
        }

        // 監看頁顯示測驗代碼＋複製鈕：代碼要登入才產得出來，沒登入（用金鑰連結進來）就不顯示
        async function liveShowQuizCode(shareId) {
            const token = lqGetToken() || '';
            const box = document.getElementById('liveCodeBox');
            if (!token || !box) return;
            try {
                const res = await fetch(API_BASE + "/api/code", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
                    body: JSON.stringify({ shareId: shareId })
                });
                const data = await res.json();
                if (data.error || !data.code) return;
                const code = String(data.code);
                box.innerHTML = "測驗代碼：<b class='text-lg tracking-widest'>" + escapeHtml(code.replace(/(\d{3})(\d{3})/, '$1 $2')) + "</b> " +
                    "<button onclick=\"navigator.clipboard.writeText(" + jsArg(code) + ").then(function(){lqAlert('已複製代碼');})\" class='lq-btn lq-btn-secondary text-xs px-2 py-1 ml-1'>複製代碼</button>";
                box.classList.remove('hidden');
            } catch (e) {}
        }

        function renderLiveDashboardTable(body, students, shareId) {
            if (students.length === 0) {
                body.innerHTML = "<div class='lq-card p-4 text-center text-gray-500'>" +
                    "<img src='assets/illust/waiting-students.webp' alt='' class='lq-illust' style='max-width:15rem' width='640' height='480' loading='lazy'>" +
                    "還沒有學生進來。學生一點開連結或輸入代碼進來，就會出現在這裡。<br>若學生已經進去了還是空的：請確認他用的是「發送給學生」視窗現在顯示的代碼或連結（改過題目或作答方式後要重新發送）</div>";
                return;
            }
            students.sort((a, b) => (b.answered || 0) - (a.answered || 0));
            let html = "";
            students.forEach(s => {
                const total = Number(s.total) || 0;
                const answered = Number(s.answered) || 0;
                const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
                const infoParts = [s.grade, s.className, s.seat ? ('座號' + s.seat) : '', s.name].filter(Boolean);
                const infoLine = infoParts.length > 0 ? infoParts.map(escapeHtml).join('・') : '（剛進來，還沒輸入名字）';
                html += "<div class='lq-card p-3 mb-2'>" +
                    "<div class='flex items-center justify-between mb-1'><span class='font-semibold text-sm'>" + infoLine + "</span>" +
                    "<button onclick=\"openProctorDetailTeacher(" + jsArg(shareId) + "," + jsArg(s.studentId) + ")\" class='lq-btn lq-btn-secondary text-xs px-2 py-1'>🔍 查看詳情</button></div>" +
                    "<div class='flex items-center justify-between mb-1'><span class='text-xs text-gray-400'>" + (answered === 0 ? "已加入，還沒答題　" : "") + answered + " / " + total + " 題</span></div>" +
                    "<div class='h-2 w-full bg-gray-200 rounded-full overflow-hidden'><div class='progress-bar' style='width:" + pct + "%;height:100%;'></div></div>" +
                    "</div>";
            });
            body.innerHTML = html;
        }

        // 老師在儀表板上「停止監看」：把這條免登入金鑰連結作廢(可再按一次恢復)。
        // 用途是考完/課後不希望連結還一直能看，或連結不小心外流
        window.dashRevoked = false;
        async function toggleRevokeDashboard() {
            const shareId = new URLSearchParams(location.search).get('live') || '';
            const key = window.currentDashKey || '';
            const btn = document.getElementById('btnRevokeDash');
            const next = !window.dashRevoked;
            if (btn) { btn.disabled = true; }
            try {
                // 金鑰(免登入老師)或老師/管理員帳號都可以停，帶哪個有就送哪個
                const headers = { 'Content-Type': 'application/json' };
                if (key) headers['X-Dash-Key'] = key;
                const token = lqGetToken() || '';
                if (token) headers['X-Session-Token'] = token;
                const res = await fetch(API_BASE + "/api/live-revoke", {
                    method: 'POST', headers,
                    body: JSON.stringify({ shareId, revoked: next })
                });
                if (!res.ok && res.status === 404) { lqAlert('這個功能需要後端更新後才能使用，請稍後再試。'); return; }
                const data = await res.json();
                if (data.error) { lqAlert(data.error.message); return; }
                window.dashRevoked = next;
                if (btn) btn.innerHTML = next ? '▶️ 恢復監看（讓連結重新可用）' : '⏹ 停止監看（讓這條連結失效）';
                if (next) {
                    if (window.livePollTimer) { clearInterval(window.livePollTimer); window.livePollTimer = null; }
                    document.getElementById('liveDashboardBody').innerHTML =
                        "<div class='lq-card p-4 text-center text-gray-500'>已停止監看，這條連結目前失效中（你自己這一頁按「恢復監看」即可重新開啟）</div>";
                } else {
                    window.liveViewRefresh();
                    if (!window.livePollTimer) window.livePollTimer = setInterval(window.liveViewRefresh, window.livePollIntervalMs || 3000);
                }
            } catch (e) {
                lqAlert('操作失敗：' + e.message);
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        // 家長單人視角：不用密碼(跟其他分享連結一樣是capability-URL哲學)，每6-8秒輪詢一次
        function renderLiveParentView(shareId, studentId) {
            const container = document.getElementById('paperContainer');
            container.innerHTML = "<div class='max-w-lg mx-auto p-4'><div id='liveParentBody'><div class='text-center text-white py-10'>⏳ 載入中...</div></div></div>";

            window.livePollIntervalMs = 3000;
            window.liveViewRefresh = async function() {
                const body = document.getElementById('liveParentBody');
                try {
                    const res = await fetch(API_BASE + "/api/live-progress/" + encodeURIComponent(shareId) + "/" + encodeURIComponent(studentId));
                    const data = await res.json();
                    if (data.error) {
                        if (res.status === 403 && window.livePollTimer) { clearInterval(window.livePollTimer); window.livePollTimer = null; }
                        body.innerHTML = "<div class='lq-card p-5 text-center text-gray-500'>" + escapeHtml(data.error.message) + "</div>";
                        return;
                    }
                    const total = Number(data.total) || 0;
                    const answered = Number(data.answered) || 0;
                    const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
                    const s = data.studentInfo || {};
                    const infoParts = [s.grade, s.className, s.seat ? ('座號' + s.seat) : '', s.name].filter(Boolean);
                    const infoLine = infoParts.length > 0 ? infoParts.map(escapeHtml).join('・') : '（剛進來，還沒輸入名字）';
                    body.innerHTML = "<div class='lq-card p-6 text-center'>" +
                        "<div class='text-sm text-gray-500 mb-1'>👀 即時作答進度</div>" +
                        "<div class='font-bold mb-3'>" + infoLine + "</div>" +
                        "<div class='text-3xl font-bold mb-2' style='color:var(--hl-blue);'>" + answered + " / " + total + " 題</div>" +
                        "<div class='h-3 w-full bg-gray-200 rounded-full overflow-hidden mb-2'><div class='progress-bar' style='width:" + pct + "%;height:100%;'></div></div>" +
                        "<div class='text-xs text-gray-400'>最後更新：" + new Date(data.updatedAt || Date.now()).toLocaleTimeString() + "</div>" +
                        "<div class='text-xs text-gray-400 mt-2'>要讓這條連結失效，請用家長帳號登入後在「我的帳號 → 即時監看」裡停止，或請老師停用。</div>" +
                        "</div>" +
                        "<div id='liveParentDetail' class='mt-4'></div>";

                    // 免登入家長也看得到監考式詳情(每題實際選了什麼)：資料本來就一起回傳，
                    // 題目內容再向公開的/api/share拿。抓題目失敗就只顯示上面的進度%，不影響主要功能
                    try {
                        const items = await fetchShareItems(shareId);
                        const detail = document.getElementById('liveParentDetail');
                        if (detail) {
                            detail.innerHTML = "<div class='text-sm text-white/80 mb-2 px-1'>🔍 每題作答情況</div>" +
                                renderProctorAnswersHtml(items, data.answers || []);
                        }
                    } catch (e2) {}
                } catch (e) {
                    body.innerHTML = "<div class='lq-card p-5 text-center text-red-600'>載入失敗：" + escapeHtml(e.message) + "</div>";
                }
            };
            window.liveViewRefresh();
            window.livePollTimer = setInterval(window.liveViewRefresh, window.livePollIntervalMs);
        }

        // --- 作答結果分享連結(給家長/老師看,唯讀,不可重測) ---
        async function loadResultViewIfAny() {
            const params = new URLSearchParams(location.search);
            const resultId = params.get('result');
            if (!resultId) return false;

            document.getElementById('inputForm').classList.add('hidden');
            document.getElementById('resultSection').classList.remove('hidden');
            const stickyHeader = document.querySelector('.sticky-header');
            if (stickyHeader) stickyHeader.classList.add('hidden');
            const ansContainer = document.getElementById('answerModeContainer');
            if (ansContainer) ansContainer.style.display = 'none';
            const paperContainer = document.getElementById('paperContainer');
            paperContainer.style.display = 'block';
            paperContainer.innerHTML = "<div class='text-center text-white py-20 text-lg'>⏳ 載入結果中...</div>";

            try {
                const res = await fetch(API_BASE + "/api/result/" + encodeURIComponent(resultId));
                const data = await res.json();
                if (data.error) throw new Error(data.error.message);
                renderResultView(data);
            } catch (e) {
                paperContainer.innerHTML = "<div class='text-center text-white py-20 text-lg'>❌ 載入失敗：" + escapeHtml(e.message) + "</div>";
            }
            return true;
        }

        function renderResultView(data) {
            const container = document.getElementById('paperContainer');
            const s = data.studentInfo || {};
            const infoParts = [];
            if (s.grade) infoParts.push(escapeHtml(s.grade));
            if (s.className) infoParts.push(escapeHtml(s.className));
            if (s.seat) infoParts.push('座號' + escapeHtml(s.seat));
            if (s.name) infoParts.push(escapeHtml(s.name));
            const infoLine = infoParts.length > 0 ? infoParts.join('・') : '(未填寫學生資料)';

            let html = "<div class='max-w-2xl mx-auto p-4'>";
            html += "<div class='lq-card p-5 mb-4 text-center'>" +
                "<div class='text-xs text-gray-400 mb-1'>📋 線上作答結果(唯讀)</div>" +
                "<h2 class='font-bold text-lg mb-1'>" + escapeHtml(data.title || '測驗') + "</h2>" +
                "<div class='text-sm text-gray-500 mb-3'>" + infoLine + "</div>" +
                "<div class='text-3xl font-bold' style='color:var(--hl-blue);'>" + (Number(data.totalScore) || 0) + " / " + (Number(data.maxScore) || 0) + " 分</div>" +
                "<div class='text-sm text-gray-500'>約 " + (Number(data.pct) || 0) + " 分</div>" +
                "</div>";

            (data.details || []).forEach((d, i) => {
                const badge = d.reviewNeeded ? (d.isCorrect ? '🤔' : '📝') : (d.isCorrect ? '✅' : '❌');
                const borderClass = d.reviewNeeded ? 'border-blue-300' : (d.isCorrect ? 'border-emerald-300' : 'border-rose-300');
                html += "<div class='lq-card p-4 mb-3 border-2 " + borderClass + "'>";
                html += "<div class='font-bold mb-2'>" + (i + 1) + ". " + escapeHtml(d.q || '') + " <span class='text-xs text-gray-400'>(" + (Number(d.max) || 0) + "分)</span></div>";
                html += "<div class='text-sm mb-1'>" + badge + " 作答：" + escapeHtml(d.userDisplay || '') + "</div>";
                if (!d.isCorrect || d.reviewNeeded) {
                    html += "<div class='text-sm text-gray-600'>參考答案：" + escapeHtml(d.correctDisplay || '') + (d.explain ? ('｜解析：' + escapeHtml(d.explain)) : '') + "</div>";
                }
                html += "</div>";
            });

            html += "</div>";
            container.innerHTML = html;
        }

