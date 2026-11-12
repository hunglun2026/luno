// 歡迎頁特效：3D 圖示隨游標（桌機）或手機傾斜微微轉動。只管轉動；進場與漂浮動畫在 css/landing.css。
// 使用者設了「減少動態」就整個不啟用。
(function () {
    'use strict';
    var w = document.getElementById('lqWelcome');
    if (!w || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var tilts = Array.prototype.slice.call(w.querySelectorAll('.ld-tilt'));
    if (!tilts.length) return;

    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;   // 目標角度、目前角度

    function frame() {
        cx += (tx - cx) * 0.12;
        cy += (ty - cy) * 0.12;
        var t = 'perspective(800px) rotateX(' + cy.toFixed(2) + 'deg) rotateY(' + cx.toFixed(2) + 'deg)';
        tilts.forEach(function (el) { el.style.transform = t; });
        raf = (Math.abs(tx - cx) > 0.02 || Math.abs(ty - cy) > 0.02) ? requestAnimationFrame(frame) : 0;
    }

    // nx、ny：-1 到 1（畫面左右、上下）
    function aim(nx, ny) {
        tx = nx * 14;
        ty = -ny * 12;
        if (!raf) raf = requestAnimationFrame(frame);
    }

    w.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        aim((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
    });
    w.addEventListener('pointerleave', function () { aim(0, 0); });

    // 手機：有傾斜感測器就跟著動（iOS 要使用者授權，沒授權就收不到事件，維持只有漂浮）
    window.addEventListener('deviceorientation', function (e) {
        if (w.hidden || e.gamma == null || e.beta == null) return;
        aim(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    });
})();

// 頁尾的 LINE ID：點一下複製；複製不到（舊瀏覽器、非 https）就把字選起來讓人自己複製
document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-copy]') : null;
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    var shown = btn.innerHTML;
    function done() {
        btn.classList.add('is-copied');
        btn.textContent = '已複製 ✓';
        setTimeout(function () { btn.classList.remove('is-copied'); btn.innerHTML = shown; }, 1600);
    }
    function select() {
        try { var r = document.createRange(); r.selectNodeContents(btn); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (err) { /* 選不起來就算了 */ }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, select);
    else select();
});
