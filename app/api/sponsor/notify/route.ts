import {
  getEnvVar,
  getKv,
  readSponsors,
  verifySign,
  writeSponsors,
} from "@/lib/sponsor"
import type { OrderRecord, Sponsor } from "@/lib/sponsor"

export const dynamic = "force-dynamic"

// 码支付异步回调（易支付风格，GET/POST 均支持）：验签 → 幂等 → 金额核验 → 写赞助墙
// 必须 5 秒内返回纯文本 success，否则网关重试
async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const params: Record<string, string> = Object.fromEntries(
    url.searchParams.entries()
  )
  // 兜底支持 POST form 通知
  if (request.method === "POST" && Object.keys(params).length === 0) {
    const form = await request.formData().catch(() => null)
    if (form) form.forEach((v, k) => { params[k] = String(v) })
  }

  const key = getEnvVar("CODEPAY_KEY")
  if (!key || !verifySign(params, key)) return new Response("fail")

  const out_trade_no = params.out_trade_no
  const money = Number(params.money)
  if (!out_trade_no || !Number.isFinite(money)) return new Response("fail")
  // 非成功状态直接 ACK，不处理
  if (params.trade_status !== "TRADE_SUCCESS") return new Response("success")

  let kv: ReturnType<typeof getKv>
  try {
    kv = getKv()
  } catch {
    return new Response("fail")
  }

  // 幂等：已处理过的订单直接返回成功
  if (await kv.get(`paid:${out_trade_no}`)) return new Response("success")

  const order = (await kv.get(`order:${out_trade_no}`, "json")) as
    | OrderRecord
    | null
  if (order) {
    if (order.status === "paid") return new Response("success")
    // 交叉核验金额：与下单金额不一致拒绝（网关会重试）
    if (Number(order.amount).toFixed(2) !== money.toFixed(2))
      return new Response("fail")
  }

  // 昵称/留言优先取下单记录；记录缺失（如 KV 数据丢失）时以签名可信的回调参数兜底
  let name = order?.name ?? ""
  const message = order?.message ?? ""
  if (!name) {
    try {
      name = JSON.parse(params.param || "{}").name ?? ""
    } catch {
      name = ""
    }
  }
  if (!name) name = String(params.name || "匿名赞助")

  const sponsors = await readSponsors(kv)
  sponsors.unshift({
    id: out_trade_no,
    name,
    amount: money,
    message,
    method: "alipay",
    createdAt: Date.now(),
    trade_no: params.trade_no,
  } satisfies Sponsor)
  await writeSponsors(kv, sponsors)

  // 幂等标记 + 更新订单状态
  await kv.put(`paid:${out_trade_no}`, params.trade_no ?? "")
  if (order)
    await kv.put(
      `order:${out_trade_no}`,
      JSON.stringify({
        ...order,
        status: "paid",
        paidAt: Date.now(),
        trade_no: params.trade_no,
      })
    )

  return new Response("success")
}

export const GET = handle
export const POST = handle
