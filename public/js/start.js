// 鴻綸 刻度｜選身分頁（start.html）：已登入的人直接進 App；點訪客／教師／家長／學生先把這個分頁記成該身分再前往 /app（免登入）。
// 2026-11-05 改成多頁式新增；2026-11-09 教師、家長、學生也改成免登入先用。「已有帳號登入」「管理員」是 /login 的真連結，不需要腳本。
(function () {
    'use strict';
    var SS_ROLE = 'lun_role_session';   // 跟 guide.js 同一個 key

    // 已登入者直接進 App；要換身分的人會帶 ?switch=1 來，才停在這一頁。
    // token 失效時 App 會清掉它並導回 /start?switch=1，不會繞圈
    var q = new URLSearchParams(location.search);
    var token = null;
    try { token = lqGetToken(); } catch (e) {}
    if (token && !q.has('switch')) { location.replace('/app'); return; }

    // 訪客、教師、家長、學生都是免登入進 /app：把這個分頁記成對應身分（guide.js 讀同一個 key）
    document.querySelectorAll('[data-role]').forEach(function (el) {
        el.addEventListener('click', function () {
            try { sessionStorage.setItem(SS_ROLE, el.getAttribute('data-role')); } catch (e) {}
        });
    });
})();
