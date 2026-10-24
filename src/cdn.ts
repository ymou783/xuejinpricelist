import type { ImageAsset, Poster } from "./catalog";
function assetOf(poster: Poster | ImageAsset) { return "image" in poster ? poster.image : poster; }
function encodedPath(key: string) { return key.split("/").map(encodeURIComponent).join("/"); }
export function originalUrl(domain: string, poster: Poster | ImageAsset): string {
  const i = assetOf(poster);
  return i.source === "upload" ? import.meta.env.BASE_URL + "uploads/" + encodedPath(i.objectKey) : "https://" + domain + "/" + encodedPath(i.objectKey);
}
export function imageUrl(domain: string, poster: Poster | ImageAsset, width = 600, attempt = 0): string {
  const i = assetOf(poster);
  if (i.source === "upload") return import.meta.env.BASE_URL + "uploads/" + i.objectKey.split("/")[0] + "/" + width + ".webp" + (attempt ? "?retry=" + attempt : "");
  return originalUrl(domain, i) + "?imageMogr2/thumbnail/" + width + "x/format/webp/quality/80" + (attempt ? "&retry=" + attempt : "");
}
export function responsiveSources(domain: string, poster: Poster | ImageAsset, widths = [360, 600, 900, 1200], attempt = 0): string {
  return widths.map(w => imageUrl(domain, poster, w, attempt) + " " + w + "w").join(", ");
}
