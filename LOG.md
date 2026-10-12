# HomePage 开发操作日志 (LOG.md)

## 2026-08-29
- **操作**: 将 GitHub 仓库 `ybttkx/HomePage` 克隆至本地独立目录 `task/0829-homepage`。
- **排查**: 通过 Cloudflare API 与 GraphQL 查询了账户下 Worker 的实时监控指标，定位到 `homepage` 产生了 1874+ 次 `exceededResources`。
- **静态分析与优化**:
  - 全站引入 `generateStaticParams` 与 `unstable_setRequestLocale`，实现 `/en`、`/zh`、`/en/sponsor`、`/zh/sponsor`、`/en/sponsor/admin`、`/zh/sponsor/admin` 全量 SSG 静态预渲染。
  - 将 `sponsor` 赞助页中客户端 URL 参数读取拆分为 `SponsorClientWrapper.tsx`，解耦 SSR 依赖。
  - 修复缺失的国际化 i18n 词条与导出，确保打包产物完全合规。
  - 添加 `.env.example` 模版与完善安全过滤。
- **Push 与部署**:
  - 提交并推送至 GitHub: `https://github.com/ybttkx/HomePage.git` (commit: `16fb14e`)。
  - 检查 GitHub 未配置 Actions CI/CD，通过 Cloudflare Wrangler 自动打包并成功部署至线上 Worker（Version ID: `1932d166-4418-4f2f-9902-85572e95e9a8`）。
  - 验证 `https://homepage.ybnbttkx.workers.dev/zh` 正常以 200 OK 响应，耗时极低。

## 2026-10-12 全站性能诊断与优化

### 干了啥
用户反馈 ybovo.com / cf.ybovo.com / eo.ybovo.com 三个 CDN 入口速度偏慢，要求做完整优化。本轮先做实测诊断，
再落地改动，最后用本地生产构建验证。

### 一、诊断阶段（新增目录 perf-audit/）
本机 `curl` 因沙箱 schannel 凭证限制（`SEC_E_NO_CREDENTIALS`）无法完成 TLS 握手，
改用 Node 的 OpenSSL 栈自行实现测量，与浏览器行为一致。新增脚本：

- `perf-audit/measure.mjs`：三域名 DNS/TCP/TLS/TTFB 精确计时、307 跳转链跟踪、连接复用对比
- `perf-audit/probe.mjs`：缓存策略、压缩能力（identity/gzip/br）、协议与响应头明细
- `perf-audit/baseline.mjs`：首屏资源清单与体积核算
- `perf-audit/compress_images.py`：图片批量压缩（试算 + `--apply`）
- `perf-audit/verify-local.mjs`：本地生产服务器的行为断言
- `perf-audit/REPORT.md`：完整诊断报告

**实测结论**：Vercel 东京最快（TCP 95ms），Cloudflare 被调度到西雅图（188ms），
EdgeOne 落在新加坡且抖动严重（静态资源 TTFB 148ms~7423ms，出现过 ECONNRESET 与 ETIMEDOUT）。

### 二、定位到的根因
1. **`components/Footer.tsx` 使用 `next/headers` 的 `headers()`**：Footer 挂在 RootLayout 上，
   该动态 API 导致整站页面失去静态性，之前加的 `generateStaticParams()` 完全失效，
   响应头变成 `private, no-cache, no-store`，三个 CDN 全部无法缓存，每次访问都回源渲染。
   同文件的服务端 `fetch` 还会同步请求境外 DoH（1s 超时）并回退 `icanhazip.com`，最坏叠加约 2 秒。
2. **next-intl 中间件在每个响应写 `NEXT_LOCALE` Cookie**：带 Set-Cookie 的响应无法被共享缓存。
3. 首页 `/` 走 307 跳转，多一次完整往返。
4. 图片占首屏 83%，`ios26.png` 单文件 940.6KB，且 `next.config.mjs` 设了 `images.unoptimized: true`。
5. EdgeOne 对 HTML 完全不压缩（84.3KB，压缩收益 0%）。
6. `public/` 静态资源 `Cache-Control: public, max-age=0, must-revalidate`，每次都要校验。

