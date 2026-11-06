// 鴻綸 刻度｜紙本卷拍照轉題目（2026-11-05）。
// 老師上傳題目卷照片或 PDF（可再加答案卷），由 Worker 的 /api/ocr-paper 用 Gemini 視覺模型照抄成整齊題目，
// 老師在「核對辨識結果」視窗逐題檢查、修改，確認後變成跟 AI 出題一樣的 window.currentItems，
// 預設就是手機線上作答（A4、PDF、Word 都從同一份資料產生）。
// 跟「原卷直上」（paper-*.js，學生在原卷圖片上作答）是兩條不同的路，互不影響。
// 依賴：page-images.js、common.js（API_BASE）、home.js（getClientId）、edit-items.js（openEditItems）、
//       sheet.js（renderPaperFixed、switchSheet）、generate.js（normalizeScores）、settings.js（saveQuizToHistory）

const OCR_Q_PAGES_PER_CALL = 3;       // 題目頁一次送幾頁（多了容易逾時、輸出截斷）
const OCR_A_PAGES_PER_CALL = 4;
const OCR_MAX_Q_PAGES = 12;
const OCR_MAX_A_PAGES = 6;

let ocrQ = [];          // 題目卷頁面 [{ blob, name, url }]
let ocrA = [];          // 答案卷頁面
let ocrBusy = false;
let ocrState = null;    // 辨識進度，失敗時可以從失敗的那一批接著跑：{ answers, items, qBatch, aBatch, degraded }

// ---------- 畫面進出 ----------
function ocrIsTeacher() {
    const u = window.currentUser;
    return !!(u && (u.role === 'teacher' || u.role === 'superadmin'));
}

