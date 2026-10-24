import { useState } from "react";
import { Image as ImageIcon, LoaderCircle } from "lucide-react";
import type { ImageAsset } from "../catalog";
import { imageUrl } from "../cdn";
import { request } from "./api";
interface Props { csrf: string; image?: ImageAsset; domain: string; kind?: "qr"; onUploaded: (image: ImageAsset) => void; onBusy: (busy: boolean) => void; onError: (error: unknown) => void }
export function UploadField({ csrf, image, domain, kind, onUploaded, onBusy, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { onError(new Error("请选择 15MB 以内的图片。")); return; }
    setBusy(true); onBusy(true);
    try {
      const form = new FormData(); form.append("image", file); if (kind) form.append("kind", kind);
      const asset = await request<ImageAsset>("upload", { method: "POST", body: form }, csrf); onUploaded(asset);
    } catch (error) { onError(error); } finally { setBusy(false); onBusy(false); }
  };
  return <label className={"upload-field" + (busy ? " is-busy" : "")}>
    <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={kind ? "上传客服二维码" : "上传海报图片"} disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
    {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : image?.objectKey ? <img src={imageUrl(domain, image, 360)} alt="当前图片预览" /> : <ImageIcon aria-hidden="true" />}
    <strong>{busy ? "正在上传并优化图片…" : image?.objectKey ? "点击替换图片" : "点击选择图片"}</strong><span>JPG、PNG 或 WebP，最大 15MB</span>
  </label>;
}
