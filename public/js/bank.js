// 刻度｜題庫前端（2026-11-03）。目前只有第一步「出題成功後把選擇題偷偷送進題庫」，使用者看不到任何變化。
// 後端在 worker/src/bank.js：伺服器會重新檢查格式，再另叫一次 AI 獨立作答比對，一致才算可用。
// 之後的抽題、回報有誤、答對率下架（第二步）也會放在這個檔。
//
// 只送「純靠年級科目範圍出的題」：老師上傳課本或講義（sType 2）出的題有版權疑慮，不送。
// 送出失敗一律靜默略過：題庫是附加功能，不能影響出題與作答。

        // cfg 是 generate.js 的 readGenForm() 結果；items 是出題後通過 vetItems 的題目
        function submitToBank(cfg, items) {
            try {
                if (!cfg || cfg.sType !== '1' || cfg.contentText) return;
                const withOptions = (items || []).filter(function (q) { return q && Array.isArray(q.o) && q.o.length > 0; });
                if (withOptions.length === 0) return;
                fetch(API_BASE + '/api/bank/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
                    body: JSON.stringify({
                        meta: { sType: '1', grade: cfg.grade, subject: cfg.subject, publisher: cfg.publisher, scope: cfg.scope, difficulty: cfg.diffVal, lang: cfg.langVal },
                        items: withOptions.map(function (q) { return { q: q.q, o: q.o, a: q.a, e: q.e }; })
                    })
                }).catch(function () {});
            } catch (e) { /* 題庫失敗不影響出題 */ }
        }
