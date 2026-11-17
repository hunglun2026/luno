// 投影到大屏（2026-11-16 Steve）：老師接投影機或電視，一次只顯示一題，字放很大，後排學生也看得清楚。
// 入口是「給學生寫」視窗的第三個選項（teacher-preview.js）；資料唯讀取自 window.currentItems，不改題目。
// 字級：題目在 1080p 螢幕約 56px（一般畫面的 3.5 倍），選項約 44px；右上角 A－／A＋ 可再調，範圍 0.7～1.6 倍。
// 題型判斷用 qtypes.js 的 qKind，答案文字用 sheet.js 的 answerKeyText／getCorrectLetters，跟 teacher-preview.js 同一套。

(function () {
    var idx = 0, showAns = false, scale = 1, overlay = null, prevFocus = null;

    function bodyHtml(q) {
        var kind = qKind(q);
        var letters = (kind === 'choice' && getCorrectLetters(q)) || [];
        var pt = (typeof ptTextFor === 'function') ? ptTextFor(window.currentItems || [], idx) : '';   // 閱讀題組：投影時文章放在題目上方（passage.js）
        var h = (pt ? "<div class='pj-pt'>" + escapeHtml(pt) + "</div>" : "") + "<div class='pj-q'>" + escapeHtml(q.q) + "</div>" + qImgHtml(q);
        if (kind === 'choice') {
            q.o.forEach(function (o, oi) {
                var label = String.fromCharCode(65 + oi);
                var ok = showAns && letters.indexOf(label) >= 0;
                h += "<div class='pj-opt" + (ok ? " is-ok" : "") + "'><b>" + label + "</b><span>" + escapeHtml(stripOptLabel(o, label)) + "</span></div>";
            });
        } else if (kind === 'match') {
            // 配合題：左右兩欄，右欄用洗過的順序（跟學生看到的一樣）；顯示答案時右欄改成正確配對
            var rows = showAns ? q.l.map(function (l, li) { return [l, q.r[li]]; }) : null;
            if (rows) rows.forEach(function (p) { h += "<div class='pj-opt is-ok'><span>" + escapeHtml(p[0]) + "　↔　" + escapeHtml(p[1]) + "</span></div>"; });
            else {
                q.l.forEach(function (l) { h += "<div class='pj-opt'><span>" + escapeHtml(l) + "</span></div>"; });
                h += "<div class='pj-hint'>配到：" + escapeHtml(q.r.join('、')) + "</div>";
            }
        } else if (kind === 'order') {
            q.l.forEach(function (l, li) {
                h += "<div class='pj-opt" + (showAns ? " is-ok" : "") + "'>" + (showAns ? "<b>" + (li + 1) + "</b>" : "") + "<span>" + escapeHtml(l) + "</span></div>";
            });
            if (!showAns) h += "<div class='pj-hint'>請排出正確順序</div>";
        }
        if (showAns && kind !== 'match' && kind !== 'order') {
            h += "<div class='pj-ans'>答案：<b>" + escapeHtml(answerKeyText(q)) + "</b></div>";
        }
        if (showAns && q.e) h += "<div class='pj-exp'>解析：" + escapeHtml(q.e) + "</div>";
        return h;
    }

    function draw() {
        var items = window.currentItems || [];
        if (!overlay || !items.length) return;
        var q = items[idx];
        overlay.style.setProperty('--pj-scale', scale);
        overlay.querySelector('.pj-count').textContent = '第 ' + (idx + 1) + ' / ' + items.length + ' 題';
        overlay.querySelector('.pj-body').innerHTML = bodyHtml(q);
        overlay.querySelector('[data-pj=ans]').textContent = showAns ? '隱藏答案' : '顯示答案';
        overlay.querySelector('[data-pj=prev]').disabled = idx === 0;
        overlay.querySelector('[data-pj=next]').disabled = idx === items.length - 1;
        overlay.querySelector('.pj-body').scrollTop = 0;
    }

    function go(d) {
        var n = (window.currentItems || []).length;
        var to = Math.max(0, Math.min(n - 1, idx + d));
        if (to !== idx) { idx = to; showAns = false; draw(); }
    }
    function zoom(d) { scale = Math.max(0.7, Math.min(1.6, Math.round((scale + d) * 10) / 10)); draw(); }

    function onKey(e) {
        var k = e.key;
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeProjector(); }
        else if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); go(1); }
        else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); go(-1); }
        else if (k === ' ' || k === 'Enter') { e.preventDefault(); showAns = !showAns; draw(); }
        else if (k === '+' || k === '=') zoom(0.1);
        else if (k === '-') zoom(-0.1);
    }

    window.openProjector = function (start) {
        var items = window.currentItems || [];
        if (!items.length || document.querySelector('.pj-overlay')) return;
        idx = Math.max(0, Math.min(items.length - 1, start || 0)); showAns = false;
        prevFocus = document.activeElement;
        overlay = document.createElement('div');
        overlay.className = 'pj-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', '投影到大屏');
        overlay.innerHTML =
            "<div class='pj-bar'><span class='pj-count'></span><span class='pj-grow'></span>" +
            "<button type='button' data-pj='zout' aria-label='縮小字'>A－</button><button type='button' data-pj='zin' aria-label='放大字'>A＋</button>" +
            "<button type='button' data-pj='prev'>← 上一題</button><button type='button' data-pj='ans' class='is-main'>顯示答案</button>" +
            "<button type='button' data-pj='next'>下一題 →</button><button type='button' data-pj='close'>結束</button></div>" +
            "<div class='pj-body'></div><div class='pj-tip'>← → 換題　空白鍵 顯示答案　＋／－ 調字大小　Esc 結束</div>";
        overlay.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-pj]') : null;
            if (!b) return;
            var a = b.getAttribute('data-pj');
            if (a === 'prev') go(-1);
            else if (a === 'next') go(1);
            else if (a === 'ans') { showAns = !showAns; draw(); }
            else if (a === 'zin') zoom(0.1);
            else if (a === 'zout') zoom(-0.1);
            else if (a === 'close') closeProjector();
        });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        draw();
        // 進全螢幕（瀏覽器要使用者手勢，這裡是從點擊來的）；不支援或被擋就維持滿版視窗
        try { if (overlay.requestFullscreen) overlay.requestFullscreen().catch(function () { }); } catch (e) { }
        overlay.querySelector('[data-pj=ans]').focus();
    };

    window.closeProjector = function () {
        if (!overlay) return;
        document.removeEventListener('keydown', onKey, true);
        try { if (document.fullscreenElement) document.exitFullscreen().catch(function () { }); } catch (e) { }
        overlay.remove(); overlay = null;
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { } }
    };

    // 使用者按瀏覽器自己的 Esc 退出全螢幕時，視窗不跟著關，維持滿版；只有按「結束」或程式內 Esc 才關
})();
