# ybovo.com 性能优化前后对比报告

> 优化时间：2026-10-12
> 测量位置：中国大陆，本机直连（本地 Clash 代理已关闭）
> 涉及域名：`ybovo.com`（Vercel 东京）、`cf.ybovo.com`（Cloudflare）、`eo.ybovo.com`（EdgeOne，已放生）

---

## 一、一句话结论

首屏传输量从 **1378.3 KB 降到 327.7 ~ 393.9 KB（降幅 71% ~ 76%）**，
首页从「307 跳转 + 每次回源实时渲染」变成「200 直达 + 边缘缓存命中」，
并且**修复了一个正在线上泄露访客 IP 的隐患**。

---

## 二、前后对比

### 2.1 首屏传输量（同域名 ybovo.com，同口径）

| 分类 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 图片 | 1131.3 KB | **92.0 KB** | −91.9% |
| JS | 217.9 KB | 218.9 KB | ≈ 持平 |
| CSS | 8.7 KB | 8.7 KB | 持平 |
| 字体 | （未单列） | 58.7 KB | — |
| HTML | 17.7 KB | 15.6 KB | −11.9% |
| **总计** | **1378.3 KB** | **393.9 KB** | **−71.4%** |

`cf.ybovo.com` 同口径实测为 **327.7 KB**（28 个资源，0 失败）。

### 2.2 单文件变化

| 文件 | 优化前 | 优化后 | 说明 |
|---|---|---|---|
| `ios26`（项目图） | 940.6 KB PNG | **42.1 KB WebP** | −95.5% |
| `blog`（项目图） | 136.2 KB PNG | **21.6 KB WebP** | −84.2% |
| `tx.jpg`（首屏头像） | 52.6 KB 640×640 | **23.8 KB 400×400** | −54.9% |
| `wechat-qr.jpg` | 152.4 KB 1490×2030 | **86.9 KB 900×1226** | −43.0% |
| `GHS.png` / `SVG/vip.png` | 68.8 / 129.6 KB | 18.2 / 35.4 KB WebP | 转格式 |
| `TimeX.png` | 714.3 KB | **已删除** | 孤儿文件，无任何引用 |

### 2.3 响应行为

| 指标 | 优化前 | 优化后（Vercel） | 优化后（Cloudflare） |
|---|---|---|---|
| 首页 `/` | **307 跳转** + 二次请求 | **200 直达** | **200 直达** |
| Cache-Control | `private, no-cache, no-store` | `public, max-age=0, must-revalidate` | `s-maxage=31536000, stale-while-revalidate` |
| `x-vercel-cache` | MISS | **HIT** | — |
| Set-Cookie | `NEXT_LOCALE=zh` | **无** | **无** |
| 构建路由标记 | `ƒ (Dynamic)` | **`● (SSG)`** | **`● (SSG)`** |
| HTML 中的客户端 IP | **真实 IP（泄露）** | 「检测中…」占位符 | 「检测中…」占位符 |
| 贡献图加载 | 阻塞首屏（TTFB 2.7s） | `loading="lazy"` | `loading="lazy"` |
| HTML 压缩 | br 17.7 KB | br 15.6 KB | br 15.5 KB |

### 2.4 网络时序（参考值，波动较大）

| 域名 | 优化前 冷连接累计 | 优化后 冷连接累计 | 优化后 热态 |
|---|---|---|---|
| ybovo.com | 1089 ms | 1407 ms | — |
| cf.ybovo.com | 1306 ms | 2552 ms（首请求含冷启动） | **255 ~ 296 ms** |
| eo.ybovo.com | 1733 ms | 3418 ms（仍为旧版） | — |

> **关于时序数据波动**：本机到海外的出口链路质量在一天中变化很大，
> 同一域名相邻两次测量的 TLS 握手时间可从 190 ms 跳到 1160 ms。
> 因此**时序数字不构成可靠的前后对比依据**，
> 真正确定性的收益是上表中的「传输量」「跳转次数」「缓存状态」「压缩率」。

---

## 三、干了什么、怎么干的

### 3.1 真正的病根（这是本次优化最关键的一步）

一开始我以为是「CDN 选得不好」，实测后发现不是。

用 Node 抓取线上响应头，发现**三个域名的 HTML 全部返回**：

```
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
Set-Cookie: NEXT_LOCALE=zh; Max-Age=31536000
```

`no-store` 意味着**任何 CDN 都无法缓存**，每次访问都要回源实时渲染。
继续追查，定位到两个元凶：

1. **`components/Footer.tsx` 调用了 `next/headers` 的 `headers()`**
   Footer 挂在 RootLayout 上，而 `headers()` 是 Next.js 的**动态 API**。
   它一旦被引用，**整站所有页面都会被判定为动态渲染**，
   之前辛苦加的 `generateStaticParams()` 完全失效。
   铁证：优化前 `next build` 的路由表里 `/[locale]` 是 `ƒ (Dynamic)`，
   优化后变成 `● (SSG) prerendered as static HTML`。

