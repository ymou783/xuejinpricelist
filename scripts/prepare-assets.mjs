import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const source = new URL("../design/wordmark-source.png", import.meta.url);
const target = new URL("../src/assets/wordmark.webp", import.meta.url);
await mkdir(new URL("../src/assets/", import.meta.url), { recursive: true });
const info = await sharp(source.pathname)
  .resize({ width: 432, withoutEnlargement: true })
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toFile(target.pathname);
console.log("Optimized wordmark: " + Math.round(info.size / 1024) + " KB");
for (const width of [600, 1200]) {
  const flame = await sharp(new URL("../design/ice-flame-source.png", import.meta.url).pathname)
    .resize({ width, withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 95, effort: 6 })
    .toFile(new URL(`../src/assets/ice-flame-${width}.webp`, import.meta.url).pathname);
  console.log(`Optimized ice flame ${width}: ${Math.round(flame.size / 1024)} KB`);
}
