"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import SponsorForm from "./SponsorForm"
import SponsorWall from "./SponsorWall"

export default function SponsorClientWrapper({ locale }: { locale: string }) {
  const searchParams = useSearchParams()
  const t = useTranslations("Sponsor")
  const showReturnNotice = searchParams.get("status") === "alipay_return"

  return (
    <>
      {showReturnNotice && (
        <p className="mb-6 text-center text-sm text-green-600 dark:text-green-400">
          {t("alipay_return_notice")}
        </p>
      )}

      <SponsorForm />
      <SponsorWall />
    </>
  )
}
