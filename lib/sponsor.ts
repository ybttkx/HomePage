// 赞助功能共享工具：类型、KV 读写、码支付签名/验签
import { createHash } from "node:crypto"
import { getCloudflareContext } from "@opennextjs/cloudflare"

// ---------- 类型 ----------

// 已确认的赞助墙记录
export type Sponsor = {
  id: string // 支付宝用 out_trade_no；手动补录用 genOrderNo()
  name: string
  amount: number // 元
  message: string
  method: "alipay" | "wechat"
  createdAt: number // ms 时间戳
  trade_no?: string // 码支付交易号（仅支付宝）
}

// 微信待确认记录（扫码付款后由站长在管理页确认）
export type PendingSponsor = {
  id: string
  name: string
  amount: number
  message: string
  method: "wechat"
  createdAt: number
}

// 支付宝下单记录（回调时交叉核验金额 + 幂等）
export type OrderRecord = {
  out_trade_no: string
  amount: number
  name: string
  message: string
  method: "alipay"
  status: "pending" | "paid"
  createdAt: number
  paidAt?: number
  trade_no?: string
}

// ---------- KV 访问 ----------

// 最小 KVNamespace 结构类型（避免引入 @cloudflare/workers-types）
type KVNamespace = {
  get(key: string): Promise<string | null>
  get(key: string, type: "json"): Promise<unknown>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

const SPONSORS_KEY = "sponsors"
const PENDING_KEY = "sponsors_pending"
const MAX_SPONSORS = 200

// 仅在 Cloudflare 运行时可用；Vercel/EdgeOne 上抛错，由调用方 try/catch 降级
export function getKv(): KVNamespace {
  const env = getCloudflareContext().env as Record<string, unknown>
  return env.SPONSORS_KV as KVNamespace
}

export async function readSponsors(kv: KVNamespace): Promise<Sponsor[]> {
  const raw = await kv.get(SPONSORS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as Sponsor[]
  } catch {
    return []
  }
}

export async function writeSponsors(kv: KVNamespace, list: Sponsor[]): Promise<void> {
  await kv.put(SPONSORS_KEY, JSON.stringify(list.slice(0, MAX_SPONSORS)))
}

export async function readPending(kv: KVNamespace): Promise<PendingSponsor[]> {
  const raw = await kv.get(PENDING_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as PendingSponsor[]
  } catch {
    return []
  }
}

export async function writePending(kv: KVNamespace, list: PendingSponsor[]): Promise<void> {
  await kv.put(PENDING_KEY, JSON.stringify(list))
}

export function genOrderNo(): string {
  return `sponsor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// 读取环境变量：优先 process.env（生产 CF/Vercel 由 opennext/平台注入），
// 其次 Cloudflare 绑定 env（本地 dev 的 .dev.vars 值在此，且 KV 模拟也依赖 getCloudflareContext）
export function getEnvVar(name: string): string | undefined {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  try {
    const env = getCloudflareContext().env as Record<string, unknown>
    const v = env[name]
    return typeof v === "string" ? v : undefined
  } catch {
    return undefined
  }
}

// 赞助功能固定部署在 Cloudflare 线路；Vercel / EdgeOne 上访问赞助页跳转到此域名
export const SPONSOR_CF_BASE = "https://cf.ybovo.com"

// 检测当前是否运行在 Cloudflare Workers（Vercel/EdgeOne 上 getCloudflareContext 会抛错）
export function isCloudflare(): boolean {
  try {
    getCloudflareContext()
    return true
  } catch {
    return false
  }
}

// ---------- 码支付签名 ----------

// 易支付签名：排除 sign/sign_type/空值，参数按 key ASCII 升序，
// 拼接 k=v&k=v（值不 urlencode），sign = md5(拼接串 + 商户KEY)
export function sign(params: Record<string, string | number>, key: string): string {
  const str = Object.keys(params)
    .filter(
      (k) =>
        k !== "sign" &&
        k !== "sign_type" &&
        params[k] !== "" &&
        params[k] != null
    )
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  return createHash("md5").update(str + key).digest("hex")
}

export function verifySign(
  params: Record<string, string | number>,
  key: string
): boolean {
  const received = String(params.sign ?? "")
  if (!received) return false
  return received.toLowerCase() === sign(params, key).toLowerCase()
}
