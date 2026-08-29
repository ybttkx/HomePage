import { locales } from "@/lib/data"
import { getTranslations, unstable_setRequestLocale } from "next-intl/server"
import { Suspense } from "react"
import SponsorClientWrapper from "@/components/sponsor/SponsorClientWrapper"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const t = await getTranslations({ locale, namespace: "Sponsor" })
  return {
    title: `${t("title")} | Portfolio`,
    description: t("description"),
  }
}

export default function SponsorPage({
  params: { locale },
}: {
  params: { locale: string }
}) {
  unstable_setRequestLocale(locale)

  return (
    <main className="flex min-h-screen flex-col items-center justify-start px-4 pt-28 pb-16">
      <Suspense fallback={<div className="text-center py-10">Loading...</div>}>
        <SponsorClientWrapper locale={locale} />
      </Suspense>
    </main>
  )
}
