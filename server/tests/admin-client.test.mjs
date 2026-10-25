import { test } from "node:test";
import assert from "node:assert/strict";
import { contentId } from "../../src/admin/contentId.ts";
import { ApiError, request } from "../../src/admin/api.ts";

test("all admin content types can receive unique IDs without secure-context randomUUID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues } });
  try {
    const ids = new Set();
    for (const prefix of ["poster", "banner", "contact", "content"]) {
      for (let i = 0; i < 50; i++) {
        const id = contentId(prefix);
        assert.match(id, new RegExp("^" + prefix + "-[a-f0-9]{32}$"));
        assert.equal(ids.has(id), false);
        ids.add(id);
      }
    }
    assert.equal(ids.size, 200);
  } finally { Object.defineProperty(globalThis, "crypto", descriptor); }
});

test("admin requests show readable errors for HTML fallback and malformed JSON", async t => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const response of [
    new Response("<!doctype html><title>Static site</title>", { headers: { "Content-Type": "text/html" } }),
    new Response("{", { headers: { "Content-Type": "application/json" } }),
    new Response("null", { headers: { "Content-Type": "application/json" } }),
  ]) {
    fetch.mock.mockImplementationOnce(async () => response);
    await assert.rejects(request("session"), error => error instanceof ApiError && /后台/.test(error.message));
  }
});

test("admin request errors preserve the server response and HTTP status", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "内容已在其他窗口修改，请重新加载后编辑。" }, { status: 409 }));
  await assert.rejects(request("content"), error => error instanceof ApiError && error.status === 409 && /其他窗口/.test(error.message));
});
