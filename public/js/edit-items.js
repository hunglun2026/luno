// 鴻綸 刻度｜編輯題目：老師在這裡改題幹、選項、答案、解析、配分，直接改 window.currentItems。
// 2026-11-05 取代 A4 試卷上的「點文字直接改」：那種改法只改畫面、不寫回資料，
// 分享連結、Word、線上作答都拿不到修改。現在題目資料是唯一來源，線上作答、A4、PDF、Word、分享都從它重畫。
// 依賴：sheet.js（renderPaperFixed、switchSheet、touchItems、answerKeyText）、generate.js（normalizeScores）、
//       answer.js（getCorrectLetters）、settings.js（saveQuizToHistory）、dialog.js（lqAlert）

        let eiDraft = [];   // 編輯中的草稿：{ q, optsText, ans, e, s, orig }

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
                html += "<div class='lq-card p-3 mb-3' data-ei='" + i + "' style='border:1px solid #e5e7eb;'>" +
                    "<div class='flex items-center justify-between mb-2'><b>第 " + (i + 1) + " 題</b>" +
                    "<span class='flex gap-1'>" +
                    "<button type='button' class='lq-btn lq-btn-ghost px-2 py-1 text-sm' onclick='eiMove(" + i + ",-1)' aria-label='上移'" + (i === 0 ? " disabled" : "") + ">↑</button>" +
                    "<button type='button' class='lq-btn lq-btn-ghost px-2 py-1 text-sm' onclick='eiMove(" + i + ",1)' aria-label='下移'" + (i === eiDraft.length - 1 ? " disabled" : "") + ">↓</button>" +
                    "<button type='button' class='lq-btn lq-btn-ghost px-2 py-1 text-sm' style='color:#d93025;' onclick='eiDelete(" + i + ")'>刪除</button>" +
                    "</span></div>" +
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

        function openEditItems() {
            if (!window.currentItems || !window.currentItems.length) { lqAlert('目前沒有題目可以編輯'); return; }
            if (typeof handoffActive === 'function' && handoffActive()) return;
            eiDraft = eiFromItems(window.currentItems);
            document.getElementById('eiTitle').value = window.docTitle || '';
            eiRender();
            document.getElementById('editItemsModal').classList.remove('hidden');
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
                out.push(Object.assign({}, d.orig || {}, { q: q, o: opts, a: a, e: d.e.trim(), s: score }));
            }
            return { items: out };
        }

        function saveEditItems() {
            eiCollect();
            const r = eiBuild();
            if (r.error) { lqAlert(r.error); return; }
            const title = document.getElementById('eiTitle').value.trim() || window.docTitle || '試卷';
            const keep = window.currentSheet || 'answer';
            window.currentItems = r.items;                  // 換成新陣列：舊的分享連結快取一定失效
            if (window.currentSettings) window.currentSettings.count = r.items.length;
            touchItems();
            renderPaperFixed(r.items, title);
            switchSheet(keep);
            saveQuizToHistory(true);
            closeEditItems();
        }
