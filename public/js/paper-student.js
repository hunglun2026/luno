// Luno 綸諾｜原卷直上：學生在原卷上作答、老師批改台。2026-10-21 從 index.html 原樣拆出，檔案順序見 index.html 底部
// ============ 學生：在原卷上作答 ============
function ppStuInit() {
    ppShow('paperStudentView');
    document.getElementById('ppStuHeader').innerHTML =
        "<div class='font-bold text-lg'>" + escapeHtml(ppPaper.title) + "</div>" +
        "<div class='text-sm text-gray-600'>共 " + ppPaper.pageCount + " 頁、" + (ppPaper.regions || []).length + " 題</div>";
    const me = (function () { try { return JSON.parse(localStorage.getItem('lun_user') || 'null'); } catch (e) { return null; } })();
    if (me && me.displayName) {
        document.getElementById('ppStuName').value = me.displayName;
        if (me.className) document.getElementById('ppStuClass').value = me.className;
    }
    document.getElementById('ppStuInfo').classList.remove('hidden');
}

function ppStuStart() {
    if (!document.getElementById('ppStuName').value.trim()) { alert('請填姓名，老師才知道這份是誰寫的'); return; }
    document.getElementById('ppStuInfo').classList.add('hidden');
    document.getElementById('ppStuBody').classList.remove('hidden');
    ppStuRenderStages();
}

async function ppStuRenderStages() {
    let html = '';
    for (let p = 1; p <= ppPaper.pageCount; p++) {
        let overlay = '';
        ppRegionsOfPage(p).forEach(function (r) {
            const style = "left:" + (r.x * 100) + "%;top:" + (r.y * 100) + "%;width:" + (r.w * 100) + "%;height:" + (r.h * 100) + "%";
            if (r.type === 'choice') {
                const opts = (r.options && r.options.length) ? r.options : ['A', 'B', 'C', 'D'];
                let btns = '';
                opts.forEach(function (o) {
                    btns += "<span class='pp-opt' data-region='" + escapeHtml(r.id) + "' data-val='" + escapeHtml(o) +
                        "' onclick=\"ppStuPick('" + r.id + "','" + o + "')\">" + escapeHtml(o) + "</span>";
                });
                overlay += "<div class='pp-ans' style='" + style + "'>" + btns + "</div>";
            } else if (r.type === 'fill') {
                overlay += "<div class='pp-ans' style='" + style + "'><input class='pp-fillbox' data-region='" + escapeHtml(r.id) +
                    "' placeholder='第" + escapeHtml(r.no) + "題' oninput=\"ppStuType('" + r.id + "',this.value)\"></div>";
            } else {
                overlay += "<div class='pp-ans pp-region pp-hand' style='" + style + "'>" +
                    "<canvas class='pp-handcanvas' data-region='" + escapeHtml(r.id) + "'></canvas></div>";
            }
        });
        html += "<div class='pp-stage'><img src='" + ppPageUrl(p) + "' alt='卷子第 " + p + " 頁'>" + overlay + "</div>";
    }
    const hasHand = (ppPaper.regions || []).some(function (r) { return r.type === 'hand'; });
    document.getElementById('ppStuStages').innerHTML =
        (hasHand ? "<div class='pp-card sticky top-[64px] z-10 flex flex-wrap gap-2 items-center'>" +
            "<span class='text-sm font-bold'>手寫工具</span>" +
            "<button class='pp-tool on' id='ppToolPen' onclick=\"ppSetTool('pen')\">✏️ 筆</button>" +
            "<button class='pp-tool' id='ppToolMark' onclick=\"ppSetTool('mark')\">🖍️ 螢光筆</button>" +
            "<button class='pp-tool' id='ppToolEraser' onclick=\"ppSetTool('eraser')\">🧽 橡皮擦</button>" +
            "<button class='pp-tool' onclick='ppUndo()'>↩️ 復原</button></div>" : '') + html;
    // 一定要等卷面影像載完再算手寫畫布尺寸：圖片還沒載入時 <img> 高度是 0，
    // 疊在上面的作答區跟著變成高度 0，畫布會建成 0 px，送出時合成手寫圖就整個炸掉
    await ppWaitImages(document.getElementById('ppStuStages'));
    ppInitHandCanvases();
}

function ppWaitImages(container) {
    const imgs = Array.from(container.querySelectorAll('img'));
    return Promise.all(imgs.map(function (im) {
        if (im.complete && im.naturalHeight) return Promise.resolve();
        return new Promise(function (resolve) { im.onload = resolve; im.onerror = resolve; });
    }));
}

