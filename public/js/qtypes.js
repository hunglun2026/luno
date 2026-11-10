// 鴻綸 刻度｜新題型（配合題 match、排序題 order）的純函式：判斷題型、檢查、洗牌、判分、答案文字、紙本版面、編輯文字轉換。
// 不碰 DOM、不依賴別的檔案，worker/test/frontend-qtypes.test.js 用 vm 載入測試。作答畫面在 answer-qtypes.js。
//
// 資料格式（沒有 t 的舊題完全不變，仍靠 o 是否有選項判斷選擇題或文字題）：
//   配合題 { q, t:'match', l:[左1,左2,左3], r:[右1,右2,右3], e, s }：r[i] 是 l[i] 的正確配對
//   排序題 { q, t:'order', l:[第1個,第2個,第3個], e, s }：l 由前到後就是正確順序
//   o 固定 []；a 是自動產生的可讀字串（讓還在讀 q.a 的地方不會壞），顯示時一律重算，不信任舊的 a。
// 畫面上右欄（配合題）與項目（排序題）用 q 的內容當種子洗牌，同一題每次洗出來一樣，所以紙本、線上作答、答案卷對得起來。
// 作答值（放在隱藏欄位 #ans-text-<i>，進度、監看都沿用文字題的路徑）：
//   配合題 "0:2,1:0,2:1"＝左 0 配右（原順序）2，依此類推；排序題 "2,0,1"＝學生排出來的順序（每個數字是項目的原順序）

const QT_LABELS = 'ABCDEFGH';          // 配合題右欄標號
const QT_CIRCLED = '①②③④⑤⑥⑦⑧';      // 排序題項目標號
const QT_MIN = 3;
const QT_MAX = 6;

