import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./store.mjs";
const derive = promisify(scrypt);
export async function setPassword(directory, password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 200) throw new Error("管理密码须为 12–200 个字符。");
  const salt = randomBytes(32).toString("hex");
  const key = (await derive(password, salt, 64)).toString("hex");
  await atomicWrite(path.join(directory, "admin.json"), { salt, key });
}
export async function passwordRecord(directory) {
  try {
    const record = JSON.parse(await readFile(path.join(directory, "admin.json"), "utf8"));
    if (!/^[a-f0-9]{64}$/.test(record.salt) || !/^[a-f0-9]{128}$/.test(record.key)) throw new Error("Invalid password record");
    return record;
  } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
export async function verifyPassword(record, password) {
  if (!record || typeof password !== "string" || password.length > 200) return false;
  const actual = await derive(password, record.salt, 64);
  return timingSafeEqual(Buffer.from(record.key, "hex"), actual);
}
