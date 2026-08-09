import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { isCloudflare, SPONSOR_CF_BASE } from "@/lib/sponsor"
import AdminPanel from "@/components/sponsor/AdminPanel"

// 必须动态渲染：非 CF 平台需按平台跳转到 CF 管理页
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const t = await getTranslations({ locale, namespace: "SponsorAdmin" })

  return {
    title: t("title"),
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function SponsorAdminPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  // Vercel/EdgeOne 上赞助管理跳转到 CF 线路
  if (!isCloudflare()) {
    redirect(`${SPONSOR_CF_BASE}/${locale}/sponsor/admin`)
  }

  return (
    <main className="flex flex-col items-center justify-center px-4 pt-28 pb-20 overflow-x-hidden">
      <div className="max-w-[45rem] w-full">
        <AdminPanel />
      </div>
    </main>
  )
}
