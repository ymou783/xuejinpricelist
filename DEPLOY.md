# 腾讯云服务器部署

网站前台与内容后台由同一个 Node.js 服务提供。完整网站按下方服务器步骤部署；仅预览静态前台时可使用 GitHub Pages。

## GitHub Pages 前台预览

仓库已提供 `.github/workflows/pages.yml`，会安装 Node.js 24、执行 `npm ci` 和 Vite 构建，然后只发布 `dist/`。不能直接用默认 Jekyll 工作流发布仓库根目录：根目录的 `index.html` 引用尚未编译的 `/src/main.tsx`，浏览器会因脚本路径或类型错误而显示空白页。Actions 显示成功仅表示文件发布成功，不代表 React 应用已经构建。

在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。之后进入 **Actions → Deploy price list to GitHub Pages → Run workflow**，或向 `main` 推送更新。工作流会从 Pages 设置读取实际基础路径，因此项目地址 `/xuejinpricelist/` 下的 JavaScript、样式、字体和内容 JSON 都使用正确路径。

当前预览地址为 `https://ymou783.github.io/xuejinpricelist/`。Pages 只提供静态前台，显示 `public/catalog.json` 中的内容，不能运行 Node.js 后台、保存后台修改或处理上传。完整网站及 `/admin` 请按下文部署到腾讯云服务器；服务器后台修改的数据不会自动同步到 Pages 预览。

若 Actions 显示成功但页面仍是旧内容，先确认运行的是本仓库的 **Deploy price list to GitHub Pages** 工作流，再刷新浏览器缓存；不要再次选择发布根目录的默认 Jekyll 流程。

工作流还会在发布前取消同一次提交中仍未结束的旧版 `pages build and deployment`，确认它停止后再发布编译产物，防止源码覆盖构建结果。取消图标属于旧流程；请以 **Deploy price list to GitHub Pages** 的结果为准。仍建议将 Source 设为 GitHub Actions，避免启动多余的旧流程。

## 先启动完整版本

服务器安装 Node.js 24+ 和 Git 后，在自己的应用目录执行：

```bash
git clone https://github.com/ymou783/xuejinpricelist.git
cd xuejinpricelist
npm ci
npm run build
npm run admin:password
npm start
```

在终端设置至少 12 位管理密码，无默认密码。前台路径 `/`，后台路径 `/admin`。服务默认只监听本机 `127.0.0.1:3000`，外部通过下述 Nginx 转发访问。

如使用 `release/xuejin-pricelist-server.zip`，解压后已有构建文件，可用 `npm ci --omit=dev` 安装生产依赖，再设置密码、启动。纯静态包 `xuejin-pricelist.zip` 仅用于前台，不包含可运行的后台。

## 使用独立数据目录

生产建议将数据放到代码目录外，例如 `/var/lib/xuejinpricelist`，并在设置密码与运行服务时使用相同的 `DATA_DIR`：

```bash
export DATA_DIR=/var/lib/xuejinpricelist
npm run admin:password
npm start
```

目录需要归运行服务的用户所有。下面的 systemd 示例使用系统用户 `xuejin`；请先创建该用户、应用目录和数据目录，确保该用户能读取应用、写入数据目录。设置密码时同样以这个用户运行：

```bash
sudo useradd --system --home /opt/xuejinpricelist --shell /usr/sbin/nologin xuejin
sudo install -d -o xuejin -g xuejin -m 700 /var/lib/xuejinpricelist
sudo -u xuejin env DATA_DIR=/var/lib/xuejinpricelist npm run admin:password
```

执行命令的工作目录应为应用目录。数据目录包括 `admin.json`（密码哈希）、`catalog.json`（发布内容）和 `uploads/`（上传图片），**备份整个目录**。不要放进 Git，也不要通过 Nginx 直接开放整个目录。

## Nginx 与 HTTPS

参考 [deploy/nginx.conf](deploy/nginx.conf)，替换 `YOUR_WEB_DOMAIN` 为网页域名，配置合法的 HTTPS 证书。示例只提供 HTTP 反向代理，HTTPS 证书和 443 配置由实际域名决定。图片子域名 `img.xuejinclub.com` 的 EdgeOne 证书与网页服务器证书分别配置。

Nginx 向本机 3000 端口转发，并保留 `Host`、`X-Forwarded-Proto` 与真实来源 IP；服务设置 `TRUST_PROXY=1`，HTTPS 下才会设置 Secure 登录 Cookie。仅在这样的受信任代理后启用此项。上传请求上限设置为 16MB。

若网页使用中国大陆服务器和域名，先完成对应网站备案要求；现有图片加速仍是全球可用区（不含中国大陆）。

## systemd 持续运行

参考 [deploy/xuejin-pricelist.service](deploy/xuejin-pricelist.service)，根据实际位置修改 `WorkingDirectory` 和 Node 路径。示例假定代码位于 `/opt/xuejinpricelist`、Node 在 `/usr/bin/node`、运行用户为 `xuejin`。不要以 root 身份运行网站。

```bash
sudo cp deploy/xuejin-pricelist.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xuejin-pricelist
sudo systemctl status xuejin-pricelist
```

检查本机 `/api/health` 返回 `{"ok":true}`；然后通过实际 HTTPS 域名检查首页和 `/admin`，登录、上传一张图片、保存，刷新前台确认。退出后管理 API 应要求重新登录。

