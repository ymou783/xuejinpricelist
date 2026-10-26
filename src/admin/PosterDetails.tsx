import { lazy, Suspense, useEffect, useState } from "react";
import { Copy, Save, Send, ZoomIn } from "lucide-react";
import { categories, validImage, type ImageAsset, type Poster } from "../catalog";
import { originalUrl } from "../cdn";
import { request } from "./api";
import { AdminDialog } from "./AdminDialog";
import { CdnImageFields } from "./CdnImageFields";
import { UploadField } from "./UploadField";
import { statusLabels, type ManagedPoster } from "./posterTypes";
const ImageViewer = lazy(() => import("../components/ImageViewer"));

interface Props { record: ManagedPoster; csrf: string; domain: string; onClose: () => void; onSaved: () => void; onBusy: (busy: boolean) => void; onUnsaved: (dirty: boolean) => void }
export function PosterDetails({ record, csrf, domain, onClose, onSaved, onBusy, onUnsaved }: Props) {
  const [saved, setSaved] = useState(record); const [draft, setDraft] = useState(record.draft);
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{ title: string; image: ImageAsset } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.draft);
  useEffect(() => { onUnsaved(dirty); return () => onUnsaved(false); }, [dirty, onUnsaved]);
  const patch = (fields: Partial<Poster>) => { setDraft(d => ({ ...d, ...fields })); setError(""); setNotice(""); };
  const close = () => { if (!dirty || confirm("这张海报还有未保存的修改，放弃修改并关闭？已保存的草稿会保留。")) onClose(); };
  const run = async (action: "draft" | "publish") => {
    setBusy(true); onBusy(true); setError(""); setNotice("");
    try {
      const data = await request<{ record: ManagedPoster }>("posters/" + draft.id, { method: "PUT", body: JSON.stringify({ draft, version: saved.version, action }) }, csrf);
      setSaved(data.record); setDraft(data.record.draft);
      setNotice(action === "publish" ? "已发布，前台刷新后可查看。" : "草稿已保存，前台内容保持原有发布版本。"); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); }
    finally { setBusy(false); onBusy(false); }
  };
  const copy = async () => {
    if (dirty) { setError("请先保存草稿，再复制这张海报。"); return; }
    setBusy(true); onBusy(true); setError("");
    try { await request("posters/" + draft.id + "/copy", { method: "POST", body: JSON.stringify({ version: saved.version }) }, csrf); setNotice("已创建副本草稿，可在海报库中编辑。"); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "复制失败。"); } finally { setBusy(false); onBusy(false); }
  };
  return <>
    <AdminDialog title={draft.title || "编辑海报"} onClose={close} busy={busy || uploading}>
      <div className="admin-dialog-body"><p className="poster-edit-status"><span className={"poster-badge " + saved.status}>{statusLabels[saved.status]}</span>{dirty ? "有未保存的修改" : "已保存"}{saved.status === "published" ? " · 保存草稿后需再次发布才会更新前台" : ""}</p>
      <fieldset className="admin-fieldset" disabled={busy || uploading}>
        <label className="form-field"><span>海报标题</span><input maxLength={80} value={draft.title} placeholder="输入海报标题" onChange={e => patch({ title: e.target.value, image: { ...draft.image, alt: !draft.image.alt || draft.image.alt === "价目海报" || draft.image.alt === draft.title ? e.target.value || "价目海报" : draft.image.alt } })} /></label>
        <label className="form-field"><span>所属分类</span><select value={draft.category} onChange={e => patch({ category: e.target.value as Poster["category"] })}>{categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <div className="form-field"><span>上传图片</span><UploadField csrf={csrf} image={draft.image} domain={domain} onBusy={value => { setUploading(value); onBusy(value); }} onError={e => setError(e instanceof Error ? e.message : "上传失败")} onUploaded={image => patch({ image: { ...image, alt: draft.title || "价目海报" } })} /></div>
        <CdnImageFields csrf={csrf} required image={draft.image} alt={draft.title || "价目海报"} onChange={image => { if (image) patch({ image }); }} />
        <label className="checkbox-field"><input type="checkbox" checked={draft.isNew} onChange={e => patch({ isNew: e.target.checked })} /><span>在“趣味单上新”中显示</span></label>
        <label className="form-field"><span>图片说明（选填）</span><textarea aria-label="图片说明（选填）" maxLength={2000} value={draft.description} placeholder="可以留空；填写后显示在图片上方，支持换行" onChange={e => patch({ description: e.target.value })} /></label>
        <div className="poster-edit-actions"><button type="button" className="button button-secondary" disabled={!validImage(draft.image)} onClick={() => setPreview({ title: draft.title || "海报预览", image: draft.image })}><ZoomIn size={18} />预览大图</button><button type="button" className="button button-secondary" onClick={() => void copy()}><Copy size={18} />复制为新海报</button></div>
        {saved.published ? <a className="text-link" href={originalUrl(domain, saved.published)} target="_blank" rel="noopener noreferrer">查看上次发布的图片</a> : null}
      </fieldset>
      {error ? <div className="admin-error" role="alert">{error}</div> : null}<p className="admin-notice" role="status">{notice}</p></div>
      <footer className="admin-dialog-footer"><button type="button" className="button button-secondary" disabled={busy || uploading} onClick={() => void run("draft")}><Save size={18} />保存草稿</button><button type="button" className="button button-primary" disabled={busy || uploading} onClick={() => void run("publish")}><Send size={18} />{busy ? "正在处理…" : "发布这张海报"}</button><button type="button" className="button button-secondary" disabled={busy || uploading} onClick={close}>关闭</button></footer>
    </AdminDialog>
    {preview ? <Suspense fallback={null}><ImageViewer key={preview.image.objectKey} poster={preview} domain={domain} onClose={() => setPreview(null)} /></Suspense> : null}
  </>;
}
