// 刻度｜交接模式：家長／教師用同一支手機出好題目後，直接遞給學生作答（不登入、不傳連結）。
// 學生寫完只看得到分數與對錯；正確答案與解析要家長／教師輸入開始前設定的 4 位數密碼才會顯示。
// 密碼只存在這個頁面的記憶體裡，重新整理就消失（重整也會失去題目，所以不會留下殘餘）。
        window.handoff = null;

        function handoffActive() {
            return !!(window.handoff && window.handoff.active);
        }

        // 「交給學生作答」按鈕：先設密碼，再進入交接模式
        function openHandoffSetup() {
            if (!window.currentItems || window.currentItems.length === 0) {
                lqAlert('目前沒有題目可以線上作答');
                return;
            }
            document.getElementById('quizEntryTitle').textContent = '📱 交給學生作答';
            document.getElementById('quizEntryBody').innerHTML =
                "<div class='space-y-3'>" +
                "<div class='lq-card p-3 text-sm'>直接把這支手機遞給學生，不用登入。學生寫完只看得到分數與對錯，<b>詳細解答要輸入下面設定的密碼才會出現</b>。</div>" +
                "<div>" +
                    "<label class='text-sm font-semibold block mb-1' for='handoffPinInput'>設定家長／教師密碼（4 位數字）</label>" +
                    "<input id='handoffPinInput' type='password' inputmode='numeric' maxlength='4' autocomplete='off' class='lq-input w-full text-center font-black text-xl' style='letter-spacing:0.4em;' placeholder='••••'>" +
                "</div>" +
                "<button onclick='startHandoff()' class='lq-btn lq-cta lq-btn-primary w-full py-3 text-lg'>📱 開始，交給學生</button>" +
                "<button onclick='renderQuizEntryRoleChoice()' class='lq-btn lq-btn-ghost w-full py-2 text-sm'>其他身分（看孩子進度、老師儀表板）</button>" +
                "</div>";
            document.getElementById('quizEntryModal').classList.remove('hidden');
        }

        function startHandoff() {
            const pin = (document.getElementById('handoffPinInput').value || '').trim();
            if (!/^\d{4}$/.test(pin)) {
                lqAlert('請設定 4 位數字的密碼，學生寫完後要用它才看得到詳細解答');
                return;
            }
            window.handoff = { active: true, pin: pin };
            closeQuizEntryModal();
            window.gradedDetails = {};
            const ans = document.getElementById('answerModeContainer');
            if (ans) ans.dataset.rendered = '';
            document.body.classList.add('handoff-mode');
            ensureHandoffBar();
            switchSheet('answer');
            startAnswerQuiz();
            window.scrollTo(0, 0);
        }

        // 頂端細條：提示「學生作答中」，右邊留一顆小按鈕給家長／教師解鎖
        function ensureHandoffBar() {
            if (document.getElementById('handoffBar')) return;
            const bar = document.createElement('div');
            bar.id = 'handoffBar';
            bar.className = 'no-print';
            bar.innerHTML = "<span>🔒 學生作答中</span><button type='button' onclick='handoffUnlock()'>家長／教師</button>";
            document.body.appendChild(bar);
        }

        async function handoffUnlock() {
            if (!handoffActive()) return;
            const input = await askText('請輸入家長／教師密碼（4 位數字）', { secret: true });
            if (input === null) return;
            if (String(input).trim() !== window.handoff.pin) {
                lqAlert('密碼不對');
                return;
            }
            endHandoff();
        }

        // 解鎖：把已評分的每題換成完整回饋（正確答案＋解析），並把工具列還給家長／教師
        function endHandoff() {
            window.handoff.active = false;
            document.body.classList.remove('handoff-mode');
            const bar = document.getElementById('handoffBar');
            if (bar) bar.remove();

            const details = window.gradedDetails || {};
            Object.keys(details).forEach(function (k) {
                const r = details[k];
                const fb = document.getElementById('ans-feedback-' + k);
                if (!r || !r.fb || !fb) return;
                setAnswerFeedback(fb, r.fb.badge, r.fb.restText, r.fb.cls);
                if (r.reviewNeeded) flashAnswerCard(Number(k), r.isCorrect);
            });

            const unlockBtn = document.querySelector('#scoreResult button[onclick="handoffUnlock()"]');
            if (unlockBtn && unlockBtn.parentNode) {
                unlockBtn.parentNode.innerHTML =
                    "<div class='text-3xl font-bold mb-1' style='color:var(--hl-blue);'>" + ((window.lastGradeSummary || {}).totalScore || 0) + " / " + ((window.lastGradeSummary || {}).maxScore || 0) + " 分</div>" +
                    "<div class='text-sm text-gray-600'>🔓 已解鎖：每題下方是正確答案與解析。上方可切到「答案卷」。</div>";
            }
            if (typeof updateGlobalBackBtn === 'function') updateGlobalBackBtn();
            window.scrollTo(0, 0);
        }
