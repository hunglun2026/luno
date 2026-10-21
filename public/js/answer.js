// Luno 綸諾｜線上作答＋自動評分、即時進度上報。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 手機線上作答＋自動評分 ---
        // 把q.a(答案)轉成選項字母(A/B/C...)給線上作答自動判分比對用。
        // AI有時不是回傳字母(如"B")，而是直接回傳完整選項文字(如"眼睛看、鼻子聞、雙手觸摸")，
        // 這時先去比對選項清單找出對應字母，找不到才退回字母萃取，避免解析成空字串
        function matchOptionLetter(q, rawAnswer) {
            const raw = String(rawAnswer).trim();
            if (!raw) return null;
            let idx = q.o.findIndex(o => o.trim() === raw);
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
            const el = document.querySelector('input[name="ansGradeMode"]:checked');
            return el ? el.value : 'instant';
        }

        // 即時模式下按「確認這題」才算送出(不是選了就馬上判定，避免誤按選項就被當成作答完畢)。
        // 判定後鎖住該題選項+隱藏確認按鈕，避免同一題重複送出
        function confirmAnswer(i) {
            const inputs = document.querySelectorAll('input[name="ans-' + i + '"]');
            const hasSelection = Array.from(inputs).some(el => el.checked);
            if (!hasSelection) { alert('請先選擇答案再確認'); return; }
            gradeOneQuestion(i);
            inputs.forEach(el => el.disabled = true);
            const btn = document.getElementById('ans-confirm-' + i);
            if (btn) btn.style.display = 'none';
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
        // 老師只需要看出「誰卡住、誰落後」，不需要逐秒精確，所以改成 15 秒最多送一次。
        // 第一次作答立刻送(老師才看得到「已開始作答」)，之後同一個 15 秒窗內只會在窗尾送最新狀態一次。
        const LIVE_PUSH_INTERVAL_MS = 15000;
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
        // 否則老師看到的會停在 15 秒前的舊狀態
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
                if (copied) { alert(msg); } else { prompt(msg + '\n複製失敗，請手動複製以下內容：', clipboardText); }
            } catch (e) {
                alert('產生連結失敗: ' + e.message);
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = originalHTML; }
            }
        }

        function renderAnswerMode() {
            const container = document.getElementById('answerModeContainer');
            if (!container) return;
            const items = window.currentItems || [];
            let html = "<div class='max-w-2xl mx-auto p-4'>";

            // 開始畫面：先填資料+選作答模式，按「開始測驗」確認後才顯示題目本體，
            // 避免模式選項跟題目混在一起、寫到一半才發現選錯模式
            html += "<div id='ansStartScreen'>";
            html += "<div class='lq-card p-6 mb-4 text-center'><h2 class='font-bold text-lg mb-1'>📱 線上作答</h2><p class='text-sm text-gray-500'>選擇/複選題會自動判分；填空/簡答題只能做文字比對，僅供參考，請自行核對。</p></div>";

            // 登入狀態區塊：只有透過分享連結進來作答的學生需要(家長監看要靠學生帳號)，
            // 老師自己預覽/家長答案檢視模式都不用看到
            if (window.isSharedView && window.sharedMode === 'student') {
                html += "<div id='ansLoginBox'>" + buildAnswerLoginBoxHtml() + "</div>";
            }

            html += "<div class='lq-card p-4 mb-4'>" +
                "<div class='text-sm text-gray-500 mb-2'>👤 填寫資料（選填，方便老師/家長核對是誰寫的）</div>" +
                "<div class='grid grid-cols-2 sm:grid-cols-4 gap-2'>" +
                "<input id='ansStuGrade' placeholder='年級' class='lq-input text-sm py-1.5'>" +
                "<input id='ansStuClass' placeholder='班級' class='lq-input text-sm py-1.5'>" +
                "<input id='ansStuSeat' placeholder='座號' class='lq-input text-sm py-1.5'>" +
                "<input id='ansStuName' placeholder='姓名' class='lq-input text-sm py-1.5'>" +
                "</div></div>";

            // 「每題即時看結果」是需要登入的功能：即時回饋會一題一題回報到伺服器(老師/家長監看也靠這個)，
            // 未登入者只給「全部寫完再送出」，並直接告訴他登入就能解鎖
            const canInstant = !!window.currentUser;
            html += "<div class='lq-card p-4 mb-5' id='ansModeBox'>" +
                "<div class='text-sm text-gray-500 mb-3 text-center font-semibold'>請選擇作答模式</div>" +
                "<div class='flex items-center justify-center gap-4 sm:gap-6 text-sm flex-wrap'>" +
                "<label class='flex items-center gap-1.5 font-semibold " + (canInstant ? "cursor-pointer" : "opacity-50 cursor-not-allowed") + "'>" +
                    "<input type='radio' name='ansGradeMode' value='instant'" + (canInstant ? " checked" : " disabled") + "> ⚡ 每題即時看結果" + (canInstant ? "" : "🔒") + "</label>" +
                "<label class='flex items-center gap-1.5 cursor-pointer font-semibold'><input type='radio' name='ansGradeMode' value='batch'" + (canInstant ? "" : " checked") + "> 📋 全部寫完再送出</label>" +
                "</div>" +
                (canInstant ? "" :
                    "<div class='text-xs text-gray-500 text-center mt-3'>想寫一題就馬上知道對不對？登入帳號就能用，分數也會存進你自己的紀錄。" +
                    "<button type='button' onclick='openAccountModal()' class='underline font-semibold' style='color:var(--hl-blue);'>登入／註冊</button></div>") +
                "</div>";

            html += "<button onclick='startAnswerQuiz()' class='lq-btn lq-cta lq-btn-primary w-full py-3 rounded-xl text-lg'>🚀 開始測驗</button>";
            html += "</div>";

            // 題目本體：預設隱藏，確認模式並按下「開始測驗」後才顯示
            html += "<div id='ansQuizBody' class='hidden'>";
            items.forEach((q, i) => {
                const letters = getCorrectLetters(q);
                html += "<div class='lq-card p-4 mb-3 ans-card' id='ans-card-" + i + "'>";
                html += "<div class='font-bold mb-2'>" + (i + 1) + ". " + escapeHtml(q.q) + " <span class='text-xs text-gray-400'>(" + q.s + "分)</span></div>";
                if (q.o && q.o.length > 0) {
                    const inputType = letters && letters.length > 1 ? 'checkbox' : 'radio';
                    q.o.forEach((o, oi) => {
                        const label = String.fromCharCode(65 + oi);
                        html += "<label class='flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 cursor-pointer'>" +
                            "<input type='" + inputType + "' name='ans-" + i + "' value='" + label + "'" +
                            " class='w-4 h-4 flex-shrink-0 accent-[color:var(--hl-blue)]' onchange='onAnswerPicked(" + i + ")'>" +
                            "<span>(" + label + ") " + escapeHtml(stripOptLabel(o, label)) + "</span></label>";
                    });
                    // 只有選擇/複選題才需要「確認這題」按鈕(即時模式用)：原本一點選項就馬上判定，
                    // 誤按到旁邊的選項也會被當成已送出，Steve反映要有明確的送出動作才不會誤按。
                    // 是否顯示由startAnswerQuiz()依選定的模式決定(批次模式不需要,只用最下面的送出評分)
                    html += "<button type='button' onclick='confirmAnswer(" + i + ")' id='ans-confirm-" + i + "' class='ans-confirm-btn lq-btn lq-btn-primary text-sm px-3 py-1.5 mt-2' style='display:none;'>✅ 確認這題</button>";
                } else {
                    html += "<textarea class='lq-input mt-1' rows='2' id='ans-text-" + i + "' placeholder='請輸入答案' onblur='onTextAnswerBlur(" + i + ")'></textarea>";
                }
                html += "<div class='ans-feedback mt-2 text-sm hidden' id='ans-feedback-" + i + "'></div>";
                html += "</div>";
            });
            // 即時進度分享連結：只有透過分享連結進來作答的學生(有shareId)才需要，老師自己預覽不用
            if (window.isSharedView && window.sharedMode === 'student' && window.liveShareId) {
                html += "<button type='button' onclick='shareLiveProgressLink(this)' class='lq-btn lq-btn-share w-full py-2 text-sm mb-3'>📤 分享即時監看連結給家長（家長不用註冊）</button>";
            }
            html += "<button onclick='gradeAnswers()' class='lq-btn lq-btn-primary w-full py-3 rounded-xl text-lg'>✅ 送出評分</button>";
            html += "<div id='scoreResult' class='mt-4'></div>";
            html += "</div>";

            html += "</div>";
            container.innerHTML = html;
        }

        // 確認模式+資料後才會呼叫，把題目本體從隱藏切成顯示；學生資料/模式選擇的input
        // 都還留在DOM裡(只是視覺隱藏)，之後gradeAnswers()/shareResult()一樣讀得到值
        function startAnswerQuiz() {
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
            void card.offsetWidth;
            card.classList.add(correct ? 'ans-correct' : 'ans-wrong');
        }

        // 單題判分：即時模式的onchange跟批次的送出評分共用同一套邏輯，
        // 結果存進window.gradedDetails[i]供之後「分享結果」組資料使用
        function gradeOneQuestion(i) {
            const items = window.currentItems || [];
            const q = items[i];
            const fb = document.getElementById('ans-feedback-' + i);
            if (!q || !fb) return null;
            const letters = getCorrectLetters(q);
            let result;
            if (q.o && q.o.length > 0) {
                const checked = Array.from(document.querySelectorAll('input[name="ans-' + i + '"]:checked')).map(el => el.value).sort();
                const correct = (letters || []).slice().sort();
                const isCorrect = checked.length > 0 && checked.length === correct.length && checked.every((v, idx) => v === correct[idx]);
                // 萬一連字母都比對不出來(AI答案格式異常)，退而顯示原始答案內容，不要留空白
                const correctDisplay = correct.length > 0 ? correct.join('') : (String(q.a || '').trim() || '(無法判讀，請自行核對)');
                const userDisplay = checked.length > 0 ? checked.join('') : '(未作答)';
                const restText = isCorrect ? '答對了！' : ('答錯了，正確答案：' + correctDisplay + (q.e ? ('｜解析：' + q.e) : ''));
                setAnswerFeedback(fb, isCorrect ? '✅' : '❌', restText, 'ans-feedback mt-2 text-sm ' + (isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'));
                flashAnswerCard(i, isCorrect);
                result = { score: isCorrect ? (q.s || 0) : 0, max: q.s || 0, isCorrect, reviewNeeded: false, userDisplay, correctDisplay };
            } else {
                const inputEl = document.getElementById('ans-text-' + i);
                const userAns = ((inputEl && inputEl.value) || '').trim();
                const correctAns = String(q.a || '').trim();
                const roughMatch = userAns !== '' && userAns.replace(/\s/g, '') === correctAns.replace(/\s/g, '');
                const restText = (roughMatch ? '文字比對相符(僅供參考)' : '請自行核對') + '，參考答案：' + correctAns + (q.e ? ('｜解析：' + q.e) : '');
                setAnswerFeedback(fb, roughMatch ? '🤔' : '📝', restText, 'ans-feedback mt-2 text-sm text-blue-600');
                flashAnswerCard(i, roughMatch);
                result = { score: roughMatch ? (q.s || 0) : 0, max: q.s || 0, isCorrect: roughMatch, reviewNeeded: true, userDisplay: userAns || '(未作答)', correctDisplay: correctAns };
            }
            window.gradedDetails = window.gradedDetails || {};
            window.gradedDetails[i] = result;
            return result;
        }

        function gradeAnswers() {
            // 交卷是關鍵事件，不等節流窗，立刻把最終狀態送出去讓老師/家長看到已完成
            pushLiveProgress(true);
            const items = window.currentItems || [];
            let totalScore = 0, maxScore = 0, needReview = 0;
            window.gradedDetails = {};
            items.forEach((q, i) => {
                const r = gradeOneQuestion(i);
                maxScore += (q.s || 0);
                if (!r) return;
                totalScore += r.score;
                if (r.reviewNeeded) needReview++;
            });

            const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
            window.lastGradeSummary = { totalScore, maxScore, pct };
            // 學生端(自主練習或用連結進來作答)把成績留在這台裝置的練習紀錄
            if (window.practiceMode || (window.currentUser && window.currentUser.role === 'student')) {
                savePracticeLog(window.docTitle || '練習卷', pct);
            }
            let resultHTML = "<div class='lq-card p-5 text-center ans-score-pop' style='border:2px solid var(--hl-blue);'>";
            resultHTML += "<div class='text-3xl font-bold mb-1' style='color:var(--hl-blue);'>" + totalScore + " / " + maxScore + " 分</div>";
            resultHTML += "<div class='text-sm text-gray-500 mb-3'>約 " + pct + " 分" + (needReview > 0 ? "（含填空/簡答題的文字比對估算，建議自行核對）" : "（選擇/複選題自動判分）") + "</div>";
            resultHTML += "<button onclick='shareResult(this)' class='lq-btn lq-btn-share px-4 py-2 text-sm'>📤 分享結果給家長/老師</button>";
            resultHTML += "<div id='shareResultMsg' class='text-xs text-gray-500 mt-2'></div>";
            resultHTML += "</div>";
            const scoreEl = document.getElementById('scoreResult');
            scoreEl.innerHTML = resultHTML;
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
                if (!copied) prompt('複製失敗，請手動複製以下內容：', clipboardText);
            } catch (e) {
                if (msgEl) msgEl.textContent = '❌ 產生連結失敗：' + e.message;
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerText = originalLabel; }
            }
        }

