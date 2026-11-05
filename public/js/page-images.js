// 鴻綸 刻度｜把使用者選的照片或 PDF 變成「一頁一張」縮好的 JPEG。
// 原卷直上（paper-teacher.js）與紙本卷拍照 OCR（ocr-teacher.js）共用，所以抽到這裡（2026-11-05）。
// 依賴：core.js 的 loadScript、LIB_URLS（PDF 轉圖用 pdf.js，按需載入）。

function lqLoadImage(url) {
    return new Promise(function (resolve, reject) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('圖片載入失敗')); };
        img.src = url;
    });
}

function lqCanvasToBlob(canvas, quality) {
    return new Promise(function (resolve) {
        canvas.toBlob(function (b) { resolve(b); }, 'image/jpeg', quality || 0.85);
    });
}

// 長邊縮到 maxEdge 以內再轉 JPEG。原卷直上用 1600（找作答框夠用）；
// OCR 要讀小字、注音、上下標，用 2200 以上。小圖不放大。
async function lqShrinkToBlob(source, maxEdge, quality) {
    const w = source.width || source.naturalWidth;
    const h = source.height || source.naturalHeight;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';              // PNG 透明底轉 JPEG 會變黑，先鋪白
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await lqCanvasToBlob(canvas, quality);
}

// files：<input type=file> 的檔案（圖片或 PDF）。回傳 [{ blob, name }]，PDF 每頁一張。
// opts：{ maxEdge, quality, maxPages, pdfScale }
async function lqFilesToPageBlobs(files, opts) {
    opts = opts || {};
    const maxEdge = opts.maxEdge || 1600;
    const quality = opts.quality || 0.85;
    const maxPages = opts.maxPages || 10;
    const pdfScale = opts.pdfScale || 2;
    const out = [];
    for (const f of files) {
        if (out.length >= maxPages) break;
        if (f.type === 'application/pdf') {
            await loadScript(LIB_URLS.pdfjs);
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB_URLS.pdfjsWorker;
            const pdf = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
            for (let p = 1; p <= pdf.numPages && out.length < maxPages; p++) {
                const page = await pdf.getPage(p);
                const viewport = page.getViewport({ scale: pdfScale });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                out.push({ blob: await lqShrinkToBlob(canvas, maxEdge, quality), name: f.name + ' 第 ' + p + ' 頁' });
            }
        } else if (/^image\//.test(f.type)) {
            const url = URL.createObjectURL(f);
            try {
                const img = await lqLoadImage(url);
                out.push({ blob: await lqShrinkToBlob(img, maxEdge, quality), name: f.name });
            } finally {
                URL.revokeObjectURL(url);
            }
        }
    }
    return out;
}

function lqBlobToBase64(blob) {
    return new Promise(function (resolve, reject) {
        const fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
        fr.onerror = function () { reject(new Error('讀取圖片失敗')); };
        fr.readAsDataURL(blob);
    });
}
