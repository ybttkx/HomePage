"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { Sponsor } from "@/lib/sponsor"

export default function SponsorWall() {
  const t = useTranslations("Sponsor")
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/sponsor/list")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) setSponsors(data.data)
        else setError(true)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="bg-white dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm">
      <h3 className="text-xl font-medium text-gray-800 dark:text-white mb-6">
        {t("wall_title")}
      </h3>

      {loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("submitting")}
        </p>
      )}

      {!loading && error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("wall_load_failed")}
        </p>
      )}

      {!loading && !error && sponsors.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("wall_empty")}
        </p>
      )}

      {!loading && !error && sponsors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sponsors.map((s) => (
            <div
              key={s.id}
              className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {s.name}
                </span>
                <span className="text-sm font-semibold text-pink dark:text-yellow">
                  ¥{s.amount.toFixed(2)}
                </span>
              </div>
              {s.message && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {s.message}
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {new Date(s.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