function ppStuPick(regionId, val) {
    ppStuAnswers[regionId] = { v: val };
    document.querySelectorAll(".pp-opt[data-region='" + regionId + "']").forEach(function (el) {
        el.classList.toggle('on', el.dataset.val === val);
    });
}

function ppStuType(regionId, val) {
    ppStuAnswers[regionId] = { v: val };
}

function ppSetTool(t) {
    ppTool = t;
    ['pen', 'mark', 'eraser'].forEach(function (k) {
        const el = document.getElementById('ppTool' + (k === 'pen' ? 'Pen' : k === 'mark' ? 'Mark' : 'Eraser'));
        if (el) el.classList.toggle('on', k === t);
    });
}

// 手寫畫布：每個手寫作答區一張透明畫布，疊在原卷影像上。
// 畫布尺寸用該區在畫面上的實際像素，送出時再合成「原卷該區 + 學生筆跡」給 AI 看得懂上下文。
let ppStrokes = {}; // { regionId: [ [ {x,y}… ], … ] } 相對座標，重畫與復原都靠它
function ppInitHandCanvases() {
    document.querySelectorAll('.pp-handcanvas').forEach(function (canvas) {
        const id = canvas.dataset.region;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        canvas.width = Math.round(rect.width * 2);   // 2 倍解析度，手寫才不會糊
        canvas.height = Math.round(rect.height * 2);
        ppHandCanvases[id] = canvas;
        ppStrokes[id] = ppStrokes[id] || [];
        ppRedraw(id);

        // 筆跡存的是相對座標，所以轉螢幕方向／改視窗大小只要重新配置尺寸再重畫就好
        if (canvas.dataset.bound === '1') return;
        canvas.dataset.bound = '1';

        let drawing = false, cur = null;
        const pos = function (e) {
            const r = canvas.getBoundingClientRect();
            return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        };
        canvas.addEventListener('pointerdown', function (e) {
            drawing = true;
            cur = { tool: ppTool, pts: [pos(e)] };
            ppStrokes[id].push(cur);
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        canvas.addEventListener('pointermove', function (e) {
            if (!drawing) return;
            cur.pts.push(pos(e));
            ppRedraw(id);
            e.preventDefault();
        });
        const stop = function () { drawing = false; cur = null; };
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
    });
}

function ppRedraw(id) {
    const canvas = ppHandCanvases[id];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    (ppStrokes[id] || []).forEach(function (s) {
        if (s.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.lineWidth = 24;
        } else if (s.tool === 'mark') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(250,204,21,.45)';
            ctx.lineWidth = 20;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#1d4ed8';
            ctx.lineWidth = 4;
        }
        ctx.beginPath();
        s.pts.forEach(function (p, i) {
            const x = p.x * canvas.width, y = p.y * canvas.height;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
}

// 轉螢幕方向或改視窗大小後，畫布的 CSS 尺寸變了但內部像素沒變，筆跡會歪掉，重新配置一次
let ppResizeTimer = null;
window.addEventListener('resize', function () {
    if (!document.getElementById('ppStuBody') || document.getElementById('ppStuBody').classList.contains('hidden')) return;
    clearTimeout(ppResizeTimer);
    ppResizeTimer = setTimeout(ppInitHandCanvases, 200);
});

function ppUndo() {
    // 復原最後一筆（不分是哪一題，就是「上一步」）
    let latestId = null, latestLen = 0;
    Object.keys(ppStrokes).forEach(function (id) {
        if (ppStrokes[id].length > latestLen) { latestLen = ppStrokes[id].length; latestId = id; }
    });
    if (!latestId) return;
    ppStrokes[latestId].pop();
    ppRedraw(latestId);
}

// 把「原卷該區的畫面」跟「學生筆跡」合成一張圖再送出，AI 批改時才看得到題目在問什麼
async function ppComposeHand(region) {
    const canvas = ppHandCanvases[region.id];
    if (!canvas) return null;
    if (!(ppStrokes[region.id] || []).length) return null;
    const src = await ppLoadImage(ppPageUrl(region.page) + '?cb=1');
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, region.x * src.naturalWidth, region.y * src.naturalHeight,
        region.w * src.naturalWidth, region.h * src.naturalHeight, 0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    return out.toDataURL('image/png');
}

async function ppStuSubmit() {
    const btnText = '✅ 送出答案';
    const body = document.getElementById('ppStuBody');
    // 一定要指名送出鈕：#ppStuBody 裡排在最前面的是手寫工具列那幾顆，
    // 用 querySelector('button') 會抓到「筆」，變成把筆停用、送出鈕原封不動
    const btn = document.getElementById('ppStuSubmitBtn');
    btn.disabled = true;
    btn.textContent = '送出中…';
    try {
        const answers = {};
        Object.keys(ppStuAnswers).forEach(function (k) { answers[k] = ppStuAnswers[k]; });
        for (const r of (ppPaper.regions || [])) {
            if (r.type !== 'hand') continue;
            const img = await ppComposeHand(r);
            if (img) answers[r.id] = { img: img };
        }
        const data = await ppApi('/api/paper/' + ppPaper.id + '/submit', {
            method: 'POST',
            body: JSON.stringify({
                studentId: getClientId(),
                grade: document.getElementById('ppStuGrade').value.trim(),
                className: document.getElementById('ppStuClass').value.trim(),
                seat: document.getElementById('ppStuSeat').value.trim(),
                name: document.getElementById('ppStuName').value.trim(),
                answers: answers,
            }),
        });
        body.classList.add('hidden');
        const result = document.getElementById('ppStuResult');
        result.classList.remove('hidden');
        result.innerHTML = "<div class='text-2xl font-bold text-emerald-700 mb-2'>已送出！</div>" +
            "<div class='text-lg'>自動判分：" + data.score + " / " + data.maxScore + " 分</div>" +
            (data.pending
                ? "<div class='text-sm text-amber-700 mt-2'>手寫的題目要等老師批改，這還不是最後分數。</div>"
                : "<div class='text-sm text-gray-600 mt-2'>老師確認後就是最後分數。</div>");
        window.scrollTo(0, 0);
    } catch (e) {
        alert('送出失敗：' + e.message);
        btn.disabled = false;
        btn.textContent = btnText;
    }
}

// ============ 老師：批改台 ============
async function ppLoadSubmissions() {
    const list = document.getElementById('ppSubList');
    list.innerHTML = '載入中…';
    try {
        const data = await ppApi('/api/paper/' + ppPaper.id + '/submissions');
        const subs = data.submissions || [];
        if (!subs.length) { list.innerHTML = "<div class='text-gray-500'>還沒有學生送出。</div>"; return; }
        let html = '';
        subs.forEach(function (s) {
            html += "<button class='w-full text-left border rounded-lg p-2 mb-1 hover:bg-emerald-50 " +
                (s.status === 'graded' ? 'border-emerald-300' : 'border-gray-200') + "' onclick=\"ppOpenSub('" + s.student_id + "')\">" +
                "<div class='font-bold'>" + escapeHtml(s.seat ? s.seat + '號 ' : '') + escapeHtml(s.name || '(未填姓名)') + "</div>" +
                "<div class='text-xs text-gray-500'>" + (s.score == null ? '—' : s.score) + " / " + s.max_score +
                (s.status === 'graded' ? ' ・已批改' : ' ・待批改') + "</div></button>";
        });
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = "<div class='text-red-600'>" + escapeHtml(e.message) + "</div>";
    }
}

async function ppOpenSub(studentId) {
    const box = document.getElementById('ppGradeBody');
    box.innerHTML = '載入中…';
    try {
        ppGradeSub = await ppApi('/api/paper/' + ppPaper.id + '/submission/' + encodeURIComponent(studentId));
        ppRenderGrade();
    } catch (e) {
        box.innerHTML = "<div class='text-red-600'>" + escapeHtml(e.message) + "</div>";
    }
}

function ppRenderGrade() {
    const s = ppGradeSub;
    const key = ppPaper.answerKey || {};
    let html = "<div class='flex flex-wrap items-center gap-2 mb-3'>" +
        "<div class='font-bold text-lg'>" + escapeHtml(s.seat ? s.seat + '號 ' : '') + escapeHtml(s.name || '(未填姓名)') + "</div>" +
        "<div class='text-sm text-gray-500'>目前 " + (s.score == null ? '—' : s.score) + " / " + s.maxScore + " 分</div>" +
        "<button class='pp-btn pp-btn-ghost ml-auto' onclick='ppAiGrade()'>🤖 AI 協助批改手寫題</button>" +
        "<button class='pp-btn pp-btn-main' onclick='ppSaveGrade()'>💾 儲存批改</button></div>" +
        "<div id='ppAiStatus' class='text-sm mb-2'></div>";

    (ppPaper.regions || []).forEach(function (r) {
        const a = s.answers[r.id];
        const auto = s.auto[r.id];
        const ai = s.ai[r.id];
        const t = s.teacher[r.id] || {};
        html += "<div class='border rounded-lg p-3 mb-2'>" +
            "<div class='font-bold mb-1'>第 " + escapeHtml(r.no) + " 題（滿分 " + (r.score || 0) + "）</div>";

        if (r.type === 'hand') {
            html += a && a.img
                ? "<img class='max-w-full border rounded mb-2' src='" + API_BASE + '/api/paper/' + ppPaper.id + '/hand/' +
                  encodeURIComponent(s.studentId) + '/' + encodeURIComponent(r.id) + "' alt='學生手寫'>"
                : "<div class='text-gray-400 mb-2'>沒有作答</div>";
            if (ai) {
                html += "<div class='text-sm bg-indigo-50 border border-indigo-200 rounded p-2 mb-2'>" +
                    "🤖 AI 建議 <b>" + ai.score + " 分</b>：" + escapeHtml(ai.comment) +
                    " <button class='pp-tool' onclick=\"ppUseAi('" + r.id + "')\">採用</button></div>";
            }
        } else {
            const got = a ? (a.v || '') : '';
            html += "<div class='text-sm mb-2'>學生答：<b>" + escapeHtml(got || '（空白）') + "</b>" +
                (key[r.id] ? "　正解：<b>" + escapeHtml(key[r.id]) + "</b>" : '') +
                (auto ? (auto.ok === 1 ? " <span class='text-emerald-600 font-bold'>✅ 自動判對</span>" : " <span class='text-red-600 font-bold'>❌ 自動判錯</span>") : '') +
                "</div>";
        }

        html += "<div class='flex flex-wrap gap-2 items-center'>" +
            "<label class='text-sm'>給分</label>" +
            "<input class='pp-in w-20' type='number' min='0' max='" + (r.score || 0) + "' id='ppScore_" + r.id + "' value='" +
            (t.score !== undefined ? t.score : (auto ? (auto.ok === 1 ? (r.score || 0) : 0) : '')) + "'>" +
            "<input class='pp-in flex-1 min-w-[160px]' id='ppComment_" + r.id + "' placeholder='給學生的話（選填）' value='" +
            escapeHtml(t.comment || (ai ? ai.comment : '')) + "'>" +
            "</div></div>";
    });

    document.getElementById('ppGradeBody').innerHTML = html;
}

function ppUseAi(regionId) {
    const ai = ppGradeSub.ai[regionId];
    if (!ai) return;
    document.getElementById('ppScore_' + regionId).value = ai.score;
    document.getElementById('ppComment_' + regionId).value = ai.comment;
}

async function ppAiGrade() {
    const status = document.getElementById('ppAiStatus');
    status.className = 'text-sm mb-2 text-gray-600';
    status.textContent = '🤖 AI 正在讀這位學生的手寫作答…';
    try {
        const data = await ppApi('/api/paper/' + ppPaper.id + '/submission/' + encodeURIComponent(ppGradeSub.studentId) + '/ai-grade', { method: 'POST' });
        ppGradeSub.ai = data.ai || {};
        ppRenderGrade();
        document.getElementById('ppAiStatus').className = 'text-sm mb-2 text-emerald-700 font-bold';
        document.getElementById('ppAiStatus').textContent = '✅ AI 給了建議分數，確認沒問題再按「採用」，最後要按儲存才算數。';
    } catch (e) {
        status.className = 'text-sm mb-2 text-red-600 font-bold';
        status.textContent = '❌ ' + e.message;
    }
}

async function ppSaveGrade() {
    const teacher = {};
    (ppPaper.regions || []).forEach(function (r) {
        const sEl = document.getElementById('ppScore_' + r.id);
        const cEl = document.getElementById('ppComment_' + r.id);
        if (!sEl) return;
        if (sEl.value !== '' || (cEl && cEl.value)) {
            teacher[r.id] = { score: sEl.value === '' ? 0 : Number(sEl.value), comment: cEl ? cEl.value : '' };
        }
    });
    try {
        const data = await ppApi('/api/paper/' + ppPaper.id + '/submission/' + encodeURIComponent(ppGradeSub.studentId), {
            method: 'PATCH',
            body: JSON.stringify({ teacher: teacher, status: 'graded' }),
        });
        ppGradeSub.teacher = teacher;
        ppGradeSub.score = data.score;
        ppGradeSub.status = 'graded';
        ppRenderGrade();
        ppLoadSubmissions();
    } catch (e) {
        alert('儲存失敗：' + e.message);
    }
}
