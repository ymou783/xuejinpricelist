import { useEffect, useRef, useState } from "react";
import type { ImageAsset } from "../catalog";
import { cdnImage } from "./imageSource";
import { request } from "./api";

interface Props { image?: ImageAsset; alt: string; csrf: string; required?: boolean; disabled?: boolean; autoOnMount?: boolean; onChange: (image: ImageAsset | undefined) => void }
export function CdnImageFields({ image, alt, csrf, required = false, disabled = false, autoOnMount = true, onChange }: Props) {
  const isCdn = image?.source === "cdn"; const isUpload = image?.source === "upload";
  const needsCdn = isCdn || (required && !isUpload);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  const current = useRef({ image, onChange });
  const edited = useRef(false);
  useEffect(() => { current.current = { image, onChange }; });
  const key = isCdn ? image.objectKey : "";
  useEffect(() => {
    setState("idle"); setError("");
    const before = current.current.image;
    if (disabled || !csrf || !key) return;
    if (!autoOnMount && !edited.current && !retry) return;
    if (key.startsWith("/") || /[\\?#\x00-\x1f:]/.test(key) || key.split("/").some(p => !p || p === "." || p === "..")) {
      setState("error"); setError("对象路径格式不正确，请仅填写桶内路径，不含域名、开头 / 或查询参数。"); return;
    }
    if (!retry && before?.width && before.height) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState("loading");
      void request<{ width: number; height: number }>("posters/image-info", { method: "POST", signal: controller.signal, body: JSON.stringify({ objectKey: key }) }, csrf)
        .then(size => {
          const latest = current.current;
          if (controller.signal.aborted || latest.image?.source !== "cdn" || latest.image.objectKey !== key) return;
          // Never overwrite dimensions filled manually while a request was running.
          const width = retry ? size.width : latest.image.width || size.width;
          const height = retry ? size.height : latest.image.height || size.height;
          if (latest.image.width !== width || latest.image.height !== height) latest.onChange({ ...latest.image, width, height });
          setState("success");
        })
        .catch(e => { if (!controller.signal.aborted) { setState("error"); setError(e instanceof Error ? e.message : "读取失败，请重试或手动填写。"); } });
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, csrf, disabled, retry, autoOnMount]);
  const size = (field: "width" | "height", value: string) => onChange({ ...cdnImage(image, key, alt, true)!, [field]: Number(value) });
  return <>
    <label className="form-field"><span>CDN 对象路径</span><input maxLength={600} required={needsCdn} disabled={disabled} value={key} placeholder="images/文件名.jpg" onChange={event => { edited.current = true; setRetry(0); onChange(cdnImage(image, event.target.value, alt, required)); }} /></label>
    <p className="field-help">填写桶内对象路径，不含域名或开头的 /，停顿后自动读取原图宽高。使用「首页设置」已保存的 CDN 域名。{isUpload ? "填入路径后会改用 CDN 图片。" : ""}{!required && isCdn ? "清空路径会移除图片，文案保留。" : ""}</p>
    {isCdn && key ? <div className="cdn-size-status" aria-live="polite">
      {state === "loading" ? <span role="status">正在自动读取原图宽高…</span> : state === "success" ? <span role="status">已读取原图尺寸</span> : state === "error" ? <span role="alert">{error} 可重试或手动填写原图宽高。</span> : null}
      <button type="button" className="text-link" disabled={disabled || state === "loading"} onClick={() => setRetry(n => n + 1)}>{state === "error" ? "重试读取尺寸" : "重新读取尺寸"}</button>
    </div> : null}
    {required || isCdn ? <div className="form-two-columns">
      <label className="form-field"><span>原图宽度</span><input type="number" min={1} max={30000} required={needsCdn} disabled={disabled} readOnly={isUpload} value={image?.width || ""} onChange={event => size("width", event.target.value)} /></label>
      <label className="form-field"><span>原图高度</span><input type="number" min={1} max={30000} required={needsCdn} disabled={disabled} readOnly={isUpload} value={image?.height || ""} onChange={event => size("height", event.target.value)} /></label>
    </div> : null}
  </>;
}
