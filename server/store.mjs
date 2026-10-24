import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "../src/catalog.ts";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function dataDirectory() { return path.resolve(process.env.DATA_DIR || path.join(root, "data")); }
export async function atomicWrite(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temp = filename + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, filename);
}
export function createStore(directory) {
  const filename = path.join(directory, "catalog.json");
  let pending = Promise.resolve();
  const snapshot = async () => {
    let raw;
    try { raw = await readFile(filename, "utf8"); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const initial = parseCatalog(JSON.parse(await readFile(path.join(root, "public/catalog.json"), "utf8")));
      // Exclusive create prevents simultaneous first requests from replacing a published file.
      await mkdir(directory, { recursive: true });
      try { await writeFile(filename, JSON.stringify(initial, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
      catch (e) { if (e.code !== "EEXIST") throw e; }
      raw = await readFile(filename, "utf8");
    }
    const catalog = parseCatalog(JSON.parse(raw));
    return { catalog, revision: createHash("sha256").update(JSON.stringify(catalog)).digest("hex") };
  };
  const save = (value, revision) => {
    const job = pending.then(async () => {
      const current = await snapshot();
      if (revision !== current.revision) { const e = new Error("内容已在其他窗口修改，请重新加载后编辑。"); e.status = 409; throw e; }
      let catalog;
      try { catalog = parseCatalog(value); } catch (error) { error.status = 400; throw error; }
      await atomicWrite(filename, catalog); return snapshot();
    });
    pending = job.catch(() => {}); return job;
  };
  return { snapshot, save };
}
