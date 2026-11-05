// 鴻綸 刻度｜選身分頁（start.html）：已登入的人直接進 App；點「訪客模式」先把這個分頁記成訪客再前往 /app。
// 2026-11-05 改成多頁式新增。「教師、家長、學生、管理員」是 /login 的真連結，不需要腳本。
(function () {
    'use strict';
    var SS_ROLE = 'lun_role_session';   // 跟 guide.js 同一個 key

    // 已登入者直接進 App；要換身分的人會帶 ?switch=1 來，才停在這一頁。
    // token 失效時 App 會清掉它並導回 /start?switch=1，不會繞圈
    var q = new URLSearchParams(location.search);
    var token = null;
    try { token = localStorage.getItem('lun_session_token'); } catch (e) {}
    if (token && !q.has('switch')) { location.replace('/app'); return; }

    var guest = document.querySelector('[data-role="guest"]');
    if (guest) guest.addEventListener('click', function () {
        try { sessionStorage.setItem(SS_ROLE, 'guest'); } catch (e) {}
    });
})();
