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
        <span>您访问的 CDN 节点 IP 是: <span id="home-server-ip" className="font-mono font-bold text-pink dark:text-yellow">{serverIp}</span></span>
        <span className="hidden sm:inline text-gray-300 dark:text-gray-700">|</span>
        <span>您的客户端 IP 是: <span id="home-client-ip" className="font-mono font-bold text-pink dark:text-yellow">{ip}</span></span>
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
      
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          async function getGeoInfo(ip) {
            if (!ip || ip === "未知" || ip === "127.0.0.1" || ip === "::1") return "";
            try {
              const res = await fetch("https://api.vore.top/api/IPdata?ip=" + ip, { signal: AbortSignal.timeout(2000) });
              if (res.ok) {
                const json = await res.json();
                if (json.code === 200 && json.data) {
                  const d = json.data;
                  const geo = [];
                  if (d.country) {
                    if (d.country === "中国") {
                      if (d.region) geo.push(d.region.replace("省", "").replace("市", ""));
                      if (d.city && d.city !== d.region) geo.push(d.city.replace("市", ""));
                    } else {
                      geo.push(d.country);
                      if (d.city) geo.push(d.city);
                    }
                  }
                  let friendlyIsp = d.isp || "";
                  if (friendlyIsp.includes("电信")) friendlyIsp = "电信";
                  else if (friendlyIsp.includes("联通")) friendlyIsp = "联通";
                  else if (friendlyIsp.includes("移动")) friendlyIsp = "移动";
                  else if (friendlyIsp.includes("铁通")) friendlyIsp = "铁通";
                  else if (friendlyIsp.includes("广电")) friendlyIsp = "广电";
                  else if (friendlyIsp.includes("教育网")) friendlyIsp = "教育网";
                  const geoStr = geo.join(" ");
                  return (geoStr ? geoStr + " " : "") + friendlyIsp;
                }
              }
            } catch(e) {}
            try {
              const res = await fetch("https://api.ip.sb/geoip/" + ip, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(2000) });
              if (res.ok) {
                const data = await res.json();
                const geo = [];
                if (data.country) {
                  if (data.country === "China") {
                    if (data.region) geo.push(data.region);
                    if (data.city && data.city !== data.region) geo.push(data.city);
                  } else {
                    geo.push(data.country);
                    if (data.city) geo.push(data.city);
                  }
                }
                const isp = data.organization || data.asn_organization || "";
                let friendlyIsp = isp;
                if (isp.includes("Chinanet") || isp.includes("China Telecom")) friendlyIsp = "电信";
                else if (isp.includes("Unicom")) friendlyIsp = "联通";
                else if (isp.includes("Mobile")) friendlyIsp = "移动";
                else if (isp.includes("Tencent")) friendlyIsp = "腾讯云";
                else if (isp.includes("Alibaba") || isp.includes("Aliyun")) friendlyIsp = "阿里云";
                else if (isp.includes("Cloudflare")) friendlyIsp = "Cloudflare";
                const geoStr = geo.join(" ");
                return (geoStr ? geoStr + " " : "") + friendlyIsp;
              }
            } catch(e) {}
            return "";
          }

          async function updateGeo() {
            const serverIpEl = document.getElementById("home-server-ip");
            const clientIpEl = document.getElementById("home-client-ip");
            if (!serverIpEl || !clientIpEl) return;
            const serverIp = serverIpEl.innerText.split(" ")[0].trim();
            const clientIp = clientIpEl.innerText.split(" ")[0].trim();
            
            const [serverGeo, clientGeo] = await Promise.all([
              getGeoInfo(serverIp),
              getGeoInfo(clientIp)
            ]);
            if (serverGeo) serverIpEl.innerText = serverIp + " (" + serverGeo + ")";
            if (clientGeo) clientIpEl.innerText = clientIp + " (" + clientGeo + ")";
          }
          
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", updateGeo);
          } else {
            updateGeo();
          }
        })()
      ` }} />
    </footer>
  )
}