2. **next-intl 中间件在每个响应上写 `NEXT_LOCALE` Cookie**
   带 `Set-Cookie` 的响应同样进不了共享缓存。

另外同文件里还有一段服务端 `fetch` 会同步请求境外 DoH（`cloudflare-dns.com`，
1 秒超时），失败后再回退 `icanhazip.com`（再 1 秒），
**最坏给每一次页面渲染叠加约 2 秒**。

### 3.2 改动清单

| # | 问题 | 做法 | 文件 |
|---|---|---|---|
| 1 | 全站无法静态化 | Footer 改为纯静态 Server Component，移除 `headers()` 与服务端 fetch | `components/Footer.tsx` |
| 2 | IP 展示功能不能丢 | 新建客户端组件，浏览器端用**阿里 DoH**（`dns.alidns.com`）查节点 IP、`myip.ipip.net` 一次拿齐客户端 IP + 归属地 | `components/NodeInfo.tsx`（新增） |
| 3 | 每响应写 Cookie | 中间件主动剔除 `Set-Cookie` | `middleware.ts` |
| 4 | 首页 307 跳转 | 首页与无前缀路径改为内部 **rewrite**（浏览器地址栏不变，省掉一次完整往返） | `middleware.ts` |
| 5 | 图片占首屏 83% | 批量转 WebP 并按显示尺寸缩放 | `public/*.webp`、`lib/data.ts` |
| 6 | 第三方贡献图 2.7s | 加 `loading="lazy"`，移出首屏加载路径 | `components/About.tsx` |
| 7 | 静态资源无法缓存 | 补缓存策略：图片/音频 1 天 + 7 天 `stale-while-revalidate`，字体 1 年 `immutable` | `vercel.json`、`public/_headers`（新增） |
| 8 | 线路维护 | 按需求移除 `vip.ybovo.com`；给 EdgeOne 线路加「不保证速度」提示 | `components/RouteSwitch.tsx` |
| 9 | 仓库垃圾 | 清理 3 个指向不存在文件的死导入、删除 714 KB 孤儿文件 `TimeX.png` | `lib/data.ts`、`public/` |

**接口可达性是实测筛出来的**：`doh.pub` 无 CORS 头、`ipapi.co` 返回 403、
`cloudflare-dns.com` 与 `api.ipify.org` 直连被重置，只有
`dns.alidns.com`（145 ms）和 `myip.ipip.net`（219 ms）既支持跨域又够快。

### 3.3 Cloudflare 侧配置（通过 API 完成）

用你提供的账号级 Token，经实测确认权限后才动手：

```
✓ Zone:Read   ✓ DNS:Read   ✓ Cache Rules:Read   ✓ Zone Settings:Read
✗ 页面规则（Page Rules 端点不支持账号级 Token）
```

- 查出区域 `cache_level = "simplified"` —— 这正是 HTML 不被缓存的原因
  （简化模式只缓存 js/css/图片等标准扩展名）。
- 新建缓存规则 **「HTML 边缘缓存」**（id `023e973f9c2641e0abaf59c4f3a70aba`）：

  ```
  表达式：(http.host eq "cf.ybovo.com"
           and not starts_with(http.request.uri.path, "/api/")
           and not starts_with(http.request.uri.path, "/_next/")
           and not http.request.uri.path contains ".")
  edge_ttl     = override_origin, 3600s
  browser_ttl  = respect_origin
  ```

  表达式**特意排除 `/api/`**，否则赞助数据与支付回调会被缓存，后果严重。

- 区域设置复查：`brotli = "on"`、`automatic_https_rewrites = "on"`（本就正常）。

### 3.4 一次被拦下的隐私事故（值得单独说）

规则建好后我**没有直接启用**，而是先核对线上旧版的行为 ——
结果发现旧版 Footer 会把**访客真实客户端 IP 渲染进 HTML**：

```
HTML 中的客户端 IP : 103.151.173.206   ← 实测到的本机出口 IP
```

如果这条 `cache: true` 规则在旧代码上生效，**所有访客都会看到第一个访客的 IP**。

所以实际执行顺序是：

1. 先把规则**停用**（`enabled=false`）
2. 部署新代码
3. 验证线上 HTML 中的 IP 已变成「检测中…」占位符
4. **再启用**规则

### 3.5 部署过程

**Cloudflare Workers**（`cf.ybovo.com` 是绑定到 `homepage` worker 的 Custom Domain）：

构建时踩了两个坑，都不是代码问题：

1. `esbuild ... Access is denied` —— OpenNext 在 Windows 上不兼容，
   默认往 `%TEMP%` 写文件被拒（本机装有卡巴斯基，`avp` 进程在跑）。
   解决：把 `TEMP`/`TMP` 指向项目内的 `.tmp-opennext/`。
2. `Next.js version 14.2.3 is not supported` —— 14.x 的两年支持期已过。
   解决：加 `--dangerouslyUseUnsupportedNextVersion` 标志。
   **注意：这意味着该版本可能有未修补的安全漏洞，建议后续单独安排升级。**

最终两次部署：

