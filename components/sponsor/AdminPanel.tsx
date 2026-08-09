"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import type { PendingSponsor, Sponsor } from "@/lib/sponsor"

export default function AdminPanel() {
  const t = useTranslations("SponsorAdmin")
  const tS = useTranslations("Sponsor")

  const [pwd, setPwd] = useState("")
  const [authed, setAuthed] = useState(false)
  const [confirmed, setConfirmed] = useState<Sponsor[]>([])
  const [pending, setPending] = useState<PendingSponsor[]>([])
  const [error, setError] = useState("")

  // 手动补录表单
  const [addName, setAddName] = useState("")
  const [addAmount, setAddAmount] = useState("")
  const [addMessage, setAddMessage] = useState("")
  const [addMethod, setAddMethod] = useState<"alipay" | "wechat">("alipay")

  // 统一请求：带上管理密码头
  const api = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-admin-pwd": pwd,
        ...(init.headers || {}),
      },
    })
    return res.json()
  }

  const refresh = async () => {
    const data = await api("/api/sponsor/manage")
    if (data.ok) {
      setConfirmed(data.confirmed)
      setPending(data.pending)
    } else {
      setError(data.error || t("error_unknown"))
    }
  }

  const login = async () => {
    setError("")
    const data = await api("/api/sponsor/manage")
    if (data.ok) {
      setAuthed(true)
      setConfirmed(data.confirmed)
      setPending(data.pending)
    } else {
      setError(data.error || t("error_unknown"))
    }
  }

  const confirmPending = async (id: string) => {
    setError("")
    const data = await api("/api/sponsor/manage", {
      method: "POST",
      body: JSON.stringify({ action: "confirm", id }),
    })
    if (data.ok) await refresh()
    else setError(data.error || t("error_unknown"))
  }

  const del = async (id: string) => {
    setError("")
    const data = await api("/api/sponsor/manage", {
      method: "POST",
      body: JSON.stringify({ action: "delete", id }),
    })
    if (data.ok) await refresh()
    else setError(data.error || t("error_unknown"))
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const amount = Number(addAmount)
    if (
      !addName.trim() ||
      !Number.isFinite(amount) ||
      amount < 0.01 ||
      amount > 1000
    ) {
      setError(tS("error_amount_invalid"))
      return
    }
    const data = await api("/api/sponsor/manage", {
      method: "POST",
      body: JSON.stringify({
        action: "add",
        name: addName.trim(),
        amount,
        message: addMessage.trim(),
        method: addMethod,
      }),
    })
    if (data.ok) {
      setAddName("")
      setAddAmount("")
      setAddMessage("")
      await refresh()
    } else {
      setError(data.error || t("error_unknown"))
    }
  }

  // 未登录：密码登录
  if (!authed) {
    return (
      <div className="bg-white dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm max-w-sm mx-auto">
        <h1 className="text-xl font-medium text-gray-800 dark:text-white mb-6">
          {t("title")}
        </h1>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          placeholder={t("password_placeholder")}
          className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink/50 mb-4"
        />
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
        )}
        <button
          onClick={login}
          className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl px-5 py-2.5 font-medium"
        >
          {t("login")}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 待确认（微信） */}
      <div className="bg-white dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-800 dark:text-white mb-4">
          {t("pending_title")}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("pending_empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                    {p.name}{" "}
                    <span className="text-pink dark:text-yellow font-semibold">
                      ¥{p.amount.toFixed(2)}
                    </span>
                  </p>
                  {p.message && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {p.message}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(p.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => confirmPending(p.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  >
                    {t("confirm")}
                  </button>
                  <button
                    onClick={() => del(p.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800"
                  >
                    {t("delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 已确认 */}
      <div className="bg-white dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-800 dark:text-white mb-4">
          {t("confirmed_title")}
        </h2>
        {confirmed.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("confirmed_empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {confirmed.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                    {s.name}{" "}
                    <span className="text-pink dark:text-yellow font-semibold">
                      ¥{s.amount.toFixed(2)}
                    </span>
                  </p>
                  {s.message && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {s.message}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => del(s.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 flex-shrink-0"
                >
                  {t("delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 手动补录 */}
      <div className="bg-white dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm">
        <h2 className="text-lg font-medium text-gray-800 dark:text-white mb-4">
          {t("add_title")}
        </h2>
        <form onSubmit={add} className="flex flex-col gap-4">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            maxLength={20}
            placeholder={tS("nickname")}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm focus:outline-none"
          />
          <input
            value={addAmount}
            onChange={(e) => setAddAmount(e.target.value)}
            type="number"
            min={0.01}
            max={1000}
            step="0.01"
            placeholder={tS("amount")}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm focus:outline-none"
          />
          <input
            value={addMessage}
            onChange={(e) => setAddMessage(e.target.value)}
            maxLength={200}
            placeholder={tS("message")}
            className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddMethod("alipay")}
              className={`px-4 py-2 rounded-lg text-sm ${
                addMethod === "alipay"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              }`}
            >
              {tS("method_alipay")}
            </button>
            <button
              type="button"
              onClick={() => setAddMethod("wechat")}
              className={`px-4 py-2 rounded-lg text-sm ${
                addMethod === "wechat"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              }`}
            >
              {tS("method_wechat")}
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl px-5 py-2.5 font-medium"
          >
            {t("add_submit")}
          </button>
        </form>
      </div>
    </div>
  )
}
