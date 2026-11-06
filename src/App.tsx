import { lazy, Suspense, useMemo } from "react";
import { Header } from "./components/Header";
import { CategoryHome } from "./components/CategoryHome";
import { ContentPanel } from "./components/ContentPanel";
import { PosterSearch } from "./components/PosterSearch";
import { useCatalog } from "./hooks/useCatalog";
import { usePageRoute } from "./hooks/usePageRoute";
import { isPosterSection, posterDirectory, POSTERS_PER_PAGE } from "./posterDirectory";
const ImageViewer = lazy(() => import("./components/ImageViewer"));
const AdminApp = lazy(() => import("./admin/AdminApp"));
const WarriorPortal=lazy(()=>import("./warrior/WarriorPortal"));
import { WarriorPanel } from "./components/WarriorPanel";
function PublicApp() {
  const catalog = useCatalog(); const route = usePageRoute(); const data = catalog.data;
  const directory = useMemo(() => data && isPosterSection(route.section) ? posterDirectory(data.entries, route.section, route) : null,
    [data, route.section, route.query, route.newOnly, route.page, route.selected]);
  const poster = data?.entries.find(p => p.id === route.poster && (route.section === "latest" ? p.isNew : p.category === route.section));
  const benefit = route.section === "benefits" ? data?.benefits.find(item => item.id === route.poster) : undefined;
  const right = route.section === "rights" ? data?.ownerRights.find(item => item.id === route.poster) : undefined;
  const contact = route.section === "contact" ? data?.contacts.find(item => item.id === route.poster) : undefined;
  const content = benefit ?? right;
  const warrior=route.section==="warriors"?data?.warriors.find(w=>w.id===route.poster):undefined;
  const warriorImage=warrior?(route.image==="avatar"?warrior.avatar:warrior.images.find(p=>p.id===route.image)?.image):undefined;
  const viewerImage = poster ?? (content?.image ? { title: content.title, image: content.image } : contact?.image ? { title: contact.label, image: contact.image } : warriorImage?{title:warrior!.name,image:warriorImage}:null);
  const viewerIndex = directory?.matches.findIndex(item => item.id === route.poster) ?? -1;
  const sequence = directory && viewerIndex >= 0 ? {
    position: viewerIndex + 1, total: directory.matches.length,
    onPrevious: viewerIndex > 0 ? () => route.replacePoster(directory.matches[viewerIndex - 1].id, Math.floor((viewerIndex - 1) / POSTERS_PER_PAGE) + 1) : undefined,
    onNext: viewerIndex + 1 < directory.matches.length ? () => route.replacePoster(directory.matches[viewerIndex + 1].id, Math.floor((viewerIndex + 1) / POSTERS_PER_PAGE) + 1) : undefined,
  } : undefined;
  return <><a className="skip-link" href="#categories">跳到分类入口</a><Header brand={data?.brand ?? "雪烬电竞"} />
    <CategoryHome heading={data?.heading ?? "三角洲价目表"} banners={data?.banners ?? []} ownerRights={data?.ownerRights ?? []} domain={data?.cdnDomain ?? "img.xuejinclub.com"} search={<PosterSearch data={data} status={catalog.status} onRetry={catalog.retry} onSelect={poster => route.select(poster.category, poster.id)} />} onOpen={route.navigate} onOpenRightsImage={id => route.navigate("rights", id)} />
    <footer className="shell site-footer"><span>{data?.brand ?? "雪烬电竞"} · 价目表</span><a className="footer-warrior-link" href={import.meta.env.BASE_URL+"warrior"}>武将登录</a></footer>
    {route.section && route.section !== "rights" && route.section!=="warriors" ? <ContentPanel key={route.section} section={route.section} directory={directory} directoryState={route} viewerOpen={Boolean(viewerImage)} data={data} status={catalog.status} onRetry={catalog.retry} onClose={route.back} onDirectoryChange={route.updateDirectory} onOpen={(id, page) => route.navigate(route.section!, id, page)} /> : null}
    {route.section==="warriors"?<WarriorPanel data={data} status={catalog.status} activeId={route.poster} state={route} imageOpen={Boolean(warriorImage)} onRetry={catalog.retry} onBack={route.back} onChange={route.updateDirectory} onOpen={(id,page)=>route.navigate("warriors",id,page)} onImage={route.showImage} onPoster={p=>route.select(p.category,p.id)} onContact={()=>route.navigate("contact")}/>:null}
    {viewerImage && data ? <Suspense fallback={<div className="viewer-loading" role="status">正在打开图片…</div>}><ImageViewer key={route.section + "/" + route.poster + "/" + (route.image??"")} poster={viewerImage} domain={data.cdnDomain} onClose={route.back} sequence={sequence} /></Suspense> : null}
  </>;
}
export default function App() {
  if(/\/warrior\/?$/.test(location.pathname))return <Suspense fallback={<div className="app-loading">正在打开武将入口…</div>}><WarriorPortal/></Suspense>;
  return /\/admin\/?$/.test(location.pathname) ? <Suspense fallback={<div className="app-loading">正在加载管理后台…</div>}><AdminApp /></Suspense> : <PublicApp />;
}
