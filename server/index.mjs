import { createApp } from "./app.mjs";
import { dataDirectory } from "./store.mjs";
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const { app, dispose } = await createApp({ directory: dataDirectory(), trustProxy: process.env.TRUST_PROXY === "1" });
const server = app.listen(port, host, () => console.log(`雪烬电竞服务已启动，监听 ${host}:${port}；后台路径 /admin`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { dispose(); server.close(() => process.exit(0)); });
