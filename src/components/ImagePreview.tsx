import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AlertCircle, ZoomIn } from "lucide-react";
import type { ImageAsset } from "../catalog";
import { imageUrl, responsiveSources } from "../cdn";

interface Props { image: ImageAsset; title: string; domain: string; onOpen: () => void; variant?: "poster" | "contact" | "rights" }
export function ImagePreview({ image, title, domain, onOpen, variant = "poster" }: Props) {
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  const button = useRef<HTMLButtonElement>(null); const [previewWidth, setPreviewWidth] = useState(360);
  useLayoutEffect(() => {
    if (variant !== "poster" || !button.current) return;
    const element = button.current;
    const measure = () => setPreviewWidth(Math.max(1, Math.ceil(element.clientWidth)));
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [variant, failed]);
  const sizes = variant === "contact" ? "(max-width: 360px) calc(100vw - 68px), 260px" : variant === "rights" ? "(max-width: 600px) calc(100vw - 80px), 520px" : previewWidth + "px";
  return <div className={"panel-poster" + (variant === "poster" ? "" : ` ${variant}-image-preview`)}>
    {failed ? <div className="image-error" role="alert"><AlertCircle aria-hidden="true" /><p>图片暂时无法加载</p><button type="button" className="button button-primary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重新加载图片</button></div>
      : <button ref={button} type="button" className="poster-preview" style={variant === "poster" ? { aspectRatio: image.width + "/" + image.height, "--poster-ratio": image.width / image.height } as CSSProperties : undefined} aria-label={"放大查看" + title} onClick={onOpen}>
        <img src={imageUrl(domain, image, variant === "contact" ? 600 : 900, attempt)} srcSet={responsiveSources(domain, image, undefined, attempt)} sizes={sizes} width={image.width} height={image.height} alt={image.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        <span className="poster-zoom"><ZoomIn size={18} aria-hidden="true" />点击放大</span>
      </button>}
  </div>;
}
