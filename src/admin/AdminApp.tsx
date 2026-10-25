import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Crown, ExternalLink, Gift, Home, Image as ImageIcon, Images, LockKeyhole, LogOut, MessageCircle, Save } from "lucide-react";
import { parseCatalog, type Catalog, type Poster } from "../catalog";
import wordmark from "../assets/wordmark.webp";
import { ApiError, request } from "./api";
import { PosterEditor, newPoster } from "./PosterEditor";
import { BenefitsEditor, ContactEditor, HomeEditor } from "./ContentEditors";
import { BannersEditor } from "./BannersEditor";
import { mergeSection, sectionDirty, type AdminSection } from "./sections";
import "./admin.css";
interface Snapshot { catalog: Catalog; revision: string }
const tabs = [{ id: "home", title: "首页设置", Icon: Home }, { id: "banners", title: "首页轮播图", Icon: Images }, { id: "posters", title: "价目海报", Icon: ImageIcon }, { id: "contact", title: "联系客服", Icon: MessageCircle }, { id: "benefits", title: "预存福利", Icon: Gift }, { id: "rights", title: "老板权益", Icon: Crown }] as const;
export default function AdminApp() {
  const [checking, setChecking] = useState(true); const [configured, setConfigured] = useState(true);
  const [csrf, setCsrf] = useState(""); const [password, setPassword] = useState("");
  const [benefitImages, setBenefitImages] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null); const [draft, setDraft] = useState<Catalog | null>(null);
  const [tab, setTab] = useState<AdminSection>("posters"); const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(0);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const dirty = !!draft && !!snapshot && JSON.stringify(draft) !== JSON.stringify(snapshot.catalog);
  const activeDirty = !!draft && !!snapshot && sectionDirty(tab, draft, snapshot.catalog);
  const otherDirty = !!draft && !!snapshot && tabs.some(item => item.id !== tab && sectionDirty(item.id, draft, snapshot.catalog));
  const onError = useCallback((value: unknown) => {
    if (value instanceof ApiError && value.status === 401) setCsrf("");
    setError(value instanceof Error ? value.message : "操作失败，请稍后重试。"); setNotice("");
  }, []);
  const onBusy = useCallback((active: boolean) => setUploading(n => Math.max(0, n + (active ? 1 : -1))), []);
  const change = useCallback((update: (value: Catalog) => Catalog) => { setDraft(d => d ? update(d) : d); setError(""); setNotice(""); }, []);
  const changePoster = useCallback((id: string, patch: Partial<Poster>) => change(c => ({ ...c, entries: c.entries.map(p => p.id === id ? { ...p, ...patch } : p) })), [change]);
  const loadContent = async (signal?: AbortSignal) => {
    const data = await request<Snapshot>("content", { signal }); setSnapshot(data); setDraft(structuredClone(data.catalog)); setSelected(data.catalog.entries[0]?.id || "");
  };
  useEffect(() => {
    document.title = "内容管理｜雪烬电竞";
    const controller = new AbortController();
    void (async () => {
      try { const session = await request<{ configured: boolean; authenticated: boolean; csrf?: string; benefitImages?: boolean }>("session", { signal: controller.signal });
        setConfigured(session.configured); setCsrf(session.csrf || ""); setBenefitImages(session.benefitImages === true); if (session.authenticated) await loadContent(controller.signal);
      } catch (e) { if (!controller.signal.aborted) onError(e); } finally { if (!controller.signal.aborted) setChecking(false); }
    })(); return () => controller.abort();
  }, [onError]);
  useEffect(() => {
    if (!dirty && !uploading) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading]);
  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const response = await request<{ csrf: string; benefitImages?: boolean }>("login", { method: "POST", body: JSON.stringify({ password }) }); setCsrf(response.csrf); setBenefitImages(response.benefitImages === true); setPassword(""); await loadContent(); }
    catch (e) { onError(e); } finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || !snapshot || uploading || busy || !activeDirty) return; setBusy(true); setError("");
    try {
      if (tab === "benefits" && !benefitImages && draft.benefits.some(item => item.image)) throw new Error("请更新并重启后台服务后，再保存福利图片。当前草稿已保留。");
      const catalog = parseCatalog(mergeSection(snapshot.catalog, draft, tab));
      const result = await request<Snapshot>("content", { method: "PUT", body: JSON.stringify({ catalog, revision: snapshot.revision }) }, csrf);
      setSnapshot(result); setDraft(current => current ? mergeSection(current, result.catalog, tab) : structuredClone(result.catalog)); setNotice("当前栏目已保存发布，刷新网站即可查看。");
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const cancel = () => { if (activeDirty && !confirm("放弃当前栏目尚未保存的修改？其他栏目的草稿会保留。")) return; if (snapshot) setDraft(current => current ? mergeSection(current, snapshot.catalog, tab) : null); setError(""); setNotice(""); };
  const logout = async () => {
    if (dirty && !confirm("有尚未保存的修改，仍要退出登录？")) return;
    try { await request("logout", { method: "POST" }, csrf); setCsrf(""); setDraft(null); setSnapshot(null); setError(""); setNotice(""); } catch (e) { onError(e); }
  };
  const addPoster = () => { const poster = newPoster(); change(c => ({ ...c, entries: [...c.entries, poster] })); setSelected(poster.id); };
  const removePoster = (id: string) => { if (confirm("删除这张海报？保存后生效，上传文件会保留用于备份。")) change(c => ({ ...c, entries: c.entries.filter(p => p.id !== id) })); };
  const movePoster = (id: string, step: number) => change(c => {
    const entries = [...c.entries]; const i = entries.findIndex(p => p.id === id); const target = i + step;
    if (i < 0 || target < 0 || target >= entries.length) return c;
    [entries[i], entries[target]] = [entries[target], entries[i]]; return { ...c, entries };
  });
  const controls = <div className="admin-savebar"><button type="submit" className="button button-primary" disabled={!activeDirty || busy || uploading > 0}><Save size={18} />{busy ? "正在保存…" : "保存发布"}</button><button type="button" className="button button-secondary" onClick={cancel}>取消</button><span className="save-status">{uploading ? "图片处理中…" : activeDirty ? "本栏目尚未保存" : "本栏目已保存"}</span></div>;
  if (checking) return <div className="app-loading" role="status">正在检查登录状态…</div>;
  if (!csrf) return <div className="admin-login-page"><form className="login-form" onSubmit={login}>
    <a href="/"><img src={wordmark} width={432} height={144} alt="雪烬电竞" /></a><span className="login-lock"><LockKeyhole aria-hidden="true" /></span><h1>内容管理</h1><p>登录后管理价目海报、客服与福利。</p>
    {!configured ? <div className="admin-message" role="status">尚未设置管理密码。请在服务器运行 <code>npm run admin:password</code>，完成后重启服务。</div> : <label className="form-field"><span>管理密码</span><input type="password" required minLength={12} maxLength={200} value={password} autoComplete="current-password" onChange={e => setPassword(e.target.value)} /></label>}
    {error ? <p className="admin-error" role="alert">{error}</p> : null}<button className="button button-primary" disabled={busy || !configured}>{busy ? "正在登录…" : "登录后台"}</button><a className="login-back" href="/">返回价目表</a>
  </form></div>;
  return <div className="admin-app">
    <header className="admin-header"><div className="admin-brand"><img src={wordmark} width={432} height={144} alt="雪烬电竞" /><span>内容管理</span></div><div className="admin-header-actions"><a className="button button-secondary" href="/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /><span>查看网站</span></a><button type="button" className="button button-secondary" disabled={busy || uploading > 0} onClick={() => void logout()}><LogOut size={18} /><span>退出登录</span></button></div></header>
    <div className="admin-layout"><nav className="admin-nav" aria-label="内容管理导航">{tabs.map(({ id, title, Icon }) => <button type="button" key={id} disabled={busy || uploading > 0} aria-current={tab === id ? "page" : undefined} aria-description={draft && snapshot && sectionDirty(id, draft, snapshot.catalog) ? "有未发布的修改" : undefined} onClick={() => { setTab(id); setError(""); setNotice(""); }}><Icon size={23} aria-hidden="true" />{title}{draft && snapshot && sectionDirty(id, draft, snapshot.catalog) ? <span className="admin-dirty-dot" aria-hidden="true" /> : null}</button>)}</nav>
    <main className="admin-main">{draft && snapshot ? <form onSubmit={save}><fieldset className="admin-fieldset" disabled={busy || uploading > 0}>
      {tab === "home" ? <HomeEditor catalog={draft} onChange={change} /> : null}
      {tab === "banners" ? <BannersEditor catalog={draft} csrf={csrf} onChange={change} onBusy={onBusy} onError={onError} /> : null}
      {tab === "posters" ? <PosterEditor catalog={draft} csrf={csrf} selected={selected} footer={controls} onSelect={setSelected} onAdd={addPoster} onChange={changePoster} onRemove={removePoster} onMove={movePoster} onBusy={onBusy} onError={onError} /> : null}
      {tab === "contact" ? <ContactEditor catalog={draft} csrf={csrf} onChange={change} onBusy={onBusy} onError={onError} /> : null}
      {tab === "benefits" ? <BenefitsEditor catalog={draft} csrf={csrf} imageEnabled={benefitImages} onChange={change} onBusy={onBusy} onError={onError} /> : null}
      {tab === "rights" ? <BenefitsEditor catalog={draft} csrf={csrf} imageEnabled={benefitImages} onChange={change} onBusy={onBusy} onError={onError} section="ownerRights" /> : null}
      {tab !== "posters" ? controls : null}
    </fieldset></form> : <div className="admin-empty-message"><p>内容尚未加载。</p><button className="button button-primary" onClick={() => void loadContent().catch(onError)}>重新加载内容</button></div>}
      {otherDirty ? <p className="admin-draft-hint">其他栏目有未发布的修改，可切换回去继续编辑；保存和取消仅针对当前栏目。</p> : null}
      {error ? <div className="admin-error" role="alert"><p>{error}</p><button type="button" className="text-link" onClick={() => { if (!dirty || confirm("重新加载将放弃当前修改，继续？")) void loadContent().then(() => setError("")).catch(onError); }}>重新加载内容</button></div> : null}
      <p className="admin-notice" role="status">{notice}</p>
    </main></div>
  </div>;
}
