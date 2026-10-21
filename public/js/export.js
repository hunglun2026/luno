// Luno 綸諾｜下載 Word／PDF。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
        // --- 下載選單（多格式）---
        function toggleDownloadMenu() {
            document.getElementById('downloadMenu').classList.toggle('hidden');
        }
        function closeDownloadMenu() {
            document.getElementById('downloadMenu').classList.add('hidden');
        }
        document.addEventListener('click', function(e) {
            const wrap = document.getElementById('downloadMenuWrap');
            if (wrap && !wrap.contains(e.target)) closeDownloadMenu();
        });


        // 函式庫改成按需載入後，第一次按下載會多等一下才有反應，老師很容易連按好幾次
        // 導致同時跑好幾份匯出。用一個旗標擋住重入。
        window._exporting = false;

        // 元素相對某個祖先的layout距離(累加offsetTop)。中途若跳出祖先範圍就回傳null，
        // 讓呼叫端知道量不到、不要拿錯的數字當切點。
        // (2026-10-21 補回：9779b2174 移除純文字下載時被連帶刪掉，PDF 匯出一直報「offsetTopWithin is not defined」)
        function offsetTopWithin(el, ancestor) {
            let y = 0, n = el;
            while (n && n !== ancestor) {
                y += n.offsetTop;
                n = n.offsetParent;
            }
            return n === ancestor ? y : null;
        }

        async function dlPDF() {
            if (window._exporting) return;
            window._exporting = true;
            try {
                await dlPDFInner();
            } finally {
                window._exporting = false;
            }
        }

        async function dlPDFInner() {
            try {
                await Promise.all([loadScript(LIB_URLS.html2canvas), loadScript(LIB_URLS.jspdf)]);
            } catch (e) {}
            if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
                alert('PDF 元件載入失敗，請檢查網路連線後再試一次');
                return;
            }
            let pages = Array.from(document.querySelectorAll('#paperContainer > .a4-page')).filter(p => p.style.display !== 'none');
            if (pages.length === 0) { alert('沒有可匯出的內容'); return; }

            // 用display:none而不是visibility:hidden：visibility只是「看不見」，元素照樣佔位，
            // 每題上方那顆「🔁 重新出這題」工具列就會在PDF裡的題號後面留下一整行空白。
            // 頁尾一起隱藏：它印的是螢幕分頁的頁碼(每10題一頁)，但PDF是照實際內容高度切，
            // 兩者頁數不一樣，截進去就會出現「第1頁/共1頁」卻有兩頁的矛盾(Steve回報)。
            // 正確頁碼改由jsPDF在最後統一補上。
            const noPrintEls = document.querySelectorAll('#paperContainer .no-print, #paperContainer .page-footer');
            const noPrintPrevDisplay = [];
            noPrintEls.forEach((el, i) => { noPrintPrevDisplay[i] = el.style.display; el.style.display = 'none'; });

            try {
                await document.fonts.ready;
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                // 內容不能貼滿整張A4：影像若從(0,0)鋪到210mm寬，文字就直接壓在紙張邊緣，
                // 印表機的不可列印區會把邊緣的字吃掉。留10mm白邊，內容縮到190x277mm。
                const PAGE_W_MM = 210, PAGE_H_MM = 297, MARGIN_MM = 10;
                const CONTENT_W_MM = PAGE_W_MM - MARGIN_MM * 2;
                const CONTENT_H_MM = PAGE_H_MM - MARGIN_MM * 2;
                let firstSlice = true;
                for (let i = 0; i < pages.length; i++) {
                    const pageEl = pages[i];
                    // 正常情況一個.a4-page的內容剛好是一張A4，scale:2畫質足夠。
                    // 但若「重新出這題」換到異常長的題目(常見於理化計算題)，這一頁實際高度會遠超297mm，
                    // 若還硬用scale:2，截圖高度(scrollHeight*scale)可能超過瀏覽器canvas高度上限(約16384px)，
                    // html2canvas會靜默把超出的內容截掉、不報錯，肉眼看起來就像內容憑空消失/跑版。
                    // 這裡動態降低scale避免撞到上限，確保整頁內容都真的被截圖進去。
                    const scale = Math.min(2, 14000 / pageEl.scrollHeight);
                    const canvas = await html2canvas(pageEl, { scale, useCORS: true, backgroundColor: '#ffffff' });
                    const pxPerMm = canvas.width / CONTENT_W_MM;
                    const sliceHeightPx = Math.round(CONTENT_H_MM * pxPerMm);

                    // 可切頁的位置＝每一題(.q-item)的底部。純照297mm硬切會把一題切成兩半
                    // (上一頁結尾只剩半行字、下一頁又接著半行)，改成切在最靠近頁尾、又不會切斷題目的那個邊界。
                    //
                    // 座標一律用layout座標(offsetTop/offsetHeight)，不能用getBoundingClientRect：
                    // rect回傳的是「視覺」尺寸，會被瀏覽器縮放/CSS transform乘上一個比例，
                    // 但canvas高度對應的是layout尺寸，兩邊基準不同會讓切點整條偏移(縮到90%就偏約10%，
                    // 剛好切進題目中間)。offsetTop/offsetHeight不受縮放影響，跟canvas同一個基準。
                    const canvasScale = canvas.height / pageEl.offsetHeight;
                    const cutPointsPx = Array.from(pageEl.querySelectorAll('.q-item'))
                        .map(el => {
                            const top = offsetTopWithin(el, pageEl);
                            if (top === null) return -1;
                            // 多帶半個題間距當緩衝：offsetHeight是layout高度，但實際描繪的字會有下伸部/
                            // 行高捨入，剛好切在offsetHeight會讓最後一行的底部1~3px殘留到下一頁。
                            // 題目之間本來就有12pt空白，往下多留一點不會吃到下一題
                            const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
                            return Math.round((top + el.offsetHeight + mb * 0.5) * canvasScale);
                        })
                        .filter(v => v > 0 && v < canvas.height)
                        .sort((a, b) => a - b);

                    // 這一頁的實際內容若超過297mm(同上述異常過長的情況)，不再硬塞成一張PDF頁面
                    // (那樣只會把內容擠壓變形)，改成依297mm高度切成好幾張PDF頁，內容才不會不見
                    let offsetPx = 0;
                    while (offsetPx < canvas.height) {
                        if (!firstSlice) pdf.addPage();
                        firstSlice = false;
                        let endPx = Math.min(offsetPx + sliceHeightPx, canvas.height);
                        if (endPx < canvas.height) {
                            // 只接受落在本頁後半段的邊界，避免某一題超長時把整頁切得只剩一小截
                            const minEnd = offsetPx + sliceHeightPx * 0.4;
                            const fits = cutPointsPx.filter(v => v > minEnd && v <= endPx);
                            if (fits.length > 0) endPx = fits[fits.length - 1];
                        }
                        const thisSlicePx = endPx - offsetPx;
                        if (thisSlicePx <= 0) break;
                        const sliceCanvas = document.createElement('canvas');
                        sliceCanvas.width = canvas.width;
                        sliceCanvas.height = thisSlicePx;
                        sliceCanvas.getContext('2d').drawImage(canvas, 0, offsetPx, canvas.width, thisSlicePx, 0, 0, canvas.width, thisSlicePx);
                        pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_MM, MARGIN_MM, CONTENT_W_MM, thisSlicePx / pxPerMm);
                        offsetPx = endPx;
                    }
                }
                // 補頁碼：等所有頁都產生完才知道總頁數，用純數字避免內建字型不支援中文而變亂碼
                const totalPages = pdf.internal.getNumberOfPages();
                pdf.setFontSize(9);
                pdf.setTextColor(90);
                for (let p = 1; p <= totalPages; p++) {
                    pdf.setPage(p);
                    pdf.text('- ' + p + ' / ' + totalPages + ' -', PAGE_W_MM / 2, PAGE_H_MM - 5, { align: 'center' });
                }

                pdf.save((window.docName || "試卷") + ".pdf");
            } catch (e) {
                alert('PDF 匯出失敗: ' + e.message);
            } finally {
                noPrintEls.forEach((el, i) => { el.style.display = noPrintPrevDisplay[i] || ''; });
            }
        }

        // Word 匯出：產生真正的 .docx（Office Open XML）。
        // 舊版是把HTML存成.doc，Word打得開但Google文件/手機Word匯入常跑版；改用docx函式庫產生標準格式。
        // 網頁上的分頁(每頁10題)是螢幕預覽用的，Word一頁塞得下的題數跟它不同，
        // 所以題目連續輸出讓Word自然填滿每一頁(舊版每頁後都強制分頁，每張紙只印5題就跳頁很浪費紙)。
        async function dlDoc() {
            if (window._exporting) return;
            window._exporting = true;
            try {
                await dlDocInner();
            } finally {
                window._exporting = false;
            }
        }

        async function dlDocInner() {
            try { await loadScript(LIB_URLS.docx); } catch (e) {}
            if (typeof window.docx === 'undefined') {
                alert('Word 元件載入失敗，請檢查網路連線後再試一次');
                return;
            }
            const items = window.currentItems || [];
            if (items.length === 0) { alert('沒有可匯出的內容'); return; }

            const D = window.docx;
            const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel } = D;
            const FONT = '微軟正黑體';
            const run = (text, opts) => new TextRun(Object.assign({ text: String(text), font: FONT }, opts || {}));

            // 標題與班級/姓名/座號欄（沿用畫面上的標題，使用者若改過標題也跟著走）
            const headerEl = document.querySelector('#paperContainer .paper-header');
            const title = (headerEl && headerEl.querySelector('h2') ? headerEl.querySelector('h2').innerText : (window.docTitle || '試卷')).trim();
            const infoSpans = headerEl ? Array.from(headerEl.querySelectorAll('.paper-info span')).map(e => e.innerText.trim()) : [];

            const children = [];
            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [run(title, { bold: true, size: 36 })]
            }));
            if (infoSpans.length > 0) {
                children.push(new Paragraph({
                    spacing: { after: 200 },
                    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 6 } },
                    children: [run(infoSpans.join('　　'), { size: 21 })]
                }));
            }

            items.forEach((q, i) => {
                const isChoice = q.o && q.o.length > 0;
                const prefix = isChoice ? ((i + 1) + '. (　　) ') : ((i + 1) + '. ');
                // 題號與題幹放同一段，靠首行凸排讓第二行對齊題幹起點，不用表格也能整齊
                children.push(new Paragraph({
                    spacing: { before: 120, after: 40 },
                    indent: { left: 720, hanging: 720 },
                    keepNext: true,
                    children: [
                        run(prefix, { bold: true }),
                        run(q.q, { bold: true }),
                        run('  (' + (q.s || 0) + '分)', { size: 18, color: '666666' })
                    ]
                }));
                if (isChoice) {
                    q.o.forEach((o, oi) => {
                        const label = String.fromCharCode(65 + oi);
                        children.push(new Paragraph({
                            spacing: { after: 20 },
                            indent: { left: 1080 },
                            children: [run('(' + label + ') ' + stripOptLabel(o, label))]
                        }));
                    });
                } else {
                    // 非選擇題留三行作答空間
                    for (let k = 0; k < 3; k++) {
                        children.push(new Paragraph({
                            spacing: { after: 120 },
                            indent: { left: 720 },
                            border: { bottom: { style: BorderStyle.DASHED, size: 6, color: '000000', space: 4 } },
                            children: [run('')]
                        }));
                    }
                }
            });

            // 答案卷：另起新頁
            children.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run('解析卷', { bold: true, size: 32 })] }));
            items.forEach((q, i) => {
                let ans = q.a;
                if (Array.isArray(q.a)) ans = q.a.map(x => String.fromCharCode(65 + x)).join('');
                else if (typeof q.a === 'number') ans = String.fromCharCode(65 + q.a);
                else ans = q.a || '(略)';
                children.push(new Paragraph({
                    spacing: { after: 60 },
                    indent: { left: 720, hanging: 720 },
                    children: [
                        run((i + 1) + '. ', { bold: true }),
                        run(String(ans) + '  ', { bold: true, color: 'CC0000' }),
                        run(q.e || '', { size: 18, color: '666666' })
                    ]
                }));
            });

            const doc = new Document({
                styles: { default: { document: { run: { font: FONT, size: 22 } } } },
                sections: [{
                    properties: { page: { margin: { top: 850, right: 1000, bottom: 850, left: 1000 } } },
                    children: children
                }]
            });

            const blob = await Packer.toBlob(doc);
            const fileName = (window.docName || '試卷') + '.docx';
            const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

            if (window.showSaveFilePicker) {
                try {
                    const h = await showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Word 文件', accept: { [MIME]: ['.docx'] } }] });
                    const w = await h.createWritable();
                    await w.write(blob); await w.close(); return;
                } catch (e) { return; }
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
        }

