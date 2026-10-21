// Luno 綸諾｜單題重新出、試卷畫面。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 單題重新出（會再打一次API，一樣受30秒冷卻限制） ---
        // 「重新出整份」實際上是整頁 reload，會把已經產生的題目、老師手動改過的內容、
        // 還沒複製的分享連結全部丟掉，卻沒有任何確認。加一道防呆。
        function restartWholeQuiz() {
            const n = (window.currentItems || []).length;
            const msg = n > 0
                ? "確定要重出整份試卷嗎？\n\n目前這 " + n + " 題（含你手動修改過的內容）都會被清掉，回到出題設定畫面。\n\n如果只是某一題不滿意，請關掉這個視窗，改按該題右上角的「🎲 換這題」。"
                : "確定要回到出題設定畫面嗎？";
            if (!confirm(msg)) return;
            location.reload();
        }

        function regenBtnHTML(idx) {
            if (window.isSharedView) return "";
            // 標籤刻意跟工具列的「重新出整份」拉開距離：兩顆按鈕原本叫「重新出題」跟「重新出這題」，
            // 只差一個字、圖示又都是旋轉箭頭，老師想換一題卻按到整份重來會把改好的內容全部洗掉
            return "<div class='no-print q-regen-toolbar' contenteditable='false'><button type='button' title='只換掉這一題（其他題目不受影響）' onclick='regenerateQuestion(" + idx + ", this)' class='text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300' style='cursor:pointer;white-space:nowrap;'>🎲<span class='q-regen-label'> 換這題</span></button></div>";
        }

        function buildRegenPrompt(idx) {
            const orig = window.currentItems[idx];
            const s = window.currentSettings || {};
            const isChoice = orig.o && orig.o.length > 0;
            let p = "請只出【1題】新題目，取代原本的第" + (idx+1) + "題，條件如下：\n";
            if (s.sType === '1') {
                let pubStr = s.publisher === '由小綸自由發揮' ? '不限版本，請依一般課綱知識出題' : s.publisher;
                p += "- 年級：" + s.grade + "\n- 科目：" + s.subject + "\n- 版本：" + pubStr + "\n- 範圍：" + s.scope + "\n- 難度：" + s.difficulty + "\n";
                p += getDifficultyRubric(s.difficulty);
            } else {
                p += "請依照參考附件/資料內容出題。\n";
            }
            p += "- 題型：" + (isChoice ? ("選擇題，共" + orig.o.length + "個選項") : "填充題或簡答題(無選項)") + "\n";
            p += "- 配分：" + orig.s + "分\n";
            p += "【避免重複】：請勿與以下已存在的題目重複或雷同：\n";
            (window.currentItems || []).forEach((it, i) => { if (i !== idx && it && it.q) p += (i+1) + ". " + it.q + "\n"; });
            p += "\n【語言】：請務必使用「" + (s.lang || '繁體中文') + "」撰寫所有內容！\n";
            p += '【嚴格格式要求】：必須且只能回傳合法的 JSON Array，且只包含1個物件。格式：[{"q":"題目內容","o":["選項1","選項2"],"a":"答案","e":"解析","s":' + orig.s + '}]。若為填充/簡答/計算題，"o" 必須且只能回傳空陣列 []，並將解答寫在 "a"，題目中預留底線(________________________)供填寫。';
            return p;
        }

        // AI 有時會在選項內容裡自己帶上「(A)」「A.」這種標號，前端再加一次就變成「(A) (A) 14」。
        // 只有開頭那個字母跟這個選項的標號相同、而且後面接著括號/句點這類分隔符時才拿掉，
        // 避免誤刪像「A 原子的質子數」這種本來就以字母開頭的正常內容
        function stripOptLabel(text, label) {
            return String(text).replace(new RegExp('^\\s*[（(]?\\s*' + label + '\\s*[)）.、:：]\\s*', 'i'), '');
        }

        function updateQuestionDOM(idx, q) {
            let qItem = document.querySelector('.q-item[data-idx="' + idx + '"]');
            if (qItem) {
                let box = qItem.querySelector('.q-content-box');
                let optsHTML = "";
                if (q.o && q.o.length > 0) {
                    optsHTML += "<div class='q-opts'>";
                    q.o.forEach((o, oi) => {
                        let label = String.fromCharCode(65+oi);
                        optsHTML += "<div class='q-opt editable-text' contenteditable='true'>("+label+") "+escapeHtml(stripOptLabel(o, label))+"</div>";
                    });
                    optsHTML += "</div>";
                }
                let answerSpace = (!q.o || q.o.length === 0) ? "<div class='writing-space'></div>" : "";
                box.innerHTML = regenBtnHTML(idx) +
                    "<div class='q-text editable-text' contenteditable='true'>" + escapeHtml(q.q) + " <span style='font-size:10pt; color:#666;'>(" + q.s + "分)</span></div>" +
                    optsHTML + answerSpace;

                let numBox = qItem.querySelector('.q-num-box');
                let globalNum = idx + 1;
                numBox.innerHTML = (q.o && q.o.length > 0) ? (globalNum + ". (　　)") : (globalNum + ".");
            }

            let keyItem = document.querySelector('.key-item[data-idx="' + idx + '"]');
            if (keyItem) {
                let ans = q.a;
                if (Array.isArray(q.a)) ans = q.a.map(x=>String.fromCharCode(65+x)).join('');
                else if (typeof q.a === 'number') ans = String.fromCharCode(65+q.a);
                else ans = q.a || '(略)';
                keyItem.innerHTML = "<b>"+(idx+1)+".</b> <span style='color:red; font-weight:bold; margin-right:10px;'>"+escapeHtml(ans)+"</span> <span style='font-size:10pt; color:#666;'>"+escapeHtml(q.e||'')+"</span>";
            }
        }

        async function regenerateQuestion(idx, btnEl) {
            if (!window.currentItems || !window.currentItems[idx]) return;
            const originalLabel = btnEl.innerHTML;
            btnEl.disabled = true;
            btnEl.innerText = "⏳ 出題中...";
            try {
                let parts = [{ text: buildRegenPrompt(idx) }];
                const s = window.currentSettings || {};
                if (s.sType === '2') {
                    uploadItems.filter(item => item.type === 'file').forEach(file => {
                        parts.push({ inline_data: { mime_type: file.mime, data: file.data } });
                    });
                }
                if (s.contentText) parts.push({ text: "\n參考內容:\n" + s.contentText });

                const adminPass = sessionStorage.getItem('linquiz_admin') || "";
                const userKey = document.getElementById('userKey').value.trim();

                let res = await fetch(API_BASE + "/api/generate", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Batch-Index': '0',
                        'X-Admin-Pass': adminPass,
                        'X-Gemini-Api-Key': userKey,
                        'X-Client-Id': getClientId()
                    },
                    body: JSON.stringify({ contents: [{ parts: parts }] })
                });

                if (res.status === 429) {
                    let cd = await res.json().catch(() => ({}));
                    let remaining = (cd.error && cd.error.remaining) || 30;
                    alert("⏳ 目前冷卻中，請等待 " + remaining + " 秒後再試一次單題重出");
                    startCooldownUI(remaining);
                    return;
                }

                let data = await res.json();
                if (data.error) throw new Error(data.error.message);

                let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                const bt = String.fromCharCode(96).repeat(3);
                let cleanJSON = rawText.replace(new RegExp(bt + 'json', 'gi'), '').replace(new RegExp(bt, 'g'), '').trim();
                cleanJSON = cleanJSON.replace(/[\r\n]+/g, ' ');
                let s2 = cleanJSON.indexOf('['), e2 = cleanJSON.lastIndexOf(']');
                if (s2 !== -1 && e2 !== -1) {
                    cleanJSON = cleanJSON.substring(s2, e2+1).replace(/,\s*\]/g,']').replace(/,\s*\}/g,'}');
                }
                let parsed = JSON.parse(cleanJSON);
                let newQ = Array.isArray(parsed) ? parsed[0] : parsed;
                if (!newQ || !newQ.q) throw new Error("AI 回傳格式異常，請再試一次");

                window.currentItems[idx] = newQ;
                updateQuestionDOM(idx, newQ);
                let ansContainer = document.getElementById('answerModeContainer');
                if (ansContainer) ansContainer.dataset.rendered = '';
            } catch(e) {
                alert("重新出題失敗: " + e.message);
            } finally {
                btnEl.disabled = false;
                btnEl.innerHTML = originalLabel;
            }
        }

        function renderPaperFixed(items, titleOverride) {
            const inputForm = document.getElementById('inputForm');
            const resultSection = document.getElementById('resultSection');
            inputForm.classList.add('hidden');
            hidePracticeLoading();
            const studentHome = document.getElementById('studentHome');
            if (studentHome) studentHome.classList.add('hidden');
            resultSection.classList.remove('hidden');

            let container = document.getElementById('paperContainer');
            container.innerHTML = "";
            container.style.display = 'block';

            let ansContainer = document.getElementById('answerModeContainer');
            if (ansContainer) { ansContainer.dataset.rendered = ''; ansContainer.style.display = 'none'; }

            let title = titleOverride || ((document.getElementById('sourceType').value==='1' ? (document.getElementById('grade').value==='Custom'?document.getElementById('c_grade').value:document.getElementById('grade').value)+" "+document.getElementById('subject').value : "測驗") + "試卷");
            let sub = "範圍：" + (document.getElementById('scope').value || "綜合");
            // docTitle是乾淨標題(給分享連結/剪貼簿訊息這種要顯示給人看的地方用)；
            // docName是title+範圍組合(給下載檔名用，例如"XX試卷_範圍：YY.doc")。
            // 之前分享連結直接把docName當標題傳給/api/share，學生端開啟時renderPaperFixed()
            // 又會在這個已經含"範圍："的字串後面再接一次範圍，變成"範圍：A_範圍：B"重複(Steve回報)
            window.docTitle = title.replace(/[<>:"/\\|?*]/g, "");
            window.docName = (title + "_" + sub).replace(/[<>:"/\\|?*]/g, "");

            const qTypeVal = document.getElementById('qType').value || "";
            const isWriting = qTypeVal.includes('簡答') || qTypeVal.includes('填充') || qTypeVal.includes('計算');
            const ITEMS_PER_PAGE = isWriting ? 8 : 10;

            let chunks = [];
            for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
                chunks.push(items.slice(i, i + ITEMS_PER_PAGE));
            }

            chunks.forEach((chunk, pageIdx) => {
                let pageNum = pageIdx + 1;
                let pageDiv = document.createElement('div');
                pageDiv.className = "a4-page quiz-page";
                pageDiv.contentEditable = "true";

                let headerHTML = "";
                if (pageNum === 1) {
                    headerHTML = "<div class='paper-header' contenteditable='true'>" +
                        "<h2>"+escapeHtml(title)+"</h2>" +
                        "<div class='paper-info'>" +
                        "<span>"+escapeHtml(sub)+"</span><span>班級：＿＿＿＿＿ 姓名：＿＿＿＿＿ 座號：＿＿＿＿＿</span></div></div>";
                } else {
                    headerHTML = "<div style='height: 30pt;'></div>";
                }

                let contentHTML = "";
                chunk.forEach((q, localIdx) => {
                    let globalNum = (pageIdx * ITEMS_PER_PAGE) + localIdx + 1;
                    let optsHTML = "";
                    if(q.o && q.o.length > 0) {
                        optsHTML += "<div class='q-opts'>";
                        q.o.forEach((o, oi) => {
                            let label = String.fromCharCode(65+oi);
                            optsHTML += "<div class='q-opt editable-text' contenteditable='true'>("+label+") "+escapeHtml(stripOptLabel(o, label))+"</div>";
                        });
                        optsHTML += "</div>";
                    }
                    let prefix = (q.o && q.o.length > 0) ? (globalNum + ". (　　)") : (globalNum + ".");
                    let answerSpace = (!q.o || q.o.length === 0) ? "<div class='writing-space'></div>" : "";
                    let qIdx = globalNum - 1;

                    contentHTML += "<div class='q-item' data-idx='" + qIdx + "'>" +
                       "<div class='q-num-box'>" + prefix + "</div>" +
                       "<div class='q-content-box'>" +
                           regenBtnHTML(qIdx) +
                           "<div class='q-text editable-text' contenteditable='true'>" + escapeHtml(q.q) + " <span style='font-size:10pt; color:#666;'>(" + q.s + "分)</span></div>" +
                           optsHTML +
                           answerSpace +
                       "</div></div>";
                });

                let footerHTML = "<div class='page-footer' contenteditable='false'>第 " + pageNum + " 頁 / 共 " + chunks.length + " 頁</div>";
                pageDiv.innerHTML = headerHTML + "<div class='page-content'>" + contentHTML + "</div>" + footerHTML;
                container.appendChild(pageDiv);
            });

            let kDiv = document.createElement('div');
            kDiv.className = "a4-page key-page";
            kDiv.style.display = 'none';
            kDiv.contentEditable = "true";
            let kHtml = "<h2 style='text-align:center; font-size:18pt; font-weight:bold; margin-bottom:20px;'>解析卷</h2>";
            items.forEach((q, i) => {
                let ans = q.a;
                if(Array.isArray(q.a)) ans = q.a.map(x=>String.fromCharCode(65+x)).join('');
                else if(typeof q.a==='number') ans = String.fromCharCode(65+q.a);
                else ans = q.a || '(略)';
                kHtml += "<div class='key-item' data-idx='" + i + "' style='margin-bottom:8px; border-bottom:1px solid #eee; padding-bottom:4px;'><b>"+(i+1)+".</b> <span style='color:red; font-weight:bold; margin-right:10px;'>"+escapeHtml(ans)+"</span> <span style='font-size:10pt; color:#666;'>"+escapeHtml(q.e||'')+"</span></div>";
            });
            kDiv.innerHTML = kHtml;
            container.appendChild(kDiv);

            // 試卷剛渲染完就要提示「可以直接點文字改」。
            // 不能只靠 switchSheet() 帶出來——正常出題流程根本不會呼叫它
            // （它只在按分頁鈕、分享模式、線上作答時才跑），提示會一直維持隱藏
            updateEditHintVisibility('quiz');
        }

        // 「更多」選單：低頻／破壞性動作（存班級歷史、重新出整份）收在這裡，
        // 不跟下載、發送測驗這些主要動作平起平坐
        function toggleMoreMenu() {
            document.getElementById('moreMenu').classList.toggle('hidden');
        }
        function closeMoreMenu() {
            document.getElementById('moreMenu').classList.add('hidden');
        }
        document.addEventListener('click', function (e) {
            const wrap = document.getElementById('moreMenuWrap');
            if (wrap && !wrap.contains(e.target)) closeMoreMenu();
        });

        // 老師按過「知道了」就不再顯示編輯提示（記在這台裝置上）
        window.editHintDismissed = localStorage.getItem('lun_edit_hint_done') === '1';

        // 提示只在「看得到可編輯的試卷」時才顯示：線上作答分頁沒有東西可編輯，
        // 分享模式下這條被借去當狀態說明由 applySharedViewChrome() 管，這裡不碰
        function updateEditHintVisibility(sheet) {
            const el = document.getElementById('editHint');
            if (!el || window.isSharedView) return;
            el.classList.toggle('hidden', sheet === 'answer' || window.editHintDismissed);
        }

        function dismissEditHint() {
            window.editHintDismissed = true;
            localStorage.setItem('lun_edit_hint_done', '1');
            const el = document.getElementById('editHint');
            if (el) el.classList.add('hidden');
        }

        function switchSheet(t) {
            let qs = document.querySelectorAll('.quiz-page');
            let ks = document.querySelectorAll('.key-page');
            let ansContainer = document.getElementById('answerModeContainer');
            let paperContainer = document.getElementById('paperContainer');
            let b1 = document.getElementById('btnQuiz');
            let b2 = document.getElementById('btnKey');

            qs.forEach(e => e.style.display = (t === 'quiz') ? 'block' : 'none');
            ks.forEach(e => e.style.display = (t === 'key') ? 'block' : 'none');
            if (ansContainer) ansContainer.style.display = (t === 'answer') ? 'block' : 'none';
            if (paperContainer) paperContainer.style.display = (t === 'answer') ? 'none' : 'block';

            if (b1) b1.classList.toggle('is-active', t === 'quiz');
            if (b2) b2.classList.toggle('is-active', t === 'key');

            updateEditHintVisibility(t);

            if (t === 'answer' && ansContainer && !ansContainer.dataset.rendered) {
                renderAnswerMode();
                ansContainer.dataset.rendered = '1';
            }
        }

