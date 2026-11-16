// key 輪流：keypool.js。連續請求要依序換 key，不能連續撞同一把。
import { describe, it, expect, beforeEach } from "vitest";
import { nextKeyStart, _resetKeyCounter, KeyCounter } from "../src/keypool.js";

beforeEach(() => _resetKeyCounter());

describe("nextKeyStart（本機退路）", () => {
  it("連續 27 次請求，每把 key 剛好被當起點 3 次（9 把輪流）", async () => {
    const hits = new Array(9).fill(0);
    for (let i = 0; i < 27; i++) hits[await nextKeyStart(9)]++;
    expect(hits).toEqual(new Array(9).fill(3));
  });
  it("相鄰兩次請求不會是同一把", async () => {
    let prev = await nextKeyStart(19);
    for (let i = 0; i < 100; i++) { const cur = await nextKeyStart(19); expect(cur).not.toBe(prev); prev = cur; }
  });
  it("只有一把或沒有 key 不會壞", async () => {
    expect(await nextKeyStart(1)).toBe(0);
    expect(await nextKeyStart(0)).toBe(0);
  });
});

describe("Durable Object 計數器", () => {
  const fakeDO = () => {
    let n = 0;
    return { idFromName: () => "id", get: () => ({ fetch: async () => new Response(String(n++)) }) };
  };
  it("有綁 KEY_COUNTER：以全域計數為準，依序換 key", async () => {
    const env = { KEY_COUNTER: fakeDO() };
    const got = [];
    for (let i = 0; i < 6; i++) got.push(await nextKeyStart(3, env));
    expect(got).toEqual([0, 1, 2, 0, 1, 2]);
  });
  it("Durable Object 連不上：退回本機輪流，不丟錯", async () => {
    const env = { KEY_COUNTER: { idFromName: () => "id", get: () => ({ fetch: async () => { throw new Error("down"); } }) } };
    const a = await nextKeyStart(5, env);
    const b = await nextKeyStart(5, env);
    expect(a).not.toBe(b);
  });
  it("KeyCounter 類別每次回傳遞增的數字", async () => {
    const store = new Map();
    const dobj = new KeyCounter({ storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v) } });
    const out = [];
    for (let i = 0; i < 3; i++) out.push(await (await dobj.fetch()).text());
    expect(out).toEqual(["0", "1", "2"]);
  });
  it("/peek 只看數字、不會讓計數往前走", async () => {
    const store = new Map();
    const dobj = new KeyCounter({ storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v) } });
    await dobj.fetch(new Request("https://key-counter/next"));
    const a = await (await dobj.fetch(new Request("https://key-counter/peek"))).text();
    const b = await (await dobj.fetch(new Request("https://key-counter/peek"))).text();
    expect([a, b]).toEqual(["1", "1"]);
  });
  it("peekKeyCounter：沒綁回 null；有綁回目前數字", async () => {
    const { peekKeyCounter } = await import("../src/keypool.js");
    expect(await peekKeyCounter({})).toBe(null);
    const env = { KEY_COUNTER: { idFromName: () => "id", get: () => ({ fetch: async () => new Response("7") }) } };
    expect(await peekKeyCounter(env)).toBe(7);
  });
});
