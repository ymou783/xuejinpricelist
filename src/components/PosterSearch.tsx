import { useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { categories, type Catalog, type Poster } from "../catalog";

interface Props { data: Catalog | null; status: string; onRetry: () => void; onSelect: (poster: Poster) => void }
function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase().trim(); }

export function PosterSearch({ data, status, onRetry, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const matches = searching ? data?.entries.filter(poster => {
    const title = normalize(poster.title);
    return terms.every(term => title.includes(term));
  }) ?? [] : [];
  const message = status === "loading" ? "正在加载价目表…" : status === "error" ? "价目表暂时无法加载，请重试。" : matches.length ? `找到 ${matches.length} 张价目表` : "没有找到相关价目表，试试其他标题关键词。";

  return <section className="poster-search">
    <form role="search" aria-label="搜索价目表" onSubmit={event => event.preventDefault()}>
      <label htmlFor="poster-search-input">搜索价目表</label>
      <div className="poster-search-field">
        <Search size={24} aria-hidden="true" />
        <input ref={input} id="poster-search-input" type="search" placeholder="输入单子标题，查找价目表" value={query} maxLength={80} autoComplete="off" enterKeyHint="search" aria-describedby={searching ? "poster-search-status" : undefined} onChange={event => setQuery(event.target.value)} />
        {query ? <button type="button" className="icon-button" aria-label="清空搜索" onClick={() => { setQuery(""); input.current?.focus(); }}><X size={21} aria-hidden="true" /></button> : null}
      </div>
    </form>
    {searching ? <div className="poster-search-results">
      <p id="poster-search-status" className="poster-search-status" role="status" aria-atomic="true">{message}</p>
      {status === "error" ? <button type="button" className="button button-secondary" onClick={onRetry}>重新加载价目表</button> : null}
      {status === "ready" && matches.length ? <ul>{matches.map(poster => <li key={poster.id}>
        <a className="poster-search-result" href={`#${poster.category}?item=${poster.id}`} onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(poster); }}>
          <span><strong>{poster.title}</strong><span>{categories.find(category => category.id === poster.category)?.title}</span></span>
          <ChevronRight aria-hidden="true" />
        </a>
      </li>)}</ul> : null}
    </div> : null}
  </section>;
}
