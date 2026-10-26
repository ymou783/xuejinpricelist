import express from "express";
import multer from "multer";
import sharp from "sharp";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createStore, root } from "./store.mjs";
import { passwordRecord, verifyPassword } from "./auth.mjs";
const ttl = 8 * 60 * 60 * 1000;
const cookieName = "xuejin_admin";
function secureEqual(a, b) { if (typeof a !== "string" || typeof b !== "string") return false; const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export async function createApp({ directory, trustProxy = false } = {}) {
  if (!directory) throw new Error("Data directory required");
  await mkdir(path.join(directory, "uploads"), { recursive: true });
  const store = createStore(directory); await store.snapshot();
  const app = express(); app.disable("x-powered-by"); if (trustProxy) app.set("trust proxy", 1);
  const sessions = new Map(); const attempts = new Map();
  const record = await passwordRecord(directory);
  const purge = setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) if (session.expires < now) sessions.delete(key);
    for (const [key, attempt] of attempts) if (attempt.until < now) attempts.delete(key);
  }, 60000); purge.unref();
  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    if (req.path.startsWith("/api/") || req.path === "/catalog.json" || req.path.startsWith("/admin")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => req.path === "/admin/" ? res.redirect(308, "/admin") : next());
  const sameOrigin = (req, res, next) => {
    const origin = req.get("origin");
    try { if (origin && new URL(origin).host === req.get("host")) return next(); } catch { /* Reject malformed origins. */ }
    return res.status(403).json({ error: "请求来源不匹配，请从本站后台操作。" });
  };
  function session(req) {
    const token = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
    const entry = token && sessions.get(token);
    if (!entry || entry.expires < Date.now()) { if (token) sessions.delete(token); return null; }
    return { token, ...entry };
  }
  const authenticate = (req, res, next) => { const s = session(req); if (!s) return res.status(401).json({ error: "登录已失效，请重新登录。" }); req.adminSession = s; next(); };
  const csrf = (req, res, next) => { if (!secureEqual(req.get("x-csrf-token"), req.adminSession.csrf)) return res.status(403).json({ error: "请重新加载后台后重试。" }); next(); };
  const cookieOptions = req => ({ httpOnly: true, secure: req.secure, sameSite: "strict", path: "/", maxAge: ttl });
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/catalog.json", async (_req, res) => res.json((await store.snapshot()).catalog));
  app.get("/api/admin/session", (req, res) => { const s = session(req); res.json({ configured: !!record, authenticated: !!s, benefitImages: true, ownerRightsImages: true, ...(s ? { csrf: s.csrf } : {}) }); });
  app.post("/api/admin/login", sameOrigin, async (req, res) => {
    if (!record) return res.status(503).json({ error: "尚未设置管理密码，请先在服务器运行 npm run admin:password，再重启服务。" });
    const key = req.ip; const now = Date.now(); const previous = attempts.get(key);
    if (previous && previous.until > now && previous.count >= 8) return res.status(429).json({ error: "尝试次数较多，请 15 分钟后重试。" });
    if (!await verifyPassword(record, req.body?.password)) {
      const count = previous && previous.until > now ? previous.count + 1 : 1;
      if (attempts.size > 10000) attempts.clear();
      attempts.set(key, { count, until: now + 15 * 60000 }); return res.status(401).json({ error: "管理密码不正确。" });
    }
    attempts.delete(key); const old = session(req); if (old) sessions.delete(old.token);
    const token = randomBytes(32).toString("hex"); const entry = { csrf: randomBytes(32).toString("hex"), expires: now + ttl };
    sessions.set(token, entry); res.cookie(cookieName, token, cookieOptions(req)); res.json({ csrf: entry.csrf, benefitImages: true, ownerRightsImages: true });
  });
  app.use("/api/admin", authenticate);
  app.get("/api/admin/content", async (_req, res) => res.json(await store.snapshot()));
  app.post("/api/admin/logout", sameOrigin, csrf, (req, res) => { sessions.delete(req.adminSession.token); res.clearCookie(cookieName, { ...cookieOptions(req), maxAge: undefined }); res.json({ ok: true }); });
  app.put("/api/admin/content", sameOrigin, csrf, async (req, res) => res.json(await store.save(req.body?.catalog, req.body?.revision)));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 1 } });
  let processing = 0;
  app.post("/api/admin/upload", sameOrigin, csrf, (req, res, next) => {
    if (processing >= 2) return res.status(429).json({ error: "图片正在处理中，请稍后重试。" });
    processing++; let finished = false;
    const release = () => { if (!finished) { processing--; finished = true; } };
    res.once("finish", release); res.once("close", release); next();
  }, upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "请选择图片。" });
    let metadata;
    try { metadata = await sharp(req.file.buffer, { limitInputPixels: 40000000 }).metadata(); }
    catch { return res.status(400).json({ error: "图片无法识别，或像素超过 4000 万。" }); }
    if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height) return res.status(400).json({ error: "仅支持静态 JPG、PNG 或 WebP 图片。" });
    const id = randomUUID(); const target = path.join(directory, "uploads", id); await mkdir(target);
    try {
      const original = await sharp(req.file.buffer, { limitInputPixels: 40000000 }).rotate().webp({ quality: 95, effort: 4 }).toFile(path.join(target, "original.webp"));
      for (const width of [360, 600, 900, 1200, 1800, 2500]) {
        await sharp(req.file.buffer, { limitInputPixels: 40000000 }).rotate().resize({ width, withoutEnlargement: true })
          .webp({ quality: req.body?.kind === "qr" ? 100 : 84, lossless: req.body?.kind === "qr", effort: 4 }).toFile(path.join(target, width + ".webp"));
      }
      res.status(201).json({ source: "upload", objectKey: id + "/original.webp", width: original.width, height: original.height, alt: "海报" });
    } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在。" }));
  app.use("/uploads", express.static(path.join(directory, "uploads"), { dotfiles: "deny", index: false, fallthrough: false, immutable: true, maxAge: "1y" }));
  app.use("/assets", express.static(path.join(root, "dist/assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
  app.get(["/", "/admin", "/admin/"], (_req, res) => { res.set("Cache-Control", "no-cache"); res.sendFile(path.join(root, "dist/index.html")); });
  app.use("/licenses", express.static(path.join(root, "dist/licenses")));
  app.use((_req, res) => res.status(404).type("text/plain").send("页面不存在"));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = error instanceof multer.MulterError ? 400 : error.status || 500;
    res.status(status).json({ error: error instanceof multer.MulterError ? "上传失败：每次请选择一张 15MB 以内的图片。" : status < 500 ? error.message : "服务器暂时无法处理请求，请稍后重试。" });
  });
  return { app, store, dispose: () => clearInterval(purge) };
}
