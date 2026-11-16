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

// 頁尾的 LINE：手機點了照連結直接加好友；電腦（有滑鼠、開 line.me 沒用）改彈小卡片：ID＋複製鈕＋「或用手機開啟」，
// 跟鴻綸官網右下角 LINE 鈕同一套。複製不到（舊瀏覽器、非 https）就把 ID 選起來讓人自己複製
(function () {
    var LINE_ID = '@gdm6961p', pop = null;
    function close() { if (pop) { pop.remove(); pop = null; } }
    function copyId(btn, idEl) {
        function done() { btn.textContent = '已複製 ✓'; setTimeout(function () { btn.textContent = '複製 ID'; }, 1600); }
        function select() {
            try { var r = document.createRange(); r.selectNodeContents(idEl); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (err) { /* 選不起來就算了 */ }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(LINE_ID).then(done, select);
        else select();
    }
    document.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('[data-line-id]') : null;
        if (!a) { if (pop && !e.target.closest('.ld-line-pop')) close(); return; }
        if (!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches)) return;   // 手機：照原本連結走
        e.preventDefault();
        if (pop) return close();
        pop = document.createElement('div');
        pop.className = 'ld-line-pop';
        pop.innerHTML = '<div class="ld-line-row"><b></b><button type="button">複製 ID</button></div>' +
            '<small>電腦版請在 LINE 搜尋 ID 加入</small><a target="_blank" rel="noopener noreferrer">或用手機開啟</a>';
        var idEl = pop.querySelector('b');
        idEl.textContent = LINE_ID;
        pop.querySelector('a').href = a.href;
        pop.querySelector('button').addEventListener('click', function () { copyId(this, idEl); });
        a.parentNode.appendChild(pop);
        pop.style.left = Math.max(0, a.offsetLeft - 20) + 'px';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
