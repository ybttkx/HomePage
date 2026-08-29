import { getTranslations, unstable_setRequestLocale } from "next-intl/server"
import { locales } from "@/lib/data"
import AdminPanel from "@/components/sponsor/AdminPanel"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

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

export default async function AdminPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  unstable_setRequestLocale(locale)

  return (
    <main className="flex flex-col items-center justify-center px-4 pt-28 pb-20 overflow-x-hidden">
      <div className="max-w-[55rem] w-full">
        <AdminPanel />
      </div>
    </main>
  )
}
