import React from "react"
import { headers } from "next/headers"

export default function Footer() {
  const headersList = headers()
  const isVercel = headersList.has("x-vercel-id")
  const isEdgeOne = headersList.has("eo-connecting-ip") || headersList.has("eo-log-uuid")
  const isCloudflare = headersList.has("cf-ray")
  const showIpv6 = isEdgeOne || isCloudflare

  return (
    <footer className="mb-10 px-4 text-center text-gray-500">
      <small className="mb-2 block text-xs">
        &copy; 2024 - 2026 毅白 · YIBAI.
      </small>
      <p className="text-xs">
        <span className="font-semibold">About this website:</span> built with
        React & Next.js (App Router & Server Actions), TypeScript, Tailwind CSS,
        Framer Motion, {isVercel ? "Vercel" : isEdgeOne ? "EdgeOne" : isCloudflare ? "Cloudflare" : "Vercel"} hosting.
      </p>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs">
        <a
          href="https://github.com/Mystic-Stars/HomePage"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700 dark:hover:text-gray-300 transition"
        >
          原作者GitHub仓库
        </a>
        {showIpv6 && (
          <div className="flex items-center gap-1.5 ml-1 text-[11px] text-gray-500 font-medium">
            <img
              src="/SVG/ipv6-s1.svg"
              alt="本站支持IPv6访问"
              className="h-4 w-auto"
            />
            <span>本站支持IPv6</span>
          </div>
        )}
      </div>
    </footer>
  )
}
