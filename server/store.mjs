import { chmod, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "../src/catalog.ts";
import { checkVersion, digest, libraryRevision, listPosters, managed, posterDraft, problem, publicEntries, publishable, reorder, touch, validId } from "./posters.mjs";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function dataDirectory() { return path.resolve(process.env.DATA_DIR || path.join(root, "data")); }
export async function atomicWrite(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temp = filename + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, filename);
}
const fields = { home: ["brand", "heading", "cdnDomain"], banners: ["banners"], contact: ["contacts"], benefits: ["benefits"], rights: ["ownerRights"] };
function snapshotOf(doc, excludePosters = false) {
  return { catalog: excludePosters ? { ...doc.catalog, entries: [] } : doc.catalog, revision: digest(doc.catalog),
    sectionRevisions: Object.fromEntries(Object.entries(fields).map(([section, keys]) => [section, digest(keys.map(key => doc.catalog[key]))])) };
}
export function createStore(directory) {
  const filename = path.join(directory, "catalog.json");
  let pending = Promise.resolve();
  const read = async () => {
    let raw;
    try { raw = await readFile(filename, "utf8"); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const initial = parseCatalog(JSON.parse(await readFile(path.join(root, "public/catalog.json"), "utf8")));
      await mkdir(directory, { recursive: true });
      try { await writeFile(filename, JSON.stringify(initial, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
      catch (e) { if (e.code !== "EEXIST") throw e; }
      raw = await readFile(filename, "utf8");
    }
    const saved = JSON.parse(raw), catalog = parseCatalog(saved);
    // One atomic document holds private drafts and the released public snapshot.
    // Legacy catalogs migrate in memory and persist on the first successful edit.
    const legacy = !Object.hasOwn(saved, "_posterLibrary");
    const records = legacy ? catalog.entries.map(managed) : saved._posterLibrary;
    if (!Array.isArray(records) || records.some(r => !r?.draft || !validId(r.draft.id) || !["draft", "published", "offline"].includes(r.status) || typeof r.version !== "string")
      || new Set(records.map(r => r.draft.id)).size !== records.length) throw problem("海报库数据损坏，请从备份恢复。", 500);
    return { catalog, records, legacy };
  };
  const edit = work => {
    const job = pending.then(async () => {
      const doc = await read(); const result = await work(doc);
      doc.catalog.entries = publicEntries(doc.records);
      if (doc.legacy) {
        const backup = filename + ".before-poster-library.bak";
        try { await copyFile(filename, backup, constants.COPYFILE_EXCL); await chmod(backup, 0o600); }
        catch (e) { if (e.code !== "EEXIST") throw e; }
      }
      await atomicWrite(filename, { ...doc.catalog, _posterLibrary: doc.records });
      return typeof result === "function" ? result(doc) : result;
    });
    pending = job.catch(() => {}); return job;
  };
  const snapshot = async (excludePosters = false) => snapshotOf(await read(), excludePosters);
  const requireRevision = (doc, revision) => { if (digest(doc.catalog) !== revision) throw problem("内容已在其他窗口修改，请重新加载后编辑。", 409); };
  const save = (value, revision) => edit(doc => {
    requireRevision(doc, revision);
    let catalog; try { catalog = parseCatalog(value); } catch (error) { throw problem(error.message); }
    // Old clients still work without discarding private drafts or offline items.
    const old = new Map(doc.records.map(r => [r.draft.id, r]));
    const active = catalog.entries.map(p => {
      const previous = old.get(p.id); old.delete(p.id);
      if (previous?.status === "published" && digest(previous.published) === digest(p)) return previous;
      return touch(managed(p));
    });
    for (const r of old.values()) { if (r.status === "published") { r.status = "offline"; touch(r); } active.push(r); }
    doc.records = active; doc.catalog = catalog; return d => snapshotOf(d);
  });
  const saveSection = (section, value, revision) => edit(doc => {
    if (!Object.hasOwn(fields, section) || !value || typeof value !== "object") throw problem("栏目不存在。");
    if (digest(fields[section].map(key => doc.catalog[key])) !== revision) throw problem("本栏目已在其他窗口修改，请重新加载后编辑。", 409);
    const candidate = { ...doc.catalog };
    for (const field of fields[section]) candidate[field] = value[field];
    try { doc.catalog = parseCatalog(candidate); } catch (e) { throw problem(e.message); }
    return d => snapshotOf(d, true);
  });
  const createPoster = (draft = {}, requestedId) => edit(doc => {
    const id = requestedId ?? "poster-" + randomUUID();
    const cleaned = posterDraft(draft, id), existing = doc.records.find(r => r.draft.id === id);
    // Stable import IDs make a retry after a lost response safe.
    if (existing) return { record: existing, reused: true };
    const record = touch({ draft: cleaned, status: "draft" }); doc.records.push(record); return { record };
  });
  const updatePoster = (id, draft, version, action) => edit(doc => {
    const r = doc.records.find(r => r.draft.id === id); checkVersion(r, version);
    if (!["draft", "publish"].includes(action)) throw problem("请选择保存草稿或发布。");
    r.draft = posterDraft(draft, id);
    if (action === "publish") { r.published = publishable(r.draft); r.status = "published"; }
    touch(r); return { record: r };
  });
  const importPosters = items => edit(doc => {
    if (!Array.isArray(items) || !items.length) throw problem("请添加要导入的海报。");
    const byId = new Map(doc.records.map(r => [r.draft.id, r])); const succeeded = [], failed = [];
    for (const item of items) {
      try {
        const draft = posterDraft(item?.draft, item?.id);
        if (!byId.has(draft.id)) {
          const record = touch({ draft, status: "draft" }); doc.records.push(record); byId.set(draft.id, record);
        }
        succeeded.push(draft.id);
      } catch (e) { failed.push({ id: typeof item?.id === "string" ? item.id : "", title: typeof item?.draft?.title === "string" ? item.draft.title : "未命名海报", error: e.message }); }
    }
    return { succeeded, failed };
  });
  const copyPoster = (id, version) => edit(doc => {
    const r = doc.records.find(r => r.draft.id === id); checkVersion(r, version);
    const draft = { ...r.draft, id: "poster-" + randomUUID(), title: (r.draft.title || "未命名海报").slice(0, 76) + "（副本）" };
    const copy = touch({ draft, status: "draft" }); doc.records.push(copy); return { record: copy };
  });
  const batchPosters = (items, action, value) => edit(doc => {
    if (!Array.isArray(items) || !items.length || items.some(i => !i || !validId(i.id)) || new Set(items.map(i => i.id)).size !== items.length) throw problem("请选择要操作的海报。");
    if (!["publish", "offline", "category", "new", "delete"].includes(action)) throw problem("批量操作不存在。");
    if (action === "category" && !["basic", "fun", "special", "companion"].includes(value)) throw problem("分类不正确。");
    if (action === "new" && typeof value !== "boolean") throw problem("上新状态不正确。");
    const byId = new Map(doc.records.map(r => [r.draft.id, r])); const deleted = new Set(), succeeded = [], failed = [];
    for (const item of items) {
      const r = byId.get(item.id);
      try {
        checkVersion(r, item.version);
        if (action === "publish") { r.published = publishable(r.draft); r.status = "published"; }
        if (action === "offline") r.status = r.status === "draft" ? "draft" : "offline";
        if (action === "category" || action === "new") {
          const key = action === "category" ? "category" : "isNew";
          r.draft[key] = value;
          // Apply only the explicit public field; preserve other unfinished edits.
          if (r.published) r.published[key] = value;
        }
        if (action === "delete") deleted.add(item.id); else touch(r);
        succeeded.push(item.id);
      } catch (e) { failed.push({ id: item.id, title: r?.draft.title || "未命名海报", error: e.message }); }
    }
    doc.records = doc.records.filter(r => !deleted.has(r.draft.id));
    return { succeeded, failed };
  });
  const movePoster = (id, position, revision) => edit(doc => {
    if (revision !== libraryRevision(doc.records)) throw problem("排序已发生变化，请刷新列表再移动。", 409);
    doc.records = reorder(doc.records, id, position); return { ok: true };
  });
  return { snapshot, save, saveSection, createPoster, importPosters, updatePoster, copyPoster, batchPosters, movePoster,
    listPosters: async query => listPosters((await read()).records, query),
    getPoster: async id => { const record = (await read()).records.find(r => r.draft.id === id); if (!record) throw problem("海报已删除，请刷新列表。", 404); return { record }; },
  };
}
