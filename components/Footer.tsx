import React from "react"
import { headers } from "next/headers"

export default async function Footer() {
  const headersList = headers()
  const host = headersList.get("host") || "ybovo.com"
  const cleanHost = host.split(":")[0]

  const isVip = cleanHost.includes("vip")
  const isVercel = !isVip && headersList.has("x-vercel-id")
  const isEdgeOne = !isVip && (headersList.has("eo-connecting-ip") || headersList.has("eo-log-uuid"))
  const isCloudflare = !isVip && headersList.has("cf-ray")
  const showIpv6 = isEdgeOne || isCloudflare || isVip

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
      {showIpv6 && (
        <div className="mt-3 flex justify-center">
          <a
            href="https://ipw.wsmdn.top/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 active:scale-95 transition inline-block"
          >
            <img
              src="/SVG/ipv6-s1.svg"
              alt="本站支持IPv6访问"
              className="h-6 w-auto"
            />
          </a>
        </div>
      )}
      {isVercel && (
        <div className="mt-3 flex flex-col items-center gap-1.5 text-sm text-gray-500 font-medium">
          <p>当前线路不支持 IPv6。如需 IPv6，请点击顶栏线路切换图标切换至 Cloudflare 或 EdgeOne 线路。</p>
          <a
            href="https://ipw.wsmdn.top/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700 dark:hover:text-gray-300 transition"
          >
            点击检测本机是否支持 IPv6
          </a>
        </div>
      )}
    </footer>
  )
}