function startOcrFlow() {
    ['inputForm', 'studentHome', 'resultSection', 'paperApp'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById('ocrApp').classList.remove('hidden');
    const ok = ocrIsTeacher() || !!localStorage.getItem('lun_key');
    document.getElementById('ocrLoginNote').classList.toggle('hidden', ok);
    document.getElementById('ocrMain').classList.toggle('hidden', !ok);
    ocrRender();
    window.scrollTo(0, 0);
}

function ocrExit() {
    document.getElementById('ocrApp').classList.add('hidden');
    document.getElementById('inputForm').classList.remove('hidden');
    window.scrollTo(0, 0);
}

function ocrRevoke(list) { list.forEach(function (p) { URL.revokeObjectURL(p.url); }); }

function ocrReset() {
    ocrRevoke(ocrQ); ocrRevoke(ocrA);
    ocrQ = []; ocrA = []; ocrState = null;
    ocrSetStatus('', '');
    ocrRender();
}

// ---------- 上傳 ----------
async function ocrAddFiles(kind, el) {
    const files = Array.from(el.files || []);
    el.value = '';
    if (!files.length || ocrBusy) return;
    const list = kind === 'q' ? ocrQ : ocrA;
    const max = kind === 'q' ? OCR_MAX_Q_PAGES : OCR_MAX_A_PAGES;
    ocrSetStatus('info', '處理圖片中…');
    try {
        const room = max - list.length;
        if (room <= 0) throw new Error('最多 ' + max + ' 頁，請先移除幾頁');
        const pages = await lqFilesToPageBlobs(files, { maxEdge: 2200, quality: 0.9, maxPages: room, pdfScale: 2.6 });
        if (!pages.length) throw new Error('沒有可用的圖片或 PDF');
        pages.forEach(function (p) { p.url = URL.createObjectURL(p.blob); list.push(p); });
        ocrState = null;
        ocrSetStatus('', '');
    } catch (e) {
        ocrSetStatus('err', e.message);
    }
    ocrRender();
}

function ocrRemove(kind, i) {
    if (ocrBusy) return;
    const list = kind === 'q' ? ocrQ : ocrA;
    const p = list.splice(i, 1)[0];
    if (p) URL.revokeObjectURL(p.url);
    ocrState = null;
    ocrRender();
}

function ocrThumbsHtml(kind, list) {
    return list.map(function (p, i) {
        return "<div class='ocr-thumb'><img src='" + p.url + "' alt='第 " + (i + 1) + " 頁' onclick='ocrViewPage(" + jsArg(kind) + "," + i + ")'>" +
            "<span class='ocr-thumb-no'>" + (i + 1) + "</span>" +
            "<button type='button' class='ocr-thumb-x' aria-label='移除這頁' onclick='ocrRemove(" + jsArg(kind) + "," + i + ")'>✕</button></div>";
    }).join('');
}

function ocrRender() {
    document.getElementById('ocrQThumbs').innerHTML = ocrThumbsHtml('q', ocrQ);
    document.getElementById('ocrAThumbs').innerHTML = ocrThumbsHtml('a', ocrA);
    document.getElementById('ocrQCount').textContent = ocrQ.length ? ('已選 ' + ocrQ.length + ' 頁') : '還沒選';
    document.getElementById('ocrACount').textContent = ocrA.length ? ('已選 ' + ocrA.length + ' 頁') : '沒有也可以';
    const go = document.getElementById('ocrGo');
    go.disabled = ocrBusy || ocrQ.length === 0;
    go.textContent = ocrBusy ? '辨識中…' : (ocrState ? '從中斷的地方繼續' : '開始辨識');
}

function ocrSetStatus(kind, text) {
    const el = document.getElementById('ocrStatus');
    if (!el) return;
    el.className = 'text-sm mt-3 ' + (kind === 'err' ? 'text-red-600 font-bold' : kind === 'ok' ? 'text-emerald-700 font-bold' : 'text-gray-600');
    el.textContent = text;
}

// 放大看某一頁原圖（核對辨識結果時對照用）
function ocrViewPage(kind, i) {
    const list = kind === 'q' ? ocrQ : ocrA;
    const p = list[i];
    if (p) ocrShowImage(p.url);
}

function ocrShowImage(url) {
    let box = document.getElementById('ocrViewer');
    if (!box) {
        box = document.createElement('div');
        box.id = 'ocrViewer';
        box.className = 'ocr-viewer';
        box.onclick = function () { box.classList.add('hidden'); };
        box.innerHTML = "<img alt='原圖'><div class='ocr-viewer-tip'>點一下關閉</div>";
        document.body.appendChild(box);
    }
    box.querySelector('img').src = url;
    box.classList.remove('hidden');
}

// ---------- 呼叫 Worker ----------
async function ocrPost(body) {
    const headers = { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() };
    const token = lqGetToken();
    if (token) headers['X-Session-Token'] = token;
    const key = (localStorage.getItem('lun_key') || '').trim();
    if (key) headers['X-Gemini-Api-Key'] = key;
    const res = await fetch(API_BASE + '/api/ocr-paper', { method: 'POST', headers: headers, body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data || data.error) {
        throw new Error((data && data.error && data.error.message) || ('辨識失敗（' + res.status + '）'));
    }
    return data;
}

async function ocrBatchBody(mode, pages, extra) {
    const out = [];
    for (const p of pages) out.push({ mime: 'image/jpeg', data: await lqBlobToBase64(p.blob) });
    return Object.assign({ mode: mode, pages: out }, extra || {});
}

// 一批一批跑；任何一批失敗就停在那一批（ocrState 記著前面成功的結果），老師按「從中斷的地方繼續」
async function ocrRun() {
    if (ocrBusy || ocrQ.length === 0) return;
    ocrBusy = true;
    const st = ocrState || { answers: [], items: [], aBatch: 0, qBatch: 0, degraded: false };
    ocrState = st;
    ocrRender();
    try {
        const aTotal = Math.ceil(ocrA.length / OCR_A_PAGES_PER_CALL);
        for (; st.aBatch < aTotal; st.aBatch++) {
            ocrSetStatus('info', '正在讀答案卷（' + (st.aBatch + 1) + ' / ' + aTotal + '）…');
            const pages = ocrA.slice(st.aBatch * OCR_A_PAGES_PER_CALL, (st.aBatch + 1) * OCR_A_PAGES_PER_CALL);
            const r = await ocrPost(await ocrBatchBody('answers', pages));
            st.answers = st.answers.concat(r.answers || []);
            if (r.degraded) st.degraded = true;
        }
        const qTotal = Math.ceil(ocrQ.length / OCR_Q_PAGES_PER_CALL);
        for (; st.qBatch < qTotal; st.qBatch++) {
            ocrSetStatus('info', '正在辨識題目卷（' + (st.qBatch + 1) + ' / ' + qTotal + '，每批約 10 到 40 秒）…');
            const from = st.qBatch * OCR_Q_PAGES_PER_CALL;
            const pages = ocrQ.slice(from, from + OCR_Q_PAGES_PER_CALL);
            const r = await ocrPost(await ocrBatchBody('questions', pages, { solve: ocrA.length === 0, startNo: st.items.length + 1 }));
            (r.items || []).forEach(function (it) {
                it.page = (from + 1) + (pages.length > 1 ? '～' + (from + pages.length) : '');
                if (it.fig) it.fig.pi = from + it.fig.p - 1;     // 批次內第幾張 → 整份題目卷的第幾頁（0 起），發布時裁圖要用
            });
            st.items = st.items.concat(r.items || []);
            if (r.degraded) st.degraded = true;
        }
        ocrFinish(st);
    } catch (e) {
        ocrSetStatus('err', e.message + '　已完成的部分有保留，按「從中斷的地方繼續」可以接著跑。');
    } finally {
        ocrBusy = false;
        ocrRender();
    }
}

function ocrFinish(st) {
    const merged = ocrMergeItems(st.items, st.answers, ocrA.length > 0);
    if (!merged.length) { ocrSetStatus('err', '沒有辨識出任何題目。請確認照片清楚、整張入鏡，再試一次。'); ocrState = null; return; }
    ocrSetStatus('ok', '辨識完成，共 ' + merged.length + ' 題。請逐題核對後發布。');
    const pages = ocrQ.map(function (p, i) { return { url: p.url, label: '題目卷第 ' + (i + 1) + ' 頁' }; })
        .concat(ocrA.map(function (p, i) { return { url: p.url, label: '答案卷第 ' + (i + 1) + ' 頁' }; }));
    openEditItems({
        items: merged,
        title: '紙本卷測驗',
        heading: '核對辨識結果',
        pages: pages,
        requireCheck: true,
        degraded: st.degraded,
        saveLabel: '完成，產生線上測驗',
        onSave: ocrPublish
    });
}

// ---------- 合併：題目＋答案卷（純函式，可在 node 單獨測） ----------
// 答案以答案卷為準；沒有答案卷時沿用 AI 解題（Worker 已標 aiGuess）。保留所有題目，只加旗標，由老師決定。
function ocrMergeItems(items, answers, hasAnswerSheet) {
    const ansMap = {};
    (answers || []).forEach(function (a) { if (a && a.n > 0 && !ansMap[a.n]) ansMap[a.n] = a; });
    let seq = 0;
    const used = {};
    return (items || []).map(function (it) {
        seq += 1;
        const o = (it.o || []).slice();
        const flag = (it.flag || []).slice();
        let n = Number(it.n) > 0 ? Number(it.n) : seq;
        if (used[n]) n = seq;                      // 題號重複或亂掉就用順序號
        used[n] = true;
        let a = it.a || '';
        let e = it.e || '';
        if (hasAnswerSheet) {
            const hit = ansMap[n];
            if (hit) {
                a = hit.a;
                if (hit.e) e = hit.e;
                const i = flag.indexOf('noAnswer'); if (i >= 0) flag.splice(i, 1);
            } else {
                a = '';
                if (flag.indexOf('noAnswer') < 0) flag.push('noAnswer');
            }
        } else if (!a && flag.indexOf('noAnswer') < 0) {
            flag.push('noAnswer');
        }
        if (o.length >= 2 && a) {
            a = ocrLetters(a);
            const bad = a.split('').some(function (ch) { return ch.charCodeAt(0) - 65 >= o.length; });
            if (!a || bad) { if (flag.indexOf('badAnswer') < 0) flag.push('badAnswer'); }
        }
        const merged = { n: n, q: it.q, o: o, a: a, e: e, s: it.s || 0, page: it.page || '', flag: flag };
        if (it.fig) merged.fig = it.fig;
        return merged;
    });
}

// 選擇題答案統一成大寫字母（甲乙丙丁→ABCD，○→A，×→B）
function ocrLetters(a) {
    const map = { '甲': 'A', '乙': 'B', '丙': 'C', '丁': 'D', '戊': 'E', '己': 'F', '○': 'A', '〇': 'A', '×': 'B', '✕': 'B' };
    let out = '';
    for (const ch of String(a)) {
        const u = map[ch] || ch.toUpperCase();
        if (/[A-H]/.test(u) && out.indexOf(u) === -1) out += u;
    }
    return out.split('').sort().join('');
}

// 依 AI 框出的位置，從題目卷那一頁裁下圖形，縮到寬 560px 以內的 JPEG（data URL）；失敗回 ''，題目照常發布只是沒有圖
async function ocrCropFigure(fig) {
    try {
        const page = ocrQ[fig.pi];
        if (!page) return '';
        const bmp = await createImageBitmap(page.blob);
        const sx = Math.round(fig.x * bmp.width), sy = Math.round(fig.y * bmp.height);
        const sw = Math.max(8, Math.round(fig.w * bmp.width)), sh = Math.max(8, Math.round(fig.h * bmp.height));
        const scale = Math.min(1, 560 / sw);
        const cv = document.createElement('canvas');
        cv.width = Math.round(sw * scale); cv.height = Math.round(sh * scale);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        let url = '';
        for (const q of [0.78, 0.65, 0.5]) {            // 單張壓到約 60KB 內，分享與歷史才放得下
            url = cv.toDataURL('image/jpeg', q);
            if (url.length < 80000) break;
        }
        return url;
    } catch (e) { return ''; }
}

// ---------- 確認發布：變成跟 AI 出題一樣的試卷 ----------
async function ocrPublish(items, title) {
    const crops = {};                                  // 同一題組共用的圖只裁一次
    for (const it of items) {
        if (!it.fig || it.img) continue;
        const k = [it.fig.pi, it.fig.x, it.fig.y, it.fig.w, it.fig.h].join('|');
        if (!(k in crops)) crops[k] = await ocrCropFigure(it.fig);
        if (crops[k]) it.img = crops[k];
    }
    const clean = items.map(function (it) {
        const c = Object.assign({}, it);
        delete c.n; delete c.page; delete c.flag; delete c.fig;     // 只在審閱時用，不進分享、不存歷史
        // g：非選擇題、有參考答案的，學生交卷時請 AI 依參考答案批改（ai-grade.js、worker/src/grade.js）
        if ((!c.o || c.o.length === 0) && String(c.a || '').trim()) c.g = 1;
        return c;
    });
    const sum = clean.reduce(function (t, x) { return t + (Number(x.s) || 0); }, 0);
    if (clean.some(function (x) { return !(Number(x.s) > 0); }) || Math.round(sum) !== 100) normalizeScores(clean);
    window.currentItems = clean;
    window.currentSettings = { sType: 'ocr', grade: '', subject: '', publisher: '', scope: '', count: clean.length, qType: '', difficulty: '', lang: '', contentText: '' };
    window.itemsVersion = (window.itemsVersion || 0) + 1;
    document.getElementById('ocrApp').classList.add('hidden');
    renderPaperFixed(clean, title);
    switchSheet('answer');
    saveQuizToHistory();
    ocrReset();
}
