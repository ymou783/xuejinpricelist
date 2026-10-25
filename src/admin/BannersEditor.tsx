import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { Banner, Catalog, ImageAsset } from "../catalog";
import { UploadField } from "./UploadField";

interface Props {
  catalog: Catalog;
  csrf: string;
  onChange: (update: (current: Catalog) => Catalog) => void;
  onBusy: (busy: boolean) => void;
  onError: (error: unknown) => void;
}
export function BannersEditor({ catalog, csrf, onChange, onBusy, onError }: Props) {
  const update = (id: string, patch: Partial<Banner>) => onChange(c => ({ ...c, banners: c.banners.map(b => b.id === id ? { ...b, ...patch } : b) }));
  const updateImage = (id: string, patch: Partial<ImageAsset>) => onChange(c => ({ ...c, banners: c.banners.map(b => b.id === id ? { ...b, image: { ...b.image, ...patch } } : b) }));
  const add = () => onChange(c => ({ ...c, banners: [...c.banners, {
    id: "banner-" + crypto.randomUUID(), title: "", image: { source: "cdn", objectKey: "", width: 0, height: 0, alt: "" },
  }] }));
  const move = (position: number, step: number) => onChange(c => {
    const banners = [...c.banners]; const target = position + step;
    if (target < 0 || target >= banners.length) return c;
    [banners[position], banners[target]] = [banners[target], banners[position]];
    return { ...c, banners };
  });
  return <>
    <div className="admin-section-heading"><div><h1>首页轮播图</h1><p>上传横幅并调整顺序，最多 10 张。</p></div><button type="button" className="button button-primary" disabled={catalog.banners.length >= 10} onClick={add}><Plus size={20} />新增轮播图</button></div>
    <p className="banner-editor-help">建议使用宽幅横图。图片会完整显示；两张及以上自动轮播，未添加时显示默认冰焰横幅。</p>
    {!catalog.banners.length ? <div className="admin-empty-message">尚未添加轮播图。</div> : null}
    <div className="editor-item-list">{catalog.banners.map((banner, position) => <article className="editable-item" key={banner.id}>
      <div className="form-subheading"><h2>轮播图 {position + 1}</h2><div className="banner-item-actions">
        <button type="button" className="icon-button" aria-label={"上移轮播图 " + (position + 1)} disabled={position === 0} onClick={() => move(position, -1)}><ArrowUp size={18} /></button>
        <button type="button" className="icon-button" aria-label={"下移轮播图 " + (position + 1)} disabled={position === catalog.banners.length - 1} onClick={() => move(position, 1)}><ArrowDown size={18} /></button>
        <button type="button" className="text-danger" aria-label={"删除轮播图 " + (position + 1)} onClick={() => { if (confirm("删除这张轮播图？保存后生效。")) onChange(c => ({ ...c, banners: c.banners.filter(b => b.id !== banner.id) })); }}><Trash2 size={16} />删除</button>
      </div></div>
      <label className="form-field"><span>轮播图名称</span><input required maxLength={80} value={banner.title} onChange={e => update(banner.id, { title: e.target.value })} /></label>
      <div className="form-field"><span>上传轮播图</span><UploadField csrf={csrf} domain={catalog.cdnDomain} image={banner.image} label={"上传轮播图 " + (position + 1)} onBusy={onBusy} onError={onError} onUploaded={image => update(banner.id, { image: { ...image, alt: banner.image.alt || banner.title || "首页轮播图" } })} /></div>
      <label className="form-field"><span>CDN 对象路径</span><input maxLength={600} value={banner.image.source === "cdn" ? banner.image.objectKey : ""} disabled={banner.image.source === "upload"} placeholder="images/横幅.jpg" onChange={e => updateImage(banner.id, { objectKey: e.target.value })} /></label>
      {banner.image.source === "upload" ? <p className="field-help">当前使用服务器上传图片。<button type="button" className="text-link" onClick={() => updateImage(banner.id, { source: "cdn", objectKey: "" })}>改用 CDN 路径</button></p> : null}
      <div className="form-two-columns"><label className="form-field"><span>原图宽度</span><input type="number" min={1} max={30000} required value={banner.image.width || ""} onChange={e => updateImage(banner.id, { width: Number(e.target.value) })} /></label><label className="form-field"><span>原图高度</span><input type="number" min={1} max={30000} required value={banner.image.height || ""} onChange={e => updateImage(banner.id, { height: Number(e.target.value) })} /></label></div>
      <label className="form-field"><span>图片说明</span><input required maxLength={500} value={banner.image.alt} onChange={e => updateImage(banner.id, { alt: e.target.value })} /></label>
    </article>)}</div>
  </>;
}
