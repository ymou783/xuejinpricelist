import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import sharp from "sharp";
import { problem, validKey } from "./posters.mjs";

const blocked4 = new BlockList();
for (const [ip, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.168.0.0",16],["192.0.2.0",24],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]]) blocked4.addSubnet(ip,prefix,"ipv4");
const global6 = new BlockList(); global6.addSubnet("2000::",3,"ipv6");
const blocked6 = new BlockList(); blocked6.addSubnet("2001:db8::",32,"ipv6");
export function publicAddress(ip) {
  return isIP(ip) === 4 ? !blocked4.check(ip,"ipv4") : isIP(ip) === 6 && global6.check(ip,"ipv6") && !blocked6.check(ip,"ipv6");
}
function publicLookup(host, options, callback) {
  lookup(host, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) return callback(problem("CDN 域名必须解析到公网地址。"));
    if (options.all) callback(null, addresses); else callback(null, addresses[0].address, addresses[0].family);
  });
}
function prefix(url, bytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, finished = false;
    const done = () => { if (!finished) { finished = true; resolve(Buffer.concat(chunks)); } };
    const req = request(url, { lookup: publicLookup, headers: { Range: "bytes=0-" + (bytes - 1), "Accept-Encoding": "identity" } }, res => {
      if (![200,206].includes(res.statusCode)) { res.resume(); reject(problem("CDN 图片返回 " + res.statusCode + "，请检查路径和访问权限。")); return; }
      res.on("data", chunk => {
        const take = chunk.subarray(0, bytes - size); chunks.push(take); size += take.length;
        if (size >= bytes) { done(); res.destroy(); }
      });
      res.on("end", done); res.on("error", e => { if (!finished) reject(e); });
    });
    // Absolute deadline also covers slow streaming and DNS.
    const timer = setTimeout(() => req.destroy(problem("读取 CDN 图片超时，可重试或手动填写宽高。")), 10000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", e => { if (!finished) reject(e); }); req.end();
  });
}
export async function cdnImageInfo(domain, key, readPrefix = prefix) {
  if (!key || !validKey(key)) throw problem("请填写有效的 CDN 对象路径。");
  const url = new URL("https://" + domain + "/" + key.split("/").map(encodeURIComponent).join("/"));
  for (const bytes of [65536,262144]) {
    let buffer;
    try { buffer = await readPrefix(url, bytes); }
    catch (e) {
      if (e.status) throw e;
      throw problem("无法访问 CDN 图片，请检查已保存的 CDN 域名、HTTPS 证书和对象路径后重试。");
    }
    try {
      const m = await sharp(buffer, { failOn: "none", limitInputPixels: false }).metadata();
      if (!["jpeg","png","webp"].includes(m.format) || !m.width || !m.height || (m.pages ?? 1) > 1) throw new Error();
      const rotate = [5,6,7,8].includes(m.orientation);
      const width = rotate ? m.height : m.width, height = rotate ? m.width : m.height;
      if (width > 30000 || height > 30000) throw new Error();
      return { width, height };
    } catch { /* A large metadata block can need a larger prefix. */ }
  }
  throw problem("无法自动读取尺寸，请手动填写原图宽高。");
}
