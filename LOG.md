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