## 日常更新

先备份数据目录，再执行：

```bash
git pull --ff-only
npm ci
npm run build
sudo systemctl restart xuejin-pricelist
```

代码更新不会覆盖独立 `DATA_DIR` 中的内容。更新后再次检查首页、后台登录和图片。重置密码时运行 `npm run admin:password`（使用正确 `DATA_DIR`），再重启服务。

## 升级到海报库与 CDN 自动尺寸

此版本需同时更新完整 `server/`、`src/` 并重新构建、重启 Node。只替换 `server/app.mjs` 或只更新前端会缺少海报库及尺寸读取接口。旧服务器会显示更新提示，不会用不完整接口保存新草稿。

若项目文件夹是从 GitHub ZIP 解压得到的 `xuejinpricelist-main`，无需执行 `git pull`。先备份原应用和正在使用的整个数据目录，将新源码的 `src/`、`server/` 及需要的项目配置更新到**原项目目录**，保留原 `data/`、自定义 `DATA_DIR` 与上传文件，然后运行：

```bash
npm run build
```

构建成功后停止原来的 npm 服务，再以原来的监听地址、端口、数据目录等参数重新启动。当前直接通过 8081 访问且未自定义数据目录的部署示例为：

```bash
HOST=0.0.0.0 PORT=8081 npm start
```

如果原服务使用 `DATA_DIR`、`TRUST_PROXY` 等环境变量，沿用原值。刷新 `/admin` 后，价目海报应显示搜索、分类、状态筛选与「批量添加」；`/api/admin/session` 返回 `posterLibrary: true` 表示加载了新版服务。此次升级不需要重设密码。

旧海报会自动迁移，首次成功编辑前自动留下 `catalog.json.before-poster-library.bak`。所有草稿、发布快照、排序均保存在数据目录；公开 `/catalog.json` 只返回已发布内容。海报总数没有固定上限，列表与导入按批次处理；服务器仍需为实际内容提供足够的磁盘与内存。

五处 CDN 输入框在填写路径后自动读取尺寸，批量添加也会逐张读取。尺寸接口从已保存的 CDN 域名请求有限长度的图片文件头，不需要配置腾讯云密钥。若读取失败，检查 CDN 域名已保存、图片可以公开访问、HTTPS 证书可用；原图不存在时会显示对应错误，仍可重试或手动填写。Node 服务器需要能够通过 HTTPS 访问该 CDN 域名。

## 后台按钮没有反馈

若使用 `http://服务器IP:端口/admin`，旧版浏览器代码调用 `crypto.randomUUID()` 会报错，使新增海报、轮播图、客服、福利和权益失效。当前版本改用 HTTP 和 HTTPS 均可用的 `crypto.getRandomValues()` 生成公开内容 ID。按上面的更新步骤重新构建并重启 Node 服务，再强制刷新后台；仅更新 GitHub Pages 不会更新服务器后台。原有内容 ID 和持久数据均保留。

若看到「后台接口未返回有效数据」，检查同一站点的 `/api/health` 是否返回 `{"ok":true}`、`/api/admin/session` 是否返回 JSON；反向代理需将 `/api/` 也交给 Node，不能回退为静态 HTML。真实管理操作应显示保存成功或可读错误提示。

## 图片与缓存

福利与老板权益图片功能同时修改共享内容验证和服务端能力标记，更新时应包含完整 `src/` 与 `server/`，完成构建后重启原 Node 进程。保留原工作目录、`DATA_DIR`、端口和代理设置。仅刷新网页不能让正在运行的 Node 进程重新加载验证模块；后台仍提示「尚未启用福利图片」或「尚未启用权益图片」时检查是否重启了实际提供 8081 服务的进程。`/api/admin/session` 的 `benefitImages` 和 `ownerRightsImages` 均为 true 表示支持这两种图片。保存和取消只影响当前栏目，其他未发布草稿不会阻止客服、轮播等栏目发布。原有纯文字内容和持久数据兼容。

- 后台直接上传：文件在服务器 `DATA_DIR/uploads/`，自动生成响应式 WebP；不自动写 COS。若今后迁移服务器，必须同时迁移上传目录。
- 继续使用 COS：先自行将原图上传到上海桶 `xuejinpricelist-1440012515`，再在轮播图、海报、客服、预存福利或老板权益编辑器填写「CDN 对象路径」，原图宽高自动读取，失败时可重试或手动填写。域名为 `img.xuejinclub.com`，现有 CNAME 为 `img.xuejinclub.com.eo.dnse2.com`。路径不含域名、开头的 `/` 或查询参数，不填写签名临时 URL。
- HTML 和内容 JSON 不长期缓存；带哈希的构建资源和唯一目录名的图片可长期缓存。更新海报建议上传新文件，保存新路径。
- 原有测试样图 5.37MB，经 1200px WebP 参数处理约 198KiB，曾验证缓存 HIT；该结果仅代表这张样图，不是其他图片的大小保证。

## 交付边界

首屏、七入口、管理功能及图片链路已验证。基础体验单已加入用户提供的唯一海报供加载测速；其他海报、轮播素材、老板权益、客服与预存细则等待补充。公网 HTTPS、Nginx/systemd 安装、服务器地域与备案状态需在用户实际服务器部署时验证；本次没有替用户购买、部署或修改正式服务器。
