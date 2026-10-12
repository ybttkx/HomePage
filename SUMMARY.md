# HomePage 项目总结 (SUMMARY.md)

**[Status: 🟡 维护中]** —— 功能稳定，本轮完成了一次全站性能优化。

---

## 1. 项目定位

个人主页（毅白 / YIBAI），基于 Next.js 14 App Router 构建，同一套代码分别部署到三个平台，
通过顶栏「线路切换」让访客自行选择最快的接入点：

| 域名 | 平台 | 机房（实测） |
|---|---|---|
| `ybovo.com` | Vercel | 东京 hnd1 |
| `cf.ybovo.com` | Cloudflare Workers（OpenNext） | 西雅图 SEA |
| `eo.ybovo.com` | 腾讯 EdgeOne Pages | 新加坡 |

> `vip.ybovo.com`（三网优化线路）已于 2026-10-12 按需求下线，从 `RouteSwitch` 中移除。

## 2. 技术栈

- **框架**：Next.js 14.2.3（App Router）+ React 18 + TypeScript 5.4
- **国际化**：next-intl 3.12（`/zh`、`/en` 前缀路由）
- **样式**：Tailwind CSS 3.4 + Framer Motion
- **部署**：Vercel / `@opennextjs/cloudflare` 1.20 / EdgeOne Pages
- **存储**：Cloudflare KV（赞助名单）

---

## 3. 2026-10-12 全站性能优化

### 3.1 诊断结论

对三个域名做了 DNS / TCP / TLS / TTFB / 跳转链 / 缓存头 / 资源体积的完整实测
（脚本见 `perf-audit/`），定位到 6 个问题，其中两个是根本性的：

1. **`components/Footer.tsx` 调用 `next/headers` 的 `headers()`**
   Footer 挂在 RootLayout 上，`headers()` 是动态 API，导致**整站所有页面失去静态性**，
   此前添加的 `generateStaticParams()` 完全失效。页面响应头为
   `Cache-Control: private, no-cache, no-store`，CDN 一律无法缓存，每次访问都回源实时渲染，
   TTFB 在 274ms ~ 3042ms 之间剧烈波动。
   同文件中的服务端 `fetch` 还会同步请求境外 DoH（1 秒超时）并在失败后回退
   `icanhazip.com`，最坏给每次渲染叠加约 2 秒。

2. **next-intl 中间件在**每个**响应上写入 `NEXT_LOCALE` Cookie**
   带 `Set-Cookie` 的响应无法进入共享缓存，进一步锁死了 CDN 缓存的可能性。

其余问题：首页 307 跳转多一次往返、图片占首屏 83%（`ios26.png` 单文件 940KB）、
EdgeOne 不压缩 HTML（84KB 未压缩）、第三方贡献图 `ghchart.rshah.org` 延迟 2.7 秒、
`public/` 静态资源 `max-age=0` 无法缓存。

### 3.2 已实施的改动

| # | 改动 | 文件 |
|---|---|---|
| 1 | 移除 `headers()` 与服务端 fetch，Footer 改为纯静态组件 | `components/Footer.tsx` |
| 2 | 新增客户端组件承接 IP / 节点信息（阿里 DoH + `myip.ipip.net`，均支持 CORS） | `components/NodeInfo.tsx`（新建） |
| 3 | 中间件剔除 `Set-Cookie`，首页由 307 改为内部 rewrite | `middleware.ts` |
| 4 | 图片转 WebP 并按显示尺寸缩放 | `public/*.webp`、`lib/data.ts` |
| 5 | 贡献图加 `loading="lazy"`，移出首屏加载路径 | `components/About.tsx` |
| 6 | 静态资源缓存策略（1 天 + stale-while-revalidate） | `vercel.json`、`public/_headers`（新建） |
| 7 | 下线 vip 线路 | `components/RouteSwitch.tsx` |
| 8 | 清理死导入与孤儿文件（`TimeX.png` 等 714KB） | `lib/data.ts`、`public/` |

### 3.3 实测效果

**首屏传输体积：1378.3 KB → 326.4 KB（下降 76%）**

| 分类 | 优化前 | 优化后 |
|---|---|---|
| 图片 | 1131.3 KB | **92.0 KB** |
| JS | 217.9 KB | 210.4 KB |
| CSS | 8.7 KB | 8.3 KB |
| HTML | 17.7 KB | 15.8 KB |
| **合计** | **1378.3 KB** | **326.4 KB** |

单文件：`ios26` 940.6 KB → 43.1 KB，`blog` 136.2 KB → 22.1 KB，`tx.jpg` 52.6 KB → 23.8 KB。

**响应行为（本地生产构建实测）：**

| 指标 | 优化前 | 优化后 |
|---|---|---|
| 首页 `/` | 307 跳转 + 二次请求（448ms + 424ms） | **200 直接返回**（9~14ms） |
| Cache-Control | `private, no-cache, no-store` | **`s-maxage=31536000, stale-while-revalidate`** |
| Set-Cookie | `NEXT_LOCALE=zh` | **无** |
| x-nextjs-cache | MISS | **HIT** |
| 构建路由标记 | `ƒ (Dynamic)` | **`● (SSG)`** |

### 3.4 验证方式

```powershell
node node_modules/next/dist/bin/next build      # 确认 /en、/zh 标记为 ● (SSG)
node node_modules/next/dist/bin/next start -p 3210
node perf-audit/verify-local.mjs 3210           # 断言 200 / 无 Set-Cookie / 语言协商
node perf-audit/baseline.mjs http://127.0.0.1:3210/zh
```

`verify-local.mjs` 全部断言通过，`tsc --noEmit` 退出码 0。

---

## 4. 部署状态与后续

### 已完成（2026-10-12 当晚落地线上）

- [x] **代码改动**已推送至 GitHub（`a8a6b81`、`e9edc28`），触发 Vercel 自动部署。
- [x] **Vercel（ybovo.com）**：已上线。`x-vercel-cache: HIT`，渲染区域由 `iad1`（美东）回到 `hnd1`（东京）。
- [x] **Cloudflare（cf.ybovo.com）**：已部署（版本 `0aba608c`）。新建缓存规则「HTML 边缘缓存」并启用，已执行过一次 `purge_cache`。
- [x] **EdgeOne（eo.ybovo.com）**：**按用户要求放生**，不部署、不配置。

### 仍待处理

- [ ] **EdgeOne 仍跑旧版代码**，其 HTML 会渲染访客真实 IP。目前未开缓存故不会串号，但若将来启用缓存必须先行更新或摘除该线路。
- [ ] **Next.js 14.2.3 已过支持期**，构建需带 `--dangerouslyUseUnsupportedNextVersion`，建议单独安排升级。
- [ ] **Cloudflare HTML 边缘缓存不稳定**：热态 255~296ms，但响应无 `age` 头，并非每次都从边缘返回。若要稳定命中需改为 Worker 内 Cache API 显式缓存（需改 `wrangler.toml` 的 `main`，属有风险改动）。
- [ ] 可选：为 `ghchart.rshah.org` 自建反代并加长缓存，彻底消除 1.3~2.7 秒延迟。
- [ ] 可选：将 `framer-motion`、`howler` 等客户端库按需拆分，进一步压缩约 219KB 的 JS。

## 5. 相关文档

- **完整前后对比报告**：`perf-audit/FINAL-REPORT.md`
- 性能诊断报告：`perf-audit/REPORT.md`
- 开发日志：`LOG.md`
- 使用说明：`README.md`
