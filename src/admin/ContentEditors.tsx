import { Plus, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { Benefit, Catalog, Contact } from "../catalog";
import { UploadField } from "./UploadField";
import { contentId } from "./contentId";
import { CdnImageFields } from "./CdnImageFields";
type Change = (change: (current: Catalog) => Catalog) => void;
export function HomeEditor({ catalog, onChange }: { catalog: Catalog; onChange: Change }) {
  return <><div className="admin-section-heading"><div><h1>首页设置</h1><p>修改首页文案和图片域名。</p></div></div><div className="simple-editor">
    {([{ key: "brand", label: "品牌名称", max: 30 }, { key: "heading", label: "首页标题", max: 40 }, { key: "cdnDomain", label: "图片 CDN 域名", max: 253 }] as const).map(f => <label className="form-field" key={f.key}><span>{f.label}</span><input required maxLength={f.max} value={catalog[f.key]} onChange={e => onChange(c => ({ ...c, [f.key]: e.target.value }))} /></label>)}
    <p className="field-help">修改域名只影响使用 COS 对象路径的图片。服务器上传图片仍由本站提供。</p>
  </div></>;
}
export function ContactEditor({ catalog, csrf, onChange, onBusy, onError }: { catalog: Catalog; csrf: string; onChange: Change; onBusy: (busy: boolean) => void; onError: (error: unknown) => void }) {
  const update = (id: string, patch: Partial<Contact>) => onChange(c => ({ ...c, contacts: c.contacts.map(item => item.id === id ? { ...item, ...patch } : item) }));
  return <><div className="admin-section-heading"><div><h1>联系客服</h1><p>设置公开联系方式、链接和二维码。</p></div><button type="button" className="button button-primary" onClick={() => onChange(c => ({ ...c, contacts: [...c.contacts, { id: contentId("contact"), label: "", value: "" }] }))}><Plus size={20} />新增客服</button></div>
    {!catalog.contacts.length ? <div className="admin-empty-message">尚未填写客服信息，前台会显示“客服信息待补充”。</div> : null}
    <div className="editor-item-list">{catalog.contacts.map((c, index) => <article className="editable-item" key={c.id}><div className="form-subheading"><h2>客服 {index + 1}</h2><button type="button" className="text-danger" onClick={() => { if (confirm("删除这条客服信息？保存后生效。")) onChange(v => ({ ...v, contacts: v.contacts.filter(i => i.id !== c.id) })); }}><Trash2 size={16} />删除</button></div>
      <label className="form-field"><span>显示名称</span><input required maxLength={50} value={c.label} placeholder="例如：微信客服" onChange={e => update(c.id, { label: e.target.value })} /></label>
      <label className="form-field"><span>联系号码或说明</span><input required maxLength={300} value={c.value} placeholder="填写希望公开的号码或说明" onChange={e => update(c.id, { value: e.target.value })} /></label>
      <label className="form-field"><span>客服链接或说明（选填）</span><input maxLength={1500} value={c.url || ""} placeholder="网址、微信号、QQ号或其他说明" onChange={e => update(c.id, { url: e.target.value || undefined })} /></label>
      <p className="field-help">网址可点击跳转，其他文字会展示并提供复制。</p>
      <div className="form-field"><span>二维码（可选）</span><UploadField csrf={csrf} image={c.image} domain={catalog.cdnDomain} kind="qr" onBusy={onBusy} onError={onError} onUploaded={asset => update(c.id, { image: { ...asset, alt: (c.label || "客服") + "二维码" } })} /></div>
      <CdnImageFields image={c.image} alt={(c.label || "客服") + "二维码"} onChange={image => update(c.id, { image })} />
      {c.image ? <button type="button" className="text-danger" onClick={() => update(c.id, { image: undefined })}>移除二维码</button> : null}
    </article>)}</div>
  </>;
}
export function BenefitsEditor({ catalog, csrf, imageEnabled, onChange, onBusy, onError, section = "benefits" }: { catalog: Catalog; csrf: string; imageEnabled: boolean; onChange: Change; onBusy: (busy: boolean) => void; onError: (error: unknown) => void; section?: "benefits" | "ownerRights" }) {
  const isRights = section === "ownerRights";
  const label = isRights ? "权益" : "福利";
  const list = useRef<HTMLDivElement>(null); const pendingFocus = useRef("");
  useLayoutEffect(() => {
    if (pendingFocus.current) { list.current?.querySelector<HTMLInputElement>(`[data-content-id="${pendingFocus.current}"] input`)?.focus(); pendingFocus.current = ""; }
  }, [catalog[section].length]);
  const update = (id: string, patch: Partial<Benefit>) => onChange(c => ({ ...c, [section]: c[section].map(b => b.id === id ? { ...b, ...patch } : b) }));
  const add = () => { const id = contentId("content"); pendingFocus.current = id; onChange(c => ({ ...c, [section]: [...c[section], { id, title: "", body: "" }] })); };
  return <><div className="admin-section-heading"><div><h1>{isRights ? "老板权益" : "预存福利"}</h1><p>{isRights ? "编辑首页底部权益，正文和图片至少添加一项。" : "填写福利标题，正文和图片至少添加一项。"}</p></div><button type="button" className="button button-primary" onClick={add}><Plus size={20} />{isRights ? "新增权益" : "新增福利"}</button></div>
    {!catalog[section].length ? <div className="admin-empty-message">{isRights ? "尚未填写老板权益，前台已保留展示位置。" : "尚未填写福利内容，前台会显示“福利内容待补充”。"}</div> : null}
    <div className="editor-item-list" ref={list}>{catalog[section].map((b, index) => <article className="editable-item" data-content-id={b.id} key={b.id}><div className="form-subheading"><h2>{label} {index + 1}</h2><button type="button" className="text-danger" onClick={() => { if (confirm("删除这条" + label + "内容？保存后生效。")) onChange(c => ({ ...c, [section]: c[section].filter(v => v.id !== b.id) })); }}><Trash2 size={16} />删除</button></div>
      <label className="form-field"><span>{label}标题</span><input required maxLength={100} value={b.title} onChange={e => update(b.id, { title: e.target.value })} /></label>
      <label className="form-field"><span>{label}正文</span><textarea required={!b.image} maxLength={15000} rows={6} value={b.body} placeholder={"填写" + label + "详情；已上传图片时可留空，支持换行。"} onChange={e => update(b.id, { body: e.target.value })} /></label>
      <div className="form-field"><span>{label}图片</span><UploadField csrf={csrf} image={b.image} domain={catalog.cdnDomain} label={"上传" + label + "图片 " + (index + 1)} disabled={!imageEnabled} onBusy={onBusy} onError={onError} onUploaded={asset => update(b.id, { image: { ...asset, alt: b.title || label + "海报" } })} /></div>
      <CdnImageFields image={b.image} alt={b.title || label + "海报"} disabled={!imageEnabled} onChange={image => update(b.id, { image })} />
      <p className="field-help">{imageEnabled ? "支持文字、图片或图文组合。上传后点击「保存发布」，前台可点击图片放大。" : "当前后台服务尚未启用" + label + "图片。请更新并重启 Node 服务，再刷新后台；文字内容可继续编辑。"}</p>
      {b.image ? <button type="button" className="text-danger" onClick={() => update(b.id, { image: undefined })}>移除{label}图片</button> : null}
    </article>)}</div>
  </>;
}
