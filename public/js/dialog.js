// 刻度｜自製對話框：取代瀏覽器內建 alert／confirm／prompt。
// 內建的長相跟網站無關、標題會顯示網址，自動化測試也會被直接按取消。
// 用法：lqAlert(訊息)；await askConfirm(訊息, { danger: true })（true／false）；
//       askConfirm 可加 okText／cancelText 改按鈕文字、image 放一張插圖；
//       await askText(訊息, { value, secret, readonly })（字串，取消回 null）。
// 多個對話框會排隊一個一個顯示。訊息一律用 textContent，不會當 HTML 執行。
(function () {
    const queue = [];
    let busy = false;

    function open(spec) {
        return new Promise(function (resolve) { queue.push({ spec: spec, resolve: resolve }); pump(); });
    }

    function pump() {
        if (busy || queue.length === 0) return;
        busy = true;
        const job = queue.shift();
        render(job.spec, function (value) { busy = false; job.resolve(value); pump(); });
    }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function render(spec, done) {
        const prevFocus = document.activeElement;
        const overlay = el('div', 'lq-dlg-overlay');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        const box = el('div', 'lq-dlg-box');
        if (spec.image) {
            const pic = el('img', 'lq-illust');
            pic.src = spec.image; pic.alt = ''; pic.style.maxWidth = '11rem';
            box.appendChild(pic);
        }
        box.appendChild(el('div', 'lq-dlg-msg', spec.message));

        let input = null;
        if (spec.kind === 'text') {
            input = el('input', 'lq-input lq-dlg-input');
            input.type = spec.secret ? 'password' : 'text';
            input.value = spec.value || '';
            input.readOnly = !!spec.readonly;
            box.appendChild(input);
        }

        const row = el('div', 'lq-dlg-row');
        let finished = false;
        function close(value) {
            if (finished) return;
            finished = true;
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
            if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { } }
            done(value);
        }
        const cancelValue = spec.kind === 'confirm' ? false : (spec.kind === 'text' ? null : undefined);
        const okValue = function () { return spec.kind === 'confirm' ? true : (spec.kind === 'text' ? input.value : undefined); };

        if (spec.kind !== 'alert') {
            const cancel = el('button', 'lq-btn lq-btn-ghost', spec.cancelText || '取消');
            cancel.type = 'button';
            cancel.onclick = function () { close(cancelValue); };
            row.appendChild(cancel);
        }
        const ok = el('button', 'lq-btn ' + (spec.danger ? 'lq-btn-danger' : 'lq-btn-primary'), spec.okText || (spec.danger ? '確定刪除' : '確定'));
        ok.type = 'button';
        ok.onclick = function () { close(okValue()); };
        row.appendChild(ok);
        box.appendChild(row);
        overlay.appendChild(box);

        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(cancelValue); }
            else if (e.key === 'Enter' && (!input || document.activeElement === input)) { e.preventDefault(); e.stopPropagation(); close(okValue()); }
        }
        document.addEventListener('keydown', onKey, true);
        // 點遮罩外面不關：避免手指誤觸就把「確定刪除」當成取消或確定
        document.body.appendChild(overlay);
        if (input) { input.focus(); if (spec.readonly) input.select(); }
        else if (spec.danger && spec.kind === 'confirm') row.firstChild.focus();
        else ok.focus();
    }

    window.lqAlert = function (message) { return open({ kind: 'alert', message: String(message) }); };
    window.askConfirm = function (message, opts) {
        opts = opts || {};
        return open({ kind: 'confirm', message: String(message), danger: !!opts.danger, okText: opts.okText, cancelText: opts.cancelText, image: opts.image });
    };
    window.askText = function (message, opts) {
        opts = opts || {};
        return open({ kind: 'text', message: String(message), value: opts.value, secret: !!opts.secret, readonly: !!opts.readonly });
    };
})();
