// 鴻綸 刻度｜共用小工具：API 網址、跳脫、帳密規則。登入頁（login.html）與 App（app.html）都要用，
// 所以從 core.js 拆出來，載入順序要在 core.js 之前（2026-11-05 改成多頁式時拆出）

        // 部署後端 Worker 後，請把這裡換成實際的 Worker 網址
        // 例：https://linquiz-api.<你的subdomain>.workers.dev
const API_BASE = "https://luno-api.hunglun.com";
// 《個人資料蒐集告知》版本日期，要跟 privacy.html 頂部的版本一致；註冊時送給後端存起來
const PRIVACY_VERSION = '2026-11-05';

        // 題目內容(q.q/q.o/q.a/q.e)來自AI回傳,分享題目(/api/share)又是任何人都能未經驗證寫入的公開端點,
        // 所以在用innerHTML插入畫面前一律要escape,避免惡意分享連結在別人瀏覽器裡跑出XSS
        function escapeHtml(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // 帳號密碼規則（Steve 2026-11-03，跟 worker 的 credentialError 一致）：
        // 最多 16 字，只能英文、數字和半形符號（不可中文、空白），不分大小寫（後端一律轉小寫存）。
        // 只用在「註冊／管理員建帳號／重設密碼」。登入欄不套用：舊帳號可能有中文或更長的名稱
        const CRED_MAX_LEN = 16;
        const CRED_INPUT_ATTRS = " maxlength='16' autocapitalize='off' autocomplete='off' spellcheck='false' oninput='lqCredFilter(this)'";
        const CRED_USER_HINT = "帳號（英數符號，最多16字）";
        const CRED_PASS_HINT = "密碼（6～16字，不分大小寫）";
        function lqCredFilter(el) {
            el.value = el.value.replace(/[^!-~]/g, '').slice(0, CRED_MAX_LEN);
        }
        // 回傳錯誤訊息，通過回 ''；username 傳 null 代表只檢查密碼（重設密碼用）
        function credentialInputError(username, password) {
            const ok = /^[!-~]+$/;
            if (username !== null) {
                if (!username) return '請輸入帳號';
                if (username.length > CRED_MAX_LEN) return '帳號最多 ' + CRED_MAX_LEN + ' 個字';
                if (!ok.test(username)) return '帳號只能用英文、數字和符號，不能有中文或空白';
            }
            if (password.length < 6) return '密碼至少需要6碼';
            if (password.length > CRED_MAX_LEN) return '密碼最多 ' + CRED_MAX_LEN + ' 個字';
            if (!ok.test(password)) return '密碼只能用英文、數字和符號，不能有中文或空白';
            return '';
        }

        // 把值放進 onclick="fn(...)" 的參數：escapeHtml 不夠用，因為屬性值會先被瀏覽器還原（&#39; 變回 '）才當 JS 執行，
        // 惡意值就能跳出字串。這裡先轉成 JSON 字串字面值（引號、反斜線、換行都跳脫），再整段 escapeHtml 放進屬性
        function jsArg(v) {
            return escapeHtml(JSON.stringify(String(v == null ? '' : v)));
        }


        // 登入憑證（2026-11-05）：每個分頁各自一份，同一台電腦同一個瀏覽器可以同時登入不同帳號
        // （例：一個分頁當老師出題，另一個分頁當學生作答），互不覆蓋。
        // - 分頁自己的登入放 sessionStorage（重新整理不會掉；空字串代表「這個分頁已登出」）
        // - localStorage 只記「最後一次登入」，給沒有自己登入過的新分頁當預設
        const LQ_TOKEN_KEY = 'lun_session_token';
        function lqGetToken() {
            try {
                const s = sessionStorage.getItem(LQ_TOKEN_KEY);
                if (s !== null) return s;
                return localStorage.getItem(LQ_TOKEN_KEY) || '';
            } catch (e) { return ''; }
        }
        function lqSetToken(t) {
            try { sessionStorage.setItem(LQ_TOKEN_KEY, t); } catch (e) {}
            try { localStorage.setItem(LQ_TOKEN_KEY, t); } catch (e) {}
        }
        function lqClearToken() {
            try {
                const mine = lqGetToken();
                sessionStorage.setItem(LQ_TOKEN_KEY, '');
                if (localStorage.getItem(LQ_TOKEN_KEY) === mine) localStorage.removeItem(LQ_TOKEN_KEY);
            } catch (e) {}
        }
