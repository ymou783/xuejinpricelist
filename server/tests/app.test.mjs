import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../app.mjs";
import { setPassword } from "../auth.mjs";
let directory, server, instance, origin, cookie, csrf, password;
async function call(url, method = "GET", body, headers = {}) {
  return fetch(origin + url, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "manual" });
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "xuejin-server-test-")); password = randomBytes(24).toString("base64url");
  await setPassword(directory, password); instance = await createApp({ directory, trustProxy: true });
  server = instance.app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); origin = "http://127.0.0.1:" + server.address().port;
});
after(async () => { instance.dispose(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
test("public homepage data is empty and admin API requires authentication", async () => {
  const r = await call("/catalog.json"); assert.equal(r.status, 200); assert.match(r.headers.get("cache-control"), /no-store/);
  const data = await r.json(); assert.deepEqual(data.entries, []); assert.deepEqual(data.contacts, []);
  for (const [url, method] of [["/api/admin/content", "GET"], ["/api/admin/content", "PUT"], ["/api/admin/upload", "POST"]]) assert.equal((await call(url, method)).status, 401);
  assert.equal((await call("/admin.json")).status, 404);
});
test("login rejects cross-origin and wrong passwords, sets a protected cookie", async () => {
  assert.equal((await call("/api/admin/login", "POST", { password }, { origin: "https://example.org" })).status, 403);
  assert.equal((await call("/api/admin/login", "POST", { password: "incorrect-password" })).status, 401);
  const r = await call("/api/admin/login", "POST", { password }, { "x-forwarded-proto": "https" });
  assert.equal(r.status, 200); const raw = r.headers.get("set-cookie"); assert.match(raw, /HttpOnly/); assert.match(raw, /SameSite=Strict/); assert.match(raw, /Secure/);
  cookie = raw.split(";")[0]; csrf = (await r.json()).csrf; assert.ok(csrf);
  const session = await (await call("/api/admin/session")).json(); assert.equal(session.authenticated, true); assert.equal(session.csrf, csrf);
});
test("publishing requires CSRF and rejects malformed content", async () => {
  const snapshot = await (await call("/api/admin/content")).json();
  assert.equal((await call("/api/admin/content", "PUT", snapshot)).status, 403);
  const bad = { ...snapshot, catalog: { ...snapshot.catalog, entries: [{ id: "broken" }] } };
  assert.equal((await call("/api/admin/content", "PUT", bad, { "x-csrf-token": csrf })).status, 400);
});
test("publish persists content, strips unknown fields, and prevents stale writes", async () => {
  const snapshot = await (await call("/api/admin/content")).json(); const catalog = { ...snapshot.catalog, heading: "测试标题", adminPassword: "must-not-be-published" };
  const r = await call("/api/admin/content", "PUT", { catalog, revision: snapshot.revision }, { "x-csrf-token": csrf }); assert.equal(r.status, 200);
  const published = await (await call("/catalog.json")).json(); assert.equal(published.heading, "测试标题"); assert.equal(published.adminPassword, undefined);
  const disk = JSON.parse(await readFile(path.join(directory, "catalog.json"), "utf8")); assert.equal(disk.heading, "测试标题");
  assert.equal((await call("/api/admin/content", "PUT", snapshot, { "x-csrf-token": csrf })).status, 409);
});
test("simultaneous writes with the same revision cannot overwrite each other", async () => {
  const s = await (await call("/api/admin/content")).json();
  const results = await Promise.all([1, 2].map(i => call("/api/admin/content", "PUT", { catalog: { ...s.catalog, heading: "并发标题" + i }, revision: s.revision }, { "x-csrf-token": csrf })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});
test("image upload decodes content, generates real WebP variants, and publishes metadata", async () => {
  const bytes = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#abcdef" } }).png().toBuffer();
  const form = new FormData(); form.append("image", new Blob([bytes], { type: "image/png" }), "../../poster.png");
  const r = await call("/api/admin/upload", "POST", form, { "x-csrf-token": csrf }); assert.equal(r.status, 201); const image = await r.json();
  assert.match(image.objectKey, /^[a-f0-9-]{36}\/original\.webp$/); assert.equal(image.width, 600); assert.equal(image.height, 900);
  const variant = await call("/uploads/" + image.objectKey.replace("original", "360")); assert.equal(variant.status, 200); assert.match(variant.headers.get("content-type"), /image\/webp/);
  const info = await sharp(Buffer.from(await variant.arrayBuffer())).metadata(); assert.equal(info.width, 360); assert.equal(info.height, 540);
  const s = await (await call("/api/admin/content")).json(); s.catalog.entries = [{ id: "test-poster", title: "测试海报", category: "basic", isNew: true, image: { ...image, alt: "测试图片" } }];
  assert.equal((await call("/api/admin/content", "PUT", s, { "x-csrf-token": csrf })).status, 200);
  assert.equal((await (await call("/catalog.json")).json()).entries[0].isNew, true);
});
test("upload rejects disguised script images and files above the size limit", async () => {
  for (const [bytes, filename] of [[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "fake.png"], [Buffer.alloc(16 * 1024 * 1024), "large.jpg"]]) {
    const form = new FormData(); form.append("image", new Blob([bytes], { type: "image/png" }), filename);
    assert.equal((await call("/api/admin/upload", "POST", form, { "x-csrf-token": csrf })).status, 400);
  }
});
test("content blocks path traversal and executable contact URLs", async () => {
  const s = await (await call("/api/admin/content")).json(); s.catalog.entries[0].image.objectKey = "../../admin.json";
  assert.equal((await call("/api/admin/content", "PUT", s, { "x-csrf-token": csrf })).status, 400);
  s.catalog.entries = []; s.catalog.contacts = [{ id: "contact", label: "客服", value: "测试", url: "javascript:alert(1)" }];
  assert.equal((await call("/api/admin/content", "PUT", s, { "x-csrf-token": csrf })).status, 400);
});
test("fresh app instances retain published content but reject previous sessions", async () => {
  const fresh = await createApp({ directory }); const other = fresh.app.listen(0, "127.0.0.1"); await new Promise(resolve => other.once("listening", resolve));
  try {
    const base = "http://127.0.0.1:" + other.address().port;
    assert.equal((await (await fetch(base + "/catalog.json")).json()).entries.length, 1);
    assert.equal((await fetch(base + "/api/admin/content", { headers: { cookie } })).status, 401);
  } finally { fresh.dispose(); await new Promise(resolve => other.close(resolve)); }
});
test("logout invalidates the session", async () => {
  assert.equal((await call("/api/admin/logout", "POST", undefined, { "x-csrf-token": csrf })).status, 200);
  assert.equal((await call("/api/admin/content")).status, 401);
});
test("repeated failed logins are rate limited", async () => {
  for (let i = 0; i < 8; i++) assert.equal((await call("/api/admin/login", "POST", { password: "incorrect-password" })).status, 401);
  assert.equal((await call("/api/admin/login", "POST", { password: "incorrect-password" })).status, 429);
});
