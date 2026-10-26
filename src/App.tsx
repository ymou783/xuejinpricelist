import { lazy, Suspense } from "react";
import { Header } from "./components/Header";
import { CategoryHome } from "./components/CategoryHome";
import { ContentPanel } from "./components/ContentPanel";
import { PosterSearch } from "./components/PosterSearch";
import { useCatalog } from "./hooks/useCatalog";
import { usePageRoute } from "./hooks/usePageRoute";
const ImageViewer = lazy(() => import("./components/ImageViewer"));
const AdminApp = lazy(() => import("./admin/AdminApp"));
function PublicApp() {
  const catalog = useCatalog(); const route = usePageRoute(); const data = catalog.data;
  const poster = data?.entries.find(p => p.id === route.poster && (route.section === "latest" ? p.isNew : p.category === route.section));
  const benefit = route.section === "benefits" ? data?.benefits.find(item => item.id === route.poster) : undefined;
  const right = route.section === "rights" ? data?.ownerRights.find(item => item.id === route.poster) : undefined;
  const contact = route.section === "contact" ? data?.contacts.find(item => item.id === route.poster) : undefined;
  const content = benefit ?? right;
  const viewerImage = poster ?? (content?.image ? { title: content.title, image: content.image } : contact?.image ? { title: contact.label, image: contact.image } : null);
  return <><a className="skip-link" href="#categories">跳到分类入口</a><Header brand={data?.brand ?? "雪烬电竞"} />
    <CategoryHome heading={data?.heading ?? "三角洲价目表"} banners={data?.banners ?? []} ownerRights={data?.ownerRights ?? []} domain={data?.cdnDomain ?? "img.xuejinclub.com"} search={<PosterSearch data={data} status={catalog.status} onRetry={catalog.retry} onSelect={poster => route.select(poster.category, poster.id)} />} onOpen={route.navigate} onOpenRightsImage={id => route.navigate("rights", id)} />
    <footer className="shell site-footer"><span>{data?.brand ?? "雪烬电竞"} · 价目表</span></footer>
    {route.section && route.section !== "rights" ? <ContentPanel key={route.section} section={route.section} initialPoster={route.selected} data={data} status={catalog.status} onRetry={catalog.retry} onClose={route.back} onOpen={id => route.navigate(route.section!, id)} /> : null}
    {viewerImage && data ? <Suspense fallback={<div className="viewer-loading" role="status">正在打开图片…</div>}><ImageViewer key={route.section + "/" + route.poster} poster={viewerImage} domain={data.cdnDomain} onClose={route.back} /></Suspense> : null}
  </>;
}
export default function App() {
  return /\/admin\/?$/.test(location.pathname) ? <Suspense fallback={<div className="app-loading">正在加载管理后台…</div>}><AdminApp /></Suspense> : <PublicApp />;
}
