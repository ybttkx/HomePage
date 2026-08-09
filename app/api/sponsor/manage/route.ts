import { NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import {
  genOrderNo,
  getEnvVar,
  getKv,
  readPending,
  readSponsors,
  writePending,
  writeSponsors,
} from "@/lib/sponsor"

export const dynamic = "force-dynamic"

// 管理鉴权：请求头 x-admin-pwd 与 ADMIN_PWD 比对（sha256 + 常量时间比较）
function authOk(pwd: string | null): boolean {
  const expected = getEnvVar("ADMIN_PWD")
  if (!expected || !pwd) return false
  return timingSafeEqual(
    createHash("sha256").update(pwd).digest(),
    createHash("sha256").update(expected).digest()
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const badAuth = async () => {
  await sleep(500) // 防爆破：失败固定延迟
  return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 })
}
const noKv = () =>
  NextResponse.json(
    { ok: false, error: "当前平台不支持赞助功能" },
    { status: 503 }
  )

// 读取正式列表 + 待确认列表
export async function GET(request: Request) {
  if (!authOk(request.headers.get("x-admin-pwd"))) return badAuth()
  let kv: ReturnType<typeof getKv>
  try {
    kv = getKv()
  } catch {
    return noKv()
  }
  const [confirmed, pending] = await Promise.all([
    readSponsors(kv),
    readPending(kv),
  ])
  return NextResponse.json({ ok: true, confirmed, pending })
}

// confirm / add / delete
export async function POST(request: Request) {
  if (!authOk(request.headers.get("x-admin-pwd"))) return badAuth()
  let kv: ReturnType<typeof getKv>
  try {
    kv = getKv()
  } catch {
    return noKv()
  }

  const body = await request.json().catch(() => null)
  const action = body?.action
  const id = String(body?.id ?? "")

  // 确认微信待确认记录 → 移入正式赞助墙
  if (action === "confirm") {
    const pending = await readPending(kv)
    const idx = pending.findIndex((p) => p.id === id)
    if (idx === -1)
      return NextResponse.json({ ok: false, error: "记录不存在" })
    const [p] = pending.splice(idx, 1)
    await writePending(kv, pending)
    const sponsors = await readSponsors(kv)
    sponsors.unshift({ ...p, method: "wechat" })
    await writeSponsors(kv, sponsors)
    return NextResponse.json({ ok: true })
  }

  // 手动补录赞助（如微信收款后站长手动添加）
  if (action === "add") {
    const name = String(body?.name ?? "").trim().slice(0, 20)
    const message = String(body?.message ?? "").trim().slice(0, 200)
    const amount = Number(body?.amount)
    const method = body?.method === "wechat" ? "wechat" : "alipay"
    if (!name)
      return NextResponse.json({ ok: false, error: "请填写昵称" })
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000)
      return NextResponse.json({ ok: false, error: "金额需在 1~1000 元之间" })
    const sponsors = await readSponsors(kv)
    sponsors.unshift({
      id: genOrderNo(),
      name,
      amount,
      message,
      method,
      createdAt: Date.now(),
    })
    await writeSponsors(kv, sponsors)
    return NextResponse.json({ ok: true })
  }

  // 删除记录（正式列表 + 待确认列表都查）
  if (action === "delete") {
    const sponsors = await readSponsors(kv)
    await writeSponsors(kv, sponsors.filter((s) => s.id !== id))
    const pending = await readPending(kv)
    await writePending(kv, pending.filter((p) => p.id !== id))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: "未知操作" }, { status: 400 })
}
