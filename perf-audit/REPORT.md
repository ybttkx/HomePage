# ybovo.com 多 CDN 性能诊断报告

> 测量时间：2026-10-12 13:36 ~ 13:45（本机直连，本地代理 7897 已关闭）
> 测量位置：中国大陆，Windows，Node.js v24.21.0（OpenSSL 栈）
> 测量脚本：`measure.mjs`（时序/跳转）、`probe.mjs`（缓存/压缩）、`baseline.mjs`（体积核算）

---

## 一、三个入口的实测对比

| 指标 | ybovo.com | cf.ybovo.com | eo.ybovo.com |
|---|---|---|---|
| 接入平台 | Vercel | Cloudflare Workers | 腾讯 EdgeOne Pages |
| 解析 IP | 64.29.17.1 | 104.21.73.131 | 43.174.246.103 |
| 落地机房 | **东京 hnd1** | **西雅图 SEA** | **新加坡** |
| TCP 握手 | **95ms** | 188ms | 201ms |
| TLS 握手 | **193ms** | 381ms | 417ms |
| 首屏 HTML 累计（连接复用） | **969ms** | 981ms | 1040ms |
| 首屏 HTML 累计（冷连接） | **1089ms** | 1306ms | 1733ms |
| HTML 压缩 | br 17.7KB | br 16.8KB | **无压缩 84.3KB** |
| 静态资源 TTFB | **~110ms** | ~260ms | 148ms ~ 7423ms |
| 稳定性 | 良好 | 良好 | **差**（出现 ECONNRESET / ETIMEDOUT） |

**结论：对国内直连而言 ybovo.com（Vercel 东京）最快最稳；Cloudflare 被调度到西雅图，慢约一倍；EdgeOne 落在新加坡且抖动极大，是三者中最差的。**

---

## 二、首屏体积构成（以 ybovo.com/zh 为例，实测）

首屏合计 **1378.3 KB**：

| 分类 | 数量 | 传输量 | 占比 |
|---|---|---|---|
| 图片 | 4 | **1131.3 KB** | **83.1%** |
| JS | 21 | 217.9 KB | 16.0% |
| CSS | 2 | 8.7 KB | 0.6% |
| 第三方 | 1 | 2.7 KB | 0.2% |

图片明细：

| 文件 | 体积 | 问题 |
|---|---|---|
| `_next/static/media/ios26.49595604.png` | **963.2 KB** | 首屏最大单文件，PNG 未转格式、未压尺寸 |
| `_next/static/media/blog.d4aa4ddd.png` | 139.4 KB | 可转 WebP |
| `tx.jpg` | 53.9 KB | 首屏头像，可接受 |
| `enfp.svg` | 1.9 KB | 正常 |

---

## 三、定位到的 6 个问题（按收益排序）

### 问题 1：图片占首屏 83%，单文件 963 KB ★★★★★

- `lib/data.ts:15,87` 引入 `ios26.png`（940.6 KB），由 next/image 渲染。
- `next.config.mjs` 设置了 `images.unoptimized: true`，导致**原图直出**，既不转 WebP/AVIF 也不裁尺寸。
- 实测 `/ios26.png` 传输 940.6 KB，且**无任何压缩**（PNG 已内置压缩，但尺寸本身过大）。
- 影响：在 20 Mbps 宽带下约 0.4 秒，在 4G/弱网下会超过 2 秒，且直接拖垮 LCP。

### 问题 2：三个站点的 HTML 全部不可缓存 ★★★★★

实测响应头（三站一致）：

```
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
set-cookie: NEXT_LOCALE=zh; Path=/; Max-Age=31536000; SameSite=lax
```

- 根因：**next-intl 中间件在每个响应上写 `NEXT_LOCALE` Cookie**（`middleware.ts` 使用 `createMiddleware`），带 `Set-Cookie` 的响应无法进入任何共享缓存。
- 后果：`x-vercel-cache: MISS`、`eo-cache-status: Cache Miss`，**每次访问都回源实时渲染**。
- 佐证：Vercel 的 `x-vercel-id: hnd1::iad1::...` 显示渲染函数实际跑在**美东 iad1**，请求要从东京边缘再跨到美东——这解释了 TTFB 在 274ms ~ 3042ms 之间的剧烈波动。
- 这是「静态站点却每次回源」的核心原因，也是当前最大的一处浪费。

### 问题 3：所有访问都要先吃一次 307 重定向 ★★★★

```
307  ybovo.com/      → /zh    (ttfb 448ms)
200  ybovo.com/zh            (ttfb 424ms)
```

- 根因：`middleware.ts` 的 `createMiddleware({ locales:['en','zh'], defaultLocale:'en' })` 对 `/` 做语言协商跳转。
- 代价：用户看到内容前多一次完整往返，约 300~500ms。
- 附带问题：`defaultLocale: 'en'`，中文访客访问裸域名会被带到英文页。

