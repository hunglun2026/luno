/* 瀏覽器「上一頁」支援（2026-11-05）。
   這個 SPA 靠 classList 切畫面，原本沒有歷史紀錄，手機滑動返回會直接離開網站。
   做法：不改任何既有的切畫面函式，只觀察畫面「深度」，變深就 pushState，使用者按瀏覽器返回時
   交給既有的 goBackOrHome()（home.js）退一層。
   深度：0 進場頁／身分頁；1 出題設定或學生首頁；2 試卷、作答卷。
   交接模式（手機已遞給學生）時返回會被擋回來，避免學生按返回跳出答題畫面。
   分享、監看、原卷連結（網址帶參數）不啟用，那些頁面沒有站內上一層。 */
(function () {
    if (location.search || !window.history || !history.pushState) return;
    var depth = 0;      // 目前歷史堆疊裡我們推到第幾層
    var ignorePop = false;

    function viewDepth() {
        function vis(id) { var el = document.getElementById(id); return isViewVisible(el); }
        if (vis('resultSection')) return 2;
        if (vis('studentHome') || vis('inputForm')) return 1;
        return 0;
    }

    function sync() {
        if (window.isSharedView) return;
        var d = viewDepth();
        if (d > depth) {
            for (var i = depth + 1; i <= d; i++) history.pushState({ lq: i }, '');
            depth = d;
        } else if (d < depth) {
            // 使用者用畫面上的返回鈕退了幾層：把歷史也退掉，下一次按瀏覽器返回才會對得上
            var diff = depth - d;
            depth = d;
            ignorePop = true;
            history.go(-diff);
        }
    }

    window.addEventListener('popstate', function (e) {
        if (ignorePop) { ignorePop = false; return; }
        var target = (e.state && e.state.lq) || 0;
        if (target >= depth) return;
        if (typeof handoffActive === 'function' && handoffActive()) {
            history.pushState({ lq: depth }, '');   // 頂回原本那層
            if (typeof lqAlert === 'function') lqAlert('目前是交接作答模式，要離開請先由家長或教師輸入密碼解鎖。');
            return;
        }
        var steps = depth - target;
        depth = target;
        for (var i = 0; i < steps; i++) goBackOrHome();
    });

    document.addEventListener('DOMContentLoaded', function () {
        var obs = new MutationObserver(sync);
        ['inputForm', 'studentHome', 'resultSection'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) obs.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        });
    });
})();
