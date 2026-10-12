"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"

/**
 * CDN 节点 IP / 客户端 IP 展示组件
 *
 * 为什么放在客户端：
 *   原先这段逻辑写在 Footer 服务端组件里，调用了 next/headers 的 headers()。
 *   headers() 是 Next.js 的动态 API，一旦被 RootLayout 引用，整站所有页面都会被
 *   强制判定为动态渲染（SSR），generateStaticParams 完全失效，响应的
 *   Cache-Control 变成 private, no-store，CDN 无法缓存，每次访问都要回源。
 *
 *   改为浏览器端获取后：
 *     1. 页面恢复为纯静态（可被 CDN 缓存）
 *     2. 省掉服务端渲染时对外部 DoH 的同步等待（原先最坏叠加约 2 秒）
 *     3. IP 与归属地一次请求拿到，比原先「先查 IP 再查 Geo」更快
 *
 * 使用的接口均已验证支持跨域（Access-Control-Allow-Origin: *）：
 *   - dns.alidns.com  ：阿里公共 DNS over HTTPS，国内访问快
 *   - myip.ipip.net   ：一次返回本机 IP + 归属地 + 运营商
 *   - api.ip.sb       ：备用
 */

const PENDING = "检测中…"

type Info = {
  nodeIp: string
  clientIp: string
  clientGeo: string
  /** null 表示尚未检测完成 */
  hasIpv6: boolean | null
}

/** 通过阿里 DoH 查询域名记录，失败时回退腾讯 DoH */
async function dohLookup(name: string, type: "A" | "AAAA"): Promise<string[]> {
  const endpoints = [
    `https://dns.alidns.com/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    `https://doh.pub/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  ]
  const wantType = type === "A" ? 1 : 28

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const answers: Array<{ type: number; data: string }> = json?.Answer ?? []
      const records = answers.filter((a) => a.type === wantType).map((a) => a.data)
      if (records.length) return records
    } catch {
      // 换下一个 DoH 端点
    }
  }
  return []
}

/** 获取客户端 IP 与归属地 */
async function fetchClientInfo(): Promise<{ ip: string; geo: string }> {
  // myip.ipip.net 返回纯文本：当前 IP：1.2.3.4  来自于：中国 云南 普洱  移动
  try {
    const res = await fetch("https://myip.ipip.net/", {
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const text = await res.text()
      const ip = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0]
      const geo = text.split("来自于：")[1]?.trim().replace(/\s+/g, " ")
      if (ip) return { ip, geo: geo || "" }
    }
  } catch {
    // 回退到 ip.sb
  }

  try {
    const res = await fetch("https://api.ip.sb/geoip", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const d = await res.json()
      const place = [
        d.country === "China" ? d.region : d.country,
        d.city,
      ].filter(Boolean).join(" ")
      const isp = d.isp || d.organization || ""
      return { ip: d.ip || "", geo: [place, isp].filter(Boolean).join(" ") }
    }
  } catch {
    // 两个接口都不可用时静默降级
  }

  return { ip: "", geo: "" }
}

export default function NodeInfo() {
  const locale = useLocale()
  const [info, setInfo] = useState<Info>({
    nodeIp: PENDING,
    clientIp: PENDING,
    clientGeo: "",
    hasIpv6: null,
  })

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const host = window.location.hostname
      const [ipv4, ipv6, client] = await Promise.all([
        dohLookup(host, "A"),
        dohLookup(host, "AAAA"),
        fetchClientInfo(),
      ])
      if (cancelled) return
      setInfo({
        nodeIp: ipv4[0] || "未知",
        clientIp: client.ip || "未知",
        clientGeo: client.geo,
        hasIpv6: ipv6.length > 0,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const zh = locale === "zh"

  return (
    <>
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-1.5 text-sm font-medium text-gray-500/80 dark:text-gray-400/80">
        <span>
          {zh ? "您访问的 CDN 节点 IP 是: " : "CDN node IP: "}
          <span id="home-server-ip" className="font-mono font-bold text-pink dark:text-yellow">
            {info.nodeIp}
          </span>
        </span>
        <span className="hidden sm:inline text-gray-300 dark:text-gray-700">|</span>
        <span>
          {zh ? "您的客户端 IP 是: " : "Your IP: "}
          <span id="home-client-ip" className="font-mono font-bold text-pink dark:text-yellow">
            {info.clientIp}
            {info.clientGeo ? ` (${info.clientGeo})` : ""}
          </span>
        </span>
      </div>

      {info.hasIpv6 === true && (
        <div className="mt-3 flex justify-center">
          <a
            href="https://ipw.wsmdn.top/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 active:scale-95 transition inline-block"
          >
            <img src="/SVG/ipv6-s1.svg" alt="本站支持IPv6访问" className="h-6 w-auto" />
          </a>
        </div>
      )}

      {info.hasIpv6 === false && (
        <div className="mt-3 flex flex-col items-center gap-1.5 text-sm text-gray-500 font-medium">
          <p>
            {zh
              ? "当前线路不支持 IPv6。如需 IPv6，请点击顶栏线路切换图标切换至 Cloudflare 或 EdgeOne 线路。"
              : "This route does not support IPv6. Use the route switcher in the header to switch to Cloudflare or EdgeOne."}
          </p>
          <a
            href="https://ipw.wsmdn.top/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700 dark:hover:text-gray-300 transition"
          >
            {zh ? "点击检测本机是否支持 IPv6" : "Check IPv6 support"}
          </a>
        </div>
      )}
    </>
  )
}
