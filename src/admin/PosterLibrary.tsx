import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Image as ImageIcon, Plus, RefreshCw, Search, Upload } from "lucide-react";
import { categories, type CategoryId } from "../catalog";
import { imageUrl } from "../cdn";
import { request } from "./api";
import { AdminDialog } from "./AdminDialog";
import { PosterDetails } from "./PosterDetails";
import { PosterImport } from "./PosterImport";
import { statusLabels, type BatchResult, type ManagedPoster, type PosterPage, type PosterRow } from "./posterTypes";
import "./posters.css";

interface Props { csrf: string; domain: string; onBusy: (busy: boolean) => void; onUnsaved: (dirty: boolean) => void }
export function PosterLibrary({ csrf, domain, onBusy, onUnsaved }: Props) {
  const [q, setQ] = useState(""), [category, setCategory] = useState<"all" | CategoryId>("all");
  const [status, setStatus] = useState("all"), [newOnly, setNewOnly] = useState("all");
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<PosterPage | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()), [batchCategory, setBatchCategory] = useState<CategoryId>("basic");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [failures, setFailures] = useState<BatchResult["failed"]>([]);
  const [record, setRecord] = useState<ManagedPoster | null>(null), [importing, setImporting] = useState(false);
  const [move, setMove] = useState<{ row: PosterRow; position: string } | null>(null);
  const dragging = useRef<string | null>(null);
  const refreshList = useCallback(() => { setLoading(true); setRefresh(n => n + 1); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setSelected(new Set());
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ q, category, status, new: newOnly, page: String(page), pageSize: "6" });
      void request<PosterPage>("posters?" + query, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); })
        .catch(e => { if (!controller.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : "海报库加载失败。"); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, q ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, category, status, newOnly, page, refresh]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); onBusy(true); setError(""); setNotice(""); setFailures([]);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "操作失败，请重试。"); }
    finally { setBusy(false); onBusy(false); }
  };
  const open = (id: string) => void run(async () => { const result = await request<{ record: ManagedPoster }>("posters/" + id); setRecord(result.record); });
  const create = () => void run(async () => {
    const result = await request<{ record: ManagedPoster }>("posters", { method: "POST", body: JSON.stringify({ draft: { category: category === "all" ? "basic" : category } }) }, csrf);
    setRecord(result.record); refreshList();
  });
  const copy = (row: PosterRow) => void run(async () => {
    const result = await request<{ record: ManagedPoster }>("posters/" + row.id + "/copy", { method: "POST", body: JSON.stringify({ version: row.version }) }, csrf);
    setRecord(result.record); refreshList();
  });
  const batch = (action: string, value?: string | boolean) => {
    const items = data?.items.filter(r => selected.has(r.id)).map(r => ({ id: r.id, version: r.version })) || [];
    if (!items.length) return;
    if (action === "delete" && !confirm("删除所选 " + items.length + " 张海报？发布记录和草稿都会删除，图片文件会保留。建议暂时不用的海报选择下架。")) return;
    if (action === "publish" && !confirm("发布所选 " + items.length + " 张海报的已保存草稿？完整条目会发布，未填完整的条目会单独列出。")) return;
    void run(async () => {
      const result = await request<BatchResult>("posters/batch", { method: "POST", body: JSON.stringify({ items, action, value }) }, csrf);
      setNotice("已完成 " + result.succeeded.length + " 张" + (result.failed.length ? "，" + result.failed.length + " 张未完成。" : "。"));
      setFailures(result.failed); refreshList();
    });
  };
  const reorder = (row: PosterRow, position: number) => void run(async () => {
    await request("posters/" + row.id + "/move", { method: "POST", body: JSON.stringify({ position, revision: data?.revision }) }, csrf);
    setMove(null); setNotice("分类内顺序已保存，已发布海报的前台顺序同步更新。"); refreshList();
  });
  const draggable = category !== "all" && !q.trim() && status === "all" && newOnly === "all";
  const blocked = busy || loading;
  return <section className="poster-library" aria-label="价目海报管理">
    <div className="admin-section-heading"><div><h1>价目海报</h1><p>按分类管理，先存草稿，再按需发布。</p></div><div className="poster-heading-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => setImporting(true)}><Upload size={18} />批量添加</button><button type="button" className="button button-primary" disabled={busy} onClick={create}><Plus size={18} />新增海报</button></div></div>
    <div className="poster-stats"><strong>{data?.counts.all ?? "—"}</strong><span>张海报</span><span className="poster-stats-note">草稿、已发布和已下架均保留在海报库</span></div>
    <fieldset className="admin-fieldset" disabled={busy}>
      <div className="poster-category-tabs" aria-label="按海报分类筛选">{[{ id: "all", title: "全部海报" }, ...categories].map(c => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => { setCategory(c.id as typeof category); setPage(1); }}>{c.title}<span>{data?.counts[c.id as keyof PosterPage["counts"]] ?? 0}</span></button>)}</div>
      <div className="poster-toolbar"><label className="poster-search"><Search size={20} aria-hidden="true" /><span className="sr-only">搜索海报标题或说明</span><input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="搜索标题或说明…" /></label>
        <label className="poster-filter"><span>状态</span><select aria-label="筛选发布状态" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下架</option></select></label>
        <label className="poster-filter"><span>上新</span><select aria-label="筛选上新状态" value={newOnly} onChange={e => { setNewOnly(e.target.value); setPage(1); }}><option value="all">全部</option><option value="yes">已设上新</option><option value="no">未设上新</option></select></label>
        <button type="button" className="button button-secondary" aria-label="刷新海报库" onClick={refreshList}><RefreshCw size={18} />刷新</button>
      </div>
    </fieldset>
    {notice ? <p className="admin-notice" role="status">{notice}</p> : null}
    {error ? <div className="admin-error" role="alert">{error}<button type="button" className="text-link" onClick={refreshList}>重新加载海报库</button></div> : null}
    {failures.length ? <div className="poster-batch-failures" role="alert"><strong>以下海报未完成，已完成的操作已保存：</strong><ul>{failures.map(f => <li key={f.id}><button type="button" className="text-link" onClick={() => open(f.id)}>{f.title}</button>：{f.error}</li>)}</ul></div> : null}
    <div className="poster-batchbar">
      <label className="poster-select-all"><input type="checkbox" aria-label="选择本页全部海报" disabled={blocked || !data?.items.length} checked={!!data?.items.length && data.items.every(r => selected.has(r.id))} onChange={e => setSelected(e.target.checked ? new Set(data?.items.map(r => r.id)) : new Set())} /><span>{selected.size ? "已选本页 " + selected.size + " 张" : "选择本页"}</span></label>
      {selected.size ? <fieldset className="admin-fieldset poster-batch-actions" disabled={blocked}>
        <select aria-label="批量目标分类" value={batchCategory} onChange={e => setBatchCategory(e.target.value as CategoryId)}>{categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select><button type="button" className="button button-secondary" onClick={() => batch("category",batchCategory)}>修改分类</button>
        <button type="button" className="button button-secondary" onClick={() => batch("new",true)}>设为上新</button><button type="button" className="button button-secondary" onClick={() => batch("new",false)}>取消上新</button>
        <button type="button" className="button button-primary" onClick={() => batch("publish")}>批量发布</button><button type="button" className="button button-secondary" onClick={() => batch("offline")}>下架</button><button type="button" className="text-danger" onClick={() => batch("delete")}>删除</button>
      </fieldset> : <span className="field-help">勾选后可批量修改分类、上新、发布或下架</span>}
    </div>
    {selected.size ? <p className="field-help">批量修改分类和上新会直接更新对应字段；编辑窗口中的其他草稿需发布后才会显示在前台。</p> : null}
    <div className="poster-library-content" aria-busy={loading}>
      {loading ? <div className="admin-empty-message" role="status">正在加载海报…</div> : !data?.items.length ? <div className="admin-list-empty"><ImageIcon size={40} /><strong>{data?.counts.all ? "没有匹配的海报" : "还没有海报"}</strong><p>调整搜索和筛选，或添加新的海报。</p></div> : <ul className="poster-library-rows">{data.items.map(row => <li key={row.id} className="poster-library-row" draggable={draggable && !blocked} onDragStart={e => { dragging.current = row.id; e.dataTransfer.setData("text/plain",row.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragging.current = null; }} onDragOver={e => { if (draggable && dragging.current) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const id = dragging.current; dragging.current = null; const source = data.items.find(r => r.id === id); if (source && source.id !== row.id && !blocked) reorder(source,row.position); }}>
        <input type="checkbox" aria-label={"选择海报：" + (row.title || "未命名海报")} checked={selected.has(row.id)} disabled={blocked} onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(row.id); else next.delete(row.id); return next; })} />
        <button type="button" className="poster-row-main" disabled={blocked} onClick={() => open(row.id)}>
          <span className="poster-row-thumb">{row.image ? <img src={imageUrl(domain,row.image,360)} alt="" width={56} height={72} loading="lazy" decoding="async" onError={e => { e.currentTarget.style.visibility = "hidden"; }} /> : <ImageIcon size={25} aria-hidden="true" />}</span>
          <span className="poster-row-text"><strong>{row.title || "未命名海报"}</strong><span>{categories.find(c => c.id === row.category)?.title} · 分类内第 {row.position} 张</span><span className="poster-row-badges"><span className={"poster-badge " + row.status}>{statusLabels[row.status]}</span>{row.isNew ? <span className="poster-badge new">上新</span> : null}{row.hasChanges ? <span className="poster-badge changed">有待发布修改</span> : null}</span></span>
        </button>
        <div className="poster-row-actions">{draggable ? <GripVertical className="poster-grip" size={20} aria-hidden="true" /> : null}<button type="button" className="button button-secondary" disabled={blocked} onClick={() => open(row.id)}>编辑</button><button type="button" className="icon-button" title="复制为草稿" aria-label={"复制海报：" + (row.title || "未命名海报")} disabled={blocked} onClick={() => copy(row)}><Copy size={18} /></button><button type="button" className="button button-secondary" disabled={blocked} onClick={() => setMove({ row, position: String(row.position) })}>排序</button></div>
      </li>)}</ul>}
    </div>
    {draggable ? <p className="field-help">可拖动同页海报调整分类内顺序，也可通过「排序」移到指定位置。</p> : <p className="field-help">选择具体分类并清除其他筛选后可拖动排序；「排序」随时可指定分类内位置。</p>}
    <div className="poster-pagination">
      <span>每页 6 张</span>
      <span role="status">共 {data?.total ?? 0} 张 · 第 {data?.page ?? 1} / {data?.pages ?? 1} 页</span>
      <div className="poster-page-buttons"><button type="button" className="button button-secondary" disabled={blocked || !data || data.page <= 1} onClick={() => setPage((data?.page || 1)-1)}>上一页</button><button type="button" className="button button-secondary" disabled={blocked || !data || data.page >= data.pages} onClick={() => setPage((data?.page || 1)+1)}>下一页</button></div>
    </div>
    {record ? <PosterDetails key={record.draft.id} record={record} csrf={csrf} domain={domain} onClose={() => setRecord(null)} onSaved={refreshList} onBusy={onBusy} onUnsaved={onUnsaved} /> : null}
    {importing ? <PosterImport csrf={csrf} category={category === "all" ? "basic" : category} onClose={() => setImporting(false)} onImported={refreshList} onBusy={onBusy} onUnsaved={onUnsaved} /> : null}
    {move ? <AdminDialog title="调整海报顺序" onClose={() => setMove(null)} busy={busy}><div className="admin-dialog-body"><strong>{move.row.title || "未命名海报"}</strong><p>在所属分类内调整位置，其他分类顺序保留。</p><label className="form-field"><span>分类内位置（1 至 {data?.counts[move.row.category]}）</span><input aria-label="分类内位置" type="number" min={1} max={data?.counts[move.row.category]} value={move.position} onChange={e => setMove({ ...move, position: e.target.value })} /></label><div className="poster-edit-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => reorder(move.row,1)}><ArrowUp size={16} />移到顶部</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => reorder(move.row,data?.counts[move.row.category] || 1)}><ArrowDown size={16} />移到末尾</button><button type="button" className="button button-primary" disabled={busy} onClick={() => reorder(move.row,Number(move.position))}>确认排序</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setMove(null)}>取消</button></div>{error ? <p className="admin-error" role="alert">{error}</p> : null}</div></AdminDialog> : null}
  </section>;
}
