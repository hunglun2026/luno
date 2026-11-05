// 鴻綸 刻度｜編輯題目：老師在這裡改題幹、選項、答案、解析、配分，直接改 window.currentItems。
// 2026-11-05 取代 A4 試卷上的「點文字直接改」：那種改法只改畫面、不寫回資料，
// 分享連結、Word、線上作答都拿不到修改。現在題目資料是唯一來源，線上作答、A4、PDF、Word、分享都從它重畫。
// 依賴：sheet.js（renderPaperFixed、switchSheet、touchItems、answerKeyText）、generate.js（normalizeScores）、
//       answer.js（getCorrectLetters）、settings.js（saveQuizToHistory）、dialog.js（lqAlert）

        let eiDraft = [];   // 編輯中的草稿：{ q, optsText, ans, e, s, orig, flag, page }
        let eiOpts = null;  // 開啟方式：沒給＝編輯目前這份試卷；OCR 核對時帶 items、onSave、pages 等

        // OCR 旗標的白話說明（紅字提醒老師這題要特別看）
        const EI_FLAG_TEXT = {
            noAnswer: '沒有答案，請補上',
            aiGuess: '答案是 AI 自己解的，請核對',
            lowConf: '字跡或注音看不太清楚，請對照原圖',
            figure: '這題原卷有圖形或表格，這裡看不到，請確認題目還讀得通',
            badAnswer: '答案對不到選項，請修正'
        };

        function eiFromItems(items) {
            return items.map(function (it) {
                const hasOpts = it.o && it.o.length > 0;
                let ans = '';
                if (hasOpts) {
                    // 答案可能是字母、字母陣列、數字索引或整段選項文字，統一顯示成字母（A、AC）
                    try { ans = (typeof getCorrectLetters === 'function' ? getCorrectLetters(it) : []).join(''); } catch (e) { ans = ''; }
                    if (!ans) ans = answerKeyText(it) === '(略)' ? '' : String(answerKeyText(it));
                } else {
                    ans = answerKeyText(it) === '(略)' ? '' : String(answerKeyText(it));
                }
                return {
                    flag: (it.flag || []).slice(), page: it.page || '',
                    q: it.q || '',
                    optsText: hasOpts ? it.o.map(function (o, i) { return stripOptLabel(o, String.fromCharCode(65 + i)); }).join('\n') : '',
                    ans: ans, e: it.e || '', s: it.s == null ? '' : it.s, orig: it
                };
            });
        }

        function eiRender() {
            const body = document.getElementById('editItemsBody');
            if (!body) return;
            let html = '';
            eiDraft.forEach(function (d, i) {
                const flags = (d.flag || []).filter(function (f) { return EI_FLAG_TEXT[f]; });
                const flagHtml = flags.map(function (f) { return "<span class='ei-flag'>" + escapeHtml(EI_FLAG_TEXT[f]) + "</span>"; }).join('');
                html += "<div class='lq-card p-3 mb-3' data-ei='" + i + "' style='border:1px solid " + (flags.length ? '#f28b82' : '#e5e7eb') + ";'>" +
                    "<div class='flex items-center justify-between mb-2'><b>第 " + (i + 1) + " 題" + (d.page ? "<span class='ei-src'>（原卷第 " + escapeHtml(d.page) + " 頁）</span>" : "") + "</b>" +
                    "<span class='flex gap-1'>" +
                    "<button type='button' class='lq-btn lq-btn-ghost px-2 py-1 text-sm' onclick='eiMove(" + i + ",-1)' aria-label='上移'" + (i === 0 ? " disabled" : "") + ">↑</button>" +
                    "<button type='button' class='lq-btn lq-btn-ghost px-2 py-1 text-sm' onclick='eiMove(" + i + ",1)' aria-label='下移'" + (i === eiDraft.length - 1 ? " disabled" : "") + ">↓</button>" +
                    "<button type='button' class='lq-btn lq-btn-ghost px-2 py-1 text-sm' style='color:#d93025;' onclick='eiDelete(" + i + ")'>刪除</button>" +
                    "</span></div>" +
                    (flagHtml ? "<div class='mb-2'>" + flagHtml + "</div>" : "") +
                    "<label class='text-xs text-gray-500'>題目</label>" +
                    "<textarea class='lq-input w-full mb-2 ei-q' rows='3' style='resize:vertical;'>" + escapeHtml(d.q) + "</textarea>" +
                    "<label class='text-xs text-gray-500'>選項（每行一個，不用加 A. B.；填空、簡答題請留空）</label>" +
                    "<textarea class='lq-input w-full mb-2 ei-o' rows='4' style='resize:vertical;'>" + escapeHtml(d.optsText) + "</textarea>" +
                    "<div class='grid grid-cols-3 gap-2 mb-2'>" +
                    "<div style='grid-column: span 2;'><label class='text-xs text-gray-500'>答案（選擇題填字母，例如 B 或 AC；其他題型寫答案文字）</label>" +
                    "<input class='lq-input w-full ei-a' value='" + escapeHtml(d.ans) + "'></div>" +
                    "<div><label class='text-xs text-gray-500'>配分</label>" +
                    "<input class='lq-input w-full ei-s' type='number' min='0' step='1' inputmode='numeric' value='" + escapeHtml(String(d.s)) + "'></div></div>" +
                    "<label class='text-xs text-gray-500'>解析</label>" +
                    "<textarea class='lq-input w-full ei-e' rows='2' style='resize:vertical;'>" + escapeHtml(d.e) + "</textarea>" +
                    "</div>";
            });
            body.innerHTML = html;
        }

        // 把畫面上的輸入值收回草稿（移動、刪除、新增前一定要先收，不然輸入的字會被重畫洗掉）
        function eiCollect() {
            document.querySelectorAll('#editItemsBody [data-ei]').forEach(function (card) {
                const d = eiDraft[Number(card.dataset.ei)];
                if (!d) return;
                d.q = card.querySelector('.ei-q').value;
                d.optsText = card.querySelector('.ei-o').value;
                d.ans = card.querySelector('.ei-a').value;
                d.s = card.querySelector('.ei-s').value;
                d.e = card.querySelector('.ei-e').value;
            });
        }

        function openEditItems(opts) {
            eiOpts = opts || null;
            const items = eiOpts ? eiOpts.items : window.currentItems;
            if (!items || !items.length) { lqAlert('目前沒有題目可以編輯'); return; }
            if (!eiOpts && typeof handoffActive === 'function' && handoffActive()) return;
            eiDraft = eiFromItems(items);
            document.getElementById('eiTitle').value = eiOpts ? (eiOpts.title || '') : (window.docTitle || '');
            document.getElementById('eiHeading').textContent = eiOpts && eiOpts.heading ? eiOpts.heading : '✏️ 編輯題目';
            document.getElementById('eiSave').textContent = eiOpts && eiOpts.saveLabel ? eiOpts.saveLabel : '儲存';
            eiRenderHead();
            eiRender();
            document.getElementById('editItemsModal').classList.remove('hidden');
        }

        // 核對模式的頂部資訊：有幾題要特別看、原圖縮圖、品質提醒、「我已檢查」勾選
        function eiRenderHead() {
            const box = document.getElementById('eiHead');
            if (!eiOpts || !eiOpts.requireCheck) { box.innerHTML = ''; return; }
            const flagged = eiDraft.filter(function (d) { return (d.flag || []).some(function (f) { return EI_FLAG_TEXT[f]; }); }).length;
            let h = "<div class='ei-note'>" + (flagged ? ("有 <b>" + flagged + " 題</b>標了紅色提醒，請優先檢查。") : "沒有特別提醒的題目，但仍請逐題對照原卷看過。") +
                " 拍照辨識可能認錯字、注音或數字，發給學生前一定要自己確認。</div>";
            if (eiOpts.degraded) h += "<div class='ei-note ei-warn'>這次辨識有一部分改用備用模型，品質可能較差，請特別仔細核對。</div>";
            if (eiOpts.pages && eiOpts.pages.length) {
                h += "<div class='ei-pages'>" + eiOpts.pages.map(function (p, i) {
                    return "<img src='" + p.url + "' alt='" + escapeHtml(p.label) + "' title='" + escapeHtml(p.label) + "' onclick='ocrShowImage(this.src)'>";
                }).join('') + "<span class='ei-src'>點縮圖可放大對照原圖</span></div>";
            }
            h += "<label class='ei-check'><input type='checkbox' id='eiChecked'> 我已逐題對照原卷檢查過，確認題目與答案沒問題</label>";
            box.innerHTML = h;
        }

        function closeEditItems() {
            document.getElementById('editItemsModal').classList.add('hidden');
        }

        function eiMove(i, dir) {
            eiCollect();
            const j = i + dir;
            if (j < 0 || j >= eiDraft.length) return;
            const t = eiDraft[i]; eiDraft[i] = eiDraft[j]; eiDraft[j] = t;
            eiRender();
        }

        async function eiDelete(i) {
            eiCollect();
            if (eiDraft.length <= 1) { lqAlert('至少要留一題'); return; }
            if (!(await askConfirm('確定刪除第 ' + (i + 1) + ' 題？', { danger: true, okText: '刪除' }))) return;
            eiDraft.splice(i, 1);
            eiRender();
        }

        function eiAdd() {
            eiCollect();
            eiDraft.push({ q: '', optsText: '', ans: '', e: '', s: '', orig: null });
            eiRender();
            const body = document.getElementById('editItemsBody');
            const last = body.lastElementChild;
            if (last) last.scrollIntoView({ block: 'center' });
        }

        // 配分重算成總分 100（沿用出題時的 normalizeScores）
        function eiNormalize() {
            eiCollect();
            const tmp = eiDraft.map(function (d) { return { s: Number(d.s) || 1 }; });
            normalizeScores(tmp);
            eiDraft.forEach(function (d, i) { d.s = tmp[i].s; });
            eiRender();
        }

        // 草稿 → 題目陣列；有問題回傳 { error }，不寫入
        function eiBuild() {
            const out = [];
            for (let i = 0; i < eiDraft.length; i++) {
                const d = eiDraft[i];
                const n = i + 1;
                const q = d.q.trim();
                if (!q) return { error: '第 ' + n + ' 題沒有題目內容' };
                const opts = d.optsText.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
                if (opts.length === 1) return { error: '第 ' + n + ' 題只有 1 個選項：選擇題至少要 2 個選項，填空、簡答題請把選項留空' };
                const score = Number(d.s);
                if (!(score >= 0)) return { error: '第 ' + n + ' 題的配分要是數字' };
                let a = d.ans.trim();
                if (opts.length >= 2) {
                    a = a.toUpperCase().replace(/[^A-Z]/g, '');
                    if (!a) return { error: '第 ' + n + ' 題是選擇題，答案要填字母（例如 B 或 AC）' };
                    for (const ch of a) {
                        if (ch.charCodeAt(0) - 65 >= opts.length) return { error: '第 ' + n + ' 題的答案「' + ch + '」超出選項範圍（只有 ' + opts.length + ' 個選項）' };
                    }
                }
                const next = Object.assign({}, d.orig || {}, { q: q, o: opts, a: a, e: d.e.trim(), s: score });
                if (eiOpts) { next.flag = d.flag || []; next.page = d.page || ''; }   // 只有 OCR 核對才帶旗標與來源頁，一般編輯不要把這些欄位塞進試卷
                out.push(next);
            }
            return { items: out };
        }

        function saveEditItems() {
            eiCollect();
            const r = eiBuild();
            if (r.error) { lqAlert(r.error); return; }
            const title = document.getElementById('eiTitle').value.trim() || window.docTitle || '試卷';
            if (eiOpts && eiOpts.requireCheck && !document.getElementById('eiChecked').checked) {
                lqAlert('請先勾選「我已逐題對照原卷檢查過」，再產生線上測驗。');
                return;
            }
            if (eiOpts && eiOpts.onSave) {
                const cb = eiOpts.onSave;
                closeEditItems();
                cb(r.items, title);
                return;
            }
            const keep = window.currentSheet || 'answer';
            window.currentItems = r.items;                  // 換成新陣列：舊的分享連結快取一定失效
            if (window.currentSettings) window.currentSettings.count = r.items.length;
            touchItems();
            renderPaperFixed(r.items, title);
            switchSheet(keep);
            saveQuizToHistory(true);
            closeEditItems();
        }
