// Luno 綸諾｜原卷直上：共用狀態、進入點、老師上傳卷子、作答區編輯。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部

// ============ 原卷直上：共用狀態 ============
// paper：目前這份卷子的資料（id/title/pageCount/regions/answerKey）
// ppDashKey：老師的批改金鑰，只有出題者拿得到（存 localStorage，換裝置要靠連結帶）
let ppPaper = null;
let ppDashKey = '';
let ppCurPage = 1;
let ppSelId = null;
let ppStuAnswers = {};   // { regionId: {v} | {canvas} }
let ppHandCanvases = {}; // { regionId: canvas }
let ppTool = 'pen';
let ppGradeSub = null;

function ppHeaders(extra) {
    const h = Object.assign({ 'X-Client-Id': getClientId() }, extra || {});
    const t = localStorage.getItem('lun_session');
    if (t) h['X-Session-Token'] = t;
    if (ppDashKey) h['X-Dash-Key'] = ppDashKey;
    return h;
}

async function ppApi(path, opts) {
    const o = Object.assign({}, opts || {});
    o.headers = ppHeaders(o.headers);
    if (o.body && typeof o.body === 'string' && !o.headers['Content-Type']) {
        o.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(API_BASE + path, o);
    const ct = res.headers.get('Content-Type') || '';
    if (!ct.includes('application/json')) {
        if (!res.ok) throw new Error('伺服器回應異常（' + res.status + '）');
        return res;
    }
    const data = await res.json();
    if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ('請求失敗（' + res.status + '）'));
    return data;
}

function ppShow(which) {
    document.getElementById('inputForm').classList.add('hidden');
    document.getElementById('studentHome').classList.add('hidden');
    document.getElementById('resultSection').classList.add('hidden');
    document.getElementById('paperApp').classList.remove('hidden');
    ['paperTeacher', 'paperStudentView', 'paperGradeView'].forEach(function (id) {
        document.getElementById(id).classList.toggle('hidden', id !== which);
    });
    window.scrollTo(0, 0);
}

function paperExit() {
    // 站內返回，不用 history.back()——這個 SPA 沒有 pushState，退的會是進站前那一頁
    document.getElementById('paperApp').classList.add('hidden');
    document.getElementById('inputForm').classList.remove('hidden');
    window.scrollTo(0, 0);
}

// ============ 進入點 ============
// 老師從出題表單第三顆鈕進來：先在後端開一份空白卷子，拿到 id 與批改金鑰
async function startPaperFlow() {
    ppShow('paperTeacher');
    document.getElementById('ppStep2').classList.add('hidden');
    document.getElementById('ppUploadStatus').textContent = '';
    document.getElementById('ppTitle').value = '';
    ppPaper = null;
    ppDashKey = '';
    ppCurPage = 1;
}

// 網址帶 ?paper=<id> 時：有 k=<批改金鑰> 就是老師（編輯或批改），沒有就是學生作答
async function loadPaperRouteIfAny() {
    const q = new URLSearchParams(location.search);
    const id = q.get('paper');
    if (!id) return false;
    ppDashKey = q.get('k') || '';
    try {
        ppPaper = await ppApi('/api/paper/' + encodeURIComponent(id));
    } catch (e) {
        ppShow('paperStudentView');
        document.getElementById('ppStuHeader').innerHTML =
            "<div class='text-red-600 font-bold'>打不開這份卷子</div><div class='text-sm text-gray-600 mt-1'>" + escapeHtml(e.message) + "</div>";
        return true;
    }
    if (ppPaper.isOwner && q.get('grade') === '1') {
        ppShow('paperGradeView');
        document.getElementById('ppGradeTitle').textContent = ppPaper.title;
        ppLoadSubmissions();
        return true;
    }
    if (ppPaper.isOwner && q.get('edit') === '1') {
        ppShow('paperTeacher');
        document.getElementById('ppTitle').value = ppPaper.title;
        document.getElementById('ppStep2').classList.remove('hidden');
        ppRenderPageTabs();
        ppRenderStage();
        return true;
    }
    ppStuInit();
    return true;
}

// ============ 老師：上傳卷子 ============
async function ppEnsurePaper() {
    if (ppPaper && ppPaper.id) return ppPaper;
    const title = document.getElementById('ppTitle').value.trim() || '原卷測驗';
    const data = await ppApi('/api/paper', { method: 'POST', body: JSON.stringify({ title }) });
    ppDashKey = data.dashKey;
    ppPaper = { id: data.id, title, pageCount: 0, regions: [], answerKey: {}, isOwner: true };
    // 老師關掉分頁後還找得回自己的卷子（金鑰只在這台裝置，不會外流）
    try {
        const mine = JSON.parse(localStorage.getItem('lun_papers') || '[]');
        mine.unshift({ id: data.id, title, dashKey: data.dashKey, at: Date.now() });
        localStorage.setItem('lun_papers', JSON.stringify(mine.slice(0, 30)));
    } catch (e) {}
    return ppPaper;
}

