// 鴻綸 刻度｜「自己指定每種題型題數」（2026-11-16）
// 題型選單選「自選題數」才出現加減面板，總題數＝各題型加總，原本的「題數」欄這時隱藏。
// 出題時每種題型各自當一小段，沿用 generate.js 既有的 planBatches／buildBatchParts（提示詞、格式、檢查都不重寫），
// 所以配合題、排序題也能混進來；固定順序接起來：單選→複選→是非→克漏字→填充→簡答→配合→排序。
// generate.js 只在 readGenForm／startGen 問這個檔：cmIsOn()、cmTotal()、cmSegments()。

var CM_VALUE = '自選題數';
// typeVal 必須是題型選單裡既有的值（generate.js 用 includes('是非')、qtWantKind 等字串判斷）
var CM_KINDS = [
    { key: 'single', label: '單選題', typeVal: '全部單選題', def: 5 },
    { key: 'multi', label: '複選題', typeVal: '全部複選題', def: 0 },
    { key: 'tf', label: '是非題', typeVal: '全部是非題', def: 0 },
    { key: 'cloze', label: '克漏字', typeVal: '全部選擇式填空(單選,題幹留括號)', def: 0 },
    { key: 'fill', label: '填充題', typeVal: '全部填充題', def: 0 },
    { key: 'short', label: '簡答題', typeVal: '全部簡答題(計算題)', def: 0 },
    { key: 'match', label: '配合題', typeVal: '全部配合題', def: 0 },
    { key: 'order', label: '排序題', typeVal: '全部排序題', def: 0 },
    // 閱讀題組（2026-11-17）：數字是「組數」，每組一篇文章配 cmCounts.perGroup 題單選題，一組一次 API 呼叫（passage.js）
    { key: 'passage', label: '閱讀題組', typeVal: '閱讀題組', def: 0, unit: '組', max: 8 }
];
var CM_PER_GROUP_MIN = 2, CM_PER_GROUP_MAX = 6, CM_PER_GROUP_DEF = 3;
var CM_STORE = 'lun_cm_counts';
var CM_MAX_PER_KIND = 50;
// 後端一次出題第 0 批過冷卻後只給 15 次後續批次（含重試，worker/src/index.js GENERATE_RUN_ALLOWANCE），
// 超過就被 429 擋掉、後半份出不來。保守抓 12 批，留 3 次給自動重試
var CM_MAX_BATCHES = 12;

var cmCounts = (function () {
    var c = {};
    CM_KINDS.forEach(function (k) { c[k.key] = k.def; });
    c.perGroup = CM_PER_GROUP_DEF;
    try {
        var saved = JSON.parse(localStorage.getItem(CM_STORE) || 'null');
        if (saved) {
            CM_KINDS.forEach(function (k) {
                var n = parseInt(saved[k.key], 10);
                if (n >= 0 && n <= (k.max || CM_MAX_PER_KIND)) c[k.key] = n;
            });
            var pg = parseInt(saved.perGroup, 10);
            if (pg >= CM_PER_GROUP_MIN && pg <= CM_PER_GROUP_MAX) c.perGroup = pg;
        }
    } catch (e) { /* 讀不到就用預設 */ }
    return c;
})();

function cmIsOn() {
    var sel = document.getElementById('qType');
    return !!sel && sel.value === CM_VALUE;
}

// 這個題型實際會出幾題：閱讀題組的數字是組數，要乘上每組題數
function cmQuestions(k) {
    var n = cmCounts[k.key] || 0;
    return k.key === 'passage' ? n * cmCounts.perGroup : n;
}

function cmTotal() {
    return CM_KINDS.reduce(function (s, k) { return s + cmQuestions(k); }, 0);
}

// 單選、複選、是非、克漏字、填充、簡答這 6 種格式相同（'o' 給選項或空陣列），併成「一次」API 呼叫。
// 為什麼：實測每次呼叫都有 30 秒以上的固定等待（連「1+1=?」都要 32 秒；複雜提示詞約 140 秒），
// 每種題型各打一次，4 種題型混出就花了快 10 分鐘。呼叫次數才是成本，不是題數。
// 提示詞寫法沿用既有「綜合題型」（前 N 題單選,中間 M 題是非…）；配合、排序、閱讀題組格式不同，仍各自一段
var CM_PLAIN = ['single', 'multi', 'tf', 'cloze', 'fill', 'short'];
var CM_PLAIN_WORD = { single: '單選', multi: '複選', tf: '是非', cloze: '選擇式填空', fill: '填充', short: '簡答(計算題)' };

