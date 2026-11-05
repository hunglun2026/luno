// 刻度｜冷卻倒數與出題主流程 startGen()。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 冷卻倒數 UI ---
        let cooldownTimer = null;
        function startCooldownUI(seconds) {
            const btn = document.getElementById('btnGo');
            const original = "🚀 開始出題";
            let remaining = Math.max(1, Math.ceil(seconds));
            btn.disabled = true;
            document.getElementById('barBox').classList.add('hidden');
            document.getElementById('status').innerText = "";
            if (cooldownTimer) clearInterval(cooldownTimer);
            const tick = () => {
                btn.innerText = "⏳ 冷卻中，請等待 " + remaining + " 秒";
                remaining--;
                if (remaining < 0) {
                    clearInterval(cooldownTimer);
                    cooldownTimer = null;
                    btn.disabled = false;
                    btn.innerText = original;
                }
            };
            tick();
            cooldownTimer = setInterval(tick, 1000);
        }

        // 出題後自動檢查：把「學生一定會被害到」的壞題擋掉（2026-11-03 注音題三個選項都對、解析自打臉）。
        // 只擋能用程式確定的：選項不足／重複、答案對不到任何選項、解析出現邊想邊改的口氣。
        // 題目本身對不對（例如兩個選項都對）程式看不出來，靠出題提示詞規則。
        const SELF_CORRECT_RE = /選項\s*\d*\s*(寫錯|有誤)|讓我(再)?(想|檢查|重新)|重新(檢查|計算|確認)|等等[，,]|抱歉|更正[：:，,]/;
        function vetItems(items) {
            const kept = [];
            items.forEach(q => {
                if (!q || typeof q.q !== 'string' || !q.q.trim()) return;
                if (Array.isArray(q.o) && q.o.length > 0) {
                    const opts = q.o.map(o => String(o).trim());
                    if (opts.length < 2 || new Set(opts).size !== opts.length) return;
                    const letters = getCorrectLetters(q) || [];
                    const valid = letters.length > 0 && letters.every(l => /^[A-Z]$/.test(l) && (l.charCodeAt(0) - 65) < opts.length);
                    if (!valid) return;
                }
                if (typeof q.e === 'string' && SELF_CORRECT_RE.test(q.e)) return;
                kept.push(q);
            });
            return kept;
        }
        // 每題配分各自取整會湊不滿 100（7 題 14 分共 98；超過 100 題變 0 分）：餘數補在最後幾題
        function normalizeScores(items) {
            const n = items.length;
            if (n === 0) return;
            const base = Math.max(1, Math.floor(100 / n));
            let extra = n > 100 ? 0 : 100 - base * n;
            items.forEach((q, idx) => { q.s = base + (idx >= n - extra ? 1 : 0); });
        }

        // ===== 出題主流程（2026-11-03 由 260 行的 startGen 拆成下面幾個小函式，行為不變）=====

        // 讀表單並驗證；缺資料就跳提示並回傳 null
        function readGenForm() {
            const sType = document.getElementById('sourceType').value;

            if (sType === '2') {
                const textVal = document.getElementById('uTxt').value.trim();
                if (uploadItems.length === 0 && textVal === "") {
                    failGen("❌ 未上傳資料！請上傳檔案、圖片或貼上文字內容。");
                    return null;
                }
            }

            let grade = document.getElementById('grade').value;
            if (grade === 'Custom') grade = document.getElementById('c_grade').value.trim();
            if (sType === '1' && (!grade || grade === '')) { failGen("❌ 請選擇或輸入【年級】！"); return null; }

            const subject = document.getElementById('subject').value.trim();
            if (sType === '1' && !subject) { failGen("❌ 請選擇【科目】！"); return null; }

            let publisher = document.getElementById('publisher').value;
            if (publisher === 'Custom') publisher = document.getElementById('c_publisher').value.trim();
            if (sType === '1' && (!publisher || publisher === '')) { failGen("❌ 請選擇或輸入【版本】！"); return null; }

            // 範圍改成選填：出綜合/複習卷的老師本來就不需要指定課次，
            // 空白時明講「整冊」讓 AI 有明確依據，而不是拿到一個空字串自己亂猜
            let scope = document.getElementById('scope').value.trim();
            if (!scope) scope = '整冊（不限特定課次）';

            let countVal = document.getElementById('count').value;
            if (countVal === 'Custom') countVal = document.getElementById('c_count').value.trim();
            const total = parseInt(countVal);
            if (!total) { failGen("❌ 請設定【題數】！"); return null; }
            // 訪客一份最多 20 題（選單已經藏掉超過的選項，這裡再擋一次，防止改畫面繞過）；上限數字見 guide.js 的 GUEST_MAX
            if (window.guestMode && total > 20) { failGen("❌ 訪客一份最多 20 題，要出更多題請登入教師帳號"); return null; }

            let typeVal = document.getElementById('qType').value;
            if (typeVal === 'Custom') typeVal = document.getElementById('c_qType').value.trim();
            if (!typeVal || typeVal === '') { failGen("❌ 請設定【題型】！"); return null; }

            let diffVal = document.getElementById('difficulty').value;
            if (diffVal === 'Custom') diffVal = document.getElementById('c_diff').value.trim();
            if (!diffVal || diffVal === '') { failGen("❌ 請設定【難度】！"); return null; }

            const langVal = document.getElementById('lang').value;
            let contentText = document.getElementById('uTxt').value;
            uploadItems.filter(item => item.type === 'docx').forEach(item => { contentText += "\n[附件 " + item.name + "]:\n" + item.content; });

            return { sType, grade, subject, publisher, scope, total, typeVal, diffVal, langVal, contentText };
        }

        // 出題中／結束的畫面狀態：按鈕、跑馬燈、進度條（開始與出錯復原共用）
        function setGenBusy(on) {
            const btn = document.getElementById('btnGo');
            btn.disabled = on;
            btn.innerText = on ? "⏳ 運算中..." : "🚀 開始出題";
            // 運算中直接亮四色跑馬燈邊框：這時按鈕是disabled，滑鼠移過去也不會觸發hover特效
            btn.classList.toggle('is-working', on);
            document.getElementById('barBox').classList.toggle('hidden', !on);
            document.getElementById('loadingAnim').classList.toggle('hidden', !on);
            document.getElementById('loadingAnim').classList.toggle('flex', on);
            if (!on) document.getElementById('status').innerText = "";
        }

        // 依題型與題數算出實際題型描述、每批題數、批數、每題配分
        function planBatches(typeVal, total) {
            let batchSize = 10;
            if (typeVal.includes("簡答") || typeVal.includes("填充")) batchSize = 8;
            // 智慧混搭：依老師選的題數對半分，奇數時單選多 1 題。
            // 舊版是寫死 20 題（前10單選+後10複選），會反過來覆蓋老師選的題數
            if (typeVal.indexOf('智慧混搭') === 0) {
                const single = Math.ceil(total / 2);
                typeVal = "前" + single + "題單選,後" + (total - single) + "題複選";
            }
            // 綜合題型：單選、是非、填充依題數三等分（餘數給單選），題型順序固定，作答與評分都用既有格式
            if (typeVal.indexOf('綜合題型') === 0) {
                const a = Math.ceil(total / 3), b = Math.ceil((total - a) / 2), c = total - a - b;
                typeVal = "前" + a + "題單選,中間" + b + "題是非,後" + c + "題填充";
                batchSize = 8;
            }
            // 相容舊的儲存設定與分享連結（值還是 Mixed_10_10）
            if (typeVal === 'Mixed_10_10') { typeVal = "前10單選,後10複選"; total = 20; batchSize = 10; }

            return { typeVal, total, batchSize, batches: Math.ceil(total / batchSize), scorePerQ: Math.floor(100 / total) };
        }

        // 單批的出題提示詞與要送給 API 的 parts
        function buildBatchParts(cfg, plan, i, currentCount) {
            const { sType, grade, subject, publisher, scope, diffVal, langVal, contentText } = cfg;
            const { typeVal, total, batchSize, scorePerQ } = plan;
            const startNum = i * batchSize + 1;
            const endNum = i * batchSize + currentCount;

            let taskDescription = "";
            if (sType === "2") {
                 taskDescription = "閱讀附件，製作測驗卷。整份考卷共有 " + total + " 題，題型順序要求為：「" + typeVal + "」。\n";
            } else {
                 let pubStr = publisher === '由小綸自由發揮' ? '不限版本，請依一般課綱知識出題' : publisher;
                 taskDescription = "【最高指令】：完全依照以下條件出題，絕不可偏離範圍！\n";
                 taskDescription += "- 年級：" + grade + "\n- 科目：" + subject + "\n- 版本：" + pubStr + "\n- 範圍：" + scope + "\n";
                 taskDescription += "- 總題數：" + total + " 題\n- 難度：" + diffVal + "\n- 題型要求：「" + typeVal + "」\n\n";
                 taskDescription += getDifficultyRubric(diffVal);
            }
            taskDescription += "【語言】：請務必使用「" + langVal + "」撰寫所有內容！\n\n";
            taskDescription += "【批次定位】：這是第 " + (i+1) + " 批，請僅生成【第 " + startNum + " 題 到 第 " + endNum + " 題】（共 " + currentCount + " 題）。\n";
            taskDescription += "若為單/複選題，'o' 給選項，'a' 給答案；若為填充/簡答/計算題，'o' 必須且只能回傳空陣列 []，並將解答寫在 'a'！題目中預留極長的底線(________________________)供填寫。配分固定為 " + scorePerQ + " 分。\n";
            // 品質規則：2026-11-03 注音題三個選項都對、解析自相矛盾（學生選對卻被判錯）
            taskDescription += "【題目品質規則】（違反就是壞題）：\n" +
                "1. 單選題只能有一個正確選項，其餘選項必須明確錯誤；出完題逐一檢查每個選項，確認沒有第二個也對的。\n" +
                "2. 題目要讓該年級學生一看就懂：一題只考一個觀念，題幹用日常白話直接問（例如「『朋』的注音是哪一個？」），不要出「選出完全正確的」「下列何者錯誤的有幾個」這類要逐項判斷的繞口題。\n" +
                "3. 選項格式一致、長度相近，每個選項只放一個答案（一個字或一個詞），不可同一題混著考不同的字或詞。\n" +
                "4. 注音／字音／字形題，每個選項都要實際核對過；注音題一次只問一個字，不要在一個選項塞整串注音。不確定的字音不要出。\n" +
                "5. 解析（e）只寫 1～2 句最終結論，直接說為什麼答案對、關鍵錯在哪；不可出現「應為」「（選項寫錯）」這類邊想邊修正的話，答案與解析必須一致。\n\n";
            if (typeVal.includes('是非')) {
                taskDescription += "【是非題格式】：是非題的 'o' 必須固定為 [\"正確\",\"錯誤\"]，'a' 只寫 \"A\"（正確）或 \"B\"（錯誤）；題幹寫成一個可以判斷對錯的完整敘述句，不可寫成問句，正確與錯誤的題數要大致各半。\n";
            }
            if (typeVal.includes('克漏字') || typeVal.includes('選擇式填空')) {
                taskDescription += "【選擇式填空格式】：題幹是一句完整的句子，把要考的字詞換成「（　　）」；'o' 給 3～4 個詞語，只有一個放進去語意與文法都通順，其餘放進去明顯不通順。\n";
            }
            if (typeVal.includes('綜合') || typeVal.includes('題填充')) {
                taskDescription += "【題型順序】：嚴格依題型要求的順序出題；單選與是非題的 'o' 給選項，填充題的 'o' 必須是空陣列 []。\n";
            }
            const formatRule = ' 【嚴格格式要求】：必須且只能回傳合法的 JSON Array。格式：[{"q":"題目內容","o":["選項1","選項2"],"a":"答案","e":"解析","s":' + scorePerQ + '}]。';

            const parts = [{ text: taskDescription + formatRule }];
            if (sType === "2" && uploadItems.length > 0) {
                uploadItems.filter(item => item.type === 'file').forEach(file => {
                    parts.push({ inline_data: { mime_type: file.mime, data: file.data } });
                });
            }
            if (contentText) parts.push({ text: "\n參考內容:\n" + contentText });
            return parts;
        }

        // 進度條在等 API 回應時慢慢往下一格爬，回傳計時器讓呼叫端收掉
        function startSimProgress(baseP, nextP) {
            let simP = baseP;
            return setInterval(() => {
                if (simP < nextP - 1) {
                    simP++;
                    setProgressBar(simP);
                }
            }, 250);
        }

        // 呼叫出題 API（整份出題的每一批、單題重出共用）。batchIndex 給後端算冷卻
        function postGenerate(parts, batchIndex) {
            return fetch(API_BASE + "/api/generate", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Batch-Index': String(batchIndex),
                    'X-Admin-Pass': sessionStorage.getItem('linquiz_admin') || "",
                    'X-Gemini-Api-Key': document.getElementById('userKey').value.trim(),
                    'X-Client-Id': getClientId()
                },
                body: JSON.stringify({ contents: [{ parts: parts }] })
            });
        }

        // 把 AI 回的文字清成可 JSON.parse 的字串：去掉 ``` 圍欄、換行、陣列尾端多餘逗號。
        // salvageObjects：回覆裡完全找不到陣列括號時，是否改用逐題挖出 {"q":...} 物件拼成陣列
        function cleanAiJsonText(rawText, salvageObjects) {
            const bt = String.fromCharCode(96).repeat(3);
            let cleanJSON = rawText.replace(new RegExp(bt + 'json', 'gi'), '').replace(new RegExp(bt, 'g'), '').trim();
            cleanJSON = cleanJSON.replace(/[\r\n]+/g, ' ');
            const startIdx = cleanJSON.indexOf('[');
            const endIdx = cleanJSON.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
                 cleanJSON = cleanJSON.substring(startIdx, endIdx + 1);
                 cleanJSON = cleanJSON.replace(/,\s*\]/g, ']');
                 cleanJSON = cleanJSON.replace(/,\s*\}/g, '}');
            } else if (salvageObjects) {
                 const matchedObjects = cleanJSON.match(/\{"q":.*?\}/g);
                 if (matchedObjects) cleanJSON = "[" + matchedObjects.join(",") + "]";
            }
            return cleanJSON;
        }

        // 把 AI 回的文字解析成題目陣列。回傳 { items, error }：
        // error 有值代表 JSON.parse 失敗；items 是搶救回來的題目（可能為空，由呼叫端決定要不要重試）
        function parseBatchJson(rawText) {
            const cleanJSON = cleanAiJsonText(rawText, true);

            try {
                let parsed = JSON.parse(cleanJSON);
                if (!Array.isArray(parsed)) parsed = [parsed];
                return { items: parsed, error: null };
            } catch (e) {
                // 常見成因：AI輸出被maxOutputTokens截斷，陣列最後一題寫到一半就斷了，
                // 導致整段JSON.parse失敗。退而求其次：把已經完整的{"q":...,"s":N}物件
                // 一個個挖出來，搶救這一批裡有順利產生完整的題目，而不是整批直接放棄
                const recovered = [];
                (cleanJSON.match(/\{"q":.*?"s":\s*\d+\}/g) || []).forEach(m => {
                    try { recovered.push(JSON.parse(m)); } catch (e2) {}
                });
                return { items: recovered, error: e };
            }
        }

        // 全部批次跑完後的收尾：檢查壞題、配分、提示、渲染、存歷史
        function finishGen(cfg, plan, allItems, parseFailBatches) {
            setProgressBar(100);

            const rawCount = allItems.length;
            allItems = vetItems(allItems);
            if (allItems.length === 0) {
                throw new Error("AI回傳的內容無法解析成題目格式，請重新嘗試出題一次（通常是暫時性問題）");
            }
            normalizeScores(allItems);
            if (allItems.length < rawCount) {
                lqAlert("已自動剔除 " + (rawCount - allItems.length) + " 題有問題的題目（選項重複、答案對不到選項或解析前後矛盾）。若題數不足可以「重新出題」再試一次");
            }
            if (parseFailBatches.length > 0) {
                lqAlert("⚠️ 第 " + parseFailBatches.join("、") + " 批題目AI回傳格式異常已略過，其餘題目正常產生。若題數不足可以「重新出題」再試一次");
            }

            // 這兩行一定要在 renderPaperFixed／switchSheet 之前：
            // renderAnswerMode() 是讀 window.currentItems 畫作答表單的，
            // 之前寫在後面，學生練習切到作答頁時拿到的還是空陣列，整份題目不見、直接顯示 0/100 分
            window.currentItems = allItems;
            window.currentSettings = { sType: cfg.sType, grade: cfg.grade, subject: cfg.subject, publisher: cfg.publisher, scope: cfg.scope, count: plan.total, qType: plan.typeVal, difficulty: cfg.diffVal, lang: cfg.langVal, contentText: cfg.contentText };

            renderPaperFixed(allItems);
            submitToBank(cfg, allItems);

            // 一律以線上、手機可直接測驗為主（Steve 2026-11-05）：出完題直接是線上作答畫面，
            // 要列印的 A4 題目卷／答案卷、PDF、Word 要按工具列的其他鈕才出現。
            // 學生的「我要練習」多一步：姓名/班級先幫他填好，省得每次重打
            window.itemsVersion = (window.itemsVersion || 0) + 1;
            switchSheet('answer');
            if (window.practiceMode) {
                const info = window.practiceStudentInfo || {};
                setTimeout(function () {
                    const setVal = function (id, v) { const el = document.getElementById(id); if (el && v) el.value = v; };
                    setVal('ansStuGrade', info.grade);
                    setVal('ansStuClass', info.className);
                    setVal('ansStuName', info.name);
                }, 50);
            }

            saveQuizToHistory();
        }

        // 出題主流程：只管批次迴圈、429 冷卻與批次重試
        async function startGen() {
            const cfg = readGenForm();
            if (!cfg) return;
            setGenBusy(true);

            const plan = planBatches(cfg.typeVal, cfg.total);
            let allItems = [];
            const parseFailBatches = [];
            const batchRetried = {};
            let simTimer = null;

            try {
                for (let i = 0; i < plan.batches; i++) {
                    document.getElementById('status').innerText = "生成中... " + (i+1) + "/" + plan.batches;
                    const baseP = Math.round((i / plan.batches) * 100);
                    const nextP = Math.round(((i + 1) / plan.batches) * 100);
                    setProgressBar(baseP);
                    simTimer = startSimProgress(baseP, nextP);

                    const currentCount = Math.min(plan.batchSize, plan.total - allItems.length);
                    const parts = buildBatchParts(cfg, plan, i, currentCount);

                    // 重試第 0 批時要送非 0 的批次序號：冷卻只算第 0 批，
                    // 重試若還報 0 會被自己 30 秒前那次擋成 429，整份考卷就沒了
                    const geminiRes = await postGenerate(parts, batchRetried[i] ? i + 1 : i);

                    clearInterval(simTimer);
                    setProgressBar(nextP);

                    if (geminiRes.status === 429) {
                        const cd = await geminiRes.json().catch(() => ({}));
                        const remaining = (cd.error && cd.error.remaining) || 30;
                        hidePracticeLoading();
                        startCooldownUI(remaining);
                        return;
                    }

                    const geminiData = await geminiRes.json();
                    if (geminiData.error) throw new Error(geminiData.error.message);

                    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    const result = parseBatchJson(rawText);
                    if (!result.error) {
                        allItems = allItems.concat(result.items);
                    } else if (result.items.length > 0) {
                        allItems = allItems.concat(result.items);
                        console.warn("第 " + (i + 1) + " 批JSON解析失敗，但搶救回 " + result.items.length + " 題（可能是AI輸出被截斷）", result.error);
                    } else if (!batchRetried[i]) {
                        // 整批一題都救不回來(常見是這次回應根本沒有文字)，先自動重試一次同一批，
                        // 不要讓使用者看到「請重新嘗試出題一次」還得自己再按一輪、又要等冷卻
                        batchRetried[i] = true;
                        console.warn("第 " + (i + 1) + " 批完全無法解析，自動重試一次", result.error);
                        i--;
                        continue;
                    } else {
                        console.error(result.error);
                        parseFailBatches.push(i + 1);
                    }
                }

                finishGen(cfg, plan, allItems, parseFailBatches);
            } catch (e) {
                if (simTimer) clearInterval(simTimer);
                hidePracticeLoading();
                setGenBusy(false);
                // 白話說明原因，並讓老師直接「再出一次」，不再只丟技術訊息
                if (await askConfirm(friendlyGenError(e), { okText: '再出一次', cancelText: '回去改條件', image: 'assets/illust/gen-retry.webp' })) startGen();
            }
        }

        // 把出題失敗的技術訊息換成老師看得懂的原因（細節留在最後一行，方便回報問題）
        function friendlyGenError(e) {
            const msg = String((e && e.message) || e || '');
            let why = '這次的條件或網路有點狀況，請再試一次。';
            if (/Failed to fetch|NetworkError|network|網路|連線|timeout|逾時/i.test(msg)) why = '網路連線可能暫時中斷了。';
            else if (/429|503|忙|冷卻|overload|busy|quota|額度/i.test(msg)) why = '線上出題的人比較多，系統正忙線。';
            else if (/解析|格式|無法/.test(msg)) why = 'AI 這次回的內容讀不出來，再出一次通常就好。';
            return '這次出題沒有成功。\n可能原因：' + why + '\n\n（細節：' + msg + '）';
        }
