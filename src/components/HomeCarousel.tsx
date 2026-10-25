import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Banner } from "../catalog";
import { imageUrl, responsiveSources } from "../cdn";
import flame from "../assets/ice-flame-1200.webp";
import smallFlame from "../assets/ice-flame-600.webp";

function BannerImage({ banner, domain, onReady }: { banner: Banner; domain: string; onReady: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return failed ? <div className="image-error carousel-image-error" role="alert">
    <AlertCircle aria-hidden="true" /><p>轮播图暂时无法加载</p>
    <button type="button" className="button button-primary" onClick={() => { setAttempt(n => n + 1); setFailed(false); }}>重新加载轮播图</button>
  </div> : <img className="carousel-image" src={imageUrl(domain, banner.image, 1200, attempt)}
    srcSet={responsiveSources(domain, banner.image, [360, 600, 900, 1200, 1800], attempt)}
    sizes="(max-width: 850px) calc(100vw - 40px), 1312px"
    width={banner.image.width} height={banner.image.height} alt={banner.image.alt}
    decoding="async" fetchPriority="high" onLoad={() => onReady(banner.id)} onError={() => setFailed(true)} />;
}

export function HomeCarousel({ heading, banners, domain }: { heading: string; banners: Banner[]; domain: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [readyId, setReadyId] = useState("");
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const activeIndex = banners.length ? index % banners.length : 0;
  const current = banners[activeIndex];
  const hasMultiple = banners.length > 1;
  const onReady = useCallback((id: string) => setReadyId(id), []);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReducedMotion(media.matches);
    const visibility = () => setVisible(document.visibilityState === "visible");
    media.addEventListener("change", motion); document.addEventListener("visibilitychange", visibility);
    return () => { media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (!hasMultiple || paused || hovered || focused || reducedMotion || !visible || readyId !== current?.id) return;
    const timer = setInterval(() => setIndex(n => (n + 1) % banners.length), 5000);
    return () => clearInterval(timer);
  }, [hasMultiple, paused, hovered, focused, reducedMotion, visible, readyId, current?.id, banners.length]);

  const select = (next: number) => { setIndex((next + banners.length) % banners.length); setPaused(true); };
  return <section className="hero-carousel" aria-label="首页轮播图" aria-roledescription="轮播图"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => {
      if (!hasMultiple || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault(); select(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
    }}>
    {current ? <>
      <h1 className="sr-only" id="page-title">{heading}</h1>
      <div className="carousel-slide" role="group" aria-roledescription="幻灯片" aria-label={`${activeIndex + 1} / ${banners.length}：${current.title}`}>
        <BannerImage key={current.id} banner={current} domain={domain} onReady={onReady} />
      </div>
    </> : <div className="home-hero carousel-fallback">
      <img className="hero-art" src={flame} srcSet={`${smallFlame} 600w, ${flame} 1200w`} sizes="(max-width: 700px) 280px, 620px" width="1200" height="858" alt="" fetchPriority="high" />
      <div className="hero-copy"><h1 id="page-title">{heading}</h1></div>
    </div>}
    {hasMultiple ? <div className="carousel-controls" aria-label="轮播图控制">
      <button type="button" className="icon-button" aria-label="上一张轮播图" onClick={() => select(activeIndex - 1)}><ChevronLeft aria-hidden="true" /></button>
      <div className="carousel-pagination" role="group" aria-label="选择轮播图">
        {banners.length <= 3 ? banners.map((banner, position) => <button key={banner.id} type="button" aria-label={`查看第 ${position + 1} 张轮播图：${banner.title}`} aria-pressed={position === activeIndex} onClick={() => select(position)}><span /></button>)
          : <span className="carousel-count">{activeIndex + 1} / {banners.length}</span>}
      </div>
      <button type="button" className="icon-button" aria-label="下一张轮播图" onClick={() => select(activeIndex + 1)}><ChevronRight aria-hidden="true" /></button>
      {!reducedMotion ? <button type="button" className="icon-button" aria-label={paused ? "开始自动轮播" : "暂停自动轮播"} onClick={() => {
        // An explicit play action also resumes interaction pauses, including touch-generated hover.
        if (paused) { setFocused(false); setHovered(false); }
        setPaused(value => !value);
      }}>{paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}</button> : null}
      <span className="sr-only" role="status" aria-live={paused ? "polite" : "off"}>第 {activeIndex + 1} 张，共 {banners.length} 张</span>
    </div> : null}
  </section>;
}