function cmPlainSegment() {
    var ks = CM_KINDS.filter(function (k) { return CM_PLAIN.indexOf(k.key) >= 0 && cmCounts[k.key] > 0; });
    if (ks.length === 0) return null;
    if (ks.length === 1) return { typeVal: ks[0].typeVal, n: cmCounts[ks[0].key] };   // 只有一種：維持原本「全部某某題」的提示詞
    var total = 0, parts = [];
    ks.forEach(function (k, i) {
        var n = cmCounts[k.key];
        total += n;
        parts.push((i === 0 ? '前' : (i === ks.length - 1 ? '最後' : '接著')) + n + '題' + CM_PLAIN_WORD[k.key]);
    });
    // 字串要含 generate.js 認得的關鍵字：是非、選擇式填空、題填充（觸發各自的格式規則），簡答／填充（一批 8 題）
    return { typeVal: parts.join(','), n: total };
}

// 回傳 [{typeVal, n, perBatch?}]：先是併成一次的基本題型，再依序配合、排序、閱讀題組。perBatch：閱讀題組一批就是一組
function cmSegments() {
    var segs = [];
    var plain = cmPlainSegment();
    if (plain) segs.push(plain);
    CM_KINDS.filter(function (k) { return CM_PLAIN.indexOf(k.key) < 0 && cmCounts[k.key] > 0; }).forEach(function (k) {
        var seg = { typeVal: k.typeVal, n: cmQuestions(k) };
        if (k.key === 'passage') seg.perBatch = cmCounts.perGroup;
        segs.push(seg);
    });
    return segs;
}

// 一段的出題計畫：沿用 planBatches；閱讀題組改成「一批一組」，並標 passage 讓 startGen 整理文章
function cmPlanFor(seg) {
    var plan = planBatches(seg.typeVal, seg.n);
    if (seg.perBatch) {
        plan.batchSize = seg.perBatch;
        plan.batches = Math.ceil(seg.n / seg.perBatch);
        plan.passage = true;
    }
    return plan;
}

// 這份設定要打幾批 API：每段各自切批（填充、簡答一批 8 題，其餘 10 題，閱讀題組一組一批）
function cmBatchCount() {
    return cmSegments().reduce(function (sum, s) { return sum + cmPlanFor(s).batches; }, 0);
}

// 一句話描述，給精靈第 4 步摘要與出題進度用，例：單選 5＋是非 3＋配合 2，共 10 題
function cmSummary() {
    var parts = CM_KINDS.filter(function (k) { return cmCounts[k.key] > 0; })
        .map(function (k) {
            if (k.key === 'passage') return '閱讀題組 ' + cmCounts.passage + ' 組（每組 ' + cmCounts.perGroup + ' 題）';
            return k.label.replace('題', '') + ' ' + cmCounts[k.key];
        });
    return (parts.length ? parts.join('＋') : '還沒選題數') + '，共 ' + cmTotal() + ' 題';
}

function cmSave() {
    try { localStorage.setItem(CM_STORE, JSON.stringify(cmCounts)); } catch (e) { /* 無痕視窗存不了也不影響出題 */ }
}

// 每種題型的上限（閱讀題組一組一次呼叫，上限較小）；perGroup 另有範圍
function cmLimits(key) {
    if (key === 'perGroup') return [CM_PER_GROUP_MIN, CM_PER_GROUP_MAX];
    var k = CM_KINDS.filter(function (x) { return x.key === key; })[0];
    return [0, (k && k.max) || CM_MAX_PER_KIND];
}

function cmStep(key, delta) {
    var lim = cmLimits(key);
    var next = (cmCounts[key] || 0) + delta;
    if (next < lim[0] || next > lim[1]) return;
    cmCounts[key] = next;
    cmSave();
    cmRender();
    cmNotify();
}

