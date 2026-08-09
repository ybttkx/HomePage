import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { isCloudflare, SPONSOR_CF_BASE } from "@/lib/sponsor"
import SponsorForm from "@/components/sponsor/SponsorForm"
import SponsorWall from "@/components/sponsor/SponsorWall"

// 必须动态渲染：CF 上需在请求期读取 KV，Vercel/EdgeOne 上需按平台跳转
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const t = await getTranslations({ locale, namespace: "Sponsor" })

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: {
      canonical: `https://ybovo.com/${locale}/sponsor`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function SponsorPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string }
  searchParams: { status?: string }
}) {
  // Vercel/EdgeOne 无 Cloudflare 环境，跳转到 CF 线路使用赞助功能
  if (!isCloudflare()) {
    const status = searchParams?.status ? `?status=${searchParams.status}` : ""
    redirect(`${SPONSOR_CF_BASE}/${locale}/sponsor${status}`)
  }

  const t = await getTranslations({ locale, namespace: "Sponsor" })
  // 支付宝支付完成后从码支付回跳，显示"已提交"提示
  const showReturnNotice = searchParams?.status === "alipay_return"

  return (
    <main className="flex flex-col items-center justify-center px-4 pt-28 pb-20 overflow-x-hidden">
      <div className="max-w-[45rem] w-full">
        <h1 className="text-3xl font-medium capitalize text-center mb-3">
          {t("title")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm text-center mb-10">
          {t("subtitle")}
        </p>

        {showReturnNotice && (
          <p className="mb-6 text-center text-sm text-green-600 dark:text-green-400">
            {t("alipay_return_notice")}
          </p>
        )}

        <SponsorForm />
        <SponsorWall />
      </div>
    </main>
  )
}
