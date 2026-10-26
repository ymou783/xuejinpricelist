import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { categories, type Catalog, type Poster } from "../catalog";
import { UploadField } from "./UploadField";
import { contentId } from "./contentId";
import { CdnImageFields } from "./CdnImageFields";
export function newPoster(): Poster {
  return { id: contentId("poster"), title: "", description: "", category: "basic", isNew: false, image: { source: "cdn", objectKey: "", width: 0, height: 0, alt: "价目海报" } };
}
interface Props { catalog: Catalog; csrf: string; selected: string; footer: ReactNode; onSelect: (id: string) => void; onAdd: () => void; onChange: (id: string, patch: Partial<Poster>) => void; onRemove: (id: string) => void; onMove: (id: string, step: number) => void; onBusy: (busy: boolean) => void; onError: (error: unknown) => void }
export function PosterEditor({ catalog, csrf, selected, footer, onSelect, onAdd, onChange, onRemove, onMove, onBusy, onError }: Props) {
  const poster = catalog.entries.find(p => p.id === selected) ?? catalog.entries[0];
  return <>
    <div className="admin-section-heading"><div><h1>价目海报</h1><p>上传海报，设置分类与上新。</p></div><button className="button button-primary" type="button" onClick={onAdd}><Plus size={20} />新增海报</button></div>
    <div className="poster-editor-layout"><aside className="poster-admin-list"><h2>海报列表</h2>
      {!catalog.entries.length ? <div className="admin-list-empty"><ImageIcon size={58} aria-hidden="true" /><strong>暂无海报</strong><p>点击「新增海报」开始添加。</p></div> : <ul>{catalog.entries.map((p, i) => <li key={p.id}>
        <button type="button" className={p.id === poster?.id ? "is-selected" : ""} onClick={() => onSelect(p.id)}><span>{p.title || "未命名海报"}</span><small>{categories.find(c => c.id === p.category)?.title}{p.isNew ? " · 上新" : ""}</small></button>
        <div className="poster-order"><button type="button" className="icon-button" aria-label={"上移海报" + (i + 1)} disabled={i === 0} onClick={() => onMove(p.id, -1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" aria-label={"下移海报" + (i + 1)} disabled={i === catalog.entries.length - 1} onClick={() => onMove(p.id, 1)}><ArrowDown size={16} /></button></div>
      </li>)}</ul>}
    </aside>
    <div className="poster-edit-form">{poster ? <>
      <div className="form-subheading"><h2>{poster.title || "新建海报"}</h2><button className="text-danger" type="button" onClick={() => onRemove(poster.id)}><Trash2 size={16} />删除海报</button></div>
      <label className="form-field"><span>海报标题</span><input maxLength={80} required value={poster.title} placeholder="输入海报标题" onChange={e => onChange(poster.id, { title: e.target.value,
        image: { ...poster.image, alt: !poster.image.alt || poster.image.alt === "价目海报" || poster.image.alt === poster.title ? e.target.value || "价目海报" : poster.image.alt } })} /></label>
      <label className="form-field"><span>所属分类</span><select value={poster.category} onChange={e => onChange(poster.id, { category: e.target.value as Poster["category"] })}>{categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <div className="form-field"><span>上传图片</span><UploadField csrf={csrf} image={poster.image} domain={catalog.cdnDomain} onBusy={onBusy} onError={onError} onUploaded={asset => onChange(poster.id, { image: { ...asset, alt: poster.image.alt || poster.title || "价目海报" } })} /></div>
      <CdnImageFields image={poster.image} alt={poster.title || "价目海报"} required onChange={image => { if (image) onChange(poster.id, { image }); }} />
      <label className="checkbox-field"><input type="checkbox" checked={poster.isNew} onChange={e => onChange(poster.id, { isNew: e.target.checked })} /><span>在“趣味单上新”中显示</span></label>
      <label className="form-field"><span>图片说明</span><textarea required maxLength={2000} value={poster.description} placeholder="填写显示在海报上方的说明，支持换行…" onChange={e => onChange(poster.id, { description: e.target.value })} /></label>
    </> : <div className="admin-form-empty"><ImageIcon size={44} aria-hidden="true" /><h2>添加你的第一张海报</h2><p>上传图片或填写已有 COS 图片路径。</p><button type="button" className="button button-primary" onClick={onAdd}>新增海报</button></div>}{footer}</div>
    </div>
  </>;
}
