import { test } from "node:test";
import assert from "node:assert/strict";
import { contentId } from "../../src/admin/contentId.ts";
import { ApiError, request } from "../../src/admin/api.ts";
import { readFile } from "node:fs/promises";
import { contactHref, parseCatalog } from "../../src/catalog.ts";
import { mergeSection, sectionDirty } from "../../src/admin/sections.ts";
import { cdnImage } from "../../src/admin/imageSource.ts";

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

test("unfinished benefit drafts cannot block saving a valid contact", async () => {
  const saved = parseCatalog(JSON.parse(await readFile(new URL("../../public/catalog.json", import.meta.url), "utf8")));
  const draft = structuredClone(saved);
  draft.benefits = [{ id: "unfinished-benefit", title: "", body: "" }];
  draft.contacts = [{ id: "new-contact", label: "测试客服", value: "扫码联系客服" }];
  assert.throws(() => parseCatalog(draft), /福利/);
  const published = parseCatalog(mergeSection(saved, draft, "contact"));
  assert.deepEqual(published.contacts, draft.contacts);
  assert.deepEqual(published.benefits, saved.benefits);
  const afterSave = mergeSection(draft, published, "contact");
  assert.deepEqual(afterSave.benefits, draft.benefits);
  assert.equal(sectionDirty("contact", afterSave, published), false);
  assert.equal(sectionDirty("benefits", afterSave, published), true);
});

test("cancel only resets the active section and home saves all three home fields", async () => {
  const saved = parseCatalog(JSON.parse(await readFile(new URL("../../public/catalog.json", import.meta.url), "utf8")));
  const draft = structuredClone(saved);
  draft.heading = "未发布标题";
  draft.contacts = [{ id: "contact-draft", label: "未发布客服", value: "草稿号码" }];
  draft.entries = [];
  const cancelled = mergeSection(draft, saved, "contact");
  assert.deepEqual(cancelled.contacts, saved.contacts);
  assert.equal(cancelled.heading, draft.heading);
  assert.deepEqual(cancelled.entries, []);
  draft.brand = "测试品牌"; draft.cdnDomain = "images.example.com";
  const home = mergeSection(saved, draft, "home");
  assert.deepEqual([home.brand, home.heading, home.cdnDomain], [draft.brand, draft.heading, draft.cdnDomain]);
  assert.deepEqual(home.entries, saved.entries);
  assert.deepEqual(home.contacts, saved.contacts);
});
test("banner publishing does not validate or publish unfinished benefit and owner drafts", async () => {
  const saved = parseCatalog(JSON.parse(await readFile(new URL("../../public/catalog.json", import.meta.url), "utf8")));
  const draft = structuredClone(saved);
  draft.benefits = [{ id: "unfinished-benefit", title: "", body: "" }];
  draft.ownerRights = [{ id: "unfinished-right", title: "", body: "" }];
  draft.banners = [{ id: "new-banner", title: "一周年店庆", image: saved.entries[0].image }];
  const published = parseCatalog(mergeSection(saved, draft, "banners"));
  assert.deepEqual(published.banners, draft.banners);
  assert.deepEqual(published.benefits, saved.benefits);
  assert.deepEqual(published.ownerRights, saved.ownerRights);
  const afterSave = mergeSection(draft, published, "banners");
  assert.deepEqual(afterSave.benefits, draft.benefits);
  assert.deepEqual(afterSave.ownerRights, draft.ownerRights);
});
test("only safe HTTP contact entries become links; other contact text stays plain", () => {
  assert.equal(contactHref("https://example.com/support"), "https://example.com/support");
  assert.equal(contactHref("  HTTP://EXAMPLE.COM/path  "), "http://example.com/path");
  for (const value of [undefined, "微信：测试账号", "weixin://example", "javascript:alert(1)", "https://user:pass@example.com"]) assert.equal(contactHref(value), undefined);
});
test("switching an uploaded image to CDN requires the new image dimensions", async () => {
  const uploaded = { source: "upload", objectKey: "11111111-1111-4111-8111-111111111111/original.webp", width: 640, height: 960, alt: "客服图片" };
  const image = cdnImage(uploaded, "images/客服图片.jpg", "备用说明");
  assert.equal(image.source, "cdn"); assert.equal(image.width, 0); assert.equal(image.height, 0);
  assert.equal(image.alt, uploaded.alt);
  assert.equal(uploaded.source, "upload"); assert.equal(uploaded.width, 640);
  const catalog = JSON.parse(await readFile(new URL("../../public/catalog.json", import.meta.url), "utf8"));
  catalog.contacts = [{ id: "cdn-contact", label: "客服", value: "扫码添加", image }];
  assert.throws(() => parseCatalog(catalog), /客服/);
  catalog.contacts[0].image = { ...image, width: 2500, height: 4231 };
  assert.deepEqual(parseCatalog(catalog).contacts[0].image, catalog.contacts[0].image);
});
test("CDN path edits reset dimensions, preserve unchanged paths and allow clearing optional images", () => {
  const image = { source: "cdn", objectKey: "images/原图.jpg", width: 2500, height: 4231, alt: "原图片说明" };
  assert.deepEqual(cdnImage(image, image.objectKey, "备用说明"), image);
  const changed = cdnImage(image, "images/新图.jpg", "备用说明");
  assert.equal(changed.width, 0); assert.equal(changed.height, 0); assert.equal(changed.alt, image.alt);
  assert.equal(cdnImage(image, "", "说明"), undefined);
  const required = cdnImage(image, "", "说明", true);
  assert.equal(required.objectKey, ""); assert.equal(required.source, "cdn");
});
