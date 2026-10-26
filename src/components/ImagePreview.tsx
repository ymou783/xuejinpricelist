import { useState } from "react";
import { AlertCircle, ZoomIn } from "lucide-react";
import type { ImageAsset } from "../catalog";
import { imageUrl, responsiveSources } from "../cdn";

interface Props { image: ImageAsset; title: string; domain: string; onOpen: () => void; variant?: "poster" | "contact" | "rights" }
export function ImagePreview({ image, title, domain, onOpen, variant = "poster" }: Props) {
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  const sizes = variant === "contact" ? "(max-width: 360px) calc(100vw - 68px), 260px" : variant === "rights" ? "(max-width: 600px) calc(100vw - 80px), 520px" : "(max-width: 700px) calc(100vw - 64px), 760px";
  return <div className={"panel-poster" + (variant === "poster" ? "" : ` ${variant}-image-preview`)}>
    {failed ? <div className="image-error" role="alert"><AlertCircle aria-hidden="true" /><p>图片暂时无法加载</p><button type="button" className="button button-primary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重新加载图片</button></div>
      : <button type="button" className="poster-preview" aria-label={"放大查看" + title} onClick={onOpen}>
        <img src={imageUrl(domain, image, variant === "contact" ? 600 : 900, attempt)} srcSet={responsiveSources(domain, image, undefined, attempt)} sizes={sizes} width={image.width} height={image.height} alt={image.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        <span className="poster-zoom"><ZoomIn size={18} aria-hidden="true" />点击放大</span>
      </button>}
  </div>;
}
