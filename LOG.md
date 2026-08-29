# HomePage 开发操作日志 (LOG.md)

## 2026-08-29
- **操作**: 将 GitHub 仓库 `ybttkx/HomePage` 克隆至本地独立目录 `task/0829-homepage`。
- **排查与诊断**:
  - 查询 Cloudflare 后台监控与 GraphQL 指标，定位到 `homepage` Worker 因 SSR 复杂计算耗时（P90 达 77~204ms，P99 达 320~421ms），产生 1874+ 次 `exceededResources` 错误。
- **代码重构与修复**:
  1. `app/[locale]/layout.tsx`: 增加 `generateStaticParams` 与 `unstable_setRequestLocale`，实现全站多语言静态预渲染。
  2. `app/[locale]/page.tsx`: 增加 `generateStaticParams` 与 `unstable_setRequestLocale`。
  3. `app/[locale]/sponsor/page.tsx`: 移除 `force-dynamic`，抽取客户端查询参数逻辑到 `SponsorClientWrapper.tsx`，添加静态参数生成。
  4. `app/[locale]/sponsor/admin/page.tsx`: 增加 `generateStaticParams`。
  5. `messages/en.json` & `messages/zh.json`: 补全缺少的翻译字段，消除构建异常。
  6. `components/Experience.tsx` & `components/Contact.tsx`: 修复导出与类型。
  7. `.env.example`: 创建规范的环境变量模板。
- **构建测试**:
  - 运行 `npm run build` 和 `npx @opennextjs/cloudflare build`，所有路由（`/[locale]`、`/[locale]/sponsor`、`/[locale]/sponsor/admin`）全部成功生成为静态预渲染 `● (SSG)` 页面。
