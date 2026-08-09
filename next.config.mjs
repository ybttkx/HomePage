import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"
import createNextIntlPlugin from "next-intl/plugin"

// 仅本地 `next dev` 时模拟 Cloudflare 绑定（KV 等）。
// 注意：不能在 next build/start 下调用——它只看 AsyncLocalStorage 不看 NODE_ENV，
// 会在 Vercel/CF 构建时执行 getPlatformProxy 导致风险，也会让 isCloudflare() 误判。
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev()
}

const withNextIntl = createNextIntlPlugin()

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
      },
    ],
  },
}

export default withNextIntl(nextConfig)