### 三、改动清单
- `components/Footer.tsx`：移除 `headers()` 与服务端 fetch，改为纯静态 Server Component。
- `components/NodeInfo.tsx`（新增）：客户端获取 IP 与节点信息。
  接口可达性经实测验证：`dns.alidns.com`（阿里 DoH，CORS `*`，145ms）查节点 A/AAAA 记录，
  `myip.ipip.net`（CORS `*`，219ms）一次拿到客户端 IP + 归属地 + 运营商，`api.ip.sb` 作备用。
  注：`doh.pub`、`ipapi.co` 无 CORS 头，`cloudflare-dns.com`、`api.ipify.org` 直连被重置，均不可用。
- `middleware.ts`：`localePrefix: 'always'` 保持不变以兼容现有 URL 与 sitemap；
  首页与无前缀路径改为内部 `rewrite`（不再 307）；对 intlMiddleware 的响应执行
  `headers.delete('set-cookie')`，恢复 HTML 可缓存性；`defaultLocale` 由 `en` 调整为 `zh`。
- `components/About.tsx`：`ghchart` 贡献图加 `loading="lazy" decoding="async" referrerPolicy`，
  移出首屏加载路径（该图实测 TTFB 1.4~2.7 秒）。
- `lib/data.ts`：修正图片引用为 `.webp`；删除指向不存在文件的死导入
  （`corpcomment.png`、`rmtdev.png`、`wordanalytics.png`）及未使用的 `GHS`、`TimeX`。
- `components/RouteSwitch.tsx`：按用户要求移除 `vip.ybovo.com`（三网优化线路）。
- `public/`：`ios26.png`→`ios26.webp`（940.6→42.1KB）、`blog.png`→`blog.webp`（136.2→21.6KB）、
  `GHS.png`→`GHS.webp`、`SVG/vip.png`→`SVG/vip.webp`、`tx.jpg` 缩至 400px（52.6→23.8KB）、
  `wechat-qr.jpg` 缩至 900px 宽（152.4→86.9KB）；删除重复的孤儿大图 `TimeX.png`（714.3KB）。
- `vercel.json`：为图片/音频（1 天 + stale-while-revalidate）与字体（1 年 immutable）补缓存规则。
- `public/_headers`（新增）：Cloudflare Workers Assets 与 EdgeOne Pages 的等价缓存规则。

### 四、验证结果
- `tsc --noEmit` 退出码 0。
- `next build` 成功，路由表由 `ƒ (Dynamic)` 变为 **`● (SSG) prerendered as static HTML`**（`/en`、`/zh` 及其子页）。
- 本地 `next start` 实测：首页 `/` 返回 **200**（不再 307），`Cache-Control: s-maxage=31536000, stale-while-revalidate`，
  **无 Set-Cookie**，`x-nextjs-cache: HIT`，响应 9~14ms；语言协商正确（中文浏览器落 zh、英文落 en）。
- `verify-local.mjs` 全部关键断言通过。
- 首屏传输体积：**1378.3 KB → 326.4 KB（下降 76%）**，其中图片 1131.3 KB → 92.0 KB。

### 五、遗留事项
需在平台控制台完成，无法通过代码修改：Cloudflare 建 Cache Rule 缓存 HTML、
EdgeOne 开启 HTML 压缩并配缓存、Vercel 确认 Region 为 `hnd1`。

### 六、踩坑记录
- `curl` 报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`，
  并非网络故障（TCP 443 全部连通），故全程改用 Node/OpenSSL 测量。
- 测量脚本首版传入 `lookup` 回调签名有误（Node 20+ 的 `autoSelectFamily` 会以 `all:true` 调用），
  导致 `ERR_INVALID_IP_ADDRESS`，已在 v2 修正并显式关闭 `autoSelectFamily`。
- `next build` 在类型检查阶段报 `spawn EPERM`：jest-worker 需 fork 子进程，
  而受限沙箱禁止管道通信。已通过放宽文件策略解决，非代码问题。
