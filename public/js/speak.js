// 鴻綸 刻度｜題目語音朗讀：學生作答時按 🔊 聽題目與選項（學 Wayground 的無障礙功能，對低年級、識字還在學的孩子有用）。
// 用瀏覽器內建的語音合成（speechSynthesis），不經過任何伺服器，題目內容不會送出去；沒有支援的瀏覽器不顯示按鈕。
// 數學式先轉成一般文字（mathtext.js），再把 ² √ × ÷ 這類符號換成唸得出來的中文。

window._speakingIdx = -1;

function speakSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

// 符號轉成唸得出來的字；順序不能亂：減號要最先處理（要靠前面還是 ² 或字母才判斷得出是減號），之後 ² 才換成中文
const SPEAK_MAP = [
    [/([\w²³)])\s*[-−]\s*(?=[\w(√])/g, '$1減'],
    [/²/g, '的平方'], [/³/g, '的立方'], [/√/g, '根號'], [/×/g, '乘以'], [/÷/g, '除以'], [/≤/g, '小於等於'], [/≥/g, '大於等於'],
    [/≠/g, '不等於'], [/≈/g, '約等於'], [/π/g, '圓周率'], [/°/g, '度'], [/\+/g, '加'], [/=/g, '等於'], [/(\d+)\s*\/\s*(\d+)/g, '$2分之$1'],
];

function speakPlain(s) {
    let t = typeof mathPlain === 'function' ? mathPlain(String(s || '')) : String(s || '');
    SPEAK_MAP.forEach(function (m) { t = t.replace(m[0], m[1]); });
    return t.replace(/\s+/g, ' ').trim();
}

// 一題要唸的完整文字：題號、題幹、選項（字母直接唸 A B C D，孩子看畫面也是這樣標）
function speakQuestionText(q, i) {
    let t = '第' + (i + 1) + '題。' + speakPlain(q.q) + '。';
    if (Array.isArray(q.o) && q.o.length > 0) {
        q.o.forEach(function (o, k) { t += '選項' + String.fromCharCode(65 + k) + '，' + speakPlain(o) + '。'; });
    }
    return t;
}

function speakVoice() {
    const vs = window.speechSynthesis.getVoices() || [];
    return vs.find(function (v) { return /zh[-_]TW/i.test(v.lang); }) ||
        vs.find(function (v) { return /^zh/i.test(v.lang); }) || null;
}

// 再按同一題＝停止；按別題＝改唸別題
function speakQuestion(i) {
    if (!speakSupported()) return;
    const synth = window.speechSynthesis;
    const wasSame = window._speakingIdx === i && synth.speaking;
    synth.cancel();
    document.querySelectorAll('.ans-speak').forEach(function (b) { b.classList.remove('is-on'); });
    if (wasSame) { window._speakingIdx = -1; return; }
    const q = (window.currentItems || [])[i];
    if (!q) return;
    const u = new SpeechSynthesisUtterance(speakQuestionText(q, i));
    const v = speakVoice();
    u.lang = v ? v.lang : 'zh-TW';
    if (v) u.voice = v;
    u.rate = 0.9;   // 比正常慢一點，孩子比較聽得清楚
    const btn = document.querySelector('#ans-card-' + i + ' .ans-speak');
    const done = function () { window._speakingIdx = -1; if (btn) btn.classList.remove('is-on'); };
    u.onend = done;
    u.onerror = done;
    window._speakingIdx = i;
    if (btn) btn.classList.add('is-on');
    synth.speak(u);
}

// 離開頁面或重新出題時別一直唸
window.addEventListener('pagehide', function () { if (speakSupported()) window.speechSynthesis.cancel(); });
