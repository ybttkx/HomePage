"use client"

import { motion } from "framer-motion"
import { links } from "@/lib/data"
import Link from "next/link"
import clsx from "clsx"
import { headerLanguageMap } from "@/lib/data"
import { useActiveSectionContext } from "@/context/action-section-context"
import { useLocale } from "next-intl"
import RouteSwitch from "@/components/RouteSwitch"

// 类型守卫：判别链接是否为独立页面（含 path 字段），让 TS 正确收窄联合类型
function isPageLink(
  link: (typeof links)[number]
): link is Extract<(typeof links)[number], { path: string }> {
  return "path" in link
}

function Header() {
  const { activeSection, setActiveSection, setTimeOfLastClick } =
    useActiveSectionContext()
  const activeLocale = useLocale()
  return (
    <header className="z-[999] relative">
      <motion.div
        className="fixed top-0 left-1/2 -translate-x-1/2 h-[4.5rem] w-full rounded-none border border-white border-opacity-40 bg-white bg-opacity-40
        shadow-lg shadow-black/[0.03] backdrop-blur-[0.5rem] sm:top-6 sm:h-[3.25rem] sm:w-[38rem] sm:rounded-full dark:bg-gray-950 dark:border-black/40 dark:bg-opacity-75"
        initial={{ y: -100, x: "-50%", opacity: 0 }}
        animate={{ y: 0, x: "-50%", opacity: 1 }}
      ></motion.div>
      <nav className="flex fixed top-[0.15rem] left-1/2 h-12 -translate-x-1/2 py-2 sm:top-[1.7rem] sm:h-[initial] sm:py-0">
        <ul className="flex w-[22rem] flex-wrap items-center justify-center gap-y-1 text-[0.9rem] font-medium text-gray-500 sm:w-[initial] sm:flex-nowrap sm:gap-4 sm:items-center">
          {links.map((link, index) => {
            // 独立页面链接（如赞助页）与锚点 section 链接分开处理
            const isPage = isPageLink(link)
            const href = isPage ? `/${activeLocale}${link.path}` : link.hash
            const label =
              activeLocale === "zh" ? headerLanguageMap[link.name] : link.name
            return (
              <motion.li
                key={isPage ? link.path : link.hash}
                className="h-3/4 flex items-center justify-center relative break-keep"
                initial={{ opacity: 0, y: -100 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Link
                  href={href}
                  className={clsx(
                    "flex w-full items-center justify-center px-3 py-3 no-wrap hover:text-gray-950 dark:hover:text-gray-300 transition",
                    {
                      "text-gray-950":
                        !isPage && activeSection === link.name,
                      "dark:hover:text-gray-600":
                        !isPage && activeSection == link.name,
                    }
                  )}
                  onClick={
                    isPage
                      ? undefined
                      : () => {
                          setActiveSection(link.name)
                          setTimeOfLastClick(Date.now())
                        }
                  }
                >
                  {label}
                  {!isPage && link.name === activeSection && (
                    <motion.span
                      className="bg-gray-100 rounded-full absolute inset-0 -z-10"
                      layoutId="activeSection"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    ></motion.span>
                  )}
                </Link>
              </motion.li>
            )
          })}
          <motion.li
            className="h-3/4 flex items-center justify-center relative border-l border-gray-300 dark:border-gray-700 pl-2 ml-1"
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <RouteSwitch />
          </motion.li>
        </ul>
      </nav>
    </header>
  )
}

export default Header
