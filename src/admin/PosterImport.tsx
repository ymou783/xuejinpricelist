import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Upload } from "lucide-react";
import { categories, validImage, type CategoryId, type ImageAsset, type Poster } from "../catalog";
import { AdminDialog } from "./AdminDialog";
import { request } from "./api";
import { contentId } from "./contentId";
import type { BatchResult } from "./posterTypes";
import { CdnImageFields } from "./CdnImageFields";

interface ImportRow { id: string; title: string; description: string; image: ImageAsset; file?: File; error: string; imported: boolean }
interface Props { csrf: string; category: CategoryId; onClose: () => void; onImported: () => void; onBusy: (busy: boolean) => void; onUnsaved: (dirty: boolean) => void }
function titleFrom(path: string) { const filename = path.split("/").pop() || "新海报"; return filename.replace(/\.[^.]+$/, "").slice(0,80) || "新海报"; }
function newRow(path: string, file?: File): ImportRow {
  const title = titleFrom(path);
  return { id: contentId("poster"), title, description: "", image: { source: "cdn", objectKey: file ? "" : path, width: 0, height: 0, alt: title }, file, error: "", imported: false };
}
const completeImage = (image: ImageAsset): boolean => validImage(image);
function safeKey(key: string) { return key && !key.startsWith("/") && !/[\\?#\x00-\x1f:]/.test(key) && key.length <= 600 && key.split("/").every(p => p && p !== "." && p !== ".."); }
export function PosterImport({ csrf, category: initialCategory, onClose, onImported, onBusy, onUnsaved }: Props) {
  const [category, setCategory] = useState(initialCategory);
  const [paths, setPaths] = useState(""); const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState(""); const [windowStart, setWindowStart] = useState(0);
  const rowsRef = useRef(rows); const busyRef = useRef(false); const stopping = useRef(false);
  const unsaved = rows.length ? rows.some(r => !r.imported) : !!paths.trim();
  useEffect(() => { onUnsaved(unsaved); return () => onUnsaved(false); }, [unsaved, onUnsaved]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const updateRow = (id: string, patch: Partial<ImportRow>) => {
    rowsRef.current = rowsRef.current.map(r => r.id === id ? { ...r, ...patch } : r); setRows(rowsRef.current);
  };
  const prepare = async (initial: ImportRow[]) => {
    if (busyRef.current || !initial.length) return;
    busyRef.current = true; stopping.current = false; setBusy(true); onBusy(true); setNotice("");
    let index = 0, done = 0;
    const run = async () => {
      while (index < initial.length && !stopping.current) {
        const row = initial[index++]; if (row.imported || completeImage(row.image)) continue;
        try {
          let image: ImageAsset;
          if (row.file) {
            if (row.file.size > 15 * 1024 * 1024) throw new Error("图片超过 15MB，请压缩后重新选择。");
            const body = new FormData(); body.append("image", row.file);
            image = await request<ImageAsset>("upload", { method: "POST", body }, csrf);
          } else {
            if (!safeKey(row.image.objectKey)) throw new Error("对象路径不正确，不含域名、开头 / 或查询参数。");
            const size = await request<{ width: number; height: number }>("posters/image-info", { method: "POST", body: JSON.stringify({ objectKey: row.image.objectKey }) }, csrf);
            image = { ...row.image, ...size };
          }
          updateRow(row.id, { image: { ...image, alt: row.title || "价目海报" }, error: "" });
        } catch (e) { updateRow(row.id, { error: e instanceof Error ? e.message : "处理失败，可以单独重试。" }); }
        done++; setProgress("已处理 " + done + " / " + initial.length + " 张");
      }
    };
    // Two bounded workers keep uploads and dimension lookups responsive.
    try { await Promise.all([run(), run()]); }
    finally { busyRef.current = false; setBusy(false); onBusy(false); setProgress(""); }
  };
  const parse = () => {
    const keys = [...new Set(paths.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
    const newRows = keys.map(key => newRow(key)); rowsRef.current = newRows; setRows(newRows); setWindowStart(0);
    void prepare(newRows);
  };
  const files = (selected: File[]) => {
    const newRows = selected.map(file => newRow(file.name, file)); rowsRef.current = newRows; setRows(newRows); setWindowStart(0); void prepare(newRows);
  };
  const importDrafts = async () => {
    if (busyRef.current) return;
    busyRef.current = true; stopping.current = false; setBusy(true); onBusy(true); setNotice("");
    const pending = rowsRef.current.filter(r => !r.imported); let done = 0, succeeded = 0;
    try {
      for (let start = 0; start < pending.length; start += 20) {
        if (stopping.current) break;
        const group = pending.slice(start, start + 20), items: { id: string; draft: Poster }[] = [];
        for (const row of group) {
          if (row.file && row.image.source !== "upload") { updateRow(row.id, { error: "请先重试上传图片。" }); continue; }
          items.push({ id: row.id, draft: { id: row.id, title: row.title, description: row.description, category, isNew: false, image: { ...row.image, alt: row.title || "价目海报" } } });
        }
        try {
          if (items.length) {
            const result = await request<BatchResult>("posters/import", { method: "POST", body: JSON.stringify({ items }) }, csrf);
            for (const id of result.succeeded) updateRow(id, { imported: true, error: "" });
            for (const item of result.failed) updateRow(item.id, { error: item.error });
            succeeded += result.succeeded.length;
          }
        } catch (e) { for (const item of items) updateRow(item.id, { error: e instanceof Error ? e.message : "导入失败，请重试。" }); }
        done += group.length; setProgress("已导入处理 " + done + " / " + pending.length + " 张");
      }
      setNotice("本次成功导入 " + succeeded + " 张草稿。可返回海报库检查、补充并批量发布。失败项保留，可重试。"); onImported();
    } finally { busyRef.current = false; setBusy(false); onBusy(false); setProgress(""); }
  };
  const close = () => {
    if (busy) return;
    if (unsaved && !confirm("还有未导入的内容，关闭将放弃这些内容。已导入的草稿会保留。")) return;
    onClose();
  };
  const pending = rows.filter(r => !r.imported).length;
  const visible = rows.slice(windowStart, windowStart + 20);
  return <AdminDialog title="批量添加海报" onClose={close} busy={busy} wide>
    <div className="admin-dialog-body">
      <p className="field-help">上传多张图片，或每行粘贴一条 CDN 对象路径。先导入为草稿，补充确认后再发布；尺寸读取失败时可手动填写。</p>
      <fieldset className="admin-fieldset" disabled={busy}>
        <label className="form-field"><span>统一所属分类</span><select value={category} onChange={e => setCategory(e.target.value as CategoryId)}>{categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        {!rows.length ? <>
          <label className="form-field"><span>CDN 对象路径，每行一条</span><textarea className="batch-paths" value={paths} onChange={e => setPaths(e.target.value)} placeholder={"images/趣味单01.jpg\nimages/趣味单02.jpg"} /></label>
          <div className="poster-edit-actions"><button type="button" className="button button-primary" disabled={!paths.trim()} onClick={parse}>解析路径并读取尺寸</button><label className="button button-secondary batch-files"><Upload size={18} />选择多张本地图片<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => { files(Array.from(e.target.files || [])); e.target.value = ""; }} /></label></div>
          <p className="field-help">本地图片保存到服务器。CDN 图片继续使用 COS 桶内路径，相同路径在本次输入中会合并。</p>
        </> : <>
          <div className="import-summary"><strong>共 {rows.length} 张 · 已导入 {rows.length - pending} 张</strong><button type="button" className="text-link" disabled={!pending} onClick={() => void prepare(rows.filter(r => !r.imported && !completeImage(r.image)))}><RefreshCw size={15} />重试未完成的图片</button></div>
          <div className="import-rows">{visible.map((row, i) => <article className="import-row" key={row.id}>
            <h3>{windowStart + i + 1}. {row.imported ? <><Check size={17} />已导入草稿</> : "待导入"}</h3>
            <fieldset className="admin-fieldset" disabled={row.imported}>
              <label className="form-field"><span>标题</span><input maxLength={80} value={row.title} onChange={e => updateRow(row.id, { title: e.target.value })} /></label>
              <label className="form-field"><span>图片说明（选填）</span><textarea aria-label="图片说明（选填）" maxLength={2000} value={row.description} placeholder="可以留空" onChange={e => updateRow(row.id, { description: e.target.value })} /></label>
              {row.file ? <><p className="field-help">本地文件：{row.file.name}</p><div className="form-two-columns">{(["width","height"] as const).map(field => <label className="form-field" key={field}><span>{field === "width" ? "原图宽度" : "原图高度"}</span><input type="number" readOnly value={row.image[field] || ""} /></label>)}</div><label className="button button-secondary batch-files">更换文件<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; const replacement = { ...row, file, image: { ...row.image, source: "cdn" as const, objectKey: "", width: 0, height: 0 }, error: "" }; updateRow(row.id,replacement); void prepare([replacement]); }} /></label></> : <CdnImageFields csrf={csrf} image={row.image} alt={row.title || "价目海报"} required disabled={busy || row.imported} autoOnMount={false} onChange={image => { if (image) updateRow(row.id, { image, error: "" }); }} />}
              {row.error ? <p className="admin-error" role="alert">{row.error}</p> : null}
              {row.file && !completeImage(row.image) ? <button type="button" className="text-link" onClick={() => void prepare([row])}>重试这张图片</button> : null}
            </fieldset>
          </article>)}</div>
          {rows.length > 20 ? <div className="poster-pagination"><button type="button" className="button button-secondary" disabled={!windowStart} onClick={() => setWindowStart(n => Math.max(0,n-20))}>上一页条目</button><span>{Math.floor(windowStart/20)+1} / {Math.ceil(rows.length/20)}</span><button type="button" className="button button-secondary" disabled={windowStart+20>=rows.length} onClick={() => setWindowStart(n => n+20)}>下一页条目</button></div> : null}
        </>}
      </fieldset>
      <p className="admin-notice" role="status">{progress || notice}</p>
    </div>
    <footer className="admin-dialog-footer"><button type="button" className="button button-primary" disabled={busy || !pending} onClick={() => void importDrafts()}>导入为草稿（{pending}）</button>{busy ? <button type="button" className="button button-secondary" onClick={() => { stopping.current = true; setProgress("正在停止，已完成的条目会保留…"); }}>停止本次处理</button> : null}<button type="button" className="button button-secondary" disabled={busy} onClick={close}>返回海报库</button></footer>
  </AdminDialog>;
}
