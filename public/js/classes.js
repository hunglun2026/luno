// 刻度｜老師的多個班級（2026-11-11）：我的帳號裡的班級管理、切換目前班、改代碼、新增／改名／刪除。
// 資料來源是登入與 /api/auth/me 回的 window.currentUser.classes（[{ id, name, code, studentCount }]），
// users.class_id 對老師來說就是「目前班」（classId／className／classCode）。
// 後端在 worker/src/classes.js；存班級歷史時選班級在 account.js 的 saveToClassHistory。
// 載入順序：放在 account.js 後面（account.js 在執行時才呼叫這裡的函式，宣告順序沒有影響）。

function lqClasses() {
    const u = window.currentUser;
    return (u && u.role === 'teacher' && Array.isArray(u.classes)) ? u.classes : [];
}

// 呼叫班級相關 API，錯誤訊息直接丟出去給呼叫端用 lqAlert 顯示
async function lqClassApi(path, method, body) {
    const opts = { method: method || 'GET', headers: { 'X-Session-Token': lqGetToken() || '' } };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data;
}

// 把清單與目前班寫回 window.currentUser，並更新頂端列與帳號視窗
function lqApplyClasses(classes, currentId) {
    const u = window.currentUser;
    if (!u) return;
    u.classes = classes;
    const cur = classes.find(function (c) { return c.id === currentId; }) || classes[0] || null;
    u.classId = cur ? cur.id : null;
    u.className = cur ? cur.name : null;
    u.classCode = cur ? cur.code : null;
    updateAccountUI();
    renderAccountLoggedInBody();
}

// 重新抓一次清單（改代碼、改名之後用）
async function lqReloadClasses(currentId) {
    const data = await lqClassApi('/api/classes');
    lqApplyClasses(data.classes, currentId || window.currentUser.classId);
}

function classManagerHtml() {
    const u = window.currentUser;
    const classes = lqClasses();
    let html = "<div class='text-xs text-gray-500'>學生註冊或加入班級時，輸入該班的班級代碼。存試卷、看歷史都是一班一班分開。</div>";
    classes.forEach(function (c) {
        const isCur = c.id === u.classId;
        html += "<div class='lq-card p-3 text-center'" + (isCur ? " style='border-color:var(--hl-blue);'" : "") + ">" +
            "<div class='text-sm font-bold'>" + escapeHtml(c.name) + (isCur ? "　<span class='text-xs' style='color:var(--hl-blue);'>目前使用中</span>" : "") + "</div>" +
            "<div class='font-black' style='font-size:2rem; letter-spacing:0.18em; color:var(--hl-blue);'>" + escapeHtml(c.code || '') + "</div>" +
            "<div class='text-xs text-gray-500 mt-1'>" + c.studentCount + " 位學生已加入</div>" +
            "<div class='flex gap-2 justify-center flex-wrap mt-2'>" +
            "<button type='button' onclick=\"copyClassCode(" + jsArg(c.code) + ", this)\" class='lq-btn lq-btn-secondary text-sm px-4 py-2' style='min-height:44px;'>複製代碼</button>" +
            (isCur ? "" : "<button type='button' onclick='selectClass(" + c.id + ")' class='lq-btn lq-btn-primary text-sm px-4 py-2' style='min-height:44px;'>設為目前班</button>") +
            "</div>" +
            // 次要動作收起來（2026-11-13）：手機上六顆小按鈕折成三排很容易按錯
            "<details class='lq-class-more'><summary>更多設定</summary><div class='flex gap-2 justify-center flex-wrap mt-2'>" +
            "<button type='button' onclick='editClassCode(" + c.id + ")' class='lq-btn lq-btn-secondary text-xs px-3 py-2'>自己設定代碼</button>" +
            "<button type='button' onclick='randomClassCode(" + c.id + ")' class='lq-btn lq-btn-secondary text-xs px-3 py-2'>換一組好唸的</button>" +
            "<button type='button' onclick='renameClass(" + c.id + ")' class='lq-btn lq-btn-secondary text-xs px-3 py-2'>改名</button>" +
            (classes.length > 1 ? "<button type='button' onclick='deleteClass(" + c.id + ")' class='lq-btn lq-btn-danger text-xs px-3 py-2'>刪除</button>" : "") +
            "</div></details>" +
            "</div>";
    });
    html += "<button type='button' onclick='addClass()' class='lq-btn lq-btn-secondary w-full py-2'>＋ 新增班級</button>";
    html += "<button onclick=\"closeAccountModal(); openClassHistory();\" class='lq-btn lq-btn-secondary w-full py-2'>📚 查看班級歷史</button>";
    return html;
}

