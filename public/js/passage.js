// 鴻綸 刻度｜閱讀題組（一篇文章配多題，2026-11-17）的純函式，不碰 DOM、不碰網路。
// 資料格式：每題照舊是獨立題目（出題、判分、分享、即時監看都不用改），多兩個選填欄位：
//   pg：同一組的代號字串，例 "p1"（同一組的每一題都有）
//   pt：文章內文字串，**只放在該組第一題**（其他題靠 pg 找回文章，不重複存）
// 渲染：每題上方都看得到文章；第一題展開，其餘題收合成「看閱讀文章」，手機不用往回捲。
// 欄位只用字串（Worker 的 publicItem 要同步放行 pg、pt，否則學生版看不到文章）。

var PT_MAX_CHARS = 1500;   // 文章長度上限：太長會拖垮分享大小（未登入分享上限 120KB）與手機畫面

function ptClean(s) {
    return String(s == null ? '' : s).replace(/\r/g, '').trim().slice(0, PT_MAX_CHARS);
}

// 出題一批（一組）回來後整理：文章只留在第一題、全部標同一個組代號。
// 找不到任何文章就整批不要（回空陣列），不讓沒有文章的「閱讀題」混進卷子
function ptNormalizeBatch(items, groupId) {
    var list = (items || []).filter(function (q) { return q && typeof q.q === 'string' && q.q.trim(); });
    var text = '';
    for (var i = 0; i < list.length; i++) {
        var t = ptClean(list[i].pt);
        if (t) { text = t; break; }
    }
    if (!text || list.length === 0) return [];
    return list.map(function (q, idx) {
        var out = {};
        Object.keys(q).forEach(function (k) { if (k !== 'pt' && k !== 'pg') out[k] = q[k]; });
        out.pg = String(groupId);
        if (idx === 0) out.pt = text;
        return out;
    });
}

// 第 i 題屬於哪一組的文章：自己有 pt 就是自己的，否則找同 pg 且有 pt 的題目；沒有就回空字串
function ptTextFor(items, i) {
    var q = items && items[i];
    if (!q || !q.pg) return '';
    if (q.pt) return ptClean(q.pt);
    for (var k = 0; k < items.length; k++) {
        if (items[k] && items[k].pg === q.pg && items[k].pt) return ptClean(items[k].pt);
    }
    return '';
}

function ptIsFirst(items, i) {
    var q = items && items[i];
    return !!(q && q.pg && q.pt);
}

// 單題重出／編輯後保留組別：新題沒有 pg／pt 時從舊題帶過去
function ptKeep(oldQ, newQ) {
    if (!oldQ || !newQ || !oldQ.pg) return newQ;
    newQ.pg = oldQ.pg;
    if (oldQ.pt) newQ.pt = oldQ.pt; else delete newQ.pt;
    return newQ;
}

// 刪掉一題後，若被刪的是組內第一題（帶 pt），把文章交給同組下一題，不讓整組的文章消失。items 是刪除前的陣列，idx 是要刪的位置
function ptHandOver(items, idx) {
    var q = items && items[idx];
    if (!q || !q.pg || !q.pt) return;
    for (var k = 0; k < items.length; k++) {
        if (k !== idx && items[k] && items[k].pg === q.pg) { items[k].pt = q.pt; return; }
    }
}

// 檢查（vetItems）可能把某組的第一題（帶 pt）剔除：事後讓每組仍然「第一個留下來的題目」帶文章，其餘不帶。
// after 是檢查後留下的題目（會被就地修改），pool 是檢查前的題目（用來查文章）
function ptRehome(after, pool) {
    var texts = {};
    (pool || []).forEach(function (q) { if (q && q.pg && q.pt) texts[q.pg] = q.pt; });
    var seen = {};
    (after || []).forEach(function (q) {
        if (!q || !q.pg) return;
        if (seen[q.pg]) { delete q.pt; return; }
        seen[q.pg] = true;
        if (texts[q.pg]) q.pt = texts[q.pg];
    });
}

// 這題上方要顯示的文章 HTML。esc 是跳脫函式（畫面用 escapeHtml，測試傳替身）。沒有文章回空字串
// opts.paper：紙本（A4 試卷、Word）只在每組第一題印一次文章，不用收合；螢幕版每題上方都有，非第一題收合
function ptHtml(items, i, esc, opts) {
    var text = ptTextFor(items, i);
    if (!text) return '';
    var body = "<div class='pt-body'>" + esc(text) + "</div>";
    if (ptIsFirst(items, i)) {
        return "<div class='pt-box'><div class='pt-title'>📖 閱讀文章</div>" + body + "</div>";
    }
    if (opts && opts.paper) return '';
    return "<details class='pt-box pt-more'><summary class='pt-title'>📖 看閱讀文章</summary>" + body + "</details>";
}

// 出題提示詞：一組＝一篇文章＋count 題單選題。grade 用來決定文章長度與難度
function ptPrompt(count, groupId, grade) {
    var g = String(grade || '');
    // 一定要綁「國小」：國中、高中也有「二年級」「三年級」，只比「二年級」會把高中生的文章寫成 80 字
    var len = /國小[一二]年級/.test(g) ? '80～150' : /國小[三四]年級/.test(g) ? '150～250' : /國小[五六]年級/.test(g) ? '250～400' : /國中|高中/.test(g) ? '300～500' : '150～300';
    return '【閱讀題組格式】：先自己寫一篇原創短文（約 ' + len + ' 字，內容正確、適合該年級閱讀，不要抄現成課文），' +
        '再根據這篇文章出 ' + count + ' 題單選題。回傳的 JSON Array 共 ' + count + ' 個物件，每題都要在文章裡找得到答案，' +
        '不可出不看文章也能答的題目。**只有第 1 題**多一個欄位 "pt"，內容是整篇文章（純文字，段落用換行分開）；' +
        '第 2 題起不要寫 "pt"。欄位順序：q、o、a、e、pt（只有第 1 題）、s。' +
        '題目中不要寫「根據上文」以外需要看圖的內容，也不要在 q 裡重貼整篇文章。' +
        '文章與題目一律用臺灣慣用的繁體字，不可出現簡體字或異體簡寫（例如寫「曬」不寫「晒」、「裡」不寫「里」）。這是第 ' + groupId + ' 組。\n';
}
