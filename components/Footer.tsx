import NodeInfo from "@/components/NodeInfo"

/**
 * 页脚（纯静态 Server Component）
 *
 * 注意：这里曾经使用 next/headers 的 headers() 与 headers() 派生的服务端 fetch
 * 来展示客户端 IP 和 CDN 节点 IP。由于 Footer 挂在 RootLayout 上，headers() 会让
 * 整站所有页面失去静态性（Cache-Control 变为 private, no-store），CDN 无法缓存。
 *
 * 现在 IP 相关信息全部交由客户端组件 <NodeInfo /> 处理，Footer 本身不含任何
 * 动态 API 调用，页面得以真正静态生成。
 */
export default function Footer() {
  return (
    <footer className="mb-10 px-4 text-center text-gray-500 text-sm">
      <small className="mb-2 block text-sm">
        &copy; 2024 - 2026 毅白 · YIBAI.
      </small>
      <p className="text-sm">
        <span className="font-semibold">About this website:</span> built with
        React & Next.js (App Router & Server Actions), TypeScript, Tailwind CSS,
        Framer Motion.
      </p>

      {/* 客户端 IP / CDN 节点 IP：浏览器端异步获取，不影响页面静态化 */}
      <NodeInfo />

      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
        <a
          href="https://github.com/Mystic-Stars/HomePage"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700 dark:hover:text-gray-300 transition"
        >
          原作者GitHub仓库
        </a>
      </div>
    </footer>
  )
}
