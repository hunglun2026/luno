// 說明書首頁（manual.html）的舊連結轉址（2026-11-12）。
// 說明書已拆成每個身分一個獨立網頁（manual-guest／teacher／student／parent／admin）；
// 以前單頁版的 ?role=teacher 與 #t-send 這類連結還可能被別處引用，在這裡轉到對應的頁。
(function () {
    var PAGE_OF_ROLE = { guest: 'manual-guest', teacher: 'manual-teacher', student: 'manual-student', parent: 'manual-parent' };
    var PAGE_OF_ANCHOR = {
        'guest': 'manual-guest',
        't-make': 'manual-teacher', 't-check': 'manual-teacher', 't-send': 'manual-teacher', 't-more': 'manual-teacher',
        'student': 'manual-student', 'parent': 'manual-parent', 'admin': 'manual-admin'
    };
    var target = '';
    try {
        var role = new URL(location.href).searchParams.get('role');
        if (role && PAGE_OF_ROLE[role]) target = PAGE_OF_ROLE[role];
    } catch (e) { /* 舊瀏覽器沒有 URL，就留在首頁 */ }
    var id = location.hash ? location.hash.slice(1) : '';
    if (!target && PAGE_OF_ANCHOR[id]) target = PAGE_OF_ANCHOR[id] + location.hash;
    if (target) location.replace(target);
})();
