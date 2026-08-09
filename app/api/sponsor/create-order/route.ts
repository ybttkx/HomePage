import { NextResponse } from "next/server"
import {
  genOrderNo,
  getEnvVar,
  getKv,
  readPending,
  sign,
  writePending,
} from "@/lib/sponsor"
import type { OrderRecord } from "@/lib/sponsor"

export const dynamic = "force-dynamic"

const PAY_URL = "https://pay.vkyun.cn/submit.php"
const VALID_METHODS = ["alipay", "wechat"]
const VALID_LOCALES = ["zh", "en"]

// 表单下单：支付宝 → 签名返回支付跳转地址；微信 → 写入待确认列表
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body)
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 })

  const name = String(body.name ?? "").trim().slice(0, 20)
  const message = String(body.message ?? "").trim().slice(0, 200)
  const method = String(body.method ?? "")
  const locale = VALID_LOCALES.includes(String(body.locale ?? ""))
    ? String(body.locale)
    : "zh"
  const amount = Number(body.amount)

  if (!name)
    return NextResponse.json({ ok: false, error: "请填写昵称" }, { status: 400 })
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 1000)
    return NextResponse.json(
      { ok: false, error: "金额需在 0.01~1000 元之间" },
      { status: 400 }
    )
  if (!VALID_METHODS.includes(method))
    return NextResponse.json(
      { ok: false, error: "不支持的支付方式" },
      { status: 400 }
    )

  let kv: ReturnType<typeof getKv>
  try {
    kv = getKv()
  } catch {
    return NextResponse.json(
      { ok: false, error: "当前平台不支持赞助功能（仅 Cloudflare 线路可用）" },
      { status: 503 }
    )
  }

  // 微信：仅挂收款码，先记待确认，由站长在管理页手动确认上墙
  if (method === "wechat") {
    const pending = await readPending(kv)
    pending.unshift({
      id: genOrderNo(),
      name,
      amount,
      message,
      method: "wechat",
      createdAt: Date.now(),
    })
    await writePending(kv, pending)
    return NextResponse.json({ ok: true, mode: "wechat" })
  }

  // 支付宝：码支付下单
  const pid = getEnvVar("CODEPAY_PID")
  const key = getEnvVar("CODEPAY_KEY")
  if (!pid || !key)
    return NextResponse.json({ ok: false, error: "支付未配置" }, { status: 500 })

  const out_trade_no = genOrderNo()
  const origin = new URL(request.url).origin
  const order: OrderRecord = {
    out_trade_no,
    amount,
    name,
    message,
    method: "alipay",
    status: "pending",
    createdAt: Date.now(),
  }
  await kv.put(`order:${out_trade_no}`, JSON.stringify(order))

  const payParams: Record<string, string | number> = {
    pid,
    out_trade_no,
    notify_url: `${origin}/api/sponsor/notify`,
    // 回跳地址需带 locale 前缀，否则 next-intl 中间件不匹配会 404
    return_url: `${origin}/${locale}/sponsor?status=alipay_return`,
    name: `赞助-${name}`,
    money: amount.toFixed(2),
    type: "alipay",
    // param 有长度限制，昵称/留言以 order 记录为准，param 只做回传关联
    param: JSON.stringify({ name }),
    sign_type: "MD5",
  }
  payParams.sign = sign(payParams, key)

  const payUrl =
    `${PAY_URL}?` +
    new URLSearchParams(
      Object.fromEntries(
        Object.entries(payParams).map(([k, v]) => [k, String(v)])
      )
    ).toString()

  return NextResponse.json({ ok: true, mode: "alipay", payUrl, outTradeNo: out_trade_no })
}
