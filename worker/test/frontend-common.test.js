// 前端共用小工具（public/js/common.js）的測試：跳脫、帳密規則、附圖白名單、分頁登入憑證。
// 檔案不是模組，用 vm 載入；前端與後端帳密規則要一致，所以也拿同一批輸入打後端註冊對照。
import { describe, it, expect, beforeEach } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import worker from "../src/index.js";
import { makeEnv, req } from "./helpers.js";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "js", "common.js"), "utf8");

function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function load() {
  const sandbox = { sessionStorage: makeStorage(), localStorage: makeStorage() };
  const api = vm.runInNewContext(SRC + "\n;({ escapeHtml, jsArg, credentialInputError, qImgHtml, qImgOk, lqCredFilter, lqGetToken, lqSetToken, lqClearToken, PRIVACY_VERSION, API_BASE })", sandbox);
  return { api, sandbox };
}

describe("跳脫 escapeHtml / jsArg（防 XSS）", () => {
  const { api } = load();
  it("五個危險字元都轉掉，null 變空字串", () => {
    expect(api.escapeHtml("<script>alert('x')</script>&\"")).toBe("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;");
    expect(api.escapeHtml(null)).toBe("");
    expect(api.escapeHtml(123)).toBe("123");
  });
  it("jsArg：跳出字串的攻擊字串，放進 onclick 屬性後仍是單一個字串引數", () => {
    const evil = "');alert(1);//";
    const attr = api.jsArg(evil);
    // 模擬瀏覽器：屬性值先被還原，再當 JS 執行
    const decoded = attr.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    let called = 0;
    const got = vm.runInNewContext("f(" + decoded + ")", { f: (x) => { called++; return x; }, alert: () => { called += 100; } });
    expect(got).toBe(evil);
    expect(called).toBe(1);
  });
});

describe("題目附圖白名單 qImgHtml", () => {
  const { api } = load();
  it("只收 JPEG data URL", () => {
    expect(api.qImgHtml({ img: "data:image/jpeg;base64,/9j/4AAQ=" })).toContain("<img");
    for (const img of ["javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "https://evil.test/x.jpg", "data:image/jpeg;base64,AA'onerror='x", 5, null]) {
      expect(api.qImgHtml({ img })).toBe("");
    }
    expect(api.qImgHtml(null)).toBe("");
  });
  it("太大的圖不顯示", () => {
    expect(api.qImgOk({ img: "data:image/jpeg;base64," + "A".repeat(200000) })).toBe(false);
  });
});

describe("帳號密碼規則 credentialInputError", () => {
  const { api } = load();
  it("各種不合格情況", () => {
    expect(api.credentialInputError("", "abc123")).toBe("請輸入帳號");
    expect(api.credentialInputError("a".repeat(17), "abc123")).toMatch(/最多 16/);
    expect(api.credentialInputError("王小明", "abc123")).toMatch(/不能有中文/);
    expect(api.credentialInputError("abc", "12345")).toMatch(/至少需要6碼/);
    expect(api.credentialInputError("abc", "a".repeat(17))).toMatch(/最多 16/);
    expect(api.credentialInputError("abc", "密碼密碼密碼密碼")).toMatch(/不能有中文/);
    expect(api.credentialInputError("abc", "abc123")).toBe("");
  });
  it("username 傳 null 代表只檢查密碼（重設密碼用）", () => {
    expect(api.credentialInputError(null, "abc")).toMatch(/至少/);
    expect(api.credentialInputError(null, "abc123")).toBe("");
  });
  it("輸入欄過濾：拿掉中文與空白，截到 16 字", () => {
    const el = { value: "a b王c" + "x".repeat(30) };
    api.lqCredFilter(el);
    expect(el.value).toBe(("abc" + "x".repeat(30)).slice(0, 16));
  });
  it("前端和後端對同一批帳密的判斷一致（改規則要兩邊一起改）", async () => {
    const cases = [["abc", "abc123"], ["a".repeat(17), "abc123"], ["王小明", "abc123"], ["a b", "abc123"], ["abc", "12345"], ["abc", "a".repeat(17)], ["abc", "密碼密碼密碼密碼"], ["Abc_1", "Pass#99"]];
    for (const [u, p] of cases) {
      const front = api.credentialInputError(u.toLowerCase(), p.toLowerCase()) === "";
      const r = await worker.fetch(req("/api/auth/register", { method: "POST", body: { username: u, password: p, role: "student", privacyVersion: "2026-11-05" } }), makeEnv(), {});
      expect(r.status === 200, `${u} / ${p}`).toBe(front);
    }
  });
});

describe("分頁各自的登入憑證", () => {
  let ctx;
  beforeEach(() => { ctx = load(); });
  it("沒登入回空字串；登入後存兩邊；登出後本分頁讀到空字串", () => {
    expect(ctx.api.lqGetToken()).toBe("");
    ctx.api.lqSetToken("tok1");
    expect(ctx.api.lqGetToken()).toBe("tok1");
    expect(ctx.sandbox.localStorage.getItem("lun_session_token")).toBe("tok1");
    ctx.api.lqClearToken();
    expect(ctx.api.lqGetToken()).toBe("");
    expect(ctx.sandbox.localStorage.getItem("lun_session_token")).toBeNull();
  });
  it("新分頁（沒自己的 sessionStorage）用 localStorage 的最後一次登入當預設", () => {
    ctx.sandbox.localStorage.setItem("lun_session_token", "last");
    expect(ctx.api.lqGetToken()).toBe("last");
  });
  it("這個分頁登出，不會把別的分頁的登入一起清掉", () => {
    ctx.sandbox.localStorage.setItem("lun_session_token", "other-tab");
    ctx.api.lqSetToken("mine");            // 這個分頁登入，localStorage 變成 mine
    ctx.sandbox.localStorage.setItem("lun_session_token", "other-tab");   // 別的分頁隨後登入
    ctx.api.lqClearToken();
    expect(ctx.sandbox.localStorage.getItem("lun_session_token")).toBe("other-tab");
  });
  it("儲存空間壞掉（隱私模式）不丟錯", () => {
    const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
    const api = vm.runInNewContext(SRC + "\n;({ lqGetToken, lqSetToken, lqClearToken })", { sessionStorage: broken, localStorage: broken });
    expect(api.lqGetToken()).toBe("");
    expect(() => { api.lqSetToken("a"); api.lqClearToken(); }).not.toThrow();
  });
  it("隱私告知版本日期格式正確，且跟 privacy.html 頂部一致", () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "privacy.html"), "utf8");
    expect(ctx.api.PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(html).toContain(ctx.api.PRIVACY_VERSION);
  });
});
