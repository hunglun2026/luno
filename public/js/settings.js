// Luno 綸諾｜年級科目膠囊、設定連結、記住條件、出題紀錄、解除冷卻。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 複製設定連結 / 帶入連結設定 ---
        // --- 年級／科目膠囊按鈕 ---
        // 這兩欄不給預設值（猜錯就整份考卷報廢），但要讓老師選得夠快：
        // 一排點就好的按鈕，比下拉選單少 2~3 次點擊，手機上差更多。
        // 真正的值仍然存在隱藏的 #grade / #subject 裡，其他既有邏輯完全不用改。
        const SUBJECT_CHIPS = ['國語', '數學', '英語', '自然', '社會'];

        function buildChoiceChips() {
            // 年級選項直接從隱藏的 <select> 讀，避免同一份清單維護兩處
            const sel = document.getElementById('grade');
            const groups = [];
            Array.from(sel.querySelectorAll('optgroup')).forEach(function (og) {
                groups.push({
                    label: og.label,
                    items: Array.from(og.querySelectorAll('option')).map(function (o) { return o.value || o.text; })
                });
            });
            let html = '';
            groups.forEach(function (g, gi) {
                html += "<div class='lq-chip-group'><span class='lq-chip-group-label'>" + escapeHtml(g.label) + "</span>";
                g.items.forEach(function (v) {
                    // 「國小三年級」在按鈕上只顯示「三年級」，同一列已經標了學制，不用重複
                    const short = v.replace(/^(國小|國中|高中)/, '');
                    html += "<button type='button' class='lq-chip' data-val='" + escapeHtml(v) + "' onclick=\"pickGrade('" + escapeHtml(v) + "')\">" + escapeHtml(short) + "</button>";
                });
                // 「其他」接在最後一組同一行，不要自己獨佔一行——它很少用，卻多吃一整行高度
                if (gi === groups.length - 1) {
                    html += "<button type='button' class='lq-chip lq-chip-custom' data-val='Custom' onclick=\"pickGrade('Custom')\">其他</button>";
                }
                html += "</div>";
            });
            document.getElementById('gradeChips').innerHTML = html;

            let sHtml = "<div class='lq-chip-group'>";
            SUBJECT_CHIPS.forEach(function (v) {
                sHtml += "<button type='button' class='lq-chip' data-val='" + escapeHtml(v) + "' onclick=\"pickSubject('" + escapeHtml(v) + "')\">" + escapeHtml(v) + "</button>";
            });
            sHtml += "<button type='button' class='lq-chip lq-chip-custom' data-val='Custom' onclick=\"pickSubject('Custom')\">✍️ 其他科目</button></div>";
            document.getElementById('subjectChips').innerHTML = sHtml;
        }

        function pickGrade(val) {
            const sel = document.getElementById('grade');
            sel.value = val;
            checkCustom(sel, 'c_grade');
            if (val === 'Custom') {
                const c = document.getElementById('c_grade');
                c.style.display = 'block';
                c.focus();
            }
            syncChoiceChips();
        }

        function pickSubject(val) {
            const input = document.getElementById('subject');
            if (val === 'Custom') {
                input.classList.remove('hidden');
                input.value = '';
                input.focus();
            } else {
                input.value = val;
                input.classList.add('hidden');
            }
            syncChoiceChips();
        }

        // 讓膠囊的選取狀態跟隱藏欄位的實際值一致
        // （儲存的設定、分享的設定連結都是直接寫進隱藏欄位，不會經過上面兩個 pick 函式）
        function syncChoiceChips() {
            const gradeVal = document.getElementById('grade').value;
            document.querySelectorAll('#gradeChips .lq-chip').forEach(function (b) {
                b.classList.toggle('is-active', b.dataset.val === gradeVal);
            });
            const subjectVal = document.getElementById('subject').value.trim();
            const isPreset = SUBJECT_CHIPS.indexOf(subjectVal) >= 0;
            document.querySelectorAll('#subjectChips .lq-chip').forEach(function (b) {
                b.classList.toggle('is-active', b.dataset.val === 'Custom' ? (!!subjectVal && !isPreset) : b.dataset.val === subjectVal);
            });
            // 科目是自訂值時，把輸入框顯示出來讓老師看得到自己填了什麼
            const input = document.getElementById('subject');
            if (subjectVal && !isPreset) input.classList.remove('hidden');
        }

        function applySettings(s) {
            function setSelectOrCustom(selectId, customId, value) {
                if (!value) return;
                const sel = document.getElementById(selectId);
                let matched = false;
                for (let opt of sel.options) {
                    if (opt.value === value || opt.text === value) { sel.value = opt.value; matched = true; break; }
                }
                if (!matched) {
                    sel.value = 'Custom';
                    const custom = document.getElementById(customId);
                    custom.value = value;
                    custom.style.display = 'block';
                }
            }
            setSelectOrCustom('grade', 'c_grade', s.grade);
            if (s.subject) document.getElementById('subject').value = s.subject;
            setSelectOrCustom('publisher', 'c_publisher', s.publisher);
            if (s.scope) document.getElementById('scope').value = s.scope;
            setSelectOrCustom('count', 'c_count', s.count);
            setSelectOrCustom('qType', 'c_qType', s.qType);
            setSelectOrCustom('difficulty', 'c_diff', s.difficulty);
            if (s.lang) document.getElementById('lang').value = s.lang;
            syncChoiceChips();
        }

        function applySettingsFromURL() {
            const params = new URLSearchParams(location.search);
            if ([...params.keys()].length === 0) return;
            applySettings({
                grade: params.get('grade'), subject: params.get('subject'), publisher: params.get('publisher'),
                scope: params.get('scope'), count: params.get('count'), qType: params.get('qType'),
                difficulty: params.get('difficulty'), lang: params.get('lang')
            });
        }

        // 讀取目前表單上的出題條件(年級/科目/版本/範圍/題數/題型/難度/語言)，
        // 「複製設定連結」「儲存設定條件」共用同一套讀取邏輯
        function getFormSettingsSnapshot() {
            let grade = document.getElementById('grade').value;
            if (grade === 'Custom') grade = document.getElementById('c_grade').value.trim();
            let subject = document.getElementById('subject').value.trim();
            let publisher = document.getElementById('publisher').value;
            if (publisher === 'Custom') publisher = document.getElementById('c_publisher').value.trim();
            let scope = document.getElementById('scope').value.trim();
            let countVal = document.getElementById('count').value;
            if (countVal === 'Custom') countVal = document.getElementById('c_count').value.trim();
            let typeVal = document.getElementById('qType').value;
            if (typeVal === 'Custom') typeVal = document.getElementById('c_qType').value.trim();
            let diffVal = document.getElementById('difficulty').value;
            if (diffVal === 'Custom') diffVal = document.getElementById('c_diff').value.trim();
            let langVal = document.getElementById('lang').value;
            return { grade, subject, publisher, scope, count: countVal, qType: typeVal, difficulty: diffVal, lang: langVal };
        }

        function copySettingsLink() {
            const s = getFormSettingsSnapshot();
            const params = new URLSearchParams({
                grade: s.grade || '', subject: s.subject || '', publisher: s.publisher || '',
                scope: s.scope || '', count: s.count || '', qType: s.qType || '',
                difficulty: s.difficulty || '', lang: s.lang || ''
            });
            const url = location.origin + location.pathname + "?" + params.toString();

            navigator.clipboard.writeText(url).then(() => {
                alert("✅ 設定連結已複製！貼給同事開啟後，表單會自動帶入這些設定。");
            }).catch(() => {
                prompt("複製失敗，請手動複製以下連結：", url);
            });
        }

        // --- 儲存/清除出題條件（存在這台裝置的 localStorage，方便手機上不用每次重填） ---
        function saveDefaultSettings() {
            const s = getFormSettingsSnapshot();
            if (!s.grade && !s.subject && !s.scope) {
                alert('目前表單是空的，請先填一些出題條件再儲存');
                return;
            }
            localStorage.setItem('lun_saved_settings', JSON.stringify(s));
            alert('✅ 已儲存目前出題條件！下次打開頁面會自動帶入，不用重填。');
        }

        function loadSavedSettingsIfAny() {
            const raw = localStorage.getItem('lun_saved_settings');
            if (!raw) return;
            try {
                applySettings(JSON.parse(raw));
            } catch (e) {}
        }

        function clearAllSettings() {
            if (!confirm('確定要清除所有出題條件嗎？已儲存的預設值也會一併刪除。')) return;
            localStorage.removeItem('lun_saved_settings');

            function resetSelect(selectId, customId, defaultValue) {
                document.getElementById(selectId).value = defaultValue !== undefined ? defaultValue : '';
                const custom = document.getElementById(customId);
                if (custom) { custom.value = ''; custom.style.display = 'none'; }
            }
            // 年級/科目回到「未選」（這兩個猜錯代價高，不給預設）；
            // 其餘回到安全預設值，而不是全部清空讓老師重新選一輪
            resetSelect('grade', 'c_grade');
            document.getElementById('subject').value = '';
            resetSelect('publisher', 'c_publisher', '由小綸自由發揮');
            document.getElementById('scope').value = '';
            resetSelect('count', 'c_count', '10');
            resetSelect('qType', 'c_qType', '全部單選題');
            resetSelect('difficulty', 'c_diff', '普通');
            document.getElementById('lang').value = '繁體中文';
            syncChoiceChips();

            alert('↺ 已重置表單（年級與科目請重新選擇，其餘已回到常用預設值）');
        }

        // --- 出題紀錄（存在這台裝置的 localStorage，最多留20筆） ---
        function saveQuizToHistory() {
            try {
                let hist = JSON.parse(localStorage.getItem('lun_history') || '[]');
                hist.unshift({
                    id: Date.now(),
                    title: window.docName || '未命名試卷',
                    createdAt: new Date().toLocaleString('zh-TW'),
                    settings: window.currentSettings,
                    items: window.currentItems
                });
                if (hist.length > 20) hist = hist.slice(0, 20);
                localStorage.setItem('lun_history', JSON.stringify(hist));
            } catch(e) { console.error('儲存歷史紀錄失敗', e); }
        }

        function openHistory() {
            let hist = [];
            try { hist = JSON.parse(localStorage.getItem('lun_history') || '[]'); } catch(e) {}
            let list = document.getElementById('historyList');
            if (hist.length === 0) {
                list.innerHTML = "<div class='lq-empty'>" +
                    "<img src='assets/art/empty.png' alt='' class='lq-empty-art' onerror=\"this.style.display='none'\">" +
                    "<p class='lq-empty-title'>還沒有出題紀錄</p>" +
                    "<p class='lq-empty-sub'>出過的卷子會留在這台裝置，換一台就看不到了</p></div>";
            } else {
                list.innerHTML = hist.map((h, i) =>
                    "<div class='flex justify-between items-center bg-gray-50 p-3 rounded-xl mb-2 border border-gray-100'>" +
                    "<div class='truncate mr-2'><div class='font-bold truncate'>" + escapeHtml(h.title) + "</div><div class='text-xs text-gray-500'>" + escapeHtml(h.createdAt) + "・" + (h.items ? h.items.length : 0) + "題</div></div>" +
                    "<div class='flex gap-2 flex-shrink-0'>" +
                    "<button onclick='loadHistory(" + i + ")' class='lq-btn lq-btn-primary px-3 py-1 text-sm'>開啟</button>" +
                    "<button onclick='deleteHistory(" + i + ")' class='lq-btn lq-btn-danger px-3 py-1 text-sm'>刪除</button>" +
                    "</div></div>"
                ).join('');
            }
            document.getElementById('historyModal').classList.remove('hidden');
        }
        function closeHistory() { document.getElementById('historyModal').classList.add('hidden'); }

        // 使用說明改成獨立的說明書頁（manual.html，2026-10-21）；舊的彈窗內容是舊流程，已拿掉
        function openUsageGuide() { window.open('manual.html', '_blank', 'noopener'); }
        function loadHistory(i) {
            let hist = [];
            try { hist = JSON.parse(localStorage.getItem('lun_history') || '[]'); } catch(e) {}
            let h = hist[i];
            if (!h) return;
            if (h.settings) applySettings(h.settings);
            window.currentItems = h.items;
            window.currentSettings = h.settings;
            closeHistory();
            renderPaperFixed(h.items);
        }
        function deleteHistory(i) {
            if (!confirm('確定刪除這筆歷史紀錄？')) return;
            let hist = [];
            try { hist = JSON.parse(localStorage.getItem('lun_history') || '[]'); } catch(e) {}
            hist.splice(i, 1);
            localStorage.setItem('lun_history', JSON.stringify(hist));
            openHistory();
        }

        window.forgetKey = function() {
            if (confirm("確定清除記憶的 API Key？")) {
                localStorage.removeItem('lun_key');
                document.getElementById('userKey').value = '';
            }
        };

        function toggleSource(val) {
            document.getElementById('sourceType').value = val;
            const btnAI = document.getElementById('btnSourceAI');
            const btnFile = document.getElementById('btnSourceFile');
            const aiInputs = document.getElementById('aiInputs');
            const fileInputs = document.getElementById('fileInputs');
            // 選取狀態改用 class 控制，樣式全部留在 CSS，不再用 JS 塗一堆行內顏色
            const paper = document.getElementById('btnSourcePaper');
            btnAI.classList.toggle('is-active', val === '1');
            btnFile.classList.toggle('is-active', val === '2');
            if (paper) paper.classList.remove('is-active');
            if (val === '1') {
                aiInputs.style.display = 'grid'; fileInputs.style.display = 'none';
            } else {
                aiInputs.style.display = 'none'; fileInputs.style.display = 'block';
            }
        }
        function checkCustom(select, inputId) {
            const box = document.getElementById(inputId);
            if(select.value === 'Custom') { box.style.display = 'block'; box.focus(); } else { box.style.display = 'none'; box.value = ''; }
        }
        function handleFiles(el) {
            if(!el.files.length) return;
            Array.from(el.files).forEach(async (f) => {
                if(f.name.endsWith('.docx')) {
                    let ab = await f.arrayBuffer();
                    await loadScript(LIB_URLS.mammoth);
                    let res = await mammoth.extractRawText({arrayBuffer:ab});
                    uploadItems.push({ type: 'docx', name: f.name, content: res.value });
                    renderFileList();
                } else {
                    let r = new FileReader();
                    r.onload = e => { uploadItems.push({ type: 'file', name: f.name, mime: f.type, data: e.target.result.split(',')[1] }); renderFileList(); };
                    r.readAsDataURL(f);
                }
            });
            el.value = '';
        }
        function renderFileList() {
            let html = "";
            uploadItems.forEach((item, idx) => {
                html += "<div class='flex justify-between items-center bg-emerald-50 p-3 rounded-lg mb-2 border border-emerald-100 text-emerald-800 text-sm font-bold shadow-sm'><span class='truncate mr-4'>✅ " + item.name + "</span><button onclick='removeFile(" + idx + ")' class='text-red-500 hover:text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-1 rounded shadow-sm transition'>✖ 刪除</button></div>";
            });
            document.getElementById('fList').innerHTML = html;
        }
        window.removeFile = function(idx) { uploadItems.splice(idx, 1); renderFileList(); };

        // --- 管理者解除冷卻限制 ---
        function unlockAdmin() {
            const btn = document.getElementById('adminBtn');
            if (sessionStorage.getItem('linquiz_admin')) {
                sessionStorage.removeItem('linquiz_admin');
                btn.innerText = "🔓 管理者解除限制";
                alert("已恢復一般冷卻限制");
                return;
            }
            let pw = prompt("請輸入管理者密碼：");
            if (pw === null || pw === "") return;
            sessionStorage.setItem('linquiz_admin', pw);
            btn.innerText = "🔒 已解除限制（點擊恢復）";
        }

