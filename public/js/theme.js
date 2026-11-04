// 刻度｜深淺色主題：淺色、深色、沒選過就跟著系統。
// 放在 <head> 同步載入：等頁面畫出來才換色，會先閃一下白底再變黑。
// 試卷與作答卷（紙張）永遠是白底，不跟主題走，見 css/theme.css。
(function () {
    'use strict';
    var KEY = 'lun_theme';

    // localStorage 在無痕或被封鎖時會丟錯，讀寫都包起來，讀不到就當成「跟隨系統」
    function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    function systemTheme() {
        return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    // 老師傳的分享、監看、原卷連結（網址帶這些參數）：學生多半是用手機點進來，那幾個作答畫面沒做深色，
    // 所以一律淺色，不跟系統、也不看之前選過什麼。參數清單要跟 index.html 歡迎頁的行內腳本一致
    var isLinkView = false;
    try {
        var q = new URLSearchParams(location.search);
        isLinkView = ['share', 'live', 'result', 'paper', 'grade'].some(function (k) { return q.has(k); });
    } catch (e) {}

    function current() {
        if (isLinkView) return 'light';
        var s = saved();
        return s === 'dark' || s === 'light' ? s : systemTheme();
    }

    // 頁面上所有標了 data-theme-toggle 的按鈕，圖示與文字跟著目前主題換
    function syncButtons(t) {
        document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
            b.setAttribute('aria-label', t === 'dark' ? '切換成淺色' : '切換成深色');
            var icon = b.querySelector('.ph-duotone');
            if (icon) icon.className = 'ph-duotone ' + (t === 'dark' ? 'ph-sun' : 'ph-moon');
            var lab = b.querySelector('.lab');
            if (lab) lab.textContent = t === 'dark' ? '淺色' : '深色';
        });
    }

    function apply() {
        var t = current();
        var root = document.documentElement;
        root.dataset.theme = t;
        // brand.css 的深色變數同時認 .dark 與 [data-theme="dark"]，兩個都設
        root.classList.toggle('dark', t === 'dark');
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', t === 'dark' ? '#0a1226' : '#fbfcfe');
        syncButtons(t);
    }

    window.toggleTheme = function () {
        save(current() === 'dark' ? 'light' : 'dark');
        apply();
    };

    apply();
    document.addEventListener('DOMContentLoaded', function () { syncButtons(current()); });
    // 沒手動選過的人，系統切換深淺色時跟著變
    if (window.matchMedia) {
        var mq = matchMedia('(prefers-color-scheme: dark)');
        var onChange = function () { if (!saved()) apply(); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
    }
})();
