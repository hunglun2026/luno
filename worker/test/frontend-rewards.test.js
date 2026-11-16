// 家長獎勵純函式：public/js/rewards.js（用 vm 載入，同 frontend-scoring.test.js）。
import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const JS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js");
const stubs = `function escapeHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}`;
const api = vm.runInNewContext(stubs + readFileSync(join(JS, "rewards.js"), "utf8") + "\n;({ lqRewardsClean, lqRewardPick, lqRewardNext, lqRewardCardHtml })", {});

const R = [{ min: 60, text: "多聽故事" }, { min: 90, text: "看卡通" }, { min: 80, text: "看電影" }];

describe("lqRewardsClean", () => {
  it("依門檻由高到低排、沒文字的丟掉、最多 3 條", () => {
    const out = api.lqRewardsClean([...R, { min: 10, text: "第四條" }, { min: 70, text: "  " }]);
    expect(out.map((r) => r.min)).toEqual([90, 80, 60]);
  });
  it("門檻夾在 0～100、轉整數；文字限 30 字；不合法的丟掉", () => {
    const out = api.lqRewardsClean([{ min: 150, text: "a" }, { min: 80.6, text: "字".repeat(50) }, { min: "x", text: "c" }]);
    expect(out.map((r) => r.min)).toEqual([100, 81]);
    expect(out[1].text.length).toBe(30);
    expect(api.lqRewardsClean([{ min: -5, text: "b" }])[0].min).toBe(0);
  });
  it("不是陣列也不會壞", () => {
    expect(api.lqRewardsClean(null)).toEqual([]);
    expect(api.lqRewardsClean("x")).toEqual([]);
  });
});

describe("lqRewardPick／lqRewardNext", () => {
  it("取達到的最高一條", () => {
    expect(api.lqRewardPick(R, 95).text).toBe("看卡通");
    expect(api.lqRewardPick(R, 90).text).toBe("看卡通");
    expect(api.lqRewardPick(R, 85).text).toBe("看電影");
    expect(api.lqRewardPick(R, 60).text).toBe("多聽故事");
  });
  it("沒達到任何一條回 null；沒設獎勵回 null", () => {
    expect(api.lqRewardPick(R, 59)).toBe(null);
    expect(api.lqRewardPick([], 100)).toBe(null);
  });
  it("下一個目標是還沒達到的最低門檻", () => {
    expect(api.lqRewardNext(R, 50).min).toBe(60);
    expect(api.lqRewardNext(R, 75).min).toBe(80);
    expect(api.lqRewardNext(R, 95)).toBe(null);
  });
});

describe("lqRewardCardHtml", () => {
  it("達到：顯示獎勵與分數；文字會跳脫，不能塞 HTML", () => {
    const html = api.lqRewardCardHtml([{ min: 80, text: "<img src=x onerror=alert(1)>" }], 85);
    expect(html).toContain("is-got");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).toContain("85 分");
  });
  it("沒達到：顯示下次目標；全沒設定：不顯示卡片", () => {
    expect(api.lqRewardCardHtml(R, 50)).toContain("下次的目標");
    expect(api.lqRewardCardHtml([], 50)).toBe("");
  });
});
