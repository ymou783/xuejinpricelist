import { createHash, randomUUID } from "node:crypto";
import { categories, validImage } from "../src/catalog.ts";

export function problem(message, status = 400) { return Object.assign(new Error(message), { status }); }
export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const validId = id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
export const validKey = key => typeof key === "string" && key.length <= 600 && !key.startsWith("/") && !/[\\?#\x00-\x1f:]/.test(key) && (!key || key.split("/").every(p => p && p !== "." && p !== ".."));
export function posterDraft(value, id) {
  if (!value || typeof value !== "object" || !validId(id)) throw problem("海报草稿格式不正确。");
  const title = value.title ?? "", description = value.description ?? "";
  const category = value.category ?? "basic", isNew = value.isNew ?? false;
  if (typeof title !== "string" || title.length > 80 || typeof description !== "string" || description.length > 2000
    || !categories.some(c => c.id === category) || typeof isNew !== "boolean") throw problem("请检查海报标题、分类和说明。");
  const i = value.image ?? { source: "cdn", objectKey: "", width: 0, height: 0, alt: title || "价目海报" };
  if (!i || !["cdn", "upload"].includes(i.source) || !validKey(i.objectKey)
    || !Number.isInteger(i.width) || i.width < 0 || i.width > 30000 || !Number.isInteger(i.height) || i.height < 0 || i.height > 30000
    || typeof i.alt !== "string" || i.alt.length > 500
    || (i.source === "upload" && !validImage(i))) throw problem("请检查图片路径和尺寸；CDN 路径不含域名或开头的 /。");
  return { id, title, description, category, isNew, image: { source: i.source, objectKey: i.objectKey, width: i.width, height: i.height, alt: i.alt } };
}
export function publishable(draft) {
  const missing = [];
  if (!draft.title.trim()) missing.push("标题");
  if (!validImage(draft.image)) missing.push("有效图片路径和原图宽高");
  if (missing.length) throw problem("“" + (draft.title || "未命名海报") + "”尚缺：" + missing.join("、") + "。可先保存草稿。");
  return structuredClone(draft);
}
export function managed(poster) {
  return { draft: structuredClone(poster), published: structuredClone(poster), status: "published", version: digest(poster), updatedAt: "" };
}
export function touch(record) { record.version = randomUUID(); record.updatedAt = new Date().toISOString(); return record; }
export function checkVersion(record, version) {
  if (!record) throw problem("海报已删除，请刷新列表。", 404);
  if (record.version !== version) throw problem("这张海报已在其他窗口修改，请重新打开后编辑。", 409);
}
export function libraryRevision(records) { return digest(records.map(r => [r.draft.id, r.version])); }
export function publicEntries(records) { return records.filter(r => r.status === "published" && r.published).map(r => r.published); }
export function listPosters(records, query = {}) {
  const counts = { all: records.length, basic: 0, fun: 0, special: 0, companion: 0 };
  const positions = new Map();
  for (const r of records) { counts[r.draft.category]++; positions.set(r.draft.id, counts[r.draft.category]); }
  const words = String(query.q ?? "").normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = records.filter(r => {
    const p = r.draft;
    return (!query.category || query.category === "all" || p.category === query.category)
      && (!query.status || query.status === "all" || r.status === query.status)
      && (!query.new || query.new === "all" || p.isNew === (query.new === "yes"))
      && words.every(word => (p.title + " " + p.description).normalize("NFKC").toLocaleLowerCase().includes(word));
  });
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 6)));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
  const items = filtered.slice((page - 1) * pageSize, page * pageSize).map(r => ({
    id: r.draft.id, title: r.draft.title, category: r.draft.category, isNew: r.draft.isNew,
    status: r.status, image: validImage(r.draft.image) ? r.draft.image : undefined,
    hasChanges: r.status === "published" && digest(r.draft) !== digest(r.published),
    version: r.version, updatedAt: r.updatedAt, position: positions.get(r.draft.id),
  }));
  return { items, total: filtered.length, counts, page, pageSize, pages, revision: libraryRevision(records) };
}
export function reorder(records, id, position) {
  const item = records.find(r => r.draft.id === id);
  if (!item) throw problem("海报已删除。", 404);
  const same = records.filter(r => r.draft.category === item.draft.category);
  if (same.some(r => r.status === "published" && r.published.category !== r.draft.category)) throw problem("本分类有尚未发布的分类修改，请先发布这些海报或通过批量分类确认后排序。");
  if (!Number.isInteger(position) || position < 1 || position > same.length) throw problem("排序位置应在 1 至 " + same.length + " 之间。");
  same.splice(same.indexOf(item), 1); same.splice(position - 1, 0, item);
  let next = 0;
  return records.map(r => r.draft.category === item.draft.category ? same[next++] : r);
}
