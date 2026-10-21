// Luno 綸諾｜冷卻倒數與出題主流程 startGen()。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 冷卻倒數 UI ---
        let cooldownTimer = null;
        function startCooldownUI(seconds) {
            const btn = document.getElementById('btnGo');
            const original = "🚀 Luno 開始出題";
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

        // ... API 呼叫邏輯 ...
        async function startGen() {
            let sType = document.getElementById('sourceType').value;

            if (sType === '2') {
                let textVal = document.getElementById('uTxt').value.trim();
                if (uploadItems.length === 0 && textVal === "") {
                    return failGen("❌ 未上傳資料！請上傳檔案、圖片或貼上文字內容。");
                }
            }

            let grade = document.getElementById('grade').value;
            if(grade === 'Custom') grade = document.getElementById('c_grade').value.trim();
            if(sType === '1' && (!grade || grade === '')) return failGen("❌ 請選擇或輸入【年級】！");

            let subject = document.getElementById('subject').value.trim();
            if(sType === '1' && !subject) return failGen("❌ 請選擇【科目】！");

            let publisher = document.getElementById('publisher').value;
            if(publisher === 'Custom') publisher = document.getElementById('c_publisher').value.trim();
            if(sType === '1' && (!publisher || publisher === '')) return failGen("❌ 請選擇或輸入【版本】！");

            // 範圍改成選填：出綜合/複習卷的老師本來就不需要指定課次，
            // 空白時明講「整冊」讓 AI 有明確依據，而不是拿到一個空字串自己亂猜
            let scope = document.getElementById('scope').value.trim();
            if (!scope) scope = '整冊（不限特定課次）';

            let countVal = document.getElementById('count').value;
            if(countVal === 'Custom') countVal = document.getElementById('c_count').value.trim();
            let total = parseInt(countVal);
            if(!total) return failGen("❌ 請設定【題數】！");

            let typeVal = document.getElementById('qType').value;
            if(typeVal === 'Custom') typeVal = document.getElementById('c_qType').value.trim();
            if(!typeVal || typeVal === '') return failGen("❌ 請設定【題型】！");

            let diffVal = document.getElementById('difficulty').value;
            if(diffVal === 'Custom') diffVal = document.getElementById('c_diff').value.trim();
            if(!diffVal || diffVal === '') return failGen("❌ 請設定【難度】！");

            let langVal = document.getElementById('lang').value;
            let contentText = document.getElementById('uTxt').value;

            document.getElementById('btnGo').disabled = true;
            document.getElementById('btnGo').innerText = "⏳ 運算中...";
            // 運算中直接亮四色跑馬燈邊框：這時按鈕是disabled，滑鼠移過去也不會觸發hover特效
            document.getElementById('btnGo').classList.add('is-working');
            document.getElementById('barBox').classList.remove('hidden');
            document.getElementById('loadingAnim').classList.remove('hidden');
            document.getElementById('loadingAnim').classList.add('flex');

            let batchSize = 10;
            if (typeVal.includes("簡答") || typeVal.includes("填充")) batchSize = 8;
            // 智慧混搭：依老師選的題數對半分，奇數時單選多 1 題。
            // 舊版是寫死 20 題（前10單選+後10複選），會反過來覆蓋老師選的題數
            if (typeVal.indexOf('智慧混搭') === 0) {
                const single = Math.ceil(total / 2);
                typeVal = "前" + single + "題單選,後" + (total - single) + "題複選";
            }
            // 相容舊的儲存設定與分享連結（值還是 Mixed_10_10）
            if (typeVal === 'Mixed_10_10') { typeVal = "前10單選,後10複選"; total = 20; batchSize = 10; }

            let batches = Math.ceil(total / batchSize);
            let scorePerQ = Math.floor(100 / total);
            let allItems = [];
            let parseFailBatches = [];
            let batchRetried = {};
            let simTimer = null;

            uploadItems.filter(item => item.type === 'docx').forEach(item => { contentText += "\n[附件 " + item.name + "]:\n" + item.content; });

            const adminPass = sessionStorage.getItem('linquiz_admin') || "";
            const userKey = document.getElementById('userKey').value.trim();

            try {
                const API_URL = API_BASE + "/api/generate";
                for(let i=0; i<batches; i++) {
                    document.getElementById('status').innerText = "生成中... " + (i+1) + "/" + batches;
                    let baseP = Math.round((i/batches)*100);
                    let nextP = Math.round(((i+1)/batches)*100);
                    let simP = baseP;
                    setProgressBar(baseP);
                    simTimer = setInterval(() => {
                        if (simP < nextP - 1) {
                            simP++;
                            setProgressBar(simP);
                        }
                    }, 250);

                    let currentCount = Math.min(batchSize, total - allItems.length);
                    let startNum = i * batchSize + 1;
                    let endNum = i * batchSize + currentCount;

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
                    const formatRule = ' 【嚴格格式要求】：必須且只能回傳合法的 JSON Array。格式：[{"q":"題目內容","o":["選項1","選項2"],"a":"答案","e":"解析","s":' + scorePerQ + '}]。';

                    let parts = [{ text: taskDescription + formatRule }];
                    if (sType === "2" && uploadItems.length > 0) {
                        uploadItems.filter(item => item.type === 'file').forEach(file => {
                            parts.push({ inline_data: { mime_type: file.mime, data: file.data } });
                        });
                    }
                    if (contentText) parts.push({ text: "\n參考內容:\n" + contentText });

                    let geminiRes = await fetch(API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            // 重試第 0 批時要送非 0 的批次序號：冷卻只算第 0 批，
                            // 重試若還報 0 會被自己 30 秒前那次擋成 429，整份考卷就沒了
                            'X-Batch-Index': String(batchRetried[i] ? i + 1 : i),
                            'X-Admin-Pass': adminPass,
                            'X-Gemini-Api-Key': userKey,
                            'X-Client-Id': getClientId()
                        },
                        body: JSON.stringify({ contents: [{ parts: parts }] })
                    });

                    clearInterval(simTimer);
                    setProgressBar(nextP);

                    if (geminiRes.status === 429) {
                        let cd = await geminiRes.json().catch(() => ({}));
                        let remaining = (cd.error && cd.error.remaining) || 30;
                        hidePracticeLoading();
                        startCooldownUI(remaining);
                        return;
                    }

                    let geminiData = await geminiRes.json();
                    if(geminiData.error) throw new Error(geminiData.error.message);

                    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    const bt = String.fromCharCode(96).repeat(3);
                    let cleanJSON = rawText.replace(new RegExp(bt + 'json', 'gi'), '').replace(new RegExp(bt, 'g'), '').trim();
                    cleanJSON = cleanJSON.replace(/[\r\n]+/g, ' ');
                    let startIdx = cleanJSON.indexOf('[');
                    let endIdx = cleanJSON.lastIndexOf(']');
                    if (startIdx !== -1 && endIdx !== -1) {
                         cleanJSON = cleanJSON.substring(startIdx, endIdx + 1);
                         cleanJSON = cleanJSON.replace(/,\s*\]/g, ']');
                         cleanJSON = cleanJSON.replace(/,\s*\}/g, '}');
                    } else {
                         let objectRegex = /\{"q":.*?\}/g;
                         let matchedObjects = cleanJSON.match(objectRegex);
                         if (matchedObjects) cleanJSON = "[" + matchedObjects.join(",") + "]";
                    }

                    try {
                        let parsed = JSON.parse(cleanJSON);
                        if (!Array.isArray(parsed)) parsed = [parsed];
                        allItems = allItems.concat(parsed);
                    } catch(e) {
                        // 常見成因：AI輸出被maxOutputTokens截斷，陣列最後一題寫到一半就斷了，
                        // 導致整段JSON.parse失敗。退而求其次：把已經完整的{"q":...,"s":N}物件
                        // 一個個挖出來，搶救這一批裡有順利產生完整的題目，而不是整批直接放棄
                        let recovered = [];
                        (cleanJSON.match(/\{"q":.*?"s":\s*\d+\}/g) || []).forEach(m => {
                            try { recovered.push(JSON.parse(m)); } catch(e2) {}
                        });
                        if (recovered.length > 0) {
                            allItems = allItems.concat(recovered);
                            console.warn("第 " + (i + 1) + " 批JSON解析失敗，但搶救回 " + recovered.length + " 題（可能是AI輸出被截斷）", e);
                        } else if (!batchRetried[i]) {
                            // 整批一題都救不回來(常見是這次回應根本沒有文字)，先自動重試一次同一批，
                            // 不要讓使用者看到「請重新嘗試出題一次」還得自己再按一輪、又要等冷卻
                            batchRetried[i] = true;
                            console.warn("第 " + (i + 1) + " 批完全無法解析，自動重試一次", e);
                            i--;
                            continue;
                        } else {
                            console.error(e);
                            parseFailBatches.push(i + 1);
                        }
                    }
                }

                setProgressBar(100);

                if (allItems.length === 0) {
                    throw new Error("AI回傳的內容無法解析成題目格式，請重新嘗試出題一次（通常是暫時性問題）");
                }
                if (parseFailBatches.length > 0) {
                    alert("⚠️ 第 " + parseFailBatches.join("、") + " 批題目AI回傳格式異常已略過，其餘題目正常產生。若題數不足可以「重新出題」再試一次");
                }

                // 這兩行一定要在 renderPaperFixed／switchSheet 之前：
                // renderAnswerMode() 是讀 window.currentItems 畫作答表單的，
                // 之前寫在後面，學生練習切到作答頁時拿到的還是空陣列——整份題目不見、直接顯示 0/100 分
                window.currentItems = allItems;
                window.currentSettings = { sType, grade, subject, publisher, scope, count: total, qType: typeVal, difficulty: diffVal, lang: langVal, contentText };

                renderPaperFixed(allItems);

                // 學生的「我要練習」：出完題直接進線上作答(他要的是寫，不是看考卷排版)，
                // 姓名/班級也先幫他填好，省得每次重打
                if (window.practiceMode) {
                    switchSheet('answer');
                    const info = window.practiceStudentInfo || {};
                    setTimeout(function () {
                        const setVal = function (id, v) { const el = document.getElementById(id); if (el && v) el.value = v; };
                        setVal('ansStuGrade', info.grade);
                        setVal('ansStuClass', info.className);
                        setVal('ansStuName', info.name);
                    }, 50);
                }

                saveQuizToHistory();
            } catch(e) {
                if (simTimer) clearInterval(simTimer);
                hidePracticeLoading();
                alert("錯誤: " + e.message);
                document.getElementById('btnGo').disabled = false;
                document.getElementById('btnGo').innerText = "🚀 Luno 開始出題";
                document.getElementById('btnGo').classList.remove('is-working');
                document.getElementById('barBox').classList.add('hidden');
                document.getElementById('loadingAnim').classList.add('hidden');
                document.getElementById('loadingAnim').classList.remove('flex');
                document.getElementById('status').innerText = "";
            }
        }

