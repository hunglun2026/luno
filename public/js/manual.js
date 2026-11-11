// 說明書「你是誰」引導：選身分後只顯示那個身分的章節（manual.html 每章有 data-role）。
// HTML 裡整份內容都在（搜尋引擎、不開 JS、列印都看得到全部）；這支只做「收起不相關的」。
// 網址 ?role=teacher 可直接指定身分；帶 #章節 錨點進來（App 內連結、目錄）就先顯示全部，免得錨點找不到。
(function () {
    var ROLES = ['guest', 'teacher', 'student', 'parent', 'all'];
    var chapters = document.querySelectorAll('.m-chapter[data-role]');
    var cards = document.querySelectorAll('[data-pick]');
    var quicks = document.querySelectorAll('.m-quick');
    var tocLinks = document.querySelectorAll('.m-toc a[href^="#"]');

    function show(role, fromUser) {
        var guided = role !== 'all';
        document.body.classList.toggle('m-guided', guided);
        for (var i = 0; i < chapters.length; i++) {
            var r = chapters[i].getAttribute('data-role');
            var ok = !guided || r === '*' || r.split(' ').indexOf(role) >= 0;
            chapters[i].hidden = !ok;
        }
        for (var q = 0; q < quicks.length; q++) quicks[q].hidden = quicks[q].getAttribute('data-for') !== role;
        for (var c = 0; c < cards.length; c++) cards[c].classList.toggle('is-on', cards[c].getAttribute('data-pick') === role);
        for (var t = 0; t < tocLinks.length; t++) {
            var target = document.getElementById(tocLinks[t].getAttribute('href').slice(1));
            if (tocLinks[t].parentNode) tocLinks[t].parentNode.hidden = !!(target && target.hidden);
        }
        try {
            var u = new URL(location.href);
            if (guided) u.searchParams.set('role', role); else u.searchParams.delete('role');
            history.replaceState(null, '', u.pathname + u.search + u.hash);
        } catch (e) { /* 網址列改不了就算了 */ }
        if (fromUser && guided) {
            var first = document.querySelector('.m-quick:not([hidden])');
            if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('[data-pick]') : null;
        if (el) show(el.getAttribute('data-pick'), true);
    });

    var want = '';
    try { want = new URL(location.href).searchParams.get('role') || ''; } catch (e) { /* 舊瀏覽器 */ }
    if (ROLES.indexOf(want) >= 0) show(want, false);
    else if (location.hash && document.getElementById(location.hash.slice(1))) show('all', false);
    else {
        // 第一次進來：先只給「你是誰」，章節收起來，選了再展開
        document.body.classList.add('m-guided', 'm-nopick');
        for (var i = 0; i < chapters.length; i++) chapters[i].hidden = true;
        for (var q = 0; q < quicks.length; q++) quicks[q].hidden = true;
        for (var t = 0; t < tocLinks.length; t++) if (tocLinks[t].parentNode) tocLinks[t].parentNode.hidden = true;
        var onPick = function (e) {
            if (e.target.closest && e.target.closest('[data-pick]')) {
                document.body.classList.remove('m-nopick');
                document.removeEventListener('click', onPick, true);
            }
        };
        document.addEventListener('click', onPick, true);
    }
})();
