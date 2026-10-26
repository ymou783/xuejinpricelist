export const categories = [
  { id: "basic", title: "基础体验单" }, { id: "fun", title: "趣味单" },
  { id: "special", title: "特色趣味单" }, { id: "companion", title: "陪玩单" },
] as const;
export type CategoryId = typeof categories[number]["id"];
export type SectionId = CategoryId | "latest" | "contact" | "benefits" | "rights";
export interface ImageAsset { source: "cdn" | "upload"; objectKey: string; width: number; height: number; alt: string }
export interface Poster { id: string; title: string; description: string; category: CategoryId; isNew: boolean; image: ImageAsset }
export interface Banner { id: string; title: string; image: ImageAsset }
export interface Contact { id: string; label: string; value: string; url?: string; image?: ImageAsset }
export interface Benefit { id: string; title: string; body: string; image?: ImageAsset }
export interface Catalog { brand: string; heading: string; cdnDomain: string; entries: Poster[]; contacts: Contact[]; benefits: Benefit[]; banners: Banner[]; ownerRights: Benefit[] }
export function contactHref(value?: string): string | undefined {
  if (!value) return;
  try { const url = new URL(value.trim()); if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Plain contact text is displayed without linking. */ }
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown, max = 200): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function validId(value: unknown): value is string { return text(value, 80) && /^[a-zA-Z0-9_-]+$/.test(value); }
function image(value: unknown): value is ImageAsset {
  if (!object(value) || !["cdn", "upload"].includes(String(value.source)) || !text(value.objectKey, 600) || !text(value.alt, 500)
    || !Number.isInteger(value.width) || Number(value.width) < 1 || Number(value.width) > 30000
    || !Number.isInteger(value.height) || Number(value.height) < 1 || Number(value.height) > 30000) return false;
  if (value.objectKey.startsWith("/") || /[\\?#\x00-\x1f]/.test(value.objectKey) || value.objectKey.split("/").some(p => !p || p === "." || p === "..")) return false;
  return value.source !== "upload" || /^[a-f0-9-]{36}\/original\.webp$/.test(value.objectKey);
}
function unique(items: unknown[], check: (item: unknown) => boolean) {
  const ids = new Set(); return items.every(item => {
    if (!object(item) || !validId(item.id) || ids.has(item.id) || !check(item)) return false;
    ids.add(item.id); return true;
  });
}
function imageContent(item: unknown) {
  return object(item) && text(item.title, 100)
    && (item.body === undefined || (typeof item.body === "string" && item.body.length <= 15000))
    && (text(item.body, 15000) || item.image !== undefined)
    && (item.image === undefined || image(item.image));
}
export function parseCatalog(value: unknown): Catalog {
  if (!object(value) || !text(value.brand, 30) || !text(value.heading, 40)
    || !text(value.cdnDomain, 253) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value.cdnDomain)
    || !Array.isArray(value.entries) || value.entries.length > 200 || !Array.isArray(value.contacts) || value.contacts.length > 20
    || !Array.isArray(value.benefits) || value.benefits.length > 50) throw new Error("内容格式不正确，请检查标题、图片和必填字段。");
  // Older saved catalogs have neither field; normalize them without discarding existing content.
  const banners = value.banners ?? [];
  const ownerRights = value.ownerRights ?? [];
  if (!Array.isArray(banners) || banners.length > 10
    || !unique(banners, item => object(item) && text(item.title, 80) && image(item.image))) {
    throw new Error("轮播图信息不完整，请填写名称、图片路径、宽高与图片说明，最多添加 10 张。");
  }
  if (!Array.isArray(ownerRights) || ownerRights.length > 50 || !unique(ownerRights, imageContent)) {
    throw new Error("请填写权益标题，并添加正文或图片。");
  }
  if (!unique(value.entries, item => object(item) && text(item.title, 80) && categories.some(c => c.id === item.category)
    && typeof item.isNew === "boolean" && image(item.image)
    && (item.description === undefined || text(item.description, 2000)))) throw new Error("海报信息不完整：请填写标题、分类、图片路径、宽高与图片说明。");
  if (!unique(value.contacts, item => object(item) && text(item.label, 50) && text(item.value, 300)
    && (item.url === undefined || (text(item.url, 1500) && !/^(?:javascript|data|vbscript):/i.test(item.url.trim())
      && (!/^https?:/i.test(item.url.trim()) || contactHref(item.url) !== undefined)))
    && (item.image === undefined || image(item.image)))) throw new Error("客服信息不完整，客服链接或说明可填写文字或有效的 http/https 网址。");
  if (!unique(value.benefits, imageContent)) throw new Error("请填写福利标题，并添加正文或图片。");
  return {
    brand: value.brand, heading: value.heading, cdnDomain: value.cdnDomain,
    entries: value.entries.map((raw: unknown) => { const e = raw as Poster; return { id: e.id, title: e.title, description: e.description ?? e.image.alt, category: e.category, isNew: e.isNew, image: cleanImage(e.image) }; }),
    contacts: value.contacts.map((raw: unknown) => { const c = raw as Contact; return { id: c.id, label: c.label, value: c.value, ...(c.url ? { url: c.url } : {}), ...(c.image ? { image: cleanImage(c.image) } : {}) }; }),
    benefits: value.benefits.map((raw: unknown) => { const b = raw as Benefit; return { id: b.id, title: b.title, body: b.body ?? "", ...(b.image ? { image: cleanImage(b.image) } : {}) }; }),
    banners: banners.map((raw: unknown) => { const b = raw as Banner; return { id: b.id, title: b.title, image: cleanImage(b.image) }; }),
    ownerRights: ownerRights.map((raw: unknown) => { const b = raw as Benefit; return { id: b.id, title: b.title, body: b.body ?? "", ...(b.image ? { image: cleanImage(b.image) } : {}) }; }),
  };
}
function cleanImage(i: ImageAsset): ImageAsset { return { source: i.source, objectKey: i.objectKey, width: i.width, height: i.height, alt: i.alt }; }
