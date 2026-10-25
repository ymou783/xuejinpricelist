import { useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { Poster } from "../catalog";
import { imageUrl, originalUrl, responsiveSources } from "../cdn";

interface ImageViewerProps {
  poster: Poster;
  domain: string;
  onClose: () => void;
}

export default function ImageViewer({ poster, domain, onClose }: ImageViewerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [fitWidth, setFitWidth] = useState(900);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const width = Math.round(fitWidth * zoom);

  useLayoutEffect(() => {
    const element = dialog.current;
    const body = scroll.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    const measure = () => {
      if (body) setFitWidth(Math.min(1100, Math.max(220, body.clientWidth - 48)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (body) observer.observe(body);
    return () => {
      observer.disconnect();
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const changeZoom = (next: number) => {
    const bounded = Math.min(3, Math.max(1, next));
    const body = scroll.current;
    const content = canvas.current;
    const centerX = body && content ? (body.scrollLeft + body.clientWidth / 2) / content.offsetWidth : 0.5;
    const centerY = body && content ? (body.scrollTop + body.clientHeight / 2) / content.offsetHeight : 0;
    setZoom(bounded);
    requestAnimationFrame(() => {
      if (body && content) {
        body.scrollLeft = Math.max(0, centerX * content.offsetWidth - body.clientWidth / 2);
        body.scrollTop = Math.max(0, centerY * content.offsetHeight - body.clientHeight / 2);
      }
    });
  };

  return (
    <dialog ref={dialog} className="image-viewer" aria-labelledby="viewer-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="viewer-header">
        <div><h2 id="viewer-title">{poster.title}</h2><p>放大后可拖动或滚动查看价格细节</p></div>
        <button type="button" className="icon-button viewer-close" aria-label="关闭大图" onClick={onClose}><X aria-hidden="true" size={24} /></button>
      </header>
      <div className="viewer-scroll" ref={scroll} tabIndex={0} aria-label="价目表图片，可滚动查看"
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          if (event.target instanceof Element && event.target.closest("button,a,input,select")) return;
          const body = scroll.current;
          if (!body) return;
          drag.current = { x: event.clientX, y: event.clientY, left: body.scrollLeft, top: body.scrollTop };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.classList.add("is-dragging");
        }}
        onPointerMove={(event) => {
          if (!drag.current || !scroll.current) return;
          scroll.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
          scroll.current.scrollTop = drag.current.top - (event.clientY - drag.current.y);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.classList.remove("is-dragging");
        }}
        onPointerCancel={(event) => {
          drag.current = null;
          event.currentTarget.classList.remove("is-dragging");
        }}>
        {failed ? <div className="image-error viewer-image-error" role="alert">
          <AlertCircle size={32} aria-hidden="true" /><p>大图暂时无法加载</p>
          <button className="button button-primary" type="button" onClick={() => {
            setAttempt((value) => value + 1); setFailed(false);
          }}>重新加载大图</button>
        </div> : <div className="viewer-canvas" ref={canvas}>
          <img src={imageUrl(domain, poster, 1200, attempt)}
            srcSet={responsiveSources(domain, poster, [1200, 1800, 2500], attempt)} sizes={width + "px"}
            width={poster.image.width} height={poster.image.height} style={{ width }}
            alt={poster.image.alt} draggable={false} decoding="async" onError={() => setFailed(true)} />
        </div>}
      </div>
      <footer className="viewer-toolbar" aria-label="图片查看工具">
        <div className="zoom-controls">
          <button className="icon-button" type="button" aria-label="缩小" onClick={() => changeZoom(zoom - 0.5)} disabled={zoom <= 1}>
            <Minus size={21} aria-hidden="true" />
          </button>
          <output className="zoom-value" aria-live="polite" aria-label="缩放比例">{Math.round(zoom * 100)}%</output>
          <button className="icon-button" type="button" aria-label="放大" onClick={() => changeZoom(zoom + 0.5)} disabled={zoom >= 3}>
            <Plus size={21} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" aria-label="适应宽度" title="适应宽度" onClick={() => {
            setZoom(1);
            if (scroll.current) { scroll.current.scrollLeft = 0; scroll.current.scrollTop = 0; }
          }}><RotateCcw size={20} aria-hidden="true" /></button>
        </div>
        <a className="viewer-original" href={originalUrl(domain, poster)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={18} aria-hidden="true" />打开原图
        </a>
      </footer>
    </dialog>
  );
}
