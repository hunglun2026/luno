// 配分（2026-11-16）：把「總分」分配到每一題。純函式，不碰 DOM；介面在 teacher-preview.js 的「配分設定」。
// mode：even 平均、ramp 後面的題目加重（1～2 倍）、typed 非選擇題算 2 倍（選擇題 1 倍）。
// 每題都是整數且至少 1 分（總分夠的話），加起來剛好等於總分：先照權重取整，剩下的分數依小數大到小補給各題。
function lqSpreadScores(items, total, mode) {
    var n = items.length, t = Math.floor(Number(total));
    if (!n || !(t > 0)) return [];
    var w = items.map(function (q, i) {
        if (mode === 'ramp') return n === 1 ? 1 : 1 + i / (n - 1);
        if (mode === 'typed') return (typeof qKind === 'function' && qKind(q) !== 'choice') ? 2 : 1;
        return 1;
    });
    var sum = w.reduce(function (a, b) { return a + b; }, 0);
    var minEach = t >= n ? 1 : 0;
    var pool = t - minEach * n;
    var raw = w.map(function (x) { return pool * x / sum; });
    var out = raw.map(function (r) { return minEach + Math.floor(r); });
    var left = t - out.reduce(function (a, b) { return a + b; }, 0);
    var order = raw.map(function (r, i) { return i; }).sort(function (a, b) {
        return (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])) || b - a;
    });
    for (var k = 0; k < left; k++) out[order[k % n]]++;
    return out;
}
function lqTotalScore(items) {
    return items.reduce(function (a, q) { return a + (Number(q.s) || 0); }, 0);
}