// 大張掃描圖直接上傳會超過 5MB，所以一律先在瀏覽器縮到長邊 1600px 再送。
// 1600px 對「看得清楚題目字」跟「AI 抓得到座標」都夠用，再高只是浪費容量。
function ppCanvasToBlob(canvas, quality) {
    return new Promise(function (resolve) {
        canvas.toBlob(function (b) { resolve(b); }, 'image/jpeg', quality || 0.85);
    });
}

async function ppShrinkImage(source) {
    const MAX = 1600;
    const w = source.width || source.naturalWidth;
    const h = source.height || source.naturalHeight;
    const scale = Math.min(1, MAX / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return await ppCanvasToBlob(canvas, 0.85);
}

function ppLoadImage(url) {
    return new Promise(function (resolve, reject) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('圖片載入失敗')); };
        img.src = url;
    });
}

async function ppHandleFiles(el) {
    const files = Array.from(el.files || []);
    el.value = '';
    if (!files.length) return;
    const status = document.getElementById('ppUploadStatus');
    status.className = 'text-sm mt-2 text-gray-600';
    status.textContent = '處理中…';

    try {
        await ppEnsurePaper();
        const blobs = [];
        for (const f of files) {
            if (f.type === 'application/pdf') {
                await loadScript(LIB_URLS.pdfjs);
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB_URLS.pdfjsWorker;
                const pdf = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
                for (let p = 1; p <= pdf.numPages && blobs.length < 10; p++) {
                    const page = await pdf.getPage(p);
                    const viewport = page.getViewport({ scale: 2 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                    blobs.push(await ppShrinkImage(canvas));
                }
            } else if (/^image\//.test(f.type)) {
                const img = await ppLoadImage(URL.createObjectURL(f));
                blobs.push(await ppShrinkImage(img));
            }
        }

        if (!blobs.length) throw new Error('沒有可用的圖片或 PDF');

        let page = Number(ppPaper.pageCount) || 0;
        for (const blob of blobs) {
            if (page >= 10) break;
            page += 1;
            status.textContent = '上傳第 ' + page + ' 頁…';
            const r = await ppApi('/api/paper/' + ppPaper.id + '/page/' + page, {
                method: 'PUT',
                headers: { 'Content-Type': 'image/jpeg' },
                body: blob,
            });
            ppPaper.pageCount = r.pageCount;
        }

        status.className = 'text-sm mt-2 text-emerald-700 font-bold';
        status.textContent = '✅ 已上傳 ' + ppPaper.pageCount + ' 頁';
        document.getElementById('ppStep2').classList.remove('hidden');
        ppCurPage = 1;
        ppRenderPageTabs();
        ppRenderStage();
    } catch (e) {
        status.className = 'text-sm mt-2 text-red-600 font-bold';
        status.textContent = '❌ ' + e.message;
    }
}

// ============ 老師：作答區編輯 ============
function ppRenderPageTabs() {
    let html = '';
    for (let p = 1; p <= (ppPaper.pageCount || 0); p++) {
        html += "<button class='pp-tool " + (p === ppCurPage ? 'on' : '') + "' onclick='ppGoPage(" + p + ")'>第 " + p + " 頁</button>";
    }
    document.getElementById('ppPageTabs').innerHTML = html;
}

function ppGoPage(p) {
    ppCurPage = p;
    ppSelId = null;
    ppRenderPageTabs();
    ppRenderStage();
}

function ppPageUrl(page) {
    return API_BASE + '/api/paper/' + ppPaper.id + '/page/' + page;
}

function ppRegionsOfPage(page) {
    return (ppPaper.regions || []).filter(function (r) { return Number(r.page) === Number(page); });
}

function ppRenderStage() {
    const wrap = document.getElementById('ppStageWrap');
    const regions = ppRegionsOfPage(ppCurPage);
    let boxes = '';
    regions.forEach(function (r) {
        const cls = 'pp-region pp-' + r.type + (r.id === ppSelId ? ' sel' : '');
        boxes += "<div class='" + cls + "' data-id='" + escapeHtml(r.id) + "' style='left:" + (r.x * 100) + "%;top:" + (r.y * 100) +
            "%;width:" + (r.w * 100) + "%;height:" + (r.h * 100) + "%'>" +
            "<span class='pp-no'>" + escapeHtml(r.no) + "</span><span class='pp-grip'></span></div>";
    });
    wrap.innerHTML = "<div class='pp-stage' id='ppStage'><img src='" + ppPageUrl(ppCurPage) + "' alt='卷子第 " + ppCurPage + " 頁'>" + boxes + "</div>";
    ppBindDrag();
    ppRenderRegionList();
}

// 拖拉／縮放：一律換算成相對比例存回 region，換裝置或換螢幕寬度都能還原
function ppBindDrag() {
    const stage = document.getElementById('ppStage');
    if (!stage) return;
    let mode = null, target = null, start = null;

    stage.addEventListener('pointerdown', function (e) {
        const box = e.target.closest('.pp-region');
        if (!box) return;
        const region = (ppPaper.regions || []).find(function (r) { return r.id === box.dataset.id; });
        if (!region) return;
        ppSelId = region.id;
        mode = e.target.classList.contains('pp-grip') ? 'resize' : 'move';
        target = region;
        const rect = stage.getBoundingClientRect();
        start = { px: e.clientX, py: e.clientY, x: region.x, y: region.y, w: region.w, h: region.h, rw: rect.width, rh: rect.height };
        box.setPointerCapture(e.pointerId);
        e.preventDefault();
        ppRenderRegionList();
        stage.querySelectorAll('.pp-region').forEach(function (b) { b.classList.toggle('sel', b.dataset.id === ppSelId); });
    });

    stage.addEventListener('pointermove', function (e) {
        if (!mode || !target) return;
        const dx = (e.clientX - start.px) / start.rw;
        const dy = (e.clientY - start.py) / start.rh;
        const clamp = function (v) { return Math.min(1, Math.max(0, v)); };
        if (mode === 'move') {
            target.x = clamp(start.x + dx);
            target.y = clamp(start.y + dy);
        } else {
            target.w = Math.max(0.02, Math.min(1 - target.x, start.w + dx));
            target.h = Math.max(0.02, Math.min(1 - target.y, start.h + dy));
        }
        const box = stage.querySelector(".pp-region[data-id='" + target.id + "']");
        if (box) {
            box.style.left = (target.x * 100) + '%';
            box.style.top = (target.y * 100) + '%';
            box.style.width = (target.w * 100) + '%';
            box.style.height = (target.h * 100) + '%';
        }
    });

    const end = function () {
        if (mode) { mode = null; target = null; ppSaveSoon(); }
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
}

function ppRenderRegionList() {
    const regions = ppRegionsOfPage(ppCurPage);
    if (!regions.length) {
        document.getElementById('ppRegionList').innerHTML = "<div class='text-gray-500'>這一頁還沒有作答區，先按「AI 自動抓」。</div>";
        return;
    }
    let html = '';
    regions.forEach(function (r) {
        const key = (ppPaper.answerKey || {})[r.id] || '';
        html += "<div class='border rounded-lg p-2 mb-2 " + (r.id === ppSelId ? 'border-red-400 bg-red-50' : 'border-gray-200') + "'>" +
            "<div class='flex gap-1 items-center mb-1'>" +
            "<input class='pp-in w-14' value='" + escapeHtml(r.no) + "' onchange=\"ppSetField('" + r.id + "','no',this.value)\" title='題號'>" +
            "<select class='pp-in flex-1' onchange=\"ppSetField('" + r.id + "','type',this.value)\">" +
            "<option value='choice'" + (r.type === 'choice' ? ' selected' : '') + ">選擇題</option>" +
            "<option value='fill'" + (r.type === 'fill' ? ' selected' : '') + ">填空／短答</option>" +
            "<option value='hand'" + (r.type === 'hand' ? ' selected' : '') + ">手寫（計算/作圖）</option>" +
            "</select>" +
            "<input class='pp-in w-14' type='number' min='0' value='" + Number(r.score || 0) + "' onchange=\"ppSetField('" + r.id + "','score',this.value)\" title='配分'>" +
            "</div>" +
            (r.type === 'hand'
                ? "<div class='text-xs text-indigo-600'>手寫題由老師批改（可按 AI 協助）</div>"
                : "<input class='pp-in w-full' placeholder='正確答案（留空＝不自動判分）' value='" + escapeHtml(key) + "' onchange=\"ppSetAnswer('" + r.id + "',this.value)\">") +
            "</div>";
    });
    document.getElementById('ppRegionList').innerHTML = html;
}

function ppSetField(id, field, value) {
    const r = (ppPaper.regions || []).find(function (x) { return x.id === id; });
    if (!r) return;
    r[field] = field === 'score' ? Number(value) || 0 : value;
    ppSaveSoon();
    ppRenderStage();
}

function ppSetAnswer(id, value) {
    ppPaper.answerKey = ppPaper.answerKey || {};
    ppPaper.answerKey[id] = value;
    ppSaveSoon();
}

function ppAddRegion() {
    ppPaper.regions = ppPaper.regions || [];
    const n = ppRegionsOfPage(ppCurPage).length + 1;
    const r = {
        id: 'm' + ppCurPage + '_' + Math.random().toString(36).slice(2, 8),
        page: ppCurPage, no: String(n), type: 'fill',
        x: 0.1, y: 0.1, w: 0.3, h: 0.06, label: '第' + n + '題', options: [], score: 5,
    };
    ppPaper.regions.push(r);
    ppSelId = r.id;
    ppSaveSoon();
    ppRenderStage();
}

function ppDeleteSelected() {
    if (!ppSelId) { alert('請先點一下要刪除的框'); return; }
    ppPaper.regions = (ppPaper.regions || []).filter(function (r) { return r.id !== ppSelId; });
    ppSelId = null;
    ppSaveSoon();
    ppRenderStage();
}

// 每次調整都存回後端，但用 debounce 避免拖一次框打十幾次 API
let ppSaveTimer = null;
function ppSaveSoon() {
    const hint = document.getElementById('ppSaveHint');
    if (hint) hint.textContent = '儲存中…';
    clearTimeout(ppSaveTimer);
    ppSaveTimer = setTimeout(async function () {
        try {
            await ppApi('/api/paper/' + ppPaper.id, {
                method: 'PATCH',
                body: JSON.stringify({
                    title: document.getElementById('ppTitle').value.trim() || ppPaper.title,
                    regions: ppPaper.regions || [],
                    answerKey: ppPaper.answerKey || {},
                }),
            });
            if (hint) hint.textContent = '已儲存';
        } catch (e) {
            if (hint) hint.textContent = '儲存失敗：' + e.message;
        }
    }, 600);
}

async function ppDetect() {
    const status = document.getElementById('ppDetectStatus');
    status.className = 'text-sm mt-2 text-gray-600';
    status.textContent = '🤖 AI 正在讀這一頁…（大張的卷子要十幾秒）';
    try {
        const data = await ppApi('/api/paper/' + ppPaper.id + '/detect', {
            method: 'POST',
            body: JSON.stringify({ page: ppCurPage }),
        });
        // 只換這一頁的框，其他頁老師調好的不要被蓋掉
        ppPaper.regions = (ppPaper.regions || []).filter(function (r) { return Number(r.page) !== Number(ppCurPage); });
        ppPaper.regions = ppPaper.regions.concat(data.regions || []);
        ppSaveSoon();
        ppRenderStage();
        status.className = 'text-sm mt-2 text-emerald-700 font-bold';
        status.textContent = '✅ 抓到 ' + (data.regions || []).length + ' 個作答區，請確認位置有沒有跑掉，再手動調整。';
    } catch (e) {
        status.className = 'text-sm mt-2 text-red-600 font-bold';
        status.textContent = '❌ ' + e.message + '（可以先用「自己加一個框」手動處理）';
    }
}

async function ppPublish() {
    const box = document.getElementById('ppPublishBox');
    try {
        await ppApi('/api/paper/' + ppPaper.id, {
            method: 'PATCH',
            body: JSON.stringify({
                title: document.getElementById('ppTitle').value.trim() || ppPaper.title,
                regions: ppPaper.regions || [],
                answerKey: ppPaper.answerKey || {},
                status: 'published',
            }),
        });
        const link = location.origin + location.pathname + '?paper=' + ppPaper.id;
        try { await navigator.clipboard.writeText(link); } catch (e) {}
        box.innerHTML = "<div class='text-emerald-700 font-bold'>✅ 連結已複製，貼到班級群組即可</div>" +
            "<input class='pp-in w-full mt-1' readonly value='" + escapeHtml(link) + "' onclick='this.select()'>";
    } catch (e) {
        box.innerHTML = "<div class='text-red-600 font-bold'>❌ " + escapeHtml(e.message) + "</div>";
    }
}

function ppOpenGrading() {
    if (!ppPaper || !ppPaper.id) { alert('請先上傳卷子'); return; }
    ppShow('paperGradeView');
    document.getElementById('ppGradeTitle').textContent = document.getElementById('ppTitle').value || ppPaper.title;
    ppLoadSubmissions();
}

