import "./globals.css"
import { Inter } from "next/font/google"
import { notFound } from "next/navigation"
import { locales } from "@/lib/data"
import Header from "@/components/Header"
import Footer from "@/components/Footer"
import ThemeSwitch from "@/components/ThemeSwitch"
import ThemeContextProvider from "@/context/theme-context"
import ActiveSectionContextProvider from "@/context/action-section-context"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations, unstable_setRequestLocale } from "next-intl/server"
import WidgetWrapper from "@/components/WidgetWrapper"
import RouteSwitch from "@/components/RouteSwitch"

const inter = Inter({ subsets: ["latin"] })

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string }
}) {
  const t = await getTranslations({ locale, namespace: "Metadata" })

  return {
    title: {
      default: t("title"),
      template: "%s | YIBAI",
    },
    description: t("description"),
    metadataBase: new URL("https://ybovo.com"),
    icons: {
      icon: "/favicon.ico",
    },
  }
}

export default async function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!locales.includes(locale as any)) {
    notFound()
  }

  unstable_setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale} className="!scroll-smooth">
      <body
        className={`${inter.className} bg-gray-50 text-gray-950 relative pt-28 sm:pt-36 dark:bg-gray-900 dark:text-gray-50 dark:text-opacity-90 min-h-screen flex flex-col`}
      >
        <div className="bg-[#fbe2e3] absolute top-[-6rem] -z-10 right-[11rem] h-[31.25rem] w-[31.25rem] rounded-full blur-[10rem] sm:w-[68.75rem] dark:bg-[#946263]"></div>
        <div className="bg-[#dbd7fb] absolute top-[-1rem] -z-10 left-[-35rem] h-[31.25rem] w-[50rem] rounded-full blur-[10rem] sm:w-[68.75rem] md:left-[-33rem] lg:left-[-28rem] xl:left-[-15rem] 2xl:left-[-5rem] dark:bg-[#676394]"></div>

        <NextIntlClientProvider messages={messages}>
          <ThemeContextProvider>
            <ActiveSectionContextProvider>
              <Header />
              <div className="flex-1">{children}</div>
              <Footer />
              <WidgetWrapper>
                <RouteSwitch />
                <ThemeSwitch />
              </WidgetWrapper>
            </ActiveSectionContextProvider>
          </ThemeContextProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