function cmSet(key, raw) {
    var lim = cmLimits(key);
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < lim[0]) n = lim[0];
    if (n > lim[1]) n = lim[1];
    cmCounts[key] = n;
    cmSave();
    cmRender();
    cmNotify();
}

// 讓精靈（guide.js）重新整理摘要與按鈕狀態：它聽 qType 的 change／input
function cmNotify() {
    var sel = document.getElementById('qType');
    if (sel) sel.dispatchEvent(new Event('input', { bubbles: true }));
}

// 一列：標籤、減、數字、加。min 是這一列的下限（每組題數不能是 0），其餘題型 0 代表不出
function cmRowHtml(key, label, unit, n, max, min) {
    return '<div class="cm-row' + (n > 0 && key !== 'perGroup' ? ' is-on' : '') + '">' +
        '<span class="cm-label">' + label + '</span>' +
        '<button type="button" class="cm-btn" aria-label="' + label + '減一' + unit + '" onclick="cmStep(&quot;' + key + '&quot;, -1)"' + (n <= min ? ' disabled' : '') + '>−</button>' +
        '<input type="number" inputmode="numeric" min="' + min + '" max="' + max + '" class="cm-num" aria-label="' + label + unit + '數" value="' + n + '" onchange="cmSet(&quot;' + key + '&quot;, this.value)">' +
        '<button type="button" class="cm-btn" aria-label="' + label + '加一' + unit + '" onclick="cmStep(&quot;' + key + '&quot;, 1)"' + (n >= max ? ' disabled' : '') + '>＋</button>' +
        '</div>';
}

function cmRender() {
    var panel = document.getElementById('cmPanel');
    if (!panel) return;
    var on = cmIsOn();
    panel.hidden = !on;
    var countSel = document.getElementById('count');
    if (countSel && countSel.parentElement) countSel.parentElement.hidden = on;   // 自選時總題數由加總決定
    if (!on) return;
    var guestCap = window.guestMode ? 20 : 0;
    var total = cmTotal();
    var batches = total > 0 ? cmBatchCount() : 0;
    var tooBig = batches > CM_MAX_BATCHES;
    var html = '<div class="cm-title">每種題型要幾題？</div><div class="cm-grid">';
    CM_KINDS.forEach(function (k) { html += cmRowHtml(k.key, k.label, k.unit || '題', cmCounts[k.key] || 0, (k.max || CM_MAX_PER_KIND), 0); });
    html += '</div>';
    if ((cmCounts.passage || 0) > 0) {
        // 一組＝一篇文章配幾題：只有選了閱讀題組才出現
        html += '<div class="cm-sub">每一組是一篇文章配幾題？' +
            '<div class="cm-grid" style="margin-top:6px">' + cmRowHtml('perGroup', '每組題數', '題', cmCounts.perGroup, CM_PER_GROUP_MAX, CM_PER_GROUP_MIN) + '</div></div>';
    }
    html += '<div class="cm-total' + (total === 0 || tooBig || (guestCap && total > guestCap) ? ' is-bad' : '') + '">' +
        (total === 0 ? '請至少選 1 題' : '共 ' + total + ' 題') +
        (guestCap && total > guestCap ? '（訪客一份最多 ' + guestCap + ' 題，要更多請登入教師帳號）' : '') +
        (tooBig ? '（題型加題數太多，一次出不完，請減少一些，或分成兩份卷）' : '') +
        '</div>';
    panel.innerHTML = html;
}

(function cmInit() {
    if (typeof document === 'undefined') return;   // 單元測試用 vm 載入時沒有 document
    function build() {
        var sel = document.getElementById('qType');
        if (!sel || document.getElementById('cmPanel')) return;
        var panel = document.createElement('div');
        panel.id = 'cmPanel';
        panel.hidden = true;
        // 放在題型欄之後、佔滿整列（外層是兩欄格線）
        sel.parentElement.insertAdjacentElement('afterend', panel);
        sel.addEventListener('change', cmRender);
        cmRender();   // 還原儲存設定後 qType 可能已經是自選題數
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
    // 設定還原（settings.js）與精靈切換步驟會改 qType，載入完成後再畫一次
    window.addEventListener('load', function () { cmRender(); });
})();
