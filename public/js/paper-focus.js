// 刻度｜原卷直上：手機上點簡答（填空）框，改用底部輸入面板（2026-11-05，Gemini 帳號 A 討論定案）
// 原因：手機上整頁 A4 縮到 390px，作答框只剩一條小縫，打字看不到自己寫什麼。
// 做法：點 .pp-fillbox 時，面板由底部滑出，上方是原卷該題附近的裁切圖，下方是大輸入框；
//       打的字同步寫回原本的 input 與 ppStuType()，所以進度、送出完全沿用原本的流程。
// 只在手機寬度（640px 以下）啟用；電腦版維持直接在卷面上打字。
(function () {
    var mq = window.matchMedia ? window.matchMedia('(max-width: 640px)') : { matches: false };
    var sheet = null;      // 目前開著的面板
    var onVv = null;       // 鍵盤彈出時調整位置的監聽

    function closeSheet() {
        if (!sheet) return;
        if (onVv && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', onVv);
            window.visualViewport.removeEventListener('scroll', onVv);
        }
        onVv = null;
        sheet.remove();
        sheet = null;
        document.body.classList.remove('pp-focus-open');
    }

    // 依鍵盤高度把面板貼在鍵盤上緣（visualViewport 在 iOS／Android 都會跟著鍵盤縮小）
    function followKeyboard(box) {
        if (!window.visualViewport) return;
        onVv = function () {
            var vv = window.visualViewport;
            var covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            box.style.bottom = covered + 'px';
        };
        window.visualViewport.addEventListener('resize', onVv);
        window.visualViewport.addEventListener('scroll', onVv);
        onVv();
    }

    // 裁切圖：用原卷頁面圖當背景，只露出作答框上方一小段（題目通常在框上面）
    function buildCrop(input) {
        var holder = input.parentElement;                       // .pp-ans，位置用百分比寫在 style 上
        var stage = input.closest('.pp-stage');
        var img = stage && stage.querySelector('img');
        var crop = document.createElement('div');
        crop.className = 'pp-focus-crop';
        if (!img || !img.naturalWidth) return crop;
        var top = parseFloat(holder.style.top) / 100;
        var h = parseFloat(holder.style.height) / 100;
        var y0 = Math.max(0, top - 0.07);                       // 框上方 7% 頁高，多半涵蓋題幹
        crop._paint = function () {
            var w = crop.clientWidth;
            var pageH = w * img.naturalHeight / img.naturalWidth;
            crop.style.backgroundImage = 'url("' + img.src + '")';
            crop.style.backgroundSize = w + 'px auto';
            crop.style.backgroundPosition = '0 ' + (-y0 * pageH) + 'px';
            var mark = document.createElement('div');           // 框出「你正在寫的這格」
            mark.className = 'pp-focus-mark';
            mark.style.top = ((top - y0) * pageH) + 'px';
            mark.style.height = Math.max(h * pageH, 14) + 'px';
            mark.style.left = parseFloat(holder.style.left) + '%';
            mark.style.width = parseFloat(holder.style.width) + '%';
            crop.appendChild(mark);
        };
        return crop;
    }

    function openSheet(input) {
        var rid = input.dataset.region;
        var overlay = document.createElement('div');
        overlay.className = 'pp-focus-overlay';
        var box = document.createElement('div');
        box.className = 'pp-focus-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', input.placeholder || '作答');

        var head = document.createElement('div');
        head.className = 'pp-focus-head';
        var title = document.createElement('b');
        title.textContent = input.placeholder || '作答';
        var done = document.createElement('button');
        done.type = 'button';
        done.className = 'pp-focus-done-top';
        done.textContent = '完成';
        head.appendChild(title);
        head.appendChild(done);

        var crop = buildCrop(input);
        var ta = document.createElement('textarea');
        ta.className = 'pp-focus-input';
        ta.rows = 3;
        ta.value = input.value;
        ta.placeholder = '在這裡打字作答';
        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'pp-focus-done';
        ok.textContent = '完成輸入';

        box.appendChild(head);
        box.appendChild(crop);
        box.appendChild(ta);
        box.appendChild(ok);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.body.classList.add('pp-focus-open');
        sheet = overlay;
        if (crop._paint) crop._paint();
        followKeyboard(box);

        ta.addEventListener('input', function () {
            input.value = ta.value;
            if (typeof ppStuType === 'function') ppStuType(rid, ta.value);
            if (typeof ppStuProgress === 'function') ppStuProgress();
            // 輸入框隨字數長高，最高 6 行，再多就框內捲動
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
        });
        function finish() { input.blur(); closeSheet(); }
        done.onclick = finish;
        ok.onclick = finish;
        overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(); });
        input.blur();                                           // 讓卷面上的小框放掉焦點，鍵盤交給面板的輸入框
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
    }

    // ===== 手寫題放大書寫面板（2026-11-06）=====
    // 手機上點手寫格，改開放大面板；筆跡存同一份 ppStrokes（相對座標），關閉後卷面小畫布同步重畫
    function openHandSheet(canvas) {
        var rid = canvas.dataset.region;
        var regions = (typeof ppPaper !== 'undefined' && ppPaper.regions) || [];
        var region = regions.filter(function (r) { return r.id === rid; })[0];
        var stage = canvas.closest('.pp-stage');
        var img = stage && stage.querySelector('img');
        if (!region || !img || !img.naturalWidth) return;
        var local = 'pen';                                      // 面板自己的工具，不動卷面上的工具列
        var overlay = document.createElement('div');
        overlay.className = 'pp-focus-overlay';
        var box = document.createElement('div');
        box.className = 'pp-focus-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', '第 ' + region.no + ' 題手寫');

        var head = document.createElement('div');
        head.className = 'pp-focus-head';
        var title = document.createElement('b');
        title.textContent = '第 ' + region.no + ' 題 手寫作答';
        var done = document.createElement('button');
        done.type = 'button';
        done.className = 'pp-focus-done-top';
        done.textContent = '完成';
        head.appendChild(title);
        head.appendChild(done);

        var crop = buildCrop(canvas);                           // 手寫格同樣放在有位置 style 的 .pp-ans 裡，可直接共用

        // 書寫區：背景是原卷該格的畫面，上面疊透明畫布；長寬比跟原格一樣，筆跡的相對座標才不會變形
        var wrap = document.createElement('div');
        wrap.className = 'pp-focus-hand';
        var aspect = (region.w * img.naturalWidth) / (region.h * img.naturalHeight);
        var availW = Math.min(window.innerWidth - 32, 560);
        var maxH = Math.round(window.innerHeight * 0.5);
        var w = availW, h = w / aspect;
        if (h < 200) { h = 200; w = Math.min(availW, h * aspect); }
        if (h > maxH) { h = maxH; w = h * aspect; }
        wrap.style.width = Math.round(w) + 'px';
        wrap.style.height = Math.round(h) + 'px';
        var pageW = w / region.w, pageH = pageW * img.naturalHeight / img.naturalWidth;
        wrap.style.backgroundImage = 'url("' + img.src + '")';
        wrap.style.backgroundSize = pageW + 'px ' + pageH + 'px';
        wrap.style.backgroundPosition = (-region.x * pageW) + 'px ' + (-region.y * pageH) + 'px';
        var big = document.createElement('canvas');
        big.className = 'pp-bigcanvas';
        big.width = Math.round(w * 2);
        big.height = Math.round(h * 2);
        wrap.appendChild(big);

        var tools = document.createElement('div');
        tools.className = 'pp-focus-tools';
        function toolBtn(label, fn) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'pp-tool';
            b.textContent = label;
            b.onclick = fn;
            tools.appendChild(b);
            return b;
        }
        function paint() { ppDrawStrokes(big, ppStrokes[rid] || []); }
        var bPen = toolBtn('✏️ 筆', function () { local = 'pen'; mark(); });
        var bEra = toolBtn('🧽 橡皮擦', function () { local = 'eraser'; mark(); });
        toolBtn('↩️ 復原', function () { (ppStrokes[rid] || []).pop(); paint(); });
        function mark() { bPen.classList.toggle('on', local === 'pen'); bEra.classList.toggle('on', local === 'eraser'); }
        mark();

        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'pp-focus-done';
        ok.textContent = '完成書寫';

        box.appendChild(head);
        box.appendChild(crop);
        box.appendChild(wrap);
        box.appendChild(tools);
        box.appendChild(ok);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.body.classList.add('pp-focus-open');
        sheet = overlay;
        if (crop._paint) crop._paint();
        paint();

        var drawing = false, cur = null;
        function pos(e) {
            var r = big.getBoundingClientRect();
            return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        }
        big.addEventListener('pointerdown', function (e) {
            drawing = true;
            cur = { tool: local, pts: [pos(e)] };
            (ppStrokes[rid] = ppStrokes[rid] || []).push(cur);
            try { big.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });
        big.addEventListener('pointermove', function (e) {
            if (!drawing) return;
            cur.pts.push(pos(e));
            paint();
            e.preventDefault();
        });
        function stop() { drawing = false; cur = null; }
        big.addEventListener('pointerup', stop);
        big.addEventListener('pointercancel', stop);

        function finish() {
            closeSheet();
            ppRedraw(rid);                                      // 卷面上的小畫布同步
            if (typeof ppStuProgress === 'function') ppStuProgress();
        }
        done.onclick = finish;
        ok.onclick = finish;
        overlay.addEventListener('click', function (e) { if (e.target === overlay) finish(); });
    }

    // 捕獲階段先攔：手機上點到手寫格就開面板，不讓小畫布自己開始畫
    document.addEventListener('pointerdown', function (e) {
        var t = e.target;
        if (sheet || !mq.matches) return;
        if (!t || !t.classList || !t.classList.contains('pp-handcanvas') || t.closest('.pp-focus-hand')) return;
        e.stopPropagation();
        e.preventDefault();
        openHandSheet(t);
    }, true);

    document.addEventListener('focusin', function (e) {
        var t = e.target;
        if (sheet || !mq.matches) return;
        if (!t || !t.classList || !t.classList.contains('pp-fillbox')) return;
        openSheet(t);
    });
})();