async function addClass() {
    const name = await askText('新班級的名稱（例如：六年2班）。\n建好之後會自動發一組班級代碼，也可以之後自己改。');
    if (name === null || !String(name).trim()) return;
    try {
        const data = await lqClassApi('/api/classes', 'POST', { name: String(name).trim() });
        lqApplyClasses(data.classes, data.classId);
    } catch (e) { lqAlert('新增班級失敗：' + e.message); }
}

async function renameClass(id) {
    const cur = lqClasses().find(function (c) { return c.id === id; });
    const name = await askText('班級新名稱', { value: cur ? cur.name : '' });
    if (name === null || !String(name).trim()) return;
    try {
        await lqClassApi('/api/classes/' + id, 'PATCH', { name: String(name).trim() });
        await lqReloadClasses();
    } catch (e) { lqAlert('改名失敗：' + e.message); }
}

async function selectClass(id) {
    try {
        await lqClassApi('/api/classes/' + id + '/select', 'POST', {});
        await lqReloadClasses(id);
    } catch (e) { lqAlert('切換失敗：' + e.message); }
}

async function deleteClass(id) {
    const cur = lqClasses().find(function (c) { return c.id === id; });
    if (!cur) return;
    const msg = '刪除「' + cur.name + '」？\n這個班的出題歷史會一起刪掉，已加入的 ' + cur.studentCount + ' 位學生會變成沒有班級（帳號還在）。\n刪掉就救不回來。';
    if (!(await askConfirm(msg, { danger: true }))) return;
    try {
        const data = await lqClassApi('/api/classes/' + id, 'DELETE');
        lqApplyClasses(data.classes, data.currentClassId);
    } catch (e) { lqAlert('刪除失敗：' + e.message); }
}

// 老師自己設定班級代碼：已加入的學生不受影響，只有「之後」註冊或加入的人要輸入新代碼；舊代碼立刻失效
async function saveClassCode(payload) {
    try {
        await lqClassApi('/api/class/code', 'POST', payload);
        await lqReloadClasses();
    } catch (e) { lqAlert('修改失敗：' + e.message); }
}
async function editClassCode(id) {
    const cur = lqClasses().find(function (c) { return c.id === id; });
    const v = await askText('設定「' + (cur ? cur.name : '') + '」的班級代碼（4～10 碼，英文、數字都可以，混搭也行，不分大小寫，例如 LIN602）。\n改了之後，舊代碼就不能再用；已經加入的學生不受影響。', { value: (cur && cur.code) || '' });
    if (v === null || v === undefined || !String(v).trim()) return;
    saveClassCode({ classId: id, code: String(v).trim() });
}
async function randomClassCode(id) {
    const ok = await askConfirm('換一組新的班級代碼？舊代碼會立刻失效，已經加入的學生不受影響。', { okText: '換一組', cancelText: '取消' });
    if (ok) saveClassCode({ classId: id, random: true });
}

// 老師的班級代碼常駐在頂列（2026-11-13 取代登入時跳一次的阻斷式視窗）：點一下複製，目前班的代碼
function updateClassCodeChip() {
    const chip = document.getElementById('classCodeChip');
    if (!chip) return;
    const u = window.currentUser;
    const show = !!(u && u.role === 'teacher' && u.classCode);
    chip.classList.toggle('hidden', !show);
    if (!show) return;
    chip.dataset.code = u.classCode;
    chip.textContent = (lqClasses().length > 1 && u.className ? u.className + '・' : '') + '代碼 ' + u.classCode + ' 📋';
    chip.title = '點一下複製班級代碼，報給學生註冊或加入班級用';
}
function copyClassCodeChip(btn) {
    const code = btn.dataset.code;
    if (!code || !(navigator.clipboard && navigator.clipboard.writeText)) return;
    const old = btn.textContent;
    navigator.clipboard.writeText(code).then(function () {
        btn.textContent = '已複製 ✓';
        setTimeout(function () { updateClassCodeChip(); }, 1500);
    }, function () {});
}

// 複製班級代碼：瀏覽器不給剪貼簿權限時不假裝成功
function copyClassCode(code, btn) {
    if (!(navigator.clipboard && navigator.clipboard.writeText)) return;
    navigator.clipboard.writeText(code).then(function () {
        btn.textContent = '已複製';
        setTimeout(function () { btn.textContent = '複製代碼'; }, 1500);
    }, function () {});
}
