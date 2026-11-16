// 刻度｜家長設定獎勵（2026-11-16）：達到幾分就有什麼獎勵。
// 家長在「給孩子寫」視窗設定（最多 3 條），存在這台裝置（localStorage lun_parent_rewards）下次自動帶出。
// 兩條路徑都會用到：發送測驗給孩子（獎勵跟著分享存到伺服器，孩子交卷看到分數後出現獎勵卡）、
// 直接拿手機給孩子寫（獎勵留在本機，孩子只看到「已交卷」，家長解鎖時才看到達成了什麼）。
// 純函式（lqRewardsClean、lqRewardPick）不碰 DOM，測試在 worker/test/frontend-rewards.test.js。
// 依賴：common.js（escapeHtml）

var LQ_REWARD_KEY = 'lun_parent_rewards';
var LQ_REWARD_DEFAULTS = [
    { min: 90, text: '看 30 分鐘卡通' },
    { min: 80, text: '週末選一部電影' },
    { min: 60, text: '睡前多聽一個故事' }
];

// 清理：最多 3 條、門檻 0～100 整數、文字去頭尾空白限 30 字、沒文字的丟掉，依門檻由高到低排
function lqRewardsClean(list) {
    var out = [];
    (Array.isArray(list) ? list : []).slice(0, 3).forEach(function (r) {
        var min = Math.round(Number(r && r.min));
        var text = String((r && r.text) || '').trim().slice(0, 30);
        if (!isFinite(min) || !text) return;
        out.push({ min: Math.max(0, Math.min(100, min)), text: text });
    });
    return out.sort(function (a, b) { return b.min - a.min; });
}

// 這個百分比拿到哪一條：門檻 ≤ 得分的裡面最高的那一條；都沒達到回 null
function lqRewardPick(rewards, pct) {
    var best = null;
    lqRewardsClean(rewards).forEach(function (r) {
        if (pct >= r.min && (!best || r.min > best.min)) best = r;
    });
    return best;
}

// 下一個目標：還沒達到的門檻裡最低的（用來鼓勵「再 N 分就有 …」）
function lqRewardNext(rewards, pct) {
    var next = null;
    lqRewardsClean(rewards).forEach(function (r) {
        if (pct < r.min && (!next || r.min < next.min)) next = r;
    });
    return next;
}

function lqRewardsLoad() {
    try {
        var raw = JSON.parse(localStorage.getItem(LQ_REWARD_KEY) || 'null');
        if (raw && Array.isArray(raw.list)) return { on: !!raw.on, list: raw.list.slice(0, 3) };
    } catch (e) { }
    return { on: false, list: LQ_REWARD_DEFAULTS.map(function (r) { return { min: r.min, text: r.text }; }) };
}
function lqRewardsSave(on, list) {
    try { localStorage.setItem(LQ_REWARD_KEY, JSON.stringify({ on: !!on, list: list })); } catch (e) { }
}

// 孩子看到的獎勵卡（連結作答，交卷後有分數時）
function lqRewardCardHtml(rewards, pct) {
    var got = lqRewardPick(rewards, pct);
    var next = lqRewardNext(rewards, pct);
    if (got) {
        return "<div class='lq-reward is-got'><div class='lq-reward-title'>🎁 爸媽的獎勵</div>" +
            "<div class='lq-reward-text'>" + escapeHtml(got.text) + "</div>" +
            "<div class='lq-reward-sub'>你得了 " + pct + " 分，達到 " + got.min + " 分的目標，太棒了！</div></div>";
    }
    if (next) {
        return "<div class='lq-reward'><div class='lq-reward-title'>🎯 下次的目標</div>" +
            "<div class='lq-reward-text'>" + next.min + " 分就有：" + escapeHtml(next.text) + "</div>" +
            "<div class='lq-reward-sub'>這次 " + pct + " 分，再加油一點就到了</div></div>";
    }
    return '';
}

// 家長在「給孩子寫」視窗看到的設定區（預設收合；打開開關才套用）
function lqRewardEditorHtml() {
    var st = lqRewardsLoad();
    var rows = st.list.map(function (r, i) {
        return "<div class='lq-reward-row'><span>≥</span><input type='number' min='0' max='100' inputmode='numeric' class='lq-rw-min' value='" + escapeHtml(String(r.min)) + "' aria-label='第 " + (i + 1) + " 條門檻分數'><span>分</span>" +
            "<input type='text' maxlength='30' class='lq-rw-text' value='" + escapeHtml(r.text) + "' placeholder='獎勵內容' aria-label='第 " + (i + 1) + " 條獎勵'></div>";
    }).join('');
    return "<details class='lq-reward-edit'" + (st.on ? " open" : "") + "><summary>🎁 設定獎勵（選填）</summary>" +
        "<label class='lq-reward-on'><input type='checkbox' id='lqRwOn'" + (st.on ? " checked" : "") + "> 這次要給孩子獎勵</label>" +
        "<div class='text-xs text-gray-500'>達到分數就有獎勵，取最高的一條。不想設的那一列把獎勵內容清空就好。</div>" + rows + "</details>";
}

// 從視窗讀出目前設定並存起來；回傳清理後要送出的獎勵陣列（沒打開開關就是空陣列）
function lqRewardsReadEditor(root) {
    var on = root.querySelector('#lqRwOn');
    if (!on) return [];
    var list = Array.prototype.map.call(root.querySelectorAll('.lq-reward-row'), function (row) {
        return { min: row.querySelector('.lq-rw-min').value, text: row.querySelector('.lq-rw-text').value };
    });
    lqRewardsSave(on.checked, list);
    return on.checked ? lqRewardsClean(list) : [];
}
