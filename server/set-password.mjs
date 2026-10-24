import { setPassword } from "./auth.mjs";
import { dataDirectory } from "./store.mjs";
function hiddenInput(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("请在终端运行此命令；自动化可通过 ADMIN_PASSWORD 环境变量设置。"));
    process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    let value = "";
    const finish = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener("data", read); process.stdout.write("\n"); };
    const read = chunk => {
      for (const c of chunk) {
        if (c === "\u0003") { finish(); reject(new Error("已取消")); return; }
        if (c === "\r" || c === "\n") { finish(); resolve(value); return; }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else if (c >= " " && value.length < 201) value += c;
      }
    };
    process.stdin.on("data", read);
  });
}
try {
  const password = process.env.ADMIN_PASSWORD || await hiddenInput("设置管理密码（至少 12 位，输入不回显）：");
  if (!process.env.ADMIN_PASSWORD && password !== await hiddenInput("再次输入管理密码：")) throw new Error("两次输入不一致。");
  await setPassword(dataDirectory(), password);
  console.log("管理密码已设置。若服务已运行，请重启服务使旧会话失效。");
} catch (error) { console.error(error.message); process.exitCode = 1; }