### 问题 4：EdgeOne 完全不压缩 HTML ★★★★

- `eo.ybovo.com`：identity 84.3 KB / gzip 84.3 KB / br 84.3 KB → **压缩收益 0%**。
- 对比：Cloudflare 82.6 KB → 16.8 KB（省 80%）。
- EdgeOne 的 `vary` 头里重复出现三次 `Accept-Encoding`，说明压缩链路存在但未生效，属于 EdgeOne Pages 侧的压缩开关/配置问题。
- 后果：eo 用户比 cf 用户多下载 **67 KB** 才看到首屏。

### 问题 5：第三方 GitHub 贡献图延迟 2.7 秒 ★★★

- `Footer` 引用 `https://ghchart.rshah.org/ybttkx`，体积只有 2.8 KB，但 **TTFB 2685ms**。
- 该域名在境外且不受你控制，国内访问不稳定，成为页脚渲染的异常长尾。

### 问题 6：21 个 JS chunk 共 218 KB ★★

- 包含 `framer-motion`、`howler`（use-sound）、`react-type-animation`、`react-icons` 等客户端库。
- 单个 chunk TTFB 还出现过 5016ms 的抖动。
- 体积尚在可接受范围，但请求数偏多，且首屏动效库（framer-motion）即便内容静态也要等 JS 才显示。

---

## 四、优化方案与预期收益

| # | 措施 | 预期收益 | 改动位置 | 风险 |
|---|---|---|---|---|
| 1 | `ios26.png` 转 WebP + 限制宽度（如 1200px），`blog.png` 同样处理 | 首屏图片 1131KB → **约 150KB**，省 ~980KB | `public/` 图片 + `lib/data.ts` 引用 | 低 |
| 2 | next-intl 中间件关闭 locale Cookie（`localeCookie: false`），或改为 CDN 边缘重定向 | HTML 变为可缓存，TTFB **1750ms → 边缘命中 ~50ms** | `middleware.ts` + CDN 缓存规则 | 中 |
| 3 | 用 CDN 边缘规则替代中间件做 `/` → `/zh` 跳转 | 省掉一次往返，**约 300~500ms** | Cloudflare Rules / EdgeOne 规则 | 低 |
| 4 | 开启 EdgeOne HTML 压缩（或对 HTML 走 Brotli） | eo 站 HTML **84KB → 17KB** | EdgeOne 控制台 | 低 |
| 5 | GitHub 贡献图改为自托管静态图或构建时生成 | 消除 **2.7 秒**长尾 | `Footer.tsx` | 低 |
| 6 | 为 `/public` 静态资源补 `Cache-Control: immutable` | 二次访问零请求 | 平台响应头规则 | 低 |

**理论效果**：首屏传输量从 1378 KB 降到约 400 KB，冷启动首屏 HTML 从 969ms 降到 300ms 以内（消除重定向 + 边缘缓存命中）。

---

## 五、需要确认的前提

1. 三个域名的定位（哪个是主入口、其余是否只做测速/备用）。
2. 「代理已关闭」指的是 Cloudflare 橙云关闭（DNS only），还是本机 Clash 代理关闭。
3. EdgeOne 与 Cloudflare 的控制台权限是否可操作（缓存规则、压缩开关属于平台侧配置）。
4. `RouteSwitch.tsx`（线路切换器）当前已被从 `layout.tsx` 移除但未提交，是否保留该功能。

---

## 附：测量脚本说明

| 脚本 | 用途 |
|---|---|
| `measure.mjs` | 三域名 DNS/TCP/TLS/TTFB/跳转链精确计时，输出 `result.json` |
| `probe.mjs` | 缓存策略、压缩能力、协议、响应头明细，输出 `probe-result.json` |
| `baseline.mjs` | 首屏资源清单与总体积核算，输出 `baseline-result.json`（支持传完整 URL 测本地） |
| `compress_images.py` | 图片批量转 WebP 并缩放，默认试算，加 `--apply` 实际写入 |
| `verify-local.mjs` | 本地生产服务器的行为断言（状态码 / Set-Cookie / 语言协商） |

运行方式（Node 路径以本机 DSH 运行时为准）：

```powershell
node measure.mjs --rounds 5
node probe.mjs
node baseline.mjs ybovo.com
python compress_images.py --apply
node verify-local.mjs 3210
```

> 注：本机 `curl` 因沙箱 schannel 凭证限制（`SEC_E_NO_CREDENTIALS`）无法完成 TLS 握手，
> 故全部测量改用 Node 的 OpenSSL 栈实现，与浏览器实际行为一致。

---

