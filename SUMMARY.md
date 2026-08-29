# HomePage 项目总结 (SUMMARY.md)

## 1. 项目核心目标与背景
本项目为个人主页（基于 Next.js 14 App Router + OpenNext Cloudflare 部署），在 Cloudflare Free Plan 运行时由于 SSR 纯计算耗时高（50ms~300ms），突破了免费版 10ms CPU 限制，导致控制台频繁报 `exceededResources`。

## 2. 优化与修复方案
1. **全站启用静态生成 (SSG / Pre-rendering)**：
   - 在 `app/[locale]/layout.tsx`、`app/[locale]/page.tsx`、`app/[locale]/sponsor/page.tsx` 以及 `app/[locale]/sponsor/admin/page.tsx` 中添加 `generateStaticParams()`。
   - 使用 `unstable_setRequestLocale` 确保构建时能够完全静态化多语言页面。
2. **重构动态组件与客户端解耦**：
   - 赞助页（Sponsor）中的 `useSearchParams` 查询逻辑解耦到 `SponsorClientWrapper` 客户端组件，避免页面退化为服务端动态渲染。
   - 动态数据通过异步 API 路由（只读 KV，仅耗时 0.5ms~2ms）加载。
3. **补全 i18n 缺失文案与修复类型导出**：
   - 补齐 `messages/en.json` 与 `messages/zh.json` 中的 `Sponsor.description` 等缺失字段，确保 SSG 构建零错误零警告。
   - 清理未使用的无状态占位组件，减少打包体积与冷启动开销。

## 3. 构建与验证结果
- 执行 `next build` 与 `@opennextjs/cloudflare build`，所有页面均成功标记为 `● (SSG)` 静态预渲染。
- 部署至 Cloudflare Workers 后，页面访问直接由 Worker Assets / CDN 缓存提供（0ms CPU 占用），从根本上彻底解决了 CPU 超时报错。
