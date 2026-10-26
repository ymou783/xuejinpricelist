import type { ImageAsset } from "../catalog";

export function cdnImage(image: ImageAsset | undefined, objectKey: string, alt: string, required = false): ImageAsset | undefined {
  if (!objectKey && !required) return;
  const samePath = image?.source === "cdn" && image.objectKey === objectKey;
  return { source: "cdn", objectKey, width: samePath ? image.width : 0, height: samePath ? image.height : 0, alt: image?.alt.trim() ? image.alt : alt };
}
