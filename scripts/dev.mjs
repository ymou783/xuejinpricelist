import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--watch", "server/index.mjs"], { stdio: "inherit", env: { ...process.env, HOST: "127.0.0.1", PORT: "3001" } }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], { stdio: "inherit" }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill("SIGTERM"); process.exitCode = code; }
for (const child of children) child.once("exit", code => stop(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
