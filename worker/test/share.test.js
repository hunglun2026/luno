import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { makeEnv, req, registerUser } from "./helpers.js";

const call = (env, path, opts) => worker.fetch(req(path, opts), env, {});
const items = (n = 2) => Array.from({ length: n }, (_, i) => ({ q: "第 " + i + " 題", o: ["甲", "乙"], a: "A", e: "解析", s: 5 }));

describe("分享測驗 /api/share", () => {
  it("沒有題目回 400；非 POST 回 405", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/share", { method: "POST", body: { items: [] } })).status).toBe(400);
    expect((await call(env, "/api/share", { method: "PUT" })).status).toBe(405);
  });
  it("建立後可用 id 取回，且另發一把只有出題者拿得到的 dashKey（不會出現在公開內容）", async () => {
    const env = makeEnv();
    const r = await call(env, "/api/share", { method: "POST", body: { items: items(), title: "小考" } });
    const { id, dashKey } = await r.json();
    expect(id).toMatch(/^[a-f0-9]{12}$/);
    expect(dashKey).toHaveLength(16);
    const got = await call(env, "/api/share/" + id);
    const text = await got.text();
    expect(got.status).toBe(200);
    expect(JSON.parse(text).title).toBe("小考");
    expect(text).not.toContain(dashKey);
  });
  it("找不到的 id 回 404", async () => {
    expect((await call(makeEnv(), "/api/share/doesnotexist")).status).toBe(404);
  });
  it("沒登入超過 120KB 被擋；登入的老師放寬到 700KB；學生仍被擋", async () => {
    const env = makeEnv();
    const big = [{ q: "x".repeat(200 * 1024), o: [], a: "", e: "", s: 1 }];
    expect((await call(env, "/api/share", { method: "POST", body: { items: big } })).status).toBe(400);
    const teacher = await registerUser(worker, env);
    const ok = await call(env, "/api/share", { method: "POST", body: { items: big }, headers: { "X-Session-Token": teacher.token } });
    expect(ok.status).toBe(200);
    const student = await registerUser(worker, env, { username: "stu1", role: "student", className: undefined });
    const no = await call(env, "/api/share", { method: "POST", body: { items: big }, headers: { "X-Session-Token": student.token } });
    expect(no.status).toBe(400);
    const huge = [{ q: "x".repeat(800 * 1024), o: [], a: "", e: "", s: 1 }];
    expect((await call(env, "/api/share", { method: "POST", body: { items: huge }, headers: { "X-Session-Token": teacher.token } })).status).toBe(400);
  });
  it("壞掉的 JSON 回 500 而不是整個掛掉", async () => {
    const r = await call(makeEnv(), "/api/share", { method: "POST", body: "{壞掉" });
    expect(r.status).toBe(500);
  });
});

describe("測驗代碼 /api/code", () => {
  it("要登入；分享不存在回 404；同一份重複產生沿用同一組", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/code", { method: "POST", body: { shareId: "x" } })).status).toBe(401);
    const teacher = await registerUser(worker, env);
    const h = { "X-Session-Token": teacher.token };
    expect((await call(env, "/api/code", { method: "POST", body: { shareId: "nope" }, headers: h })).status).toBe(404);
    expect((await call(env, "/api/code", { method: "POST", body: {}, headers: h })).status).toBe(400);
    const { id } = await (await call(env, "/api/share", { method: "POST", body: { items: items() } })).json();
    const c1 = await (await call(env, "/api/code", { method: "POST", body: { shareId: id }, headers: h })).json();
    const c2 = await (await call(env, "/api/code", { method: "POST", body: { shareId: id }, headers: h })).json();
    expect(c1.code).toMatch(/^[1-9]\d{5}$/);
    expect(c2.code).toBe(c1.code);
    const found = await call(env, "/api/code/" + c1.code);
    expect((await found.json()).shareId).toBe(id);
  });
  it("代碼格式不對回 400，查無回 404", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/code/12345")).status).toBe(400);
    expect((await call(env, "/api/code/999999")).status).toBe(404);
  });
});

describe("作答結果 /api/result", () => {
  const body = { title: "小考", studentInfo: { name: "小明", seat: "7" }, totalScore: 8, maxScore: 10, pct: 80, details: [{ i: 1 }] };
  it("建立與取回；姓名等欄位被截短在上限內", async () => {
    const env = makeEnv();
    const r = await call(env, "/api/result", { method: "POST", body: { ...body, studentInfo: { name: "名".repeat(200) } } });
    const { id } = await r.json();
    const got = await (await call(env, "/api/result/" + id)).json();
    expect(got.studentInfo.name).toHaveLength(50);
    expect(got.pct).toBe(80);
  });
  it("沒有 details 回 400、太大回 400、找不到回 404、非 POST 回 405", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/result", { method: "POST", body: { title: "x" } })).status).toBe(400);
    expect((await call(env, "/api/result", { method: "POST", body: { details: [{ t: "x".repeat(400 * 1024) }] } })).status).toBe(400);
    expect((await call(env, "/api/result/nope")).status).toBe(404);
    expect((await call(env, "/api/result", { method: "PUT" })).status).toBe(405);
  });
});

describe("其他端點", () => {
  it("OPTIONS 預檢帶 CORS 標頭", async () => {
    for (const p of ["/api/share", "/api/result", "/api/visit", "/api/code/123456"]) {
      const r = await call(makeEnv(), p, { method: "OPTIONS" });
      expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });
  it("人次：同一個 IP 同一天只算一次", async () => {
    const env = makeEnv();
    const h = { "CF-Connecting-IP": "1.2.3.4" };
    expect((await (await call(env, "/api/visit", { headers: h })).json()).count).toBe(1);
    expect((await (await call(env, "/api/visit", { headers: h })).json()).count).toBe(1);
    expect((await (await call(env, "/api/visit", { headers: { "CF-Connecting-IP": "5.6.7.8" } })).json()).count).toBe(2);
  });
  it("管理者密碼沒設定時，任何 X-Admin-Pass 都不成立（功能停用，不是放行）", async () => {
    const env = makeEnv({ ADMIN_PASSWORD: "" });
    const r = await call(env, "/api/bank/stats", { headers: { "X-Admin-Pass": "" } });
    expect(r.status).toBe(403);
    const r2 = await call(env, "/api/bank/stats", { headers: { "X-Admin-Pass": "undefined" } });
    expect(r2.status).toBe(403);
  });
  it("管理者密碼錯回 403，對才放行", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/bank/stats", { headers: { "X-Admin-Pass": "wrong" } })).status).toBe(403);
    expect((await call(env, "/api/bank/stats", { headers: { "X-Admin-Pass": "admin-pass" } })).status).toBe(200);
  });
  it("沒登入不能列出帳號、不能進超級管理員後台", async () => {
    const env = makeEnv();
    expect((await call(env, "/api/admin/users")).status).toBe(401);
    const teacher = await registerUser(worker, env);
    expect((await call(env, "/api/admin/users", { headers: { "X-Session-Token": teacher.token } })).status).toBe(401);
  });
});
