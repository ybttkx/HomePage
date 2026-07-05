import React from "react"
import { headers } from "next/headers"
import { FaCloudflare } from "react-icons/fa"
import { IoLogoVercel } from "react-icons/io5"

export default async function Footer() {
  const headersList = headers()
  const isVercel = headersList.has("x-vercel-id")
  const isEdgeOne = headersList.has("eo-connecting-ip") || headersList.has("eo-log-uuid")
  const isCloudflare = headersList.has("cf-ray")
  const showIpv6 = isEdgeOne || isCloudflare

  const ip = headersList.get("cf-connecting-ip") ||
             headersList.get("eo-connecting-ip") ||
             headersList.get("x-real-ip") ||
             headersList.get("x-forwarded-for")?.split(",")[0].trim() ||
             "127.0.0.1"

  const cfRay = headersList.get("cf-ray")
  const coloCode = cfRay && cfRay.includes("-") ? cfRay.split("-")[1].toUpperCase() : ""

  const host = headersList.get("host") || "ybovo.com"
  const cleanHost = host.split(":")[0]
  const isClientIpv6 = ip.includes(":")

  // Fetch Server Anycast IP using DoH based on client connection type (A/AAAA)
  let serverIp = "未知"
  try {
    if (cleanHost !== "localhost" && cleanHost !== "127.0.0.1") {
      const type = isClientIpv6 ? "AAAA" : "A"
      const dnsRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${cleanHost}&type=${type}`, {
        headers: { accept: "application/dns-json" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(1000),
      })
      if (dnsRes.ok) {
        const json = await dnsRes.json()
        if (json.Answer && json.Answer.length > 0) {
          const targetType = isClientIpv6 ? 28 : 1 // 28 is AAAA, 1 is A
          const records = json.Answer.filter((ans: any) => ans.type === targetType)
          if (records.length > 0) {
            serverIp = records[0].data
          }
        }
      }
    } else {
      serverIp = isClientIpv6 ? "::1" : "127.0.0.1"
    }
  } catch (e) {
    // Fallback if DoH fails
    try {
      const res = await fetch("https://icanhazip.com/", {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok) {
        serverIp = (await res.text()).trim()
      }
    } catch (_) {}
  }

  return (
    <footer className="mb-10 px-4 text-center text-gray-500 text-sm">
      <small className="mb-2 block text-sm">
        &copy; 2024 - 2026 毅白 · YIBAI.
      </small>
      <p className="text-sm">
        <span className="font-semibold">About this website:</span> built with
        React & Next.js (App Router & Server Actions), TypeScript, Tailwind CSS,
        Framer Motion, {isVercel ? "Vercel" : isEdgeOne ? "EdgeOne" : isCloudflare ? "Cloudflare" : "Vercel"} hosting.
      </p>
      
      {/* CDN Node IP & Provider display line */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-sm font-medium text-gray-500/80 dark:text-gray-400/80">
        <span>您访问的 CDN 节点 IP 是: <span className="font-mono font-bold text-pink dark:text-yellow">{serverIp}</span></span>
        <span className="hidden sm:inline text-gray-300 dark:text-gray-700">|</span>
        <span>您的客户端 IP 是: <span className="font-mono font-bold text-pink dark:text-yellow">{ip}</span></span>
        <span className="hidden sm:inline text-gray-300 dark:text-gray-700">|</span>
        <div className="flex items-center gap-1">
          <span>属于:</span>
          {isVercel && (
            <div className="flex items-center gap-1 text-black dark:text-white font-semibold">
              <IoLogoVercel className="w-3.5 h-3.5" />
              <span>Vercel</span>
            </div>
          )}
          {isCloudflare && (
            <div className="flex items-center gap-1 text-[#f38020] font-bold">
              <FaCloudflare className="w-4 h-4" />
              <span>Cloudflare {coloCode ? `(${coloCode})` : ""}</span>
            </div>
          )}
          {isEdgeOne && (
            <div className="flex items-center gap-1 text-blue-500 dark:text-blue-400 font-bold">
              <img
                src="/SVG/edgeone.svg"
                alt="EdgeOne"
                className="h-3.5 w-auto dark:brightness-125"
              />
              <span>EdgeOne</span>
            </div>
          )}
          {!isVercel && !isCloudflare && !isEdgeOne && (
            <span className="text-gray-400 dark:text-gray-600 font-mono">本地开发线路</span>
          )}
        </div>
      </div>

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
          <p>本线路不支持ipv6，如有需要可点击右侧WiFi图标切换cloudflare或edgeone</p>
          <a
            href="https://ipw.wsmdn.top/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700 dark:hover:text-gray-300 transition"
          >
            点击检测本机是否支持ipv6
          </a>
        </div>
      )}
    </footer>
  )
}
