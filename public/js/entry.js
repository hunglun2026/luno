// 鴻綸 刻度｜App 進場輔助：API Key 欄位收合、老師自己測試線上作答、回到選身分頁。
// 2026-11-05 改成多頁式：原本這裡的身分選擇與登入表單已搬到 start.html／login.html（js/start.js、js/login.js）。
        function showApiKeyBox() {
            const keyBox = document.getElementById('apiKeyBox');
            const showLink = document.getElementById('showKeyBoxLink');
            if (keyBox) keyBox.classList.remove('hidden');
            if (showLink) showLink.classList.add('hidden');
            const keyInput = document.getElementById('userKey');
            if (keyInput) keyInput.focus();
        }

        // 沒有自己的 Key 時把 Key 欄位收起來，避免表單上多一塊用不到的空格，
        // 但留一條小連結讓使用者隨時可以改用自己的 Key
        function useBuiltinQuota() {
            const box = document.getElementById('apiKeyBox');
            const link = document.getElementById('showKeyBoxLink');
            if (box) box.classList.add('hidden');
            if (link) link.classList.remove('hidden');
        }

        // 頂列的「登入」與各處的「註冊保存」提示。
        // 免登入使用中（window.guestRole 有值）直接帶去該身分的登入頁，from=guest 讓登入頁知道要搬這台裝置的資料；
        // toRegister 為真時登入頁先停在註冊分頁。其餘情況回選身分頁（真的換頁，瀏覽器上一頁可以回來）
        function openIdentitySplash(toRegister) {
            const r = window.guestRole;
            const loginRole = r === 'guest' ? 'teacher' : r;   // 訪客模式出的是老師的題，註冊成老師帳號最合理
            if (loginRole === 'teacher' || loginRole === 'parent' || loginRole === 'student') {
                location.href = '/login?role=' + loginRole + '&from=guest' + (toRegister === true ? '&mode=register' : '');
                return;
            }
            location.href = '/start?switch=1';
        }

        // --- 老師自己測試「線上作答」：開一個新分頁，跟原本出題頁完全分開(不影響原畫面) ---
        async function openAnswerModeNewTab(btnEl) {
            if (!window.currentItems || window.currentItems.length === 0) {
                lqAlert('目前沒有題目可以線上作答');
                return;
            }
            const originalText = btnEl ? btnEl.innerHTML : '';
            // window.open 必須在使用者點擊當下同步呼叫，不能等fetch跑完再開，否則會被瀏覽器擋成彈出視窗
            const newTab = window.open('', '_blank');
            if (newTab) {
                newTab.document.write('<p style="font-family:sans-serif;padding:2rem;">⏳ 載入題目中...</p>');
            }
            if (btnEl) { btnEl.disabled = true; btnEl.innerText = '⏳ 準備中...'; }
            try {
                // 跟分享連結/儀表板共用同一個shareId，老師才看得到自己測試的這份進度
                const shareId = await getOrCreateShareId();
                const url = location.origin + location.pathname + "?share=" + shareId + "&mode=student";
                if (newTab) {
                    newTab.location.href = url;
                } else {
                    window.open(url, '_blank');
                }
            } catch (e) {
                if (newTab) newTab.close();
                lqAlert('開啟線上作答分頁失敗: ' + e.message);
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = originalText; }
            }
        }