# 六、实施结果（2026-10-12 当日完成）

## 6.1 已落地的改动

| # | 对应问题 | 改动 | 文件 |
|---|---|---|---|
| 1 | 问题 2 根因 | 移除 `headers()` 与服务端 fetch，Footer 改为纯静态组件 | `components/Footer.tsx` |
| 2 | — | 新增客户端组件承接 IP / 节点信息展示 | `components/NodeInfo.tsx`（新建） |
| 3 | 问题 2 | 中间件剔除 `Set-Cookie`，恢复 HTML 可缓存 | `middleware.ts` |
| 4 | 问题 3 | 首页由 307 跳转改为内部 rewrite | `middleware.ts` |
| 5 | 问题 1 | 图片转 WebP 并按显示尺寸缩放 | `public/`、`lib/data.ts` |
| 6 | 问题 5 | 贡献图加 `loading="lazy"` | `components/About.tsx` |
| 7 | 问题 6 | 静态资源缓存策略 | `vercel.json`、`public/_headers`（新建） |
| 8 | — | 下线 vip 线路、清理死导入与孤儿文件 | `RouteSwitch.tsx`、`lib/data.ts` |

> **诊断阶段的一个关键修正**：问题 2 最初归因于 next-intl 的 Cookie，进一步排查发现
> 真正的根因是 `Footer.tsx` 用了 `next/headers` 的 `headers()`。两者都在阻止缓存，
> 但前者只影响响应头，后者直接让整站退化为 SSR、使 `generateStaticParams()` 完全失效。

## 6.2 优化前后对比（实测）

**首屏传输体积：1378.3 KB → 326.4 KB（下降 76%）**

| 分类 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 图片 | 1131.3 KB | **92.0 KB** | −91.9% |
| JS | 217.9 KB | 210.4 KB | −3.4% |
| CSS | 8.7 KB | 8.3 KB | −4.6% |
| HTML | 17.7 KB | 15.8 KB | −10.7% |
| **合计** | **1378.3 KB** | **326.4 KB** | **−76.3%** |

单文件对比：

| 文件 | 优化前 | 优化后 |
|---|---|---|
| `ios26` 项目图 | 940.6 KB (PNG) | **42.1 KB (WebP)** |
| `blog` 项目图 | 136.2 KB (PNG) | **21.6 KB (WebP)** |
| `tx.jpg` 头像 | 52.6 KB (640×640) | **23.8 KB (400×400)** |
| `wechat-qr.jpg` | 152.4 KB (1490×2030) | **86.9 KB (900×1226)** |
| `TimeX.png` 孤儿文件 | 714.3 KB | **已删除** |

**响应行为（本地生产构建实测）：**

| 指标 | 优化前 | 优化后 |
|---|---|---|
| 首页 `/` | 307 跳转，累计 969ms | **200 直接返回，9~14ms** |
| `Cache-Control` | `private, no-cache, no-store, max-age=0` | **`s-maxage=31536000, stale-while-revalidate`** |
| `Set-Cookie` | `NEXT_LOCALE=zh; Max-Age=31536000` | **无** |
| `x-nextjs-cache` | MISS | **HIT** |
| `next build` 路由标记 | `ƒ (Dynamic)` | **`● (SSG)`** |

## 6.3 验证记录

- `tsc --noEmit` → 退出码 0
- `next build` → 成功，9 个静态页面预渲染完成，`/en`、`/zh` 及其子页均标记 `● (SSG)`
- `next start` + `verify-local.mjs` → 全部关键断言通过
  （首页 200、无 Set-Cookie、中文浏览器落 zh、英文浏览器落 en、赞助页正常）

## 6.4 仍需平台控制台操作的事项

代码层面无法解决，需在对应平台手动配置：

1. **Cloudflare（cf.ybovo.com）**：创建 Cache Rule，对 HTML 启用边缘缓存。
   默认规则不缓存 HTML，即使源站已返回 `s-maxage`。
   建议：`hostname eq "cf.ybovo.com"` → Cache Eligibility = Eligible，Edge TTL 设为较长值
   （如 1 个月）。注意若勾选「忽略源站 Cache-Control」，需自行承担内容更新延迟。
2. **EdgeOne（eo.ybovo.com）**：开启 HTML 压缩。实测 identity / gzip / brotli 三者均为 84.3 KB，
   压缩收益为 0%，属平台侧未启用；同时配置缓存规则。
3. **Vercel（ybovo.com）**：确认项目 Region 设为 `hnd1`（东京）。
   优化前 `x-vercel-id` 显示渲染执行在 `iad1`（美东），跨洋往返是 TTFB 波动的主因之一。
4. 可选：为 `ghchart.rshah.org` 自建反代并加长缓存，彻底消除 1.4~2.7 秒的长尾。

