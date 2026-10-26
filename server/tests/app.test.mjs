import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../app.mjs";
import { setPassword } from "../auth.mjs";
import { atomicWrite, createStore } from "../store.mjs";
import { parseCatalog } from "../../src/catalog.ts";
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
test("public homepage exposes the requested basic poster and admin API requires authentication", async () => {
  const r = await call("/catalog.json"); assert.equal(r.status, 200); assert.match(r.headers.get("cache-control"), /no-store/);
  const data = await r.json(); assert.equal(data.entries.length, 3); assert.ok(data.entries.every(e => e.category === "basic"));
  assert.equal(new Set(data.entries.map(e => e.image.objectKey)).size, 1);
  assert.equal(data.entries[0].image.objectKey, "images/2a9bfad6-6e9a-4911-abf2-ff72ff8497dc.jpg"); assert.deepEqual(data.contacts, []);
  for (const [url, method] of [["/api/admin/content", "GET"], ["/api/admin/content", "PUT"], ["/api/admin/upload", "POST"]]) assert.equal((await call(url, method)).status, 401);
  assert.equal((await call("/admin.json")).status, 404);
});
test("login rejects cross-origin and wrong passwords, sets a protected cookie", async () => {
  assert.equal((await call("/api/admin/login", "POST", { password }, { origin: "https://example.org" })).status, 403);
  assert.equal((await call("/api/admin/login", "POST", { password: "incorrect-password" })).status, 401);
  const r = await call("/api/admin/login", "POST", { password }, { "x-forwarded-proto": "https" });
  assert.equal(r.status, 200); const raw = r.headers.get("set-cookie"); assert.match(raw, /HttpOnly/); assert.match(raw, /SameSite=Strict/); assert.match(raw, /Secure/);
  cookie = raw.split(";")[0]; csrf = (await r.json()).csrf; assert.ok(csrf);
  const session = await (await call("/api/admin/session")).json(); assert.equal(session.authenticated, true); assert.equal(session.csrf, csrf); assert.equal(session.benefitImages, true); assert.equal(session.ownerRightsImages, true);
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
test("poster descriptions publish separately from image alt text and reject invalid content", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const alt = saved.catalog.entries[0].image.alt;
  saved.catalog.entries[0].description = "用户可见的海报说明。\n支持第二行。";
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const published = await (await call("/catalog.json")).json();
  assert.equal(published.entries[0].description, "用户可见的海报说明。\n支持第二行。");
  assert.equal(published.entries[0].image.alt, alt);
  for (const description of ["", "x".repeat(2001), 42]) {
    const current = await (await call("/api/admin/content")).json(); current.catalog.entries[0].description = description;
    assert.equal((await call("/api/admin/content", "PUT", current, { "x-csrf-token": csrf })).status, 400);
  }
});
test("old posters without a public description preserve their image explanation", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const legacy = structuredClone(saved.catalog); delete legacy.entries[0].description;
  const normalized = parseCatalog(legacy);
  assert.equal(normalized.entries[0].description, legacy.entries[0].image.alt);
  assert.deepEqual(normalized.entries[0].image, legacy.entries[0].image);
});
test("legacy saved catalogs keep existing content and migrate without the retired subtitle", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const legacy = structuredClone(saved.catalog);
  delete legacy.banners; delete legacy.ownerRights; legacy.subtitle = "旧版首页说明";
  const legacyDirectory = path.join(directory, "legacy");
  await atomicWrite(path.join(legacyDirectory, "catalog.json"), legacy);
  const store = createStore(legacyDirectory); const normalized = await store.snapshot();
  assert.deepEqual(normalized.catalog.entries, legacy.entries);
  assert.deepEqual(normalized.catalog.banners, []); assert.deepEqual(normalized.catalog.ownerRights, []);
  assert.equal(Object.hasOwn(normalized.catalog, "subtitle"), false);
  await store.save(normalized.catalog, normalized.revision);
  const disk = JSON.parse(await readFile(path.join(legacyDirectory, "catalog.json"), "utf8"));
  assert.equal(Object.hasOwn(disk, "subtitle"), false); assert.deepEqual(disk.entries, legacy.entries);
});
test("banners and owner rights publish independently from deposit benefits and persist", async () => {
  const saved = await (await call("/api/admin/content")).json();
  saved.catalog.banners = [{ id: "test-banner", title: "测试横幅", image: saved.catalog.entries[0].image }];
  saved.catalog.ownerRights = [{ id: "test-right", title: "测试权益", body: "仅用于测试。\n支持换行。" }];
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const published = await (await call("/catalog.json")).json();
  assert.equal(published.banners[0].title, "测试横幅");
  assert.equal(published.ownerRights[0].body, "仅用于测试。\n支持换行。");
  assert.deepEqual(published.benefits, saved.catalog.benefits);
  const disk = JSON.parse(await readFile(path.join(directory, "catalog.json"), "utf8"));
  assert.deepEqual(disk.ownerRights, published.ownerRights); assert.deepEqual(disk.banners, published.banners);
});
test("invalid banner paths, excessive slides, and incomplete rights cannot replace published content", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const cases = [structuredClone(saved), structuredClone(saved), structuredClone(saved)];
  cases[0].catalog.banners[0].image.objectKey = "../admin.json";
  cases[1].catalog.banners = Array.from({ length: 11 }, (_, i) => ({ ...saved.catalog.banners[0], id: "banner-" + i }));
  cases[2].catalog.ownerRights[0].body = "";
  for (const input of cases) assert.equal((await call("/api/admin/content", "PUT", input, { "x-csrf-token": csrf })).status, 400);
  assert.equal((await (await call("/catalog.json")).json()).banners[0].title, "测试横幅");
});
test("benefits publish text, image-only and combined content without losing uploaded images", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const image = saved.catalog.entries[0].image;
  saved.catalog.benefits = [
    { id: "text-benefit", title: "文字福利", body: "原有文字内容" },
    { id: "image-benefit", title: "福利海报", image },
    { id: "mixed-benefit", title: "图文福利", body: "第一行\n第二行", image: { ...image, extra: "strip-this" } },
  ];
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const published = await (await call("/catalog.json")).json();
  assert.deepEqual(published.benefits[0], saved.catalog.benefits[0]);
  assert.equal(published.benefits[1].body, "");
  assert.deepEqual(published.benefits[1].image, image);
  assert.deepEqual(published.benefits[2].image, image);
  const stored = await createStore(directory).snapshot();
  assert.deepEqual(stored.catalog.benefits, published.benefits);
  assert.deepEqual(stored.catalog.contacts, saved.catalog.contacts);
  assert.deepEqual(stored.catalog.ownerRights, saved.catalog.ownerRights);
});
test("benefits reject blank content and unsafe images while keeping published data", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const base = saved.catalog.benefits[1];
  const invalid = [
    { ...base, title: "" }, { ...base, image: undefined, body: "  " },
    { ...base, body: 42 }, { ...base, body: "x".repeat(15001) },
    { ...base, image: { ...base.image, objectKey: "../admin.json" } },
    { ...base, image: { ...base.image, width: 0 } },
  ];
  for (const benefit of invalid) {
    const input = structuredClone(saved); input.catalog.benefits = [benefit];
    assert.equal((await call("/api/admin/content", "PUT", input, { "x-csrf-token": csrf })).status, 400);
  }
  assert.deepEqual((await (await call("/catalog.json")).json()).benefits, saved.catalog.benefits);
});
test("removing a benefit image preserves its text and legacy text benefits stay valid", async () => {
  const saved = await (await call("/api/admin/content")).json();
  delete saved.catalog.benefits[2].image;
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const published = await (await call("/catalog.json")).json();
  assert.equal(published.benefits[2].image, undefined);
  assert.equal(published.benefits[2].body, "第一行\n第二行");
  assert.deepEqual(published.benefits[0], { id: "text-benefit", title: "文字福利", body: "原有文字内容" });
});
test("owner rights retain uploaded images and support legacy text, image-only and combined content", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const image = saved.catalog.entries[0].image;
  saved.catalog.ownerRights = [
    { id: "legacy-right", title: "文字权益", body: "原有文字说明" },
    { id: "image-right", title: "权益海报", image },
    { id: "mixed-right", title: "图文权益", body: "第一行\n第二行", image },
  ];
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const published = await (await call("/catalog.json")).json();
  assert.deepEqual(published.ownerRights[0], saved.catalog.ownerRights[0]);
  assert.equal(published.ownerRights[1].body, "");
  assert.deepEqual(published.ownerRights[1].image, image);
  assert.deepEqual(published.ownerRights[2].image, image);
  assert.deepEqual((await createStore(directory).snapshot()).catalog.ownerRights, published.ownerRights);
  assert.deepEqual(published.benefits, saved.catalog.benefits);
});
test("invalid owner images cannot replace published rights and image removal preserves text", async () => {
  const saved = await (await call("/api/admin/content")).json();
  for (const image of [{ ...saved.catalog.ownerRights[1].image, objectKey: "../admin.json" }, { ...saved.catalog.ownerRights[1].image, height: 0 }]) {
    const invalid = structuredClone(saved); invalid.catalog.ownerRights[1].image = image;
    assert.equal((await call("/api/admin/content", "PUT", invalid, { "x-csrf-token": csrf })).status, 400);
  }
  assert.deepEqual((await (await call("/catalog.json")).json()).ownerRights, saved.catalog.ownerRights);
  delete saved.catalog.ownerRights[2].image;
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const right = (await (await call("/catalog.json")).json()).ownerRights[2];
  assert.equal(right.image, undefined); assert.equal(right.body, "第一行\n第二行");
});
test("contact entries accept non-web text and retain image metadata", async () => {
  const saved = await (await call("/api/admin/content")).json();
  saved.catalog.contacts = [
    { id: "contact-text", label: "文字客服", value: "扫码添加客服", url: "微信：测试账号", image: saved.catalog.entries[0].image },
    { id: "contact-web", label: "网页客服", value: "在线咨询", url: "https://example.com/support" },
    { id: "contact-app", label: "其他信息", value: "复制使用", url: "weixin://example" },
  ];
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const published = await (await call("/catalog.json")).json();
  assert.deepEqual(published.contacts, saved.catalog.contacts);
  assert.deepEqual((await createStore(directory).snapshot()).catalog.contacts, saved.catalog.contacts);
});
test("all five managed image types publish CDN object paths and retain metadata", async () => {
  const saved = await (await call("/api/admin/content")).json();
  const image = { source: "cdn", objectKey: "images/中文 图片.jpg", width: 2500, height: 4231, alt: "CDN 图片说明" };
  for (const key of ["entries", "banners", "contacts", "benefits", "ownerRights"]) saved.catalog[key][0].image = image;
  assert.equal((await call("/api/admin/content", "PUT", saved, { "x-csrf-token": csrf })).status, 200);
  const published = await (await call("/catalog.json")).json();
  const stored = (await createStore(directory).snapshot()).catalog;
  for (const key of ["entries", "banners", "contacts", "benefits", "ownerRights"]) {
    assert.deepEqual(published[key][0].image, image);
    assert.deepEqual(stored[key][0].image, image);
  }
});
test("all five CDN image inputs reject URLs, leading slashes, traversal and query strings", async () => {
  const saved = await (await call("/api/admin/content")).json();
  for (const key of ["entries", "banners", "contacts", "benefits", "ownerRights"]) {
    for (const objectKey of ["https://img.example.com/images/a.jpg", "/images/a.jpg", "../admin.json", "images/a.jpg?signature=test"]) {
      const invalid = structuredClone(saved); invalid.catalog[key][0].image.objectKey = objectKey;
      assert.equal((await call("/api/admin/content", "PUT", invalid, { "x-csrf-token": csrf })).status, 400);
    }
  }
  assert.deepEqual((await (await call("/catalog.json")).json()), saved.catalog);
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
