import type { ImageAsset } from "../catalog";
import { cdnImage } from "./imageSource";

interface Props { image?: ImageAsset; alt: string; required?: boolean; disabled?: boolean; onChange: (image: ImageAsset | undefined) => void }
export function CdnImageFields({ image, alt, required = false, disabled = false, onChange }: Props) {
  const isCdn = image?.source === "cdn"; const isUpload = image?.source === "upload";
  const needsCdn = isCdn || (required && !isUpload);
  const size = (field: "width" | "height", value: string) => onChange({ ...cdnImage(image, isCdn ? image.objectKey : "", alt, true)!, [field]: Number(value) });
  return <>
    <label className="form-field"><span>CDN 对象路径</span><input maxLength={600} required={needsCdn} disabled={disabled} value={isCdn ? image.objectKey : ""} placeholder="images/文件名.jpg" onChange={event => onChange(cdnImage(image, event.target.value, alt, required))} /></label>
    <p className="field-help">仅填写桶内对象路径，不含域名或开头的 /。填写后设置原图宽高；更换路径后需重新填写宽高。{isUpload ? "当前使用服务器上传图片，填入路径后会改用 CDN 图片。" : "图片使用首页设置中的 CDN 域名。"}{!required && isCdn ? "清空路径会移除图片，文案保留。" : ""}</p>
    {required || isCdn ? <div className="form-two-columns">
      <label className="form-field"><span>原图宽度</span><input type="number" min={1} max={30000} required={needsCdn} disabled={disabled} readOnly={isUpload} value={image?.width || ""} onChange={event => size("width", event.target.value)} /></label>
      <label className="form-field"><span>原图高度</span><input type="number" min={1} max={30000} required={needsCdn} disabled={disabled} readOnly={isUpload} value={image?.height || ""} onChange={event => size("height", event.target.value)} /></label>
    </div> : null}
  </>;
}