// 清成不為空的字串陣列；有任何一項是空的就回傳 null
function qtList(x) {
    if (!Array.isArray(x)) return null;
    const out = x.map(function (v) { return (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : ''; });
    return out.some(function (v) { return !v; }) ? null : out;
}

// 'match'、'order'、'choice'（有選項）、'text'（填充、簡答）。t 是新題型但資料不合格時當文字題，不會讓畫面壞掉
function qKind(q) {
    if (q && (q.t === 'match' || q.t === 'order')) {
        const l = qtList(q.l);
        if (l && l.length >= QT_MIN && l.length <= QT_MAX) {
            if (q.t === 'order') return 'order';
            const r = qtList(q.r);
            if (r && r.length === l.length) return 'match';
        }
    }
    return q && Array.isArray(q.o) && q.o.length > 0 ? 'choice' : 'text';
}

function qtIsTyped(q) {
    const k = qKind(q);
    return k === 'match' || k === 'order';
}

function qtHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// 洗牌結果 perm：畫面第 p 個位置放的是原本第 perm[p] 個。保證不等於原順序（不然排序題一開始就是答案）
function qtShuffle(q) {
    const n = q.l.length;
    // 學生版（伺服器不送答案）：伺服器已經把 l／r 洗好再送，畫面順序就是送來的順序（pre:1），這裡不能再洗一次
    if (q.pre) { const id = []; for (let k = 0; k < n; k++) id.push(k); return id; }
    let st = qtHash([q.t, q.q, q.l.join('|'), (q.r || []).join('|')].join('\u0001'));
    const rnd = function () {
        st = (st + 0x6D2B79F5) | 0;
        let t = Math.imul(st ^ (st >>> 15), 1 | st);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const perm = [];
    for (let i = 0; i < n; i++) perm.push(i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    if (perm.every(function (v, i) { return v === i; })) { const t0 = perm[0]; perm[0] = perm[1]; perm[1] = t0; }
    return perm;
}

// 正確答案的人看得懂的寫法：配合題 1→C；2→A；3→B　排序題 ② → ① → ③（標號是畫面上洗牌後的標號）
function qtAnswerText(q) {
    if (q.pre) return '(判分後才會公布)';   // 學生版題目沒有正確配對，不能自己算
    const perm = qtShuffle(q);
    if (q.t === 'match') {
        return q.l.map(function (_, i) { return (i + 1) + '→' + QT_LABELS[perm.indexOf(i)]; }).join('；');
    }
    return q.l.map(function (_, k) { return QT_CIRCLED[perm.indexOf(k)]; }).join(' → ');
}

function qtParseMatch(n, value) {
    const res = [];
    for (let i = 0; i < n; i++) res.push(-1);
    String(value || '').split(',').forEach(function (s) {
        const m = /^(\d+):(\d+)$/.exec(s.trim());
        if (m && Number(m[1]) < n && Number(m[2]) < n) res[Number(m[1])] = Number(m[2]);
    });
    return res;
}

// 排序題的作答：每個數字都在範圍內、不重複、長度剛好 n 才算有效，否則視為沒作答
function qtParseOrder(n, value) {
    const arr = String(value || '').split(',').map(function (x) { return parseInt(x, 10); });
    if (arr.length !== n) return null;
    if (arr.some(function (x) { return !(x >= 0 && x < n); }) || new Set(arr).size !== n) return null;
    return arr;
}

// 學生作答的人看得懂的寫法（判分回饋、老師即時監看都用它）
function qtDescribe(q, value) {
    const perm = qtShuffle(q);
    if (q.t === 'match') {
        const pairs = qtParseMatch(q.l.length, value);
        return pairs.map(function (j, i) { return (i + 1) + '→' + (j >= 0 ? QT_LABELS[perm.indexOf(j)] : '（未連）'); }).join('；');
    }
    const arr = qtParseOrder(q.l.length, value);
    return arr ? arr.map(function (idx) { return QT_CIRCLED[perm.indexOf(idx)]; }).join(' → ') : '(未作答)';
}

// 判分：配合題每對按比例給分，排序題位置放對的項目按比例給分；分數無條件捨去到 0.5；全對才算 isCorrect；沒作答 0 分
function qtGrade(q, value) {
    const n = q.l.length;
    const total = Number(q.s) || 0;
    let correct = 0;
    let answered = false;
    if (q.t === 'match') {
        const pairs = qtParseMatch(n, value);
        answered = pairs.some(function (j) { return j >= 0; });
        pairs.forEach(function (j, i) { if (j === i) correct++; });
    } else {
        const arr = qtParseOrder(n, value);
        answered = !!arr;
        if (arr) arr.forEach(function (v, k) { if (v === k) correct++; });
    }
    const score = !answered ? 0 : (correct === n ? total : Math.floor(total * correct / n * 2) / 2);
    return {
        n: n, correct: correct, answered: answered, score: score, max: total,
        isCorrect: answered && correct === n,
        userDisplay: answered ? qtDescribe(q, value) : '(未作答)',
        correctDisplay: qtAnswerText(q)
    };
}

// 出題後檢查並整理：合格回傳整理過的新物件（補 o、a、去掉 g），不合格回傳 null（整題剔除）
function qtNormalize(q) {
    if (!q || typeof q.q !== 'string' || !q.q.trim()) return null;
    if (q.t !== 'match' && q.t !== 'order') return null;
    const l = qtList(q.l);
    if (!l || l.length < QT_MIN || l.length > QT_MAX || new Set(l).size !== l.length) return null;
    const out = Object.assign({}, q, { q: q.q.trim(), l: l, o: [] });
    if (q.t === 'match') {
        const r = qtList(q.r);
        if (!r || r.length !== l.length || new Set(r).size !== r.length) return null;
        out.r = r;
    } else {
        delete out.r;
    }
    delete out.g;   // 不交給 AI 批改，判分是確定的
    out.a = qtAnswerText(out);
    return out;
}

// 紙本版面：題目卷、單題重出共用。回傳 { prefix, optsHTML, answerSpace }；esc 是跳脫函式（escapeHtml）
function qtPaperParts(q, num, esc) {
    const perm = qtShuffle(q);
    if (q.t === 'match') {
        let left = '', right = '';
        q.l.forEach(function (text, i) { left += "<div class='q-match-row'>(　　) " + (i + 1) + ". " + esc(text) + "</div>"; });
        perm.forEach(function (j, p) { right += "<div class='q-match-row'>" + QT_LABELS[p] + ". " + esc(q.r[j]) + "</div>"; });
        return {
            prefix: num + ".",
            optsHTML: "<div class='q-match'><div class='q-match-col'>" + left + "</div><div class='q-match-col'>" + right + "</div></div>" +
                "<div class='q-match-note'>在左邊的（　）裡填上右邊對應的代號</div>",
            answerSpace: ''
        };
    }
    let items = "<div class='q-opts'>";
    perm.forEach(function (idx, p) { items += "<div class='q-opt'>" + QT_CIRCLED[p] + " " + esc(q.l[idx]) + "</div>"; });
    items += "</div>";
    const blanks = q.l.map(function () { return '（　　）'; }).join(' → ');
    return { prefix: num + ".", optsHTML: items + "<div class='q-order-ans'>順序：" + blanks + "</div>", answerSpace: '' };
}

// Word 用：題幹後面每一行的文字（不含題幹本身）
function qtWordRows(q) {
    const perm = qtShuffle(q);
    if (q.t === 'match') {
        return q.l.map(function (text, p) { return '(　　) ' + (p + 1) + '. ' + text + '　　　　' + QT_LABELS[p] + '. ' + q.r[perm[p]]; });
    }
    const rows = perm.map(function (idx, p) { return QT_CIRCLED[p] + ' ' + q.l[idx]; });
    rows.push('順序：' + q.l.map(function () { return '（　　）'; }).join(' → '));
    return rows;
}

// 表單題型值是整份都要配合題或排序題時回傳 'match'／'order'，其他（含自定義文字）回傳 null
function qtWantKind(typeVal) {
    const v = String(typeVal || '').trim();
    return v === '全部配合題' ? 'match' : (v === '全部排序題' ? 'order' : null);
}

// 出題提示詞：新題型的格式與品質規則（整份出題、單題重出共用）。count 是這次要幾題，score 是每題配分
function qtFormatRule(kind, score, count) {
    const wrap = '【嚴格格式要求】：必須且只能回傳合法的 JSON Array' + (count === 1 ? '，且只包含1個物件' : '') + '。\n';
    if (kind === 'match') {
        return wrap +
            '【配合題格式】：每題一個物件：{"q":"題目說明（例如：請把左邊的詞語連到右邊對應的解釋）","t":"match","l":["左項1","左項2","左項3"],"r":["左項1對應的右項","左項2對應的右項","左項3對應的右項"],"e":"解析","s":' + score + '}\n' +
            '規則：1. "l" 與 "r" 各 ' + QT_MIN + ' 到 ' + QT_MAX + ' 項，數量一定要相同。2. "r" 的第 N 項必須是 "l" 第 N 項的正確配對，順序保持一一對應、不要打亂（畫面會自動洗牌）。3. 同一欄不可有重複的項目，每個左項只能對應一個右項，不可一對多或兩個都說得通。4. 每一項寫得簡短（一個詞或一句短話）。5. 不要有 "o"、"a" 欄位。6. 欄位順序固定為 q、t、l、r、e、s，"s" 放最後。\n';
    }
    return wrap +
        '【排序題格式】：每題一個物件：{"q":"題目說明（例如：請把下列步驟排成正確的順序）","t":"order","l":["第1個","第2個","第3個","第4個"],"e":"解析","s":' + score + '}\n' +
        '規則：1. "l" 有 ' + QT_MIN + ' 到 ' + QT_MAX + ' 項，由前到後就是正確順序（畫面會自動洗牌，不要先打亂）。2. 只出順序唯一、沒有爭議的內容：時間先後、實驗或操作步驟、故事發展、數字或大小順序；不要出兩種排法都說得通的題。3. 項目不可重複，每項簡短。4. 題目說明要寫清楚依什麼排序（例如「由早到晚」「由小到大」）。5. 不要有 "o"、"a" 欄位。6. 欄位順序固定為 q、t、l、e、s，"s" 放最後。\n';
}

// 編輯題目：題目 → 文字框內容。配合題一行一對「左｜右」，排序題一行一項（由上到下就是正確順序）
function qtToLines(q) {
    if (q.t === 'match') return q.l.map(function (text, i) { return text + '｜' + q.r[i]; }).join('\n');
    return q.l.join('\n');
}

// 文字框內容 → { l, r? } 或 { error }
function qtFromLines(kind, text) {
    const lines = String(text || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    if (lines.length < QT_MIN || lines.length > QT_MAX) return { error: '要有 ' + QT_MIN + ' 到 ' + QT_MAX + ' 行，目前有 ' + lines.length + ' 行' };
    if (kind === 'order') return { l: lines };
    const l = [], r = [];
    for (let i = 0; i < lines.length; i++) {
        const m = /^(.+?)\s*[｜|]\s*(.+)$/.exec(lines[i]);
        if (!m) return { error: '第 ' + (i + 1) + ' 行要用「｜」隔開左右，例如：蘋果｜Apple' };
        l.push(m[1].trim()); r.push(m[2].trim());
    }
    return { l: l, r: r };
}
