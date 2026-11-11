// Luno 綸諾｜線上作答＋自動評分、即時進度上報。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 手機線上作答＋自動評分 ---
        // 把q.a(答案)轉成選項字母(A/B/C...)給線上作答自動判分比對用。
        // AI有時不是回傳字母(如"B")，而是直接回傳完整選項文字(如"眼睛看、鼻子聞、雙手觸摸")，
        // 這時先去比對選項清單找出對應字母，找不到才退回字母萃取，避免解析成空字串
        function matchOptionLetter(q, rawAnswer) {
            const raw = String(rawAnswer).trim();
            if (!raw) return null;
            let idx = q.o.findIndex(o => o.trim() === raw);
            // 純字母答案（"B"、"AC"）是選項代號不是選項文字：不做模糊比對，
            // 否則選項「B 型血」「ATP」這種含英文字母的會被誤認成答案
            if (idx < 0 && /^[A-Za-z]{1,8}$/.test(raw)) return null;
            if (idx < 0) idx = q.o.findIndex(o => raw.includes(o.trim()) || o.trim().includes(raw));
            return idx >= 0 ? String.fromCharCode(65 + idx) : null;
        }

        function getCorrectLetters(q) {
            if (!q.o || q.o.length === 0) return null;
            if (Array.isArray(q.a)) {
                return q.a.map(x => {
                    if (typeof x === 'number') return String.fromCharCode(65 + x);
                    const s = String(x).trim();
                    if (/^[A-Za-z]$/.test(s)) return s.toUpperCase();
                    return matchOptionLetter(q, s) || s.toUpperCase();
                });
            } else if (typeof q.a === 'number') {
                return [String.fromCharCode(65 + q.a)];
            } else if (typeof q.a === 'string') {
                const raw = q.a.trim();
                const directMatch = matchOptionLetter(q, raw);
                if (directMatch) return [directMatch];
                const lettersOnly = raw.toUpperCase().replace(/[^A-Z]/g, '');
                if (lettersOnly && lettersOnly.length <= q.o.length) return lettersOnly.split('');
                return [];
            }
            return [];
        }

        // 選擇/複選題在「即時模式」下才會逐題觸發即時判分；填空/簡答題不管哪個模式都是送出評分後才看結果(文字比對本來就只能算參考)
        function getGradeMode() {
            // 交接模式（家長／教師把手機遞給學生）一律「全部寫完再送出」，不逐題公布對錯與解析
            if (handoffActive()) return 'batch';
            // 學生從老師／家長的連結進來：一律照分享時設定的方式，不能自己選
            if (window.isSharedView && window.sharedMode === 'student') return window.sharedGradeMode === 'instant' ? 'instant' : 'batch';
            const el = document.querySelector('input[name="ansGradeMode"]:checked');
            if (el) return el.value;
            // 學生自己練習沒有老師可以問：登入了就即時反饋，沒登入就寫完再送出
            if (isSelfStudent()) return window.currentUser ? 'instant' : 'batch';
            return 'instant';
        }

        // 學生（登入或免登入練習）都不選作答方式
        function isSelfStudent() {
            return !!((window.currentUser && window.currentUser.role === 'student') || window.guestRole === 'student' || window.practiceMode);
        }

        // 老師／家長在作答頁選的「學生作答方式」，發送測驗時存進分享；還沒進作答頁就用上次選的，預設即時反饋
        function teacherGradeMode() {
            const el = document.querySelector('input[name="ansGradeMode"]:checked');
            if (el) return el.value === 'batch' ? 'batch' : 'instant';
            return window.teacherGradeModePref === 'batch' ? 'batch' : 'instant';
        }

        // 即時模式下按「確認這題」才算送出(不是選了就馬上判定，避免誤按選項就被當成作答完畢)。
        // 判定後鎖住該題選項+隱藏確認按鈕，避免同一題重複送出
        async function confirmAnswer(i) {
            const typed = qtIsTyped((window.currentItems || [])[i]);   // 配合題、排序題：作答值在隱藏欄位，按鈕在 answer-qtypes.js
            const inputs = document.querySelectorAll('input[name="ans-' + i + '"]');
            const hasSelection = typed ? !!(qtHidden(i) && qtHidden(i).value) : Array.from(inputs).some(el => el.checked);
            if (!hasSelection) { lqAlert('請先選擇答案再確認'); return; }
            // 學生版：答案在伺服器，先送去判分才有對錯可以顯示（送出期間鎖住按鈕，避免連按）
            if (serverGradeOn()) {
                const cbtn = document.getElementById('ans-confirm-' + i);
                if (cbtn) cbtn.disabled = true;
                const ok = await serverGradeFetch([i]);
                if (cbtn) cbtn.disabled = false;
                if (!ok) { lqAlert('連線不穩，這題還沒送出去，請再按一次「檢查這題」。'); return; }
            }
            gradeOneQuestion(i);
            inputs.forEach(el => el.disabled = true);
            if (typed) lockTypedCard(i);
            const btn = document.getElementById('ans-confirm-' + i);
            if (btn) btn.style.display = 'none';
            // 確認後稍等讓學生看到對錯回饋，再把下一題帶進視線（沒有下一題就不動；偏好減少動態的人用瞬間跳）
            const next = document.getElementById('ans-card-' + (i + 1));
            if (next) {
                const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
                setTimeout(function () { next.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' }); }, 1400);
            }
        }

        // --- 即時進度：讓老師/家長輪詢看到學生目前答了幾題(輕量版,不用WebSocket) ---
        // 選了選項/填空欄位失焦時觸發(不是判分!只是紀錄「有動作」)，跟confirmAnswer/gradeAnswers的
        // 判分邏輯完全分開；只有透過分享連結(?share=)進來的學生會推送，老師自己在表單頁按「開始測驗」預覽不會推送
        function onAnswerPicked(i) {
            pushLiveProgress();
        }

        // 記錄每題上次推送時的文字內容，避免同一題還沒真的變動就重複推送(例如只是focus/blur但沒打字)
        window.lastPushedTextAnswers = window.lastPushedTextAnswers || {};
        function onTextAnswerBlur(i) {
            const el = document.getElementById('ans-text-' + i);
            const val = (el && el.value || '').trim();
            if (window.lastPushedTextAnswers[i] === val) return;
            window.lastPushedTextAnswers[i] = val;
            pushLiveProgress();
        }

        // 上報節流：原本每答一題就送一次，30人班級考10題 = 300 次寫入，
        // 老師只需要看出「誰卡住、誰落後」，不需要逐秒精確，2026-11-10 起改成 1 秒最多送一次(見下方常數)。
        // 第一次作答立刻送(老師才看得到「已開始作答」)，之後同一個時間窗內只會在窗尾送最新狀態一次。
        const LIVE_PUSH_INTERVAL_MS = 1000; // 2026-11-10 由 15 秒縮到 1 秒：老師與家長要幾乎即時看到；沒動作就不送，不會白寫 D1
        window._livePushTimer = null;
        window._livePushLastAt = 0;
        function pushLiveProgress(immediate) {
            if (immediate) {
                if (window._livePushTimer) { clearTimeout(window._livePushTimer); window._livePushTimer = null; }
                window._livePushLastAt = Date.now();
                pushLiveProgressNow();
                return;
            }
            const waited = Date.now() - window._livePushLastAt;
            if (waited >= LIVE_PUSH_INTERVAL_MS) {
                window._livePushLastAt = Date.now();
                pushLiveProgressNow();
                return;
            }
            if (window._livePushTimer) return; // 這個窗內已經排好一次了，等它送最新狀態就好
            window._livePushTimer = setTimeout(function () {
                window._livePushTimer = null;
                window._livePushLastAt = Date.now();
                pushLiveProgressNow();
            }, LIVE_PUSH_INTERVAL_MS - waited);
        }

        // 學生把分頁關掉/切到背景時，如果還有排程中的上報就先補送，
        // 否則老師看到的會停在上一次送出的舊狀態
        window.addEventListener('pagehide', function () {
            if (window._livePushTimer) { clearTimeout(window._livePushTimer); window._livePushTimer = null; pushLiveProgressNow(); }
        });

        // fire-and-forget：失敗不影響作答本身，這只是加值功能
        async function pushLiveProgressNow() {
            if (!(window.isSharedView && window.sharedMode === 'student' && window.liveShareId)) return;
            const items = window.currentItems || [];
            let answered = 0;
            // 監考式即時監看用：每題目前實際選的選項字母(單選/複選)或填的文字，不只是「有沒有作答」的數字
            const answers = [];
            items.forEach((q, i) => {
                if (q.o && q.o.length > 0) {
                    const checked = Array.from(document.querySelectorAll('input[name="ans-' + i + '"]:checked')).map(el => el.value);
                    if (checked.length > 0) { answered++; answers.push({ i, selected: checked.join('') }); }
                } else {
                    const el = document.getElementById('ans-text-' + i);
                    const val = (el && el.value || '').trim();
                    if (val !== '') { answered++; answers.push({ i, selected: val }); }
                }
            });
            try {
                await fetch(API_BASE + "/api/live-progress", {
                    method: 'POST',
                    // keepalive：學生關分頁時最後一次補送才不會被瀏覽器中斷
                    keepalive: true,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        shareId: window.liveShareId,
                        studentId: getLiveStudentId(),
                        studentInfo: {
                            grade: (document.getElementById('ansStuGrade') || {}).value || '',
                            className: (document.getElementById('ansStuClass') || {}).value || '',
                            seat: (document.getElementById('ansStuSeat') || {}).value || '',
                            name: (document.getElementById('ansStuName') || {}).value || '',
                        },
                        answered, total: items.length, answers,
                        // 若學生剛好有登入帳號(非必要)，順便標記username，讓已連結的家長能直接透過帳號找到這份即時進度
                        studentUsername: (window.currentUser && window.currentUser.role === 'student') ? window.currentUser.username : ''
                    })
                });
            } catch (e) {}
        }

        async function shareLiveProgressLink(btnEl) {
            const originalHTML = btnEl ? btnEl.innerHTML : '';
            if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '⏳ 產生連結中...'; }
            try {
                const title = window.docTitle || '測驗';
                const url = location.origin + location.pathname + "?live=" + window.liveShareId + "&student=" + getLiveStudentId();
                const clipboardText = "【" + title + "】即時作答監看(給家長看)\n" + url;
                const msg = "✅ 已複製即時監看連結！家長開啟後不用註冊、不用密碼，就能看到你答了幾題＋每題選了什麼。不想被看的時候可以按下面的「⏹ 停止監看」讓連結失效。";
                let copied = false;
                try { await navigator.clipboard.writeText(clipboardText); copied = true; } catch (e) {}
                if (copied) { lqAlert(msg); } else { await askText(msg + '\n複製失敗，請手動複製以下內容：', { value: clipboardText, readonly: true }); }
            } catch (e) {
                lqAlert('產生連結失敗: ' + e.message);
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = originalHTML; }
            }
        }

        // 開始畫面：先填資料+選作答模式，按「開始測驗」確認後才顯示題目本體，
        // 避免模式選項跟題目混在一起、寫到一半才發現選錯模式。2026-11-03 從 renderAnswerMode 拆出
        function answerStartScreenHtml() {
            let html = "<div id='ansStartScreen'>";
            // 老師／訪客自己出完題看到的就是這個畫面，常被誤會成「要我自己填座號寫考卷」（2026-11-10 Steve 試用回報不夠直觀）。
            // 保留「出完題預設進線上作答」，只在最上面說明身分並給發送出口；學生從連結進來、自己練習、交接給學生時不顯示。
            const teacherPreview = !window.isSharedView && !isSelfStudent() && !(typeof handoffActive === 'function' && handoffActive());
            if (teacherPreview) {
                // 三步引導：每一步一顆按鈕，主要動作（發送）用主色。2026-11-11 Steve：要引導式、更直觀
                html += "<div class='lq-preview-banner'><div class='lq-pb-text'><b>✅ 出好了！題目在下面</b><span>看過沒問題就發送，要改再按編輯：</span></div>" +
                    "<div class='lq-pb-steps'>" +
                    "<button type='button' onclick='openEditItems()' class='lq-pb-step'><i>1</i><span class='lq-pb-ic'>✏️</span><span>看題目、<br>要改就改</span></button>" +
                    "<button type='button' onclick='openSendQuizModal()' class='lq-pb-step is-main'><i>2</i><span class='lq-pb-ic'>📤</span><span>發送給學生</span></button>" +
                    "<button type='button' onclick='openLiveMonitor()' class='lq-pb-step'><i>3</i><span class='lq-pb-ic'>📊</span><span>看全班<br>寫到哪</span></button>" +
                    "</div></div>";
                html += teacherPreviewListHtml(window.currentItems || []);   // teacher-preview.js：先看到題目與答案
            } else {
                html += "<div class='lq-card p-6 mb-4 text-center'><h2 class='font-bold text-lg mb-1'>📱 線上作答</h2><p class='text-sm text-gray-500'>選擇/複選題會自動判分；填空/簡答題只能做文字比對，僅供參考，請自行核對。</p></div>";
            }

            // 登入狀態區塊：只有透過分享連結進來作答的學生需要(家長監看要靠學生帳號)，
            // 老師自己預覽/家長答案檢視模式都不用看到
            if (window.isSharedView && window.sharedMode === 'student') {
                html += "<div id='ansLoginBox'>" + buildAnswerLoginBoxHtml() + "</div>";
            }

            // 已登入的學生：姓名、班級帳號裡就有，整塊不顯示，直接帶帳號資料（老師看全班進度時仍認得出是誰）
            const loggedStudent = !!(window.currentUser && window.currentUser.role === 'student');
            const stuName = loggedStudent ? escapeHtml(window.currentUser.displayName || '') : '';
            const stuClass = loggedStudent ? escapeHtml(window.currentUser.className || '') : '';
            // 老師預覽也不顯示（欄位還在 DOM，自己試寫與進度上報照樣讀得到空值）
            html += "<div class='lq-card p-4 mb-4" + (loggedStudent || teacherPreview ? " hidden" : "") + "' id='ansInfoBox' oninput='pushLiveProgress()'>" +
                "<div class='text-sm mb-2' style='" + (window.isSharedView ? "font-weight:700;color:var(--hl-blue);" : "color:#6b7280;") + "'>👤 " + (window.isSharedView ? "先輸入你的姓名或暱稱（必填），老師才知道是誰在寫" : "填寫資料（選填，方便老師/家長核對是誰寫的）") + "</div>" +
                "<div class='grid grid-cols-2 sm:grid-cols-4 gap-2'>" +
                "<input id='ansStuGrade' placeholder='年級' class='lq-input text-sm py-1.5'>" +
                "<input id='ansStuClass' placeholder='班級' value='" + stuClass + "' class='lq-input text-sm py-1.5'>" +
                "<input id='ansStuSeat' placeholder='座號' class='lq-input text-sm py-1.5'>" +
                "<input id='ansStuName' placeholder='" + (window.isSharedView ? "姓名或暱稱（必填）" : "姓名") + "' maxlength='20' value='" + stuName + "' class='lq-input text-sm py-1.5'>" +
                "</div>" +
                "<div style='font-size:0.75rem;color:#5f6368;margin-top:0.5rem;line-height:1.5;'>這些資料只給出這份測驗的老師或家長看，用途與保存期限見<a href='privacy.html' target='_blank' rel='noopener' style='color:#1A73E8;text-decoration:underline;'>個人資料蒐集告知</a>。不想填可以留空。</div></div>";

            // 「每題即時看結果」是需要登入的功能：即時回饋會一題一題回報到伺服器(老師/家長監看也靠這個)，
            // 未登入者只給「全部寫完再送出」，並直接告訴他登入就能解鎖
            // 老師／訪客自己預覽（不是學生從連結進來）也開放，才看得到學生會看到的即時回饋
            const canInstant = !!window.currentUser || !window.isSharedView;
            const modeNow = getGradeMode();
            if ((window.isSharedView && window.sharedMode === 'student') || isSelfStudent()) {
                // 學生不再自己選：照老師／家長發送時的設定（自己練習則登入即時反饋、沒登入寫完再送出）
                html += "<div class='text-center text-sm text-gray-600 mb-4' id='ansModeBox'>作答方式：" +
                    (modeNow === 'instant' ? "⚡ 每題答完馬上看對錯" : "📋 全部寫完再送出，最後一起看結果") + "</div>";
            } else
            html += "<div class='lq-card p-4 mb-5' id='ansModeBox'>" +
                "<div class='text-sm text-gray-500 mb-1 text-center font-semibold'>學生作答方式</div>" +
                "<div class='text-xs text-gray-400 mb-3 text-center'>發送測驗給學生時，會照這裡選的方式作答</div>" +
                "<div class='flex items-center justify-center gap-4 sm:gap-6 text-sm flex-wrap'>" +
                "<label class='flex items-center gap-1.5 font-semibold " + (canInstant ? "cursor-pointer" : "opacity-50 cursor-not-allowed") + "'>" +
                    "<input type='radio' name='ansGradeMode' value='instant' onchange=\"window.teacherGradeModePref=this.value\"" + (window.teacherGradeModePref === 'batch' ? "" : (canInstant ? " checked" : " disabled")) + "> ⚡ 即時反饋（每題答完馬上看對錯）" + (canInstant ? "" : "🔒") + "</label>" +
                "<label class='flex items-center gap-1.5 cursor-pointer font-semibold'><input type='radio' name='ansGradeMode' value='batch' onchange=\"window.teacherGradeModePref=this.value\"" + (window.teacherGradeModePref === 'batch' || !canInstant ? " checked" : "") + "> 📋 全部寫完再送出（最後一起看結果）</label>" +
                "</div>" +
                (canInstant ? "" :
                    "<div class='text-xs text-gray-500 text-center mt-3'>想寫一題就馬上知道對不對？登入帳號就能用，分數也會存進你自己的紀錄。" +
                    "<button type='button' onclick='openAccountModal()' class='underline font-semibold' style='color:var(--hl-blue);'>登入／註冊</button></div>") +
                "</div>";

            if (teacherPreview) {
                // 老師的主要出口是發送；自己試寫降為次要。底下留白避免被左下角浮動的「回上一頁」蓋住
                html += "<button onclick='openSendQuizModal()' class='lq-btn lq-cta lq-btn-primary w-full py-3 rounded-xl text-lg mb-2'>📤 " + (window.currentUser ? "發送給學生" : "登入後發送給學生") + "</button>" +
                    "<button onclick='startAnswerQuiz()' class='lq-btn lq-btn-secondary w-full py-2 rounded-xl text-sm'>▶ 我自己先試寫一遍</button>" +
                    "<div style='height:4.5rem'></div>";
            } else {
                html += "<button onclick='startAnswerQuiz()' class='lq-btn lq-cta lq-btn-primary w-full py-3 rounded-xl text-lg'>🚀 開始測驗</button>";
            }
            html += "</div>";
            return html;
        }

        // 單題作答卡片
        function answerCardHtml(q, i) {
            const letters = getCorrectLetters(q);
            let html = "<div class='lq-card p-4 mb-3 ans-card' id='ans-card-" + i + "'>";
            // 🔊 朗讀題目（瀏覽器內建語音，不送出任何資料；不支援的瀏覽器不顯示）
            const speakBtn = (typeof speakSupported === 'function' && speakSupported())
                ? " <button type='button' class='ans-speak' onclick='speakQuestion(" + i + ")' aria-label='朗讀第 " + (i + 1) + " 題' title='朗讀題目'>🔊</button>" : "";
            html += "<div class='font-bold mb-2'>" + (i + 1) + ". " + escapeHtml(q.q) + " <span class='text-xs text-gray-400'>(" + (Number(q.s) || 0) + "分)</span>" + speakBtn + "</div>" + qImgHtml(q);
            if (qtIsTyped(q)) {
                html += typedAnswerHtml(q, i);
            } else if (q.o && q.o.length > 0) {
                const inputType = (q.m || (letters && letters.length > 1)) ? 'checkbox' : 'radio';   // q.m：學生版題目沒有答案，伺服器另外標了是複選題
                q.o.forEach((o, oi) => {
                    const label = String.fromCharCode(65 + oi);
                    html += "<label class='lq-ans-opt flex items-center gap-2 cursor-pointer'>" +
                        "<input type='" + inputType + "' name='ans-" + i + "' value='" + label + "'" +
                        " class='w-5 h-5 flex-shrink-0 accent-[color:var(--hl-blue)]' onchange='onAnswerPicked(" + i + ")'>" +
                        "<span>(" + label + ") " + escapeHtml(stripOptLabel(o, label)) + "</span></label>";
                });
                // 只有選擇/複選題才需要「確認這題」按鈕(即時模式用)：原本一點選項就馬上判定，
                // 誤按到旁邊的選項也會被當成已送出，Steve反映要有明確的送出動作才不會誤按。
                // 是否顯示由startAnswerQuiz()依選定的模式決定(批次模式不需要,只用最下面的送出評分)
                html += "<button type='button' onclick='confirmAnswer(" + i + ")' id='ans-confirm-" + i + "' class='ans-confirm-btn lq-btn lq-btn-primary text-sm px-3 py-1.5 mt-2' style='display:none;'>✅ 檢查這題</button>";
            } else {
                html += "<textarea class='lq-input mt-1' rows='2' id='ans-text-" + i + "' placeholder='請輸入答案' onblur='onTextAnswerBlur(" + i + ")'></textarea>";
            }
            html += "<div class='ans-feedback mt-2 text-sm hidden' id='ans-feedback-" + i + "'></div>";
            html += "</div>";
            return html;
        }

        function renderAnswerMode() {
            const container = document.getElementById('answerModeContainer');
            if (!container) return;
            const items = window.currentItems || [];
            let html = "<div class='max-w-2xl mx-auto p-4'>";
            html += answerStartScreenHtml();

            // 題目本體：預設隱藏，確認模式並按下「開始測驗」後才顯示
            html += "<div id='ansQuizBody' class='hidden'>";
            items.forEach((q, i) => { html += answerCardHtml(q, i); });
            // 即時進度分享連結：只有透過分享連結進來作答的學生(有shareId)才需要，老師自己預覽不用
            if (window.isSharedView && window.sharedMode === 'student' && window.liveShareId) {
                html += "<button type='button' onclick='shareLiveProgressLink(this)' class='lq-btn lq-btn-share w-full py-2 text-sm mb-3'>📤 分享即時監看連結給家長（家長不用註冊）</button>";
            }
            // 底部固定列（2026-11-05）：隨時看得到寫到哪、交卷鈕不用捲到最底
            html += "<div id='scoreResult' class='mt-4'></div>";
            html += "<nav class='lq-quiz-bottombar' aria-label='作答進度'>" +
                "<div class='lq-bar-progress-box'><div class='lq-bar-meta'><span>已作答</span><b id='ansProgressText' aria-live='polite' aria-atomic='true'>0 / " + items.length + " 題</b></div>" +
                "<div class='lq-bar-track'><div class='lq-bar-fill' id='ansProgressFill' style='width:0%'></div></div></div>" +
                "<button type='button' onclick='requestGrade()' class='lq-btn lq-btn-primary lq-bar-submit'>🏁 交卷看成績</button></nav>";
            html += "</div>";

            html += "</div>";
            container.innerHTML = html;
            // 選項／選擇題用 change（點一下才觸發）；文字題用 input 但防抖 250 毫秒：
            // 以前每打一個字就掃過整份卷子的所有題目與選項並重設樣式，題數多的手機上打字會卡
            let progTimer = null;
            // 學生一進到作答頁就先報到（還沒有名字也先出現在老師的名單裡）
            if (window.isSharedView && window.sharedMode === 'student') pushLiveProgress(true);
            container.onchange = updateAnsProgress;
            container.oninput = function (e) {
                const t = e && e.target;
                if (t && (t.tagName === 'TEXTAREA' || t.type === 'text')) {
                    clearTimeout(progTimer);
                    progTimer = setTimeout(updateAnsProgress, 250);
                } else {
                    updateAnsProgress();
                }
            };
        }

        // 已作答題數：選擇題有勾選、文字題有內容才算
        function updateAnsProgress() {
            const items = window.currentItems || [];
            let done = 0;
            items.forEach(function (q, i) {
                if (q.o && q.o.length > 0) {
                    if (document.querySelector('input[name="ans-' + i + '"]:checked')) done++;
                } else {
                    const t = document.getElementById('ans-text-' + i);
                    if (t && t.value.trim()) done++;
                }
            });
            // 舊 iPad（iOS 15.4 以前）不支援 :has()，改用 class 標示選中的那一列
            document.querySelectorAll('#answerModeContainer .lq-ans-opt').forEach(function (lb) {
                const inp = lb.querySelector('input');
                lb.classList.toggle('is-selected', !!(inp && inp.checked));
            });
            const txt = document.getElementById('ansProgressText'), fill = document.getElementById('ansProgressFill');
            if (txt) txt.textContent = done + ' / ' + items.length + ' 題';
            if (fill) fill.style.width = (items.length ? Math.round(done * 100 / items.length) : 0) + '%';
        }

        // 確認模式+資料後才會呼叫，把題目本體從隱藏切成顯示；學生資料/模式選擇的input
        // 都還留在DOM裡(只是視覺隱藏)，之後gradeAnswers()/shareResult()一樣讀得到值
        function startAnswerQuiz() {
            // 從連結／代碼進來的學生一定要留名字（姓名或暱稱都行）：沒登入也沒有名字，老師與家長就不知道是誰
            if (window.isSharedView && window.sharedMode === 'student') {
                const nameEl = document.getElementById('ansStuName');
                if (nameEl && !nameEl.value.trim()) {
                    lqAlert('請先輸入你的姓名或暱稱，老師才知道是誰在寫。');
                    nameEl.focus();
                    return;
                }
            }
            const startScreen = document.getElementById('ansStartScreen');
            const quizBody = document.getElementById('ansQuizBody');
            if (startScreen) startScreen.classList.add('hidden');
            if (quizBody) {
                quizBody.classList.remove('hidden');
                quizBody.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            // 即時模式才顯示每題的「確認這題」按鈕；批次模式全程不判分，只靠最下面的送出評分
            const showConfirmBtns = getGradeMode() === 'instant';
            document.querySelectorAll('.ans-confirm-btn').forEach(btn => {
                btn.style.display = showConfirmBtns ? 'inline-flex' : 'none';
            });
            // 學生按下開始就先報到（0 題也送）：老師的監看畫面馬上看到「某某人進來了」，
            // 不用等他選第一個答案（以前進來沒答題，老師端一片空白，像是監看壞掉）
            pushLiveProgress(true);
        }

        // 用DOM節點組回饋文字(而非字串拼innerHTML)，即使q.e/correctAns等內容來自AI也不會有XSS風險，
        // 同時讓✅/❌徽章可以套上獨立的彈跳動畫class
        function setAnswerFeedback(fb, badge, restText, className) {
            fb.className = className;
            fb.innerHTML = '';
            const badgeEl = document.createElement('span');
            badgeEl.className = 'ans-badge';
            badgeEl.textContent = badge;
            fb.appendChild(badgeEl);
            fb.appendChild(document.createTextNode(' ' + restText));
            fb.classList.remove('hidden');
        }

        // 答對/答錯時整張題目卡片跳一下(答對)或抖一下(答錯)+外框變色，強制重播動畫要先移除class再reflow
        function flashAnswerCard(i, correct) {
            const card = document.getElementById('ans-card-' + i);
            if (!card) return;
            card.classList.remove('ans-correct', 'ans-wrong');
            // 下一個畫面影格再加回 class，動畫一樣會重播，但不用 offsetWidth 強迫瀏覽器馬上重排
            requestAnimationFrame(function () { requestAnimationFrame(function () {
                card.classList.add(correct ? 'ans-correct' : 'ans-wrong');
            }); });
        }

        // 單題判分：即時模式的onchange跟批次的送出評分共用同一套邏輯，
        // 結果存進window.gradedDetails[i]供之後「分享結果」組資料使用
        function gradeOneQuestion(i) {
            const items = window.currentItems || [];
            const q = items[i];
            const fb = document.getElementById('ans-feedback-' + i);
            if (!q || !fb) return null;
            // 學生版：用伺服器判好的結果（server-grade.js），本機沒有答案可以算
            if (serverGradeOn()) {
                const sr = gradeFromServer(i, q, fb);
                if (sr) { window.gradedDetails = window.gradedDetails || {}; window.gradedDetails[i] = sr; }
                return sr;
            }
            const letters = getCorrectLetters(q);
            let result;
            if (qtIsTyped(q)) {
                result = gradeTypedQuestion(i, q, fb);   // 配合題、排序題（answer-qtypes.js）
            } else if (q.o && q.o.length > 0) {
                const checked = Array.from(document.querySelectorAll('input[name="ans-' + i + '"]:checked')).map(el => el.value).sort();
                const correct = (letters || []).slice().sort();
                const isCorrect = checked.length > 0 && checked.length === correct.length && checked.every((v, idx) => v === correct[idx]);
                // 萬一連字母都比對不出來(AI答案格式異常)，退而顯示原始答案內容，不要留空白
                const correctDisplay = correct.length > 0 ? correct.join('') : (String(q.a || '').trim() || '(無法判讀，請自行核對)');
                const userDisplay = checked.length > 0 ? checked.join('') : '(未作答)';
                const restText = isCorrect ? '答對了！' : ('答錯了，正確答案：' + correctDisplay + (q.e ? ('｜解析：' + q.e) : ''));
                const badge = isCorrect ? '✅' : '❌';
                const cls = 'ans-feedback mt-2 text-sm ' + (isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold');
                // 交接模式：交卷後連對錯都不顯示，全部留到家長／教師解鎖才公布（結果存在 result.fb）
                if (!handoffActive()) {
                    setAnswerFeedback(fb, badge, restText, cls);
                    flashAnswerCard(i, isCorrect);
                }
                result = { score: isCorrect ? (q.s || 0) : 0, max: q.s || 0, isCorrect, reviewNeeded: false, userDisplay, correctDisplay, fb: { badge, restText, cls } };
            } else {
                const inputEl = document.getElementById('ans-text-' + i);
                const userAns = ((inputEl && inputEl.value) || '').trim();
                const correctAns = String(q.a || '').trim();
                const roughMatch = userAns !== '' && userAns.replace(/\s/g, '') === correctAns.replace(/\s/g, '');
                const restText = (roughMatch ? '文字比對相符(僅供參考)' : '請自行核對') + '，參考答案：' + correctAns + (q.e ? ('｜解析：' + q.e) : '');
                const badge = roughMatch ? '🤔' : '📝';
                const cls = 'ans-feedback mt-2 text-sm text-blue-600';
                if (!handoffActive()) {
                    setAnswerFeedback(fb, badge, restText, cls);
                    flashAnswerCard(i, roughMatch);
                }
                result = { score: roughMatch ? (q.s || 0) : 0, max: q.s || 0, isCorrect: roughMatch, reviewNeeded: true, userDisplay: userAns || '(未作答)', correctDisplay: correctAns, fb: { badge, restText, cls } };
            }
            window.gradedDetails = window.gradedDetails || {};
            window.gradedDetails[i] = result;
            return result;
        }

        // 「送出評分」按鈕入口。交接模式下學生可能亂按，送出前先提醒還有幾題沒寫（評分後不能重寫）
        async function requestGrade() {
            const items = window.currentItems || [];
            let blank = 0;
            items.forEach((q, i) => {
                if (q.o && q.o.length > 0) {
                    if (!document.querySelector('input[name="ans-' + i + '"]:checked')) blank++;
                } else {
                    const t = document.getElementById('ans-text-' + i);
                    if (!t || !t.value.trim()) blank++;
                }
            });
            if (handoffActive()) {
                const msg = blank > 0 ? ('還有 ' + blank + ' 題沒寫，確定要交卷嗎？交卷後就不能再修改。') : '確定要交卷嗎？交卷後就不能再修改。';
                if (!(await askConfirm(msg))) return;
            } else if (blank > 0) {
                // 2026-11-11：一般作答也要提醒（以前只有交接模式會問，漏寫的題目直接算 0 分，學生以為還能補）
                if (!(await askConfirm('還有 ' + blank + ' 題沒寫，現在交卷這幾題會算沒答。', { okText: '現在交卷', cancelText: '回去寫' }))) return;
            }
            gradeAnswers();
        }

        async function gradeAnswers() {
            // 交卷是關鍵事件，不等節流窗，立刻把最終狀態送出去讓老師/家長看到已完成
            pushLiveProgress(true);
            const items = window.currentItems || [];
            let totalScore = 0, maxScore = 0, needReview = 0;
            // 學生版：先把還沒判過的題目送去伺服器判分（失敗就停在這裡，學生可以再按一次交卷，作答內容不會掉）
            if (serverGradeOn()) {
                if (window.__grading) return;
                window.__grading = true;
                const submitBtn = document.querySelector('.lq-bar-submit');
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ 評分中…'; }
                const ok = await serverGradeFetch(items.map(function (_, i) { return i; }));
                window.__grading = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🏁 交卷看成績'; }
                if (!ok) { lqAlert('連線不穩，還沒交卷成功。你的答案都還在，請再按一次「交卷看成績」。'); return; }
            }
            window.gradedDetails = {};
            items.forEach((q, i) => { gradeOneQuestion(i); });
            // 填空、簡答：標了 g 的題目（紙本卷拍照轉題目）請 AI 依參考答案批改，失敗或次數用完就維持文字比對（ai-grade.js）
            if (items.some(aiGradeEligible)) {
                const waitEl = document.getElementById('scoreResult');
                if (waitEl) waitEl.innerHTML = "<div class='lq-card p-5 text-center text-sm text-gray-600'>⏳ AI 正在依參考答案批改填空與簡答題…</div>";
                applyAiGrades(await aiRegradeTextAnswers());
            }
            let aiCount = 0;
            items.forEach((q, i) => {
                const r = (window.gradedDetails || {})[i];
                maxScore += (q.s || 0);
                if (!r) return;
                totalScore += r.score;
                if (r.reviewNeeded) needReview++;
                if (r.aiGraded) aiCount++;
            });

            const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
            window.lastGradeSummary = { totalScore, maxScore, pct };
            // 學生端(自主練習或用連結進來作答)把成績留在這台裝置的練習紀錄
            if (window.practiceMode || (window.currentUser && window.currentUser.role === 'student')) {
                savePracticeLog(window.docTitle || '練習卷', pct);
            }
            let resultHTML = "<div class='lq-card p-5 text-center ans-score-pop' style='border:2px solid var(--hl-blue);'>";
            if (handoffActive()) {
                // 交接模式：學生只看到「已交卷」，分數與對錯等家長／教師解鎖後才公布
                handoffRecordResult(totalScore, maxScore, pct);
                resultHTML += "<img src='assets/illust/submitted-done.webp' alt='' class='lq-illust' style='max-width:14rem' width='640' height='480'>";
                resultHTML += "<div class='text-xl font-bold mb-1'>已交卷！</div>";
                resultHTML += "<div class='text-sm text-gray-600 mb-4'>請把手機交還給家長／教師。</div>";
                resultHTML += "<div class='flex flex-col gap-2'>" +
                    "<button onclick='handoffNextStudent()' class='lq-btn lq-btn-secondary px-4 py-2 text-sm'>👥 換下一位同學寫</button>" +
                    "<button onclick='handoffUnlock()' class='lq-btn lq-btn-ghost px-4 py-2 text-sm'>🔓 家長／教師查看詳解</button></div>";
            } else {
                resultHTML += "<div class='text-3xl font-bold mb-1' style='color:var(--hl-blue);'>" + totalScore + " / " + maxScore + " 分</div>";
                resultHTML += "<div class='text-sm text-gray-500 mb-3'>約 " + pct + " 分" + (needReview > 0 ? "（含填空/簡答題的文字比對估算，建議自行核對）" : (aiCount > 0 ? "（填空與簡答題由 AI 依參考答案批改）" : "（選擇/複選題自動判分）")) + "</div>";
                resultHTML += "<button onclick='shareResult(this)' class='lq-btn lq-btn-share px-4 py-2 text-sm'>📤 分享結果給家長/老師</button>";
                resultHTML += "<div id='shareResultMsg' class='text-xs text-gray-500 mt-2'></div>";
            }
            resultHTML += "</div>";
            const scoreEl = document.getElementById('scoreResult');
            scoreEl.innerHTML = resultHTML;
            if (handoffActive()) handoffLockAfterGrade();
            scoreEl.scrollIntoView({ behavior: 'smooth' });
        }

        // 把作答結果(含選填的學生資料)存到後端換一個唯讀結果連結,複製給家長/老師
        async function shareResult(btnEl) {
            const items = window.currentItems || [];
            const details = items.map((q, i) => {
                const r = (window.gradedDetails && window.gradedDetails[i]) || null;
                return {
                    q: q.q,
                    max: q.s || 0,
                    score: r ? r.score : 0,
                    isCorrect: r ? !!r.isCorrect : false,
                    reviewNeeded: r ? !!r.reviewNeeded : false,
                    userDisplay: r ? r.userDisplay : '(未作答)',
                    correctDisplay: r ? r.correctDisplay : '',
                    explain: q.e || '',
                };
            });
            const studentInfo = {
                grade: (document.getElementById('ansStuGrade') || {}).value?.trim() || '',
                className: (document.getElementById('ansStuClass') || {}).value?.trim() || '',
                seat: (document.getElementById('ansStuSeat') || {}).value?.trim() || '',
                name: (document.getElementById('ansStuName') || {}).value?.trim() || '',
            };
            const s = window.lastGradeSummary || {};
            const msgEl = document.getElementById('shareResultMsg');
            const originalLabel = btnEl ? btnEl.innerText : '';
            if (btnEl) { btnEl.disabled = true; btnEl.innerText = '⏳ 產生連結中...'; }
            try {
                const res = await fetch(API_BASE + "/api/result", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: window.docTitle || '測驗',
                        studentInfo,
                        totalScore: s.totalScore || 0,
                        maxScore: s.maxScore || 0,
                        pct: s.pct || 0,
                        details,
                    }),
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error.message);

                const url = location.origin + location.pathname + "?result=" + data.id;
                const title = window.docTitle || '測驗';
                const whoLabel = studentInfo.name || [studentInfo.grade, studentInfo.className, studentInfo.seat ? ('座號' + studentInfo.seat) : ''].filter(Boolean).join(' ') || '(未填寫姓名)';
                const clipboardText = "【" + title + "】" + whoLabel + " 的作答結果\n" + url;
                let copied = false;
                try { await navigator.clipboard.writeText(clipboardText); copied = true; } catch (e) {}
                if (msgEl) msgEl.textContent = copied ? ('✅ 已複製「' + title + '」' + whoLabel + ' 的結果連結！可貼給家長/老師查看(30天內有效，唯讀)') : ('連結：' + url);
                if (!copied) await askText('複製失敗，請手動複製以下內容：', { value: clipboardText, readonly: true });
            } catch (e) {
                if (msgEl) msgEl.textContent = '❌ 產生連結失敗：' + e.message;
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerText = originalLabel; }
            }
        }

