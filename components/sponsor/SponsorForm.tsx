"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { FaAlipay } from "react-icons/fa"
import { IoLogoWechat } from "react-icons/io5"

const PRESET_AMOUNTS = [5, 10, 20, 50, 100]

export default function SponsorForm() {
  const t = useTranslations("Sponsor")
  const locale = useLocale()

  const [name, setName] = useState("")
  const [amount, setAmount] = useState(10)
  const [customAmount, setCustomAmount] = useState("")
  const [message, setMessage] = useState("")
  const [method, setMethod] = useState<"alipay" | "wechat">("alipay")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [showWechatQr, setShowWechatQr] = useState(false)

  const finalAmount = customAmount ? Number(customAmount) : amount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!name.trim()) {
      setError(t("error_name_required"))
      return
    }
    if (
      !Number.isFinite(finalAmount) ||
      finalAmount < 0.01 ||
      finalAmount > 1000
    ) {
      setError(t("error_amount_invalid"))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/sponsor/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          amount: finalAmount,
          message: message.trim(),
          method,
          locale,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t("error_create_failed"))
        setSubmitting(false)
        return
      }
      if (data.mode === "alipay") {
        // 跳转码支付收银台
        window.location.href = data.payUrl
      } else if (data.mode === "wechat") {
        // 微信：展示收款码，等待站长确认
        setShowWechatQr(true)
        setSubmitting(false)
      }
    } catch {
      setError(t("error_create_failed"))
      setSubmitting(false)
    }
  }

  // 微信支付结果视图：收款码 + 待确认提示
  if (showWechatQr) {
    return (
      <div className="bg-white dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm flex flex-col items-center gap-4 mb-12">
        <h3 className="text-xl font-medium text-gray-800 dark:text-white">
          {t("wechat_pending_title")}
        </h3>
        {/* 微信收款码：h-auto 保持原始宽高比，避免固定高度导致图片被压扁 */}
        <img
          src="/wechat-qr.jpg"
          alt="WeChat QR"
          className="w-56 h-auto rounded-xl border border-gray-200 dark:border-gray-700"
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
          {t("wechat_pending_notice")}
        </p>
        <button
          onClick={() => setShowWechatQr(false)}
          className="text-sm text-pink dark:text-yellow hover:underline"
        >
          {t("wechat_back")}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm mb-12">
      <h3 className="text-xl font-medium text-gray-800 dark:text-white mb-6">
        {t("form_title")}
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* 昵称 */}
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1.5">
            {t("nickname")}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder={t("nickname_placeholder")}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink/50 dark:focus:ring-yellow/50"
          />
        </div>

        {/* 金额档位 + 自定义 */}
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1.5">
            {t("amount")}
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {PRESET_AMOUNTS.map((a) => {
              const active = !customAmount && amount === a
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAmount(a)
                    setCustomAmount("")
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    active
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  ¥{a}
                </button>
              )
            })}
          </div>
          <input
            type="number"
            min={0.01}
            max={1000}
            step="0.01"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder={t("amount_custom_placeholder")}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink/50 dark:focus:ring-yellow/50"
          />
        </div>

        {/* 留言 */}
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1.5">
            {t("message")}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder={t("message_placeholder")}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink/50 dark:focus:ring-yellow/50 resize-none"
          />
        </div>

        {/* 支付方式 */}
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1.5">
            {t("method")}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMethod("alipay")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition flex-1 justify-center ${
                method === "alipay"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <FaAlipay className="w-4 h-4" />
              {t("method_alipay")}
            </button>
            <button
              type="button"
              onClick={() => setMethod("wechat")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition flex-1 justify-center ${
                method === "wechat"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <IoLogoWechat className="w-4 h-4" />
              {t("method_wechat")}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        )}

        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl px-5 py-2.5 font-medium transition disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submit")}
        </motion.button>
      </form>
    </div>
  )
}
