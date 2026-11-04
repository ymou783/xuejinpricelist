import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Image as ImageIcon, Search, X, ZoomIn } from "lucide-react";
import { categories, type Poster } from "../catalog";
import { imageUrl, responsiveSources } from "../cdn";
import { POSTERS_PER_PAGE, type DirectoryState, type PosterDirectoryModel, type PosterSection } from "../posterDirectory";
import { routeHash } from "../hooks/usePageRoute";
import "./poster-directory.css";

interface Props {
  section: PosterSection;
  state: DirectoryState;
  model: PosterDirectoryModel;
  domain: string;
  viewerOpen: boolean;
  onChange: (state: Partial<DirectoryState>) => void;
  onOpen: (id: string, page?: number) => void;
}

function PosterCard({ poster, domain, href, selected, showCategory, onOpen }: {
  poster: Poster; domain: string; href: string; selected: boolean; showCategory: boolean; onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onOpen();
  };
  return <article className={"directory-card" + (selected ? " is-selected" : "")} data-poster-id={poster.id}>
    <a href={href} className="directory-card-link" onClick={open} aria-label={"查看海报：" + poster.title} aria-current={selected ? "true" : undefined}>
      <div className="directory-card-media">
        {failed ? <span className="directory-image-error"><AlertCircle size={24} aria-hidden="true" /><span>缩略图加载失败</span></span>
          : <img src={imageUrl(domain, poster, 360, attempt)} srcSet={responsiveSources(domain, poster, [360, 600], attempt)}
            sizes="(max-width: 600px) 150px, 240px" width={poster.image.width} height={poster.image.height} alt={poster.image.alt}
            loading="lazy" decoding="async" onError={() => setFailed(true)} />}
        {!failed ? <span className="directory-zoom" aria-hidden="true"><ZoomIn size={17} /></span> : null}
      </div>
      <div className="directory-card-copy">
        <div className="directory-card-labels">{showCategory ? <span>{categories.find(c => c.id === poster.category)?.title}</span> : null}{poster.isNew ? <span className="directory-new">上新</span> : null}{selected ? <span className="directory-viewed">刚刚浏览</span> : null}</div>
        <h3 title={poster.title}>{poster.title}</h3>
        {poster.description.trim() ? <p title={poster.description}>{poster.description}</p> : null}
      </div>
    </a>
    {failed ? <button type="button" className="directory-image-retry button button-secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试缩略图</button> : null}
  </article>;
}

export function PosterDirectory({ section, state, model, domain, viewerOpen, onChange, onOpen }: Props) {
  const scroll = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [jump, setJump] = useState(String(model.page));
  const filtered = Boolean(state.query.trim()) || state.newOnly;
  useEffect(() => setJump(String(model.page)), [model.page]);
  useLayoutEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [model.page, state.query, state.newOnly]);
  useLayoutEffect(() => {
    if (viewerOpen || !state.selected) return;
    const frame = requestAnimationFrame(() => {
      const card = Array.from(scroll.current?.querySelectorAll<HTMLElement>("[data-poster-id]") ?? []).find(element => element.dataset.posterId === state.selected);
      card?.scrollIntoView({ block: "nearest" });
      card?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.selected, viewerOpen, model.page]);

  return <div className="poster-directory">
    <div className="directory-tools">
      <form className="directory-search" role="search" aria-label="搜索当前分类" onSubmit={event => event.preventDefault()}>
        <label htmlFor="directory-search-input" className="sr-only">搜索当前分类的海报标题</label>
        <Search size={21} aria-hidden="true" />
        <input ref={input} id="directory-search-input" type="search" value={state.query} placeholder="搜索当前分类的海报标题" maxLength={80}
          autoComplete="off" enterKeyHint="search" onChange={event => onChange({ query: event.target.value, page: 1 })} />
        {state.query ? <button type="button" className="icon-button" aria-label="清空分类搜索" onClick={() => { onChange({ query: "", page: 1 }); input.current?.focus(); }}><X size={19} aria-hidden="true" /></button> : null}
      </form>
      <div className="directory-filter-row">
        {section !== "latest" ? <div className="directory-filters" role="group" aria-label="海报筛选">
          <button type="button" aria-pressed={!state.newOnly} onClick={() => onChange({ newOnly: false, page: 1 })}>全部</button>
          <button type="button" aria-pressed={state.newOnly} onClick={() => onChange({ newOnly: true, page: 1 })}>只看上新</button>
        </div> : <span className="directory-latest-label">最近上新的价目海报</span>}
        <p className="directory-result-count" role="status" aria-atomic="true">{filtered ? "找到 " : "共 "}<strong>{model.matches.length}</strong> 张海报</p>
      </div>
    </div>
    <div className="directory-scroll" ref={scroll}>
      {model.items.length ? <div className="directory-grid">{model.items.map(poster => <PosterCard key={poster.id + "/" + poster.image.objectKey}
        poster={poster} domain={domain} selected={poster.id === state.selected} showCategory={section === "latest"}
        href={routeHash({ ...state, section, poster: poster.id, page: model.page })} onOpen={() => onOpen(poster.id, model.page)} />)}</div>
        : <div className="directory-empty"><ImageIcon size={40} aria-hidden="true" /><h3>{model.categoryCount ? "没有找到匹配的海报" : "海报整理中"}</h3>
          <p>{model.categoryCount ? "试试其他标题关键词，或调整上新筛选。" : "该分类的价目海报将在补充后展示。"}</p>
          {filtered ? <button type="button" className="button button-secondary" onClick={() => onChange({ query: "", newOnly: false, page: 1 })}>清除搜索和筛选</button> : null}
        </div>}
    </div>
    <footer className="directory-pagination" aria-label="海报分页">
      <div className="directory-page-controls">
        <button type="button" className="button button-secondary" disabled={model.page <= 1} onClick={() => onChange({ page: model.page - 1 })}><ArrowLeft size={18} aria-hidden="true" />上一页</button>
        <span className="directory-page-number" aria-live="polite" aria-atomic="true">第 <strong>{model.page}</strong> / {model.pages} 页</span>
        <button type="button" className="button button-secondary" disabled={model.page >= model.pages} onClick={() => onChange({ page: model.page + 1 })}>下一页<ArrowRight size={18} aria-hidden="true" /></button>
      </div>
      <form className="directory-page-jump" onSubmit={event => { event.preventDefault(); const page = Number(jump); if (Number.isInteger(page) && page >= 1 && page <= model.pages) onChange({ page }); }}>
        <span className="directory-page-size">每页 {POSTERS_PER_PAGE} 张</span>
        {model.pages > 1 ? <><label htmlFor="directory-page-input">跳至</label><input id="directory-page-input" type="number" inputMode="numeric" min={1} max={model.pages} required value={jump} aria-label="跳转页码" onChange={event => setJump(event.target.value)} /><button type="submit" className="button button-secondary">跳转</button></> : null}
      </form>
    </footer>
  </div>;
}
