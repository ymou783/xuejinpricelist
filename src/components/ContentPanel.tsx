import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Copy, ExternalLink, Gift, Image as ImageIcon, MessageCircle, X } from "lucide-react";
import { categories, contactHref, type Catalog, type SectionId } from "../catalog";
import { ImagePreview } from "./ImagePreview";
import { copyText } from "../clipboard";
import { isPosterSection, type DirectoryState, type PosterDirectoryModel } from "../posterDirectory";
import { PosterDirectory } from "./PosterDirectory";
interface Props { section: Exclude<SectionId, "rights" | "warriors">; directory: PosterDirectoryModel | null; directoryState: DirectoryState; viewerOpen: boolean; data: Catalog | null; status: string; onRetry: () => void; onClose: () => void; onOpen: (id: string, page?: number) => void; onDirectoryChange: (state: Partial<DirectoryState>) => void }
const titles = { latest: "趣味单上新", contact: "联系客服", benefits: "预存福利" };
function Empty({ section, onClose }: { section: SectionId; onClose: () => void }) {
  const Icon = section === "contact" ? MessageCircle : section === "benefits" ? Gift : ImageIcon;
  const heading = section === "contact" ? "客服信息待补充" : section === "benefits" ? "福利内容待补充" : "海报整理中";
  const description = section === "contact" ? "联系方式补充后会在这里展示。" : section === "benefits" ? "预存规则与福利内容将在确认后公布。" : "该分类的价目海报将在补充后展示。";
  return <div className="panel-empty"><span className="empty-icon"><Icon aria-hidden="true" /></span><h3>{heading}</h3><p>{description}</p><button className="button button-primary" onClick={onClose}>返回分类</button></div>;
}
export function ContentPanel({ section, directory, directoryState, viewerOpen, data, status, onRetry, onClose, onOpen, onDirectoryChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(""); const [copyError, setCopyError] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = categories.find(c => c.id === section)?.title ?? titles[section as keyof typeof titles];
  useLayoutEffect(() => {
    const element = dialog.current; const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const copy = async (value: string, id: string) => {
    try { await copyText(value, dialog.current ?? document.body); setCopied(id); setCopyError(false);
      if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(""), 2500);
    } catch { setCopyError(true); }
  };
  return <dialog ref={dialog} className={"content-panel" + (isPosterSection(section) ? " directory-panel" : "")} aria-labelledby="panel-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <header className="panel-header"><button className="icon-button" aria-label="返回分类" onClick={onClose}><ArrowLeft aria-hidden="true" /></button><h2 id="panel-title">{title}</h2><button className="icon-button panel-close" aria-label="关闭内容窗口" onClick={onClose}><X aria-hidden="true" /></button></header>
    {data && directory && isPosterSection(section) ? <PosterDirectory section={section} state={directoryState} model={directory} domain={data.cdnDomain} viewerOpen={viewerOpen} onChange={onDirectoryChange} onOpen={onOpen} /> : null}
    {!data || !isPosterSection(section) ? <div className="panel-scroll">
      {status === "loading" ? <div className="panel-empty" role="status"><p>正在加载内容…</p></div> : null}
      {status === "error" ? <div className="panel-empty" role="alert"><AlertCircle size={40} aria-hidden="true" /><h3>内容暂时无法加载</h3><button className="button button-primary" onClick={onRetry}>重新加载</button></div> : null}
      {data && section === "contact" ? data.contacts.length ? <div className="contact-list">{data.contacts.map(c => {
        const href = contactHref(c.url); const information = c.url && !href ? c.url : c.value;
        return <article key={c.id} className="contact-item"><h3>{c.label}</h3><p className="contact-value">{c.value}</p>{c.url && !href ? <p className="contact-extra">{c.url}</p> : null}{c.image ? <ImagePreview key={c.image.objectKey} image={c.image} title={c.label} domain={data.cdnDomain} variant="contact" onOpen={() => onOpen(c.id)} /> : null}<div className="contact-actions"><button type="button" className="button button-secondary" onClick={() => void copy(information, c.id)}>{copied === c.id ? <Check size={18} /> : <Copy size={18} />}{copied === c.id ? "已复制" : "复制客服信息"}</button>{href ? <a className="button button-primary" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />联系客服</a> : null}</div></article>;
      })}<p className="copy-status" role="status">{copyError ? "复制暂时不可用，请长按或选中号码手动复制。" : copied ? "客服信息已复制" : ""}</p></div> : <Empty section={section} onClose={onClose} /> : null}
      {data && section === "benefits" ? data.benefits.length ? <div className="benefit-list">{data.benefits.map(b => <article key={b.id}><h3>{b.title}</h3>{b.body.trim() ? <p>{b.body}</p> : null}{b.image ? <ImagePreview key={b.image.objectKey} image={b.image} title={b.title} domain={data.cdnDomain} onOpen={() => onOpen(b.id)} /> : null}</article>)}</div> : <Empty section={section} onClose={onClose} /> : null}
    </div> : null}
  </dialog>;
}
