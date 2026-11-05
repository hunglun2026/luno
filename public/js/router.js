/* 瀏覽器「上一頁」支援（2026-11-05；同日改成多頁式後簡化）。
   /app 這一頁裡，出題表單或學生首頁是「頁面本身」，按瀏覽器返回就真的回到上一個網頁（選身分頁）；
   只有「試卷、作答卷」是頁內切換出來的畫面，進去時才 pushState 一層，
   使用者按瀏覽器返回時交給既有的 goBackOrHome()（home.js）退回出題表單。
   交接模式（手機已遞給學生）時返回會被擋回來，避免學生按返回跳出答題畫面。
   分享、監看、原卷連結（網址帶參數）不啟用，那些頁面沒有站內上一層。 */
(function () {
    if (location.search || !window.history || !history.pushState) return;
    var depth = 0;      // 目前歷史堆疊裡我們推到第幾層（0 是頁面本身，1 是試卷／作答卷）
    var ignorePop = false;

    function viewDepth() {
        function vis(id) { var el = document.getElementById(id); return isViewVisible(el); }
        return vis('resultSection') ? 1 : 0;
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
