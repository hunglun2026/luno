// 鴻綸 刻度｜數學式轉成一般文字的純函式：不碰 DOM、不依賴別的檔案，worker/test/frontend-mathtext.test.js 用 vm 載入測試。
// 為什麼不用數學排版套件：題目要同時出現在畫面、PDF、Word，轉成「a²+2ab+b²」這種一般文字，三種輸出都不用另外處理。
// AI 出題常常照習慣寫 LaTeX（$a^2+b^2$、\frac{1}{2}），出題提示詞已禁止，這裡是第二道：新題、舊測驗、別人分享的測驗都會經過。
//
// 判斷什麼是數學式（避免把金額 NT$100 誤吃掉）：
//   兩個 $ 之間、頭尾不是空白、裡面沒有中文，才當數學式；落單的 $、「$100 和 $200」這種都原樣保留。
//
// 對外：mathPlain(字串) → 字串；mathClean(題目陣列) → 新的題目陣列（不改原陣列，img 欄位不碰）

const MT_SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ' };
const MT_SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' };
const MT_SYMBOLS = {
    times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
    approx: '≈', equiv: '≡', infty: '∞', pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ',
    lambda: 'λ', mu: 'μ', sigma: 'σ', omega: 'ω', Delta: 'Δ', Omega: 'Ω', angle: '∠', triangle: '△',
    circ: '°', degree: '°', parallel: '∥', perp: '⊥', sim: '∼', cong: '≅', therefore: '∴', because: '∵',
    Rightarrow: '⇒', Leftarrow: '⇐', to: '→', rightarrow: '→', leftarrow: '←', ldots: '…', cdots: '⋯', dots: '…',
    prime: '′', in: '∈', cup: '∪', cap: '∩', subset: '⊂', emptyset: '∅', sum: 'Σ'
};
const MT_CJK = /[㐀-鿿＀-￯]/;

function mtMapAll(s, table) {
    let out = '';
    for (const ch of s) {
        if (!(ch in table)) return null;
        out += table[ch];
    }
    return out;
}
function mtSimple(s) { return /^[\w.]+$/.test(s); }

// 一段數學式（不含 $）轉成一般文字
function mtInner(src) {
    let s = src;
    s = s.replace(/\\\{/g, '\u0001').replace(/\\\}/g, '\u0002').replace(/\\%/g, '%');
    s = s.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$1');
    // 分數、根號可以巢狀，從最內層開始一直換到沒有為止
    for (let k = 0; k < 6; k++) {
        const before = s;
        s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (m, a, b) {
            a = a.trim(); b = b.trim();
            return (mtSimple(a) ? a : '(' + a + ')') + '/' + (mtSimple(b) ? b : '(' + b + ')');
        });
        s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, function (m, a) {
            a = a.trim();
            return '√' + (mtSimple(a) ? a : '(' + a + ')');
        });
        if (s === before) break;
    }
    s = s.replace(/\\(?:left|right|bigl|bigr|big|Big)\s*/g, '');
    s = s.replace(/\\!/g, '').replace(/\\[,;: ]/g, ' ');
    s = s.replace(/\\([A-Za-z]+)/g, function (m, k) { return k in MT_SYMBOLS ? MT_SYMBOLS[k] : k; });
    s = s.replace(/\^\s*°/g, '°');
    s = s.replace(/\^\s*\{([^{}]*)\}|\^\s*(-?[0-9A-Za-z])/g, function (m, a, b) {
        const e = (a !== undefined ? a : b).trim();
        const mapped = mtMapAll(e, MT_SUP);
        if (mapped !== null) return mapped;
        return e.length > 1 ? '^(' + e + ')' : '^' + e;
    });
    s = s.replace(/_\s*\{([^{}]*)\}|_\s*([0-9])/g, function (m, a, b) {
        const e = (a !== undefined ? a : b).trim();
        const mapped = mtMapAll(e, MT_SUB);
        return mapped !== null ? mapped : '_' + e;
    });
    s = s.replace(/[{}]/g, '');
    return s.replace(/\u0001/g, '{').replace(/\u0002/g, '}');
}

function mathPlain(str) {
    if (typeof str !== 'string') return str;
    const hasDollar = str.indexOf('$') >= 0;
    const hasCmd = /\\(?:frac|dfrac|sqrt|times|div|pm|leq|geq|neq|cdot|pi|left|right|text|angle|circ)\b/.test(str);
    if (!hasDollar && !hasCmd) return str;
    let t = str.replace(/\\\$/g, '\u0003');
    t = t.replace(/\$\$([\s\S]+?)\$\$|\$(?=\S)([^$\n]*?\S)\$/g, function (m, a, b) {
        const inner = a !== undefined ? a : b;
        if (MT_CJK.test(inner)) return m;
        return mtInner(inner);
    });
    // 沒包 $ 的裸指令（例如整題直接寫 \frac{1}{2}）
    if (/\\[A-Za-z]+/.test(t)) t = mtInner(t);
    return t.replace(/\u0003/g, '$');
}

function mtDeep(v) {
    if (typeof v === 'string') return mathPlain(v);
    if (Array.isArray(v)) return v.map(mtDeep);
    if (v && typeof v === 'object') {
        const out = {};
        Object.keys(v).forEach(function (k) { out[k] = k === 'img' ? v[k] : mtDeep(v[k]); });
        return out;
    }
    return v;
}
function mathClean(items) { return Array.isArray(items) ? items.map(mtDeep) : items; }
