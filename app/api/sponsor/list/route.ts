import { NextResponse } from "next/server"
import { getKv, readSponsors } from "@/lib/sponsor"

export const dynamic = "force-dynamic"

// 公开赞助墙列表；非 Cloudflare 平台（Vercel/EdgeOne）降级为空列表
export async function GET() {
  try {
    const kv = getKv()
    const data = await readSponsors(kv)
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json(
      { ok: false, data: [], error: "当前平台不支持赞助功能" },
      { headers: { "Cache-Control": "no-store" } }
    )
  }
}
