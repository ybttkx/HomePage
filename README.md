# YIBAI 个人主页（HomePage）

个人主页站点，基于 [Codefreyy/joy-personal-portfolio](https://github.com/Codefreyy/joy-personal-portfolio)
二次开发，同一套代码部署到三个平台，通过顶栏「线路切换」让访客选择最快接入点。

| 域名 | 平台 | 实测机房 |
|---|---|---|
| `ybovo.com` | Vercel | 东京 hnd1 |
| `cf.ybovo.com` | Cloudflare Workers（OpenNext） | 西雅图 SEA |
| `eo.ybovo.com` | 腾讯 EdgeOne Pages | 新加坡 |

## 技术栈

- Next.js 14.2.3（App Router）+ React 18 + TypeScript 5.4
- next-intl 3.12（`/zh`、`/en` 前缀路由）
- Tailwind CSS 3.4 + Framer Motion
- 赞助名单存储：Cloudflare KV

## 环境要求

- Node.js 18+（本地验证使用 v24.21.0）
- npm / pnpm / yarn 任一
- 部署到 Cloudflare 需 `wrangler` 登录（`npx wrangler login`）

## 快速开始

```bash
npm install

npm run dev      # 本地开发，http://localhost:3000
npm run build    # 生产构建（会校验类型）
npm run start    # 启动生产服务器
npm run lint     # ESLint 检查
```

生产构建后应确认路由表中 `/en`、`/zh` 及其子页标记为 **`● (SSG)`** 而不是 `ƒ (Dynamic)`。
若变成 Dynamic，说明有组件引入了动态 API，见下方「性能约定」。

## 部署

### Vercel（ybovo.com）

推送到 Git 仓库后由 Vercel 自动构建，或在项目目录执行 `vercel --prod`。

**建议确认项目 Region 设为 `hnd1`（东京）**，否则渲染函数可能落在美东 `iad1`，造成跨洋往返。

### Cloudflare Workers（cf.ybovo.com）

```bash
npm run cf:build     # 生成 .open-next 产物
npm run cf:preview   # 本地预览
npm run cf:deploy    # 部署到 Cloudflare
```

KV 绑定等配置见 `wrangler.toml`。

### EdgeOne Pages（eo.ybovo.com）

在 EdgeOne Pages 控制台关联仓库并按其流程构建部署。

## 性能约定（重要，请勿回退）

本站在 2026-10-12 做过一轮完整性能优化，以下约定请在后续开发中保持：

### 1. 不要在服务端组件里使用动态 API

**根因记录**：`components/Footer.tsx` 曾调用 `next/headers` 的 `headers()` 来展示客户端 IP。
由于 Footer 挂在 `app/[locale]/layout.tsx` 的 RootLayout 上，`headers()` 会让**整站所有页面**
退化为动态渲染（SSR），`generateStaticParams()` 完全失效，响应头变成
`Cache-Control: private, no-cache, no-store`，导致三个 CDN 全部无法缓存，每次访问都回源。

**因此**：`headers()`、`cookies()`、`draftMode()` 等动态 API 只允许出现在
`app/api/**` 路由或客户端组件中。当前 IP 展示由客户端组件 `components/NodeInfo.tsx` 承担。

### 2. 新增图片请先压缩为 WebP

`next.config.mjs` 设置了 `images.unoptimized: true`（因为三个平台均未启用 Next 图片优化服务），
图片会原图直出，所以**必须在入库前压缩**。可用项目自带脚本：

```bash
python perf-audit/compress_images.py          # 试算收益，不写文件
python perf-audit/compress_images.py --apply  # 实际执行
```

压缩后记得同步更新 `lib/data.ts` 等处的引用路径。

### 3. 缓存策略

- `vercel.json`：Vercel 平台的静态资源缓存规则
- `public/_headers`：Cloudflare Workers Assets 与 EdgeOne Pages 的等价规则

图片/音频为 1 天缓存 + 7 天 `stale-while-revalidate`，字体为 1 年 `immutable`。

> 注意：**HTML 的边缘缓存在 Cloudflare 与 EdgeOne 需要在控制台额外配置 Cache Rule**，
> 默认规则不缓存 HTML。Vercel 对 SSG 页面自动缓存，无需配置。

### 4. 路由与语言

`middleware.ts` 中 `localePrefix` 保持 `'always'`，以兼容现有外部链接与 `sitemap.xml`。
首页与无前缀路径通过内部 **rewrite**（而非 307 跳转）落到对应语言，省掉一次完整往返。
中间件会主动剔除 next-intl 写入的 `NEXT_LOCALE` Cookie，以保证响应可被 CDN 缓存。

## 目录结构

```
0913-homepage/
├── app/
│   ├── [locale]/            # 多语言页面（page / sponsor / sponsor.admin）
│   └── api/sponsor/         # 赞助相关 API 路由（动态）
├── components/
│   ├── Footer.tsx           # 纯静态页脚
│   ├── NodeInfo.tsx         # 客户端：IP / 节点信息展示
│   └── ...
├── lib/data.ts              # 站点数据与图片引用
├── messages/                # zh.json / en.json 文案
├── public/                  # 静态资源 + _headers
├── perf-audit/              # 性能测量脚本与诊断报告
├── middleware.ts            # 国际化中间件
├── vercel.json              # Vercel 缓存规则
└── wrangler.toml            # Cloudflare Workers 配置
```

## 相关文档

- `SUMMARY.md` —— 项目总结与优化成果
- `LOG.md` —— 开发操作日志
- `perf-audit/REPORT.md` —— 性能诊断报告（含实测数据与脚本说明）
