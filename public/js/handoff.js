// 刻度｜交接模式：家長／教師用同一支手機出好題目後，直接遞給學生作答（不登入、不傳連結）。
// 學生交卷後只看到「已交卷」；分數、對錯、正確答案與解析，要家長／教師輸入開始前設定的 4 位數密碼才會公布。
// 一支手機可以輪流給多位學生寫（換下一位免密碼，成績暫存在記憶體，解鎖時一次看全部）。
// 密碼與成績只存在這個頁面的記憶體裡，重新整理就消失（重整也會失去題目，所以不會留下殘餘）。
// UI 取捨經 Gemini 兩輪討論（2026-11-03）：全藏對錯避免挫折與偷看、忘記密碼改用算式。解鎖一度設計成長按 2 秒，後來因為已有密碼擋著而改成單點。
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
                "<img src='assets/illust/handoff.webp' alt='' class='lq-illust' style='max-width:15rem' loading='lazy'>" +
                "<div class='lq-card p-3 text-sm'>直接把這支手機遞給學生，不用登入。學生交卷後只會看到「已交卷」，<b>分數與詳細解答要輸入下面設定的密碼才會出現</b>。</div>" +
                "<div>" +
                    "<label class='text-sm font-semibold block mb-1' for='handoffPinInput'>設定家長／教師密碼（4 位數字）</label>" +
                    // 用明碼：這時學生還沒拿到手機，看得到數字比較不會打錯後忘記；數字鍵盤省去切換
                    "<input id='handoffPinInput' type='text' inputmode='numeric' pattern='[0-9]*' maxlength='4' autocomplete='off' class='lq-input w-full text-center font-black text-xl' style='letter-spacing:0.4em;' placeholder='0000'>" +
                    "<div class='text-xs text-gray-500 mt-1'>請記住它。萬一忘記，解鎖時留空按確定，可以改用算式驗證。</div>" +
                "</div>" +
                "<div>" +
                    "<label class='text-sm font-semibold block mb-1' for='handoffNameInput'>學生暱稱（選填）</label>" +
                    "<input id='handoffNameInput' type='text' maxlength='10' autocomplete='off' class='lq-input w-full' placeholder='不填也可以，成績會標「學生1」'>" +
                "</div>" +
                "<button onclick='startHandoff()' class='lq-btn lq-cta lq-btn-primary w-full py-3 text-lg'>📱 開始，交給學生</button>" +
                "<button onclick='renderQuizEntryRoleChoice()' class='lq-btn lq-btn-ghost w-full py-2 text-sm'>其他身分（看孩子進度、老師儀表板）</button>" +
                "</div>";
            document.getElementById('quizEntryModal').classList.remove('hidden');
        }

        function startHandoff() {
            const pin = (document.getElementById('handoffPinInput').value || '').trim();
            if (!/^\d{4}$/.test(pin)) {
                lqAlert('請設定 4 位數字的密碼，學生交卷後要用它才看得到分數與詳細解答');
                return;
            }
            const name = (document.getElementById('handoffNameInput').value || '').trim() || '學生1';
            window.handoff = { active: true, pin: pin, name: name, records: [] };
            closeQuizEntryModal();
            document.body.classList.add('handoff-mode');
            window.addEventListener('beforeunload', handoffBeforeUnload);
            ensureHandoffBar();
            handoffResetAnswers();
        }

        // 清掉上一位的作答，重新畫一份乾淨的作答頁並直接進入題目（跳過開始畫面）
        function handoffResetAnswers() {
            window.gradedDetails = {};
            window.lastGradeSummary = null;
            const ans = document.getElementById('answerModeContainer');
            if (ans) ans.dataset.rendered = '';
            switchSheet('answer');
            startAnswerQuiz();
            window.scrollTo(0, 0);
        }

        // 頂端細條：提示「學生作答中」；右邊小按鈕單點就跳出密碼框（有 4 位數密碼擋著，不需要再長按）
        function ensureHandoffBar() {
            if (document.getElementById('handoffBar')) return;
            const bar = document.createElement('div');
            bar.id = 'handoffBar';
            bar.className = 'no-print';
            bar.innerHTML = "<span>🔒 " + escapeHtml(window.handoff.name) + " 作答中</span><button type='button'>家長／教師</button>";
            document.body.appendChild(bar);
            bar.querySelector('button').addEventListener('click', handoffUnlock);
        }

        // 交卷時由 gradeAnswers() 呼叫：把這位學生的成績存進記憶體
        function handoffRecordResult(totalScore, maxScore, pct) {
            window.handoff.records.push({ name: window.handoff.name, totalScore: totalScore, maxScore: maxScore, pct: pct });
        }

        // 交卷後鎖住所有作答欄位並收起送出鈕：否則學生可以改答案重送
        function handoffLockAfterGrade() {
            document.querySelectorAll('#ansQuizBody input, #ansQuizBody textarea, #ansQuizBody .lq-typed-btn').forEach(function (el) { el.disabled = true; });
            document.querySelectorAll('#ansQuizBody button[onclick^="requestGrade"], #ansQuizBody button[onclick^="gradeAnswers"]').forEach(function (el) { el.style.display = 'none'; });
        }

        // 換下一位同學：免密碼（不會公布任何東西），題目與密碼保留，作答清空，成績留在記憶體
        async function handoffNextStudent() {
            if (!handoffActive()) return;
            const next = await askText('下一位同學的暱稱（可留空）', { value: '學生' + (window.handoff.records.length + 1) });
            if (next === null) return;
            window.handoff.name = String(next).trim() || ('學生' + (window.handoff.records.length + 1));
            const bar = document.getElementById('handoffBar');
            if (bar) bar.remove();
            ensureHandoffBar();
            handoffResetAnswers();
        }

        async function handoffUnlock() {
            if (!handoffActive()) return;
            const input = await askText('請輸入家長／教師密碼（4 位數字）。忘記密碼請留空，直接按確定，改用算式驗證。', { secret: true });
            if (input === null) return;
            if (String(input).trim() === '') {
                if (await handoffMathGate()) endHandoff();
                return;
            }
            if (String(input).trim() !== window.handoff.pin) {
                lqAlert('密碼不對');
                return;
            }
            endHandoff();
        }

        // 忘記密碼的補救：出一題成人才算得快的算式（兩位數乘一位數），答對才解鎖。
        // 絕不能直接公開解答，否則學生裝作忘記密碼就能看答案
        async function handoffMathGate() {
            const a = 23 + Math.floor(Math.random() * 67), b = 6 + Math.floor(Math.random() * 4);
            const ans = await askText('家長／教師驗證：請算出 ' + a + ' × ' + b + ' = ?');
            if (ans === null) return false;
            if (String(ans).trim() !== String(a * b)) { lqAlert('答案不對，請再試一次'); return false; }
            return true;
        }

        // 作答中不小心重新整理或關頁，題目與作答都會消失，先跳瀏覽器內建警告（beforeunload 瀏覽器不准自訂文字）
        function handoffBeforeUnload(e) {
            e.preventDefault();
            e.returnValue = '';
        }

        // 解鎖：公布最後一位學生每題的對錯、正確答案與解析，成績卡改成全部學生的成績名單，並把工具列還給家長／教師
        function endHandoff() {
            const records = window.handoff.records.slice();
            window.handoff.active = false;
            window.removeEventListener('beforeunload', handoffBeforeUnload);
            document.body.classList.remove('handoff-mode');
            const bar = document.getElementById('handoffBar');
            if (bar) bar.remove();

            const details = window.gradedDetails || {};
            Object.keys(details).forEach(function (k) {
                const r = details[k];
                const fb = document.getElementById('ans-feedback-' + k);
                if (!r || !r.fb || !fb) return;
                setAnswerFeedback(fb, r.fb.badge, r.fb.restText, r.fb.cls);
                flashAnswerCard(Number(k), r.isCorrect);
            });

            const wrongCount = Object.keys(details).filter(function (k) { return details[k] && !details[k].isCorrect; }).length;
            const card = document.getElementById('scoreResult') && document.getElementById('scoreResult').firstElementChild;
            if (card && records.length > 0) {
                const rows = records.map(function (r, i) {
                    const last = i === records.length - 1;
                    return "<div class='flex justify-between items-center text-sm py-1.5 border-b border-gray-100" + (last ? " font-bold" : "") + "'>" +
                        "<span>" + escapeHtml(r.name) + (last ? "（下方為這位的詳解）" : "") + "</span>" +
                        "<span style='color:var(--hl-blue);'>" + r.totalScore + " / " + r.maxScore + " 分</span></div>";
                }).join('');
                let actions = '';
                if (wrongCount > 0) {
                    actions += "<button onclick='handoffRetryWrong()' class='lq-btn lq-btn-primary w-full py-2 text-sm mt-3'>🔁 只重做錯題（" + wrongCount + " 題）</button>";
                }
                if (window._handoffOriginalItems && window.currentItems === window._handoffRetryItems) {
                    actions += "<button onclick='handoffRestoreItems()' class='lq-btn lq-btn-secondary w-full py-2 text-sm mt-2'>📋 還原成完整題目</button>";
                }
                card.innerHTML = "<div class='font-bold mb-2'>🔓 已解鎖，成績名單</div>" + rows +
                    "<div class='text-xs text-gray-500 mt-3'>填空／簡答為文字比對估算，請自行核對。每題下方是正確答案與解析，也可切到上方「答案卷」。</div>" + actions;
            }
            if (typeof updateGlobalBackBtn === 'function') updateGlobalBackBtn();
            window.scrollTo(0, 0);
        }

        // 解鎖後「只重做錯題」：把上一位答錯（含填空比對不符）的題目挑出來，沿用同一組密碼與暱稱再交給學生一次。
        // 純前端過濾現有題目，不重打 API；配分重算成滿分 100。原題目留在 _handoffOriginalItems，可還原
        function handoffRetryWrong() {
            const details = window.gradedDetails || {};
            const items = window.currentItems || [];
            const wrong = items.filter(function (q, i) { return details[i] && !details[i].isCorrect; }).map(function (q) { return Object.assign({}, q); });
            if (wrong.length === 0 || !window.handoff) return;
            // 只有「目前題目就是上次的重做題」才沿用舊備份；換過題目（新出題、載入歷史）就以目前這份為完整題目
            if (!window._handoffOriginalItems || items !== window._handoffRetryItems) window._handoffOriginalItems = items;
            normalizeScores(wrong);
            window._handoffRetryItems = wrong;
            window.currentItems = wrong;
            renderPaperFixed(wrong, window.docTitle);
            window.handoff.active = true;
            window.handoff.name = String(window.handoff.name).replace(/（重做錯題）$/, '') + '（重做錯題）';
            document.body.classList.add('handoff-mode');
            window.addEventListener('beforeunload', handoffBeforeUnload);
            ensureHandoffBar();
            handoffResetAnswers();
        }

        // 還原成出題時的完整題目，回到題目卷畫面
        function handoffRestoreItems() {
            if (!window._handoffOriginalItems || window.currentItems !== window._handoffRetryItems) return;
            window.currentItems = window._handoffOriginalItems;
            window._handoffOriginalItems = null;
            window._handoffRetryItems = null;
            renderPaperFixed(window.currentItems, window.docTitle);
            switchSheet('quiz');
            window.scrollTo(0, 0);
        }

