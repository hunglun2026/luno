// Luno 綸諾｜設定與啟動：API 網址、函式庫按需載入、裝置 ID、window.onload（最後交給 Guide.start）。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部

        // 部署後端 Worker 後，請把這裡換成實際的 Worker 網址
        // 例：https://linquiz-api.<你的subdomain>.workers.dev
        const API_BASE = "https://luno-api.hunglun.com";

        let uploadItems = [];

        // 按需載入外部函式庫：mammoth/SheetJS(上傳檔案才用)、html2canvas+jsPDF(下載PDF才用)、
        // docx(下載Word才用)。同一個網址只會真的載入一次，之後直接回傳同一個 Promise。
        window._loadedScripts = window._loadedScripts || {};
        function loadScript(src) {
            if (window._loadedScripts[src]) return window._loadedScripts[src];
            window._loadedScripts[src] = new Promise(function (resolve, reject) {
                const s = document.createElement('script');
                s.src = src;
                s.onload = function () { resolve(); };
                s.onerror = function () {
                    delete window._loadedScripts[src]; // 失敗就別記住，下次按還能重試
                    reject(new Error('載入失敗：' + src));
                };
                document.head.appendChild(s);
            });
            return window._loadedScripts[src];
        }
        const LIB_URLS = {
            mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
            html2canvas: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
            jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
            // 真正的 .docx 產生器(Office Open XML)。CDN 必須用 unpkg：
            // jsdelivr 對 .cjs 回傳 application/node，瀏覽器會拒絕執行
            docx: "https://unpkg.com/docx@9.7.1/dist/index.umd.cjs",
            // 原卷直上：老師常常直接丟 PDF 考卷，得在瀏覽器端先轉成圖片再上傳
            pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
            pdfjsWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
        };

        // 題目內容(q.q/q.o/q.a/q.e)來自AI回傳,分享題目(/api/share)又是任何人都能未經驗證寫入的公開端點,
        // 所以在用innerHTML插入畫面前一律要escape,避免惡意分享連結在別人瀏覽器裡跑出XSS
        function escapeHtml(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // 難度分級的實質定義：舊版只把「簡單/適中/困難」這個標籤原封不動塞給AI，
        // AI只能自己猜「困難的國小一年級題目」該長怎樣，結果常常是拉高知識點年級(例如小一困難題混進國中概念)，
        // 而不是在同一年級課綱內加深認知複雜度。改成明確定義每一級「考什麼認知層次」，
        // 並且每一級都重申「知識點不可超出該年級課綱」，讓難度只調整思考深度、不調整年級高低。
        // 只有選5個預設分級才給明確定義；使用者自訂難度文字就照原樣尊重使用者說法，不覆蓋。
        function getDifficultyRubric(diffVal) {
            const rubric = {
                '基礎': '「基礎」＝直接記憶與辨識：緊扣課本原文的定義/事實，不需要推理或跨概念整合，題目應該一眼就能對應到課本某一句話。',
                '普通': '「普通」＝基本理解與單一應用：需要理解課本概念後做一次簡單應用，但只涉及單一個知識點，不需要跨單元。',
                '進階': '「進階」＝應用與初步分析：需要結合同單元內兩個以上的概念一起應用，或需要簡單的邏輯推理才能作答。',
                '挑戰': '「挑戰」＝多步驟推理：需要多個步驟的推理或情境轉換(例如把課本概念套進新情境判斷)，但用到的知識點依然不可超出該年級課綱。',
                '熟練': '「熟練」＝整合與靈活運用：該年級課綱內認知要求最高的題目，可綜合單元內多個概念，強調概念之間的靈活運用與辨析，但知識點依然完全不可超出該年級課綱。',
            };
            if (!rubric[diffVal]) return '';
            return '【難度定義】：' + rubric[diffVal] + ' 無論難度高低，考的知識點都必須落在該年級課綱範圍內——難度只反映認知複雜度(記憶→理解→應用→分析→整合)的層次，絕對不可以用超出年級的知識點來製造難度。\n\n';
        }

        // 每台裝置的瀏覽器各自產生一個固定ID(存localStorage),讓冷卻機制以裝置為單位,
        // 避免同校/同網路多位老師共用同一個IP時互相卡到彼此的30秒冷卻
        function getClientId() {
            let id = localStorage.getItem('lun_client_id');
            if (!id) {
                id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
                localStorage.setItem('lun_client_id', id);
            }
            return id;
        }

        // 即時進度用的學生ID：故意用sessionStorage不是localStorage，換分頁/裝置視為新的一位，
        // 但同一分頁重整不會被當成重複加入
        function getLiveStudentId() {
            let id = sessionStorage.getItem('lun_live_student_id');
            if (!id) {
                id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
                sessionStorage.setItem('lun_live_student_id', id);
            }
            return id;
        }

        // 進度條：同時更新寬度(視覺填滿)與裡面顯示的百分比文字，
        // 之前的bug是只更新了style.width，文字內容一直停在HTML裡寫死的"0%"
        // 出題前的欄位驗證失敗：跳訊息之前先收掉學生的等待遮罩
        function failGen(msg) { hidePracticeLoading(); alert(msg); }

        function setProgressBar(pct) {
            const bar = document.getElementById('bar');
            bar.style.width = pct + "%";
            bar.textContent = pct + "%";
            // 學生練習時老師表單是隱藏的，進度要同步鏡射到蓋在學生畫面上的那張卡
            const pBar = document.getElementById('practiceBar');
            if (pBar) pBar.style.width = pct + "%";
        }

        function showPracticeLoading() {
            const el = document.getElementById('practiceLoading');
            if (el) el.classList.remove('hidden');
            const pBar = document.getElementById('practiceBar');
            if (pBar) pBar.style.width = '0%';
        }
        function hidePracticeLoading() {
            const el = document.getElementById('practiceLoading');
            if (el) el.classList.add('hidden');
        }

        window.isSharedView = false;
        window.sharedMode = null;
        window.liveShareId = null;

        window.onload = async function() {
            let k = localStorage.getItem('lun_key');
            if (k) document.getElementById('userKey').value = k;

            // 年級／科目的膠囊按鈕要先建好，後面 applySettingsFromURL / loadSavedSettingsIfAny
            // 才有東西可以同步選取狀態
            buildChoiceChips();

            initAuthUI();

            // 原卷直上的連結（?paper=…）走自己的畫面，不經過出題表單／分享題目那條路
            if (await loadPaperRouteIfAny()) {
                document.getElementById('hlSplash').style.display = 'none';
                return;
            }

            fetch(API_BASE + "/api/visit")
                .then(r => r.json())
                .then(d => { document.getElementById('visitCount').textContent = d.count; })
                .catch(() => {});

            const liveViewed = await loadLiveViewIfAny();
            if (liveViewed) {
                document.getElementById('hlSplash').style.display = 'none';
                return;
            }

            const resultViewed = await loadResultViewIfAny();
            if (resultViewed) {
                document.getElementById('hlSplash').style.display = 'none';
                return;
            }

            const shared = await loadSharedQuizIfAny();
            if (shared) {
                document.getElementById('hlSplash').style.display = 'none';
                return;
            }

            useBuiltinQuota();

            // 「複製設定連結」一定帶 grade 和 qType。原本是「網址有任何參數就當設定連結」，
            // FB／LINE 分享時自動加的 fbclid 這類參數會被誤認，條件被套成空白
            const urlParams = new URLSearchParams(location.search);
            const fromSettingsLink = urlParams.has('grade') && urlParams.has('qType');
            if (fromSettingsLink) {
                // 網址帶了設定參數(複製設定連結分享來的)，優先用連結裡的設定
                applySettingsFromURL();
            } else {
                // 沒有帶連結參數，才套用這台裝置自己儲存的預設出題條件
                loadSavedSettingsIfAny();
            }

            // 引導式進站（2026-10-21 Steve 指定）：鴻綸特效歡迎頁 → 選老師／學生 → 老師一步一頁出題。
            // 7 月曾把進場頁拿掉，原因是「要點三層才看得到出題」；這次老師卡直接進出題，
            // 回訪的人有「繼續當老師」「用上次的條件直接出題」兩個捷徑。細節在 guide.js。
            Guide.start({ fromSettingsLink: fromSettingsLink });
        };

