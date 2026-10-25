import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Gift, Image as ImageIcon, MessageCircle, X, ZoomIn } from "lucide-react";
import { categories, type Catalog, type Poster, type SectionId } from "../catalog";
import { imageUrl, responsiveSources } from "../cdn";
interface Props { section: SectionId; data: Catalog | null; status: string; onRetry: () => void; onClose: () => void; onOpen: (poster: Poster) => void }
const titles = { latest: "趣味单上新", contact: "联系客服", benefits: "预存福利" };
function PosterPreview({ poster, domain, onOpen }: { poster: Poster; domain: string; onOpen: () => void }) {
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  return <div className="panel-poster">{failed ? <div className="image-error" role="alert"><AlertCircle aria-hidden="true" /><p>海报暂时无法加载</p><button className="button button-primary" onClick={() => { setFailed(false); setAttempt(v => v + 1); }}>重新加载图片</button></div>
    : <button className="poster-preview" aria-label={"放大查看" + poster.title} onClick={onOpen}><img src={imageUrl(domain, poster, 900, attempt)} srcSet={responsiveSources(domain, poster, undefined, attempt)} sizes="(max-width: 700px) calc(100vw - 64px), 760px" width={poster.image.width} height={poster.image.height} alt={poster.image.alt} decoding="async" onError={() => setFailed(true)} /><span className="poster-zoom"><ZoomIn size={18} aria-hidden="true" />点击放大</span></button>}
  </div>;
}
function Empty({ section, onClose }: { section: SectionId; onClose: () => void }) {
  const Icon = section === "contact" ? MessageCircle : section === "benefits" ? Gift : ImageIcon;
  const heading = section === "contact" ? "客服信息待补充" : section === "benefits" ? "福利内容待补充" : "海报整理中";
  const description = section === "contact" ? "联系方式补充后会在这里展示。" : section === "benefits" ? "预存规则与福利内容将在确认后公布。" : "该分类的价目海报将在补充后展示。";
  return <div className="panel-empty"><span className="empty-icon"><Icon aria-hidden="true" /></span><h3>{heading}</h3><p>{description}</p><button className="button button-primary" onClick={onClose}>返回分类</button></div>;
}
export function ContentPanel({ section, data, status, onRetry, onClose, onOpen }: Props) {
  const dialog = useRef<HTMLDialogElement>(null); const scroll = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(""); const [copied, setCopied] = useState(""); const [copyError, setCopyError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posters = data?.entries.filter(p => section === "latest" ? p.isNew : p.category === section) ?? [];
  const current = posters.find(p => p.id === active) ?? posters[0];
  const currentIndex = posters.findIndex(p => p.id === current?.id);
  const title = categories.find(c => c.id === section)?.title ?? titles[section as keyof typeof titles];
  useLayoutEffect(() => {
    const element = dialog.current; const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const copy = async (value: string, id: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(id); setCopyError(false);
      if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(""), 2500);
    } catch { setCopyError(true); }
  };
  const selectPoster = (poster: Poster) => {
    setActive(poster.id); scroll.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(`[data-poster-id="${poster.id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  };
  return <dialog ref={dialog} className="content-panel" aria-labelledby="panel-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <header className="panel-header"><button className="icon-button" aria-label="返回分类" onClick={onClose}><ArrowLeft aria-hidden="true" /></button><h2 id="panel-title">{title}</h2><button className="icon-button panel-close" aria-label="关闭内容窗口" onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="panel-scroll" ref={scroll}>
      {status === "loading" ? <div className="panel-empty" role="status"><p>正在加载内容…</p></div> : null}
      {status === "error" ? <div className="panel-empty" role="alert"><AlertCircle size={40} aria-hidden="true" /><h3>内容暂时无法加载</h3><button className="button button-primary" onClick={onRetry}>重新加载</button></div> : null}
      {data && section === "contact" ? data.contacts.length ? <div className="contact-list">{data.contacts.map(c => <article key={c.id} className="contact-item"><h3>{c.label}</h3><p className="contact-value">{c.value}</p>{c.image ? <img className="contact-qr" src={imageUrl(data.cdnDomain, c.image, 600)} width={c.image.width} height={c.image.height} alt={c.image.alt} /> : null}<div className="contact-actions"><button className="button button-secondary" onClick={() => void copy(c.value, c.id)}>{copied === c.id ? <Check size={18} /> : <Copy size={18} />}{copied === c.id ? "已复制" : "复制联系方式"}</button>{c.url ? <a className="button button-primary" href={c.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />联系客服</a> : null}</div></article>)}<p className="copy-status" role="status">{copyError ? "复制暂时不可用，请长按或选中号码手动复制。" : copied ? "联系方式已复制" : ""}</p></div> : <Empty section={section} onClose={onClose} /> : null}
      {data && section === "benefits" ? data.benefits.length ? <div className="benefit-list">{data.benefits.map(b => <article key={b.id}><h3>{b.title}</h3><p>{b.body}</p></article>)}</div> : <Empty section={section} onClose={onClose} /> : null}
      {data && section !== "contact" && section !== "benefits" ? current ? <>
        {posters.length > 1 ? <div className="poster-switcher">
          <div className="poster-switcher-summary"><span role="status">第 {currentIndex + 1} 张，共 {posters.length} 张</span><div>
            <button type="button" className="icon-button" aria-label="上一张海报" disabled={currentIndex === 0} onClick={() => selectPoster(posters[currentIndex - 1])}><ArrowLeft size={19} aria-hidden="true" /></button>
            <button type="button" className="icon-button" aria-label="下一张海报" disabled={currentIndex === posters.length - 1} onClick={() => selectPoster(posters[currentIndex + 1])}><ArrowRight size={19} aria-hidden="true" /></button>
          </div></div>
          <div className="poster-tabs" role="group" aria-label="选择海报">{posters.map(p => <button key={p.id} data-poster-id={p.id} aria-pressed={p.id === current.id} onClick={() => selectPoster(p)}>{p.title}</button>)}</div>
        </div> : null}
        <div className="poster-info"><h3>{current.title}</h3><p>{current.description}</p></div>
        <PosterPreview key={current.id} poster={current} domain={data.cdnDomain} onOpen={() => onOpen(current)} />
      </> : <Empty section={section} onClose={onClose} /> : null}
    </div>
    {section !== "contact" && section !== "benefits" ? <footer className="panel-footer">点击海报可放大查看。</footer> : null}
  </dialog>;
}
