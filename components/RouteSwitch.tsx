"use client"

import React, { useState, useEffect, useRef } from "react"
import { useLocale } from "next-intl"
import { IoWifiOutline } from "react-icons/io5"

const routes = [
  {
    name: "主线路 (亚洲)",
    name_en: "Main Route (Asia)",
    url: "https://ybovo.com",
  },
  {
    name: "全球线路 (Cloudflare)",
    name_en: "Global Route (CF)",
    url: "https://cf.ybovo.com",
  },
  {
    name: "国外线路 (EdgeOne)",
    name_en: "Overseas Route (EO)",
    url: "https://eo.ybovo.com",
  },
]

export default function RouteSwitch() {
  const [isOpen, setIsOpen] = useState(false)
  const [latencies, setLatencies] = useState<{ [key: string]: number | string }>({})
  const [fastestUrl, setFastestUrl] = useState<string | null>(null)
  const activeLocale = useLocale()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const toggleDropdown = () => {
    setIsOpen(!isOpen)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Run ping tests when opened
  useEffect(() => {
    if (!isOpen) return

    let active = true

    async function pingUrl(url: string, timeout = 3000): Promise<{ ok: boolean; time: number }> {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), timeout)
      try {
        // 1. Connection warmup (TCP/TLS handshake)
        await fetch(`${url}/favicon.ico?warmup=${Date.now()}`, {
          method: "HEAD",
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal,
        })
        
        // 2. Pure RTT measurement
        const start = performance.now()
        await fetch(`${url}/favicon.ico?ts=${Date.now()}`, {
          method: "HEAD",
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal,
        })
        
        clearTimeout(id)
        return { ok: true, time: Math.max(1, Math.round(performance.now() - start)) }
      } catch (e) {
        clearTimeout(id)
        return { ok: false, time: timeout }
      }
    }

    async function runTests() {
      // Set initial status to testing
      const initialStatus: { [key: string]: string } = {}
      routes.forEach((r) => {
        initialStatus[r.url] = activeLocale === "zh" ? "测试中..." : "Testing..."
      })
      if (active) setLatencies(initialStatus)

      const results = await Promise.all(
        routes.map(async (r) => {
          const res = await pingUrl(r.url).catch(() => ({ ok: false, time: 9999 }))
          return { url: r.url, ok: res.ok, time: res.ok ? res.time : Infinity }
        })
      )

      if (!active) return

      const newLatencies: { [key: string]: number | string } = {}
      let minTime = Infinity
      let bestUrl: string | null = null

      results.forEach((res) => {
        if (res.ok && res.time !== Infinity) {
          newLatencies[res.url] = res.time
          if (res.time < minTime) {
            minTime = res.time
            bestUrl = res.url
          }
        } else {
          newLatencies[res.url] = activeLocale === "zh" ? "超时" : "Timeout"
        }
      })

      setLatencies(newLatencies)
      setFastestUrl(bestUrl)
    }

    runTests()

    return () => {
      active = false
    }
  }, [isOpen, activeLocale])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="w-[2.5rem] h-[2.5rem] bg-opacity-80 flex items-center justify-center hover:scale-[1.15] active:scale-105 transition-all text-gray-700 dark:text-white/80"
        title={activeLocale === "zh" ? "选择线路" : "Select Route"}
      >
        <span className="sr-only">Change Route</span>
        <IoWifiOutline className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute bottom-0 right-[3.2rem] mr-2 w-64 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200 dark:border-gray-800 rounded-2xl p-3 shadow-2xl z-[1000] flex flex-col gap-1.5 animate-in fade-in slide-in-from-right-2 duration-200">
          <div className="text-xs font-semibold px-2 py-1 text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {activeLocale === "zh" ? "📡 线路切换 / 测速" : "📡 Route Switch / Ping"}
          </div>

          {routes.map((route) => {
            const latency = latencies[route.url]
            const isFastest = fastestUrl === route.url
            const isTesting = latency === "测试中..." || latency === "Testing..."
            const isTimeout = latency === "超时" || latency === "Timeout"
            
            return (
              <a
                key={route.url}
                href={route.url}
                className={`flex flex-col p-2.5 rounded-xl border transition-all duration-200 text-left ${
                  isFastest
                    ? "bg-pink/5 dark:bg-yellow/5 border-pink/20 dark:border-yellow/20 hover:bg-pink/10 dark:hover:bg-yellow/10"
                    : "bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <span className={`text-sm font-semibold transition-colors duration-200 ${
                  isFastest
                    ? "text-pink dark:text-yellow"
                    : "text-gray-800 dark:text-gray-200"
                }`}>
                  {activeLocale === "zh" ? route.name : route.name_en}
                </span>
                
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono tracking-wide">
                    {route.url.replace("https://", "")}
                  </span>
                  
                  <span className={`text-xs font-medium font-mono ${
                    isTesting
                      ? "text-gray-400 dark:text-gray-500"
                      : isTimeout
                      ? "text-red-500"
                      : isFastest
                      ? "text-pink dark:text-yellow font-bold"
                      : "text-gray-500 dark:text-gray-400"
                  }`}>
                    {typeof latency === "number" ? `${latency}ms` : latency || "—"}
                  </span>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