| 版本 ID | 内容 |
|---|---|
| `c8a7a20b-3412-45d8-8107-70d1cc80e76f` | 主体性能优化 |
| `0aba608c-ef32-4073-bf76-291286734eb5` | 线路提示文案 |

部署后出现 `main-app-2e660ed0290f68c3.js 404`：
边缘仍缓存着上一版 HTML，而它引用的旧 chunk 已被新版本替换。
执行 `purge_cache` 清除后恢复正常（已验证新 chunk 返回 200）。

**Vercel**（`ybovo.com`）：推送 Git 后自动部署，未做手工操作。
验证结果：`x-vercel-cache: HIT`，`x-vercel-id` 为 `hnd1`（东京），
且不再出现 `iad1`（美东）——说明渲染函数不再跨洋执行。

**EdgeOne**（`eo.ybovo.com`）：按你的要求放生，未做任何部署与配置。

---

## 四、提交与部署记录

### Git 提交（已推送到 `github.com/ybttkx/HomePage`，分支 `main`）

| Commit | 说明 |
|---|---|
| `a8a6b81` | `perf(全站): 移除 Footer 动态 API 恢复全站 SSG，首屏体积降低 76%`<br>37 个文件变更（19 新增 / 5 删除 / 14 修改） |
| `e9edc28` | `feat(线路切换): 为 EdgeOne 线路标注「不保证速度」`<br>1 个文件变更 |

推送范围：`37ed64d..e9edc28`（含你此前未提交的 `RouteSwitch` 位置调整）。

**提交前已执行安全过滤**：
- 扫描 `cfut_`/`cfat_` 前缀 Token、`Bearer`、password、secret 等模式 → **未发现明文密钥**
- 构建产物 `.open-next/`、`.next/`、`.wrangler/`、`node_modules/` 均已在 `.gitignore` 中
- 新增忽略 `.tmp-opennext/`（本次排查 Windows 构建问题时产生的临时目录）
- `perf-audit/` 下的脚本一律从**环境变量**读取凭据，不含硬编码

### 平台变更

| 平台 | 变更 |
|---|---|
| Cloudflare | 新增缓存规则「HTML 边缘缓存」；执行过一次 `purge_cache`；部署 worker 两次 |
| Vercel | 因 Git 推送自动部署两次 |
| EdgeOne | 无 |

---

## 五、仍未解决 / 需要你决定的事

1. **EdgeOne 线路已放生**，但仍运行旧版代码，也就是说
   `eo.ybovo.com` 目前**仍会把访客 IP 渲染进 HTML**。
   它现在没有开缓存，所以 IP 不会串号；但若将来在 EdgeOne 上启用缓存，就会出问题。
   建议要么更新它，要么直接从 `RouteSwitch` 里摘掉。

2. **Next.js 14.2.3 已过支持期**，构建必须带 `--dangerouslyUseUnsupportedNextVersion`。
   建议安排一次独立升级（升到 15.x 涉及 next-intl 与 OpenNext 的适配，改动面较大）。

3. **Cloudflare 的 HTML 边缘缓存不稳定**：
   实测热态响应 255~296 ms（良好），但响应中始终没有 `age` 头，
   说明并非每次都从边缘缓存返回。
   若要稳定命中，需改为在 Worker 内使用 Cache API 显式缓存
   （需改 `wrangler.toml` 的 `main` 指向自定义入口，属于有风险的改动，未擅自实施）。

4. **EdgeOne 的 HTML 不压缩**（identity/gzip/br 均为 84.3 KB，压缩收益 0%）。
   已随放生一并搁置。

5. **`ghchart.rshah.org` 贡献图**只是改为懒加载，滚动到该区域仍需等 1.3~2.7 秒。
   彻底解决需自建反代并加长缓存。

---

## 六、复现方式

所有测量脚本在 `perf-audit/` 下：

```powershell
node measure.mjs --rounds 5      # 三域名 DNS/TCP/TLS/TTFB/跳转链
node probe.mjs                   # 缓存策略 / 压缩能力 / 协议
node baseline.mjs ybovo.com      # 首屏体积核算
node verify-live.mjs cf.ybovo.com# 线上行为与隐私断言
node compress_images.py          # 图片压缩（试算，加 --apply 执行）

# 浏览器操控（CDP，零依赖）
node browser.mjs goto <url>
node browser.mjs shot <file.png>

# Cloudflare 管理（Token 走环境变量）
$env:CF_TOKEN="<你的Token>"
node cf-api.mjs probe ybovo.com
node cf-api.mjs apply-cache-rule ybovo.com cf.ybovo.com 3600
node cf-api.mjs rule-toggle ybovo.com true
node cf-api.mjs purge ybovo.com
```

> **安全提醒**：你在对话中明文发送过一个 `cfat_` 账号级 API Token，
> 以及 R2 的 Access Key ID / Secret Access Key。
> 这些凭据应当视为已泄露，建议尽快在 Cloudflare 控制台**撤销并重新生成**。
> 本次任务只在内存与环境变量中使用过它们，未写入任何文件或提交记录。
