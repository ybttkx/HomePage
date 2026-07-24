import Intro from "@/components/Intro"
import SectionDivider from "@/components/SectionDivider"
import About from "@/components/About"
import Projects from "@/components/Projects"
import Skills from "@/components/Skills"
import Subscribe from "@/components/Subscribe"

import { getTranslations } from "next-intl/server"

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "Metadata" })

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `https://ybovo.com/${locale}`,
      languages: {
        "zh": "https://ybovo.com/zh",
        "en": "https://ybovo.com/en",
        "x-default": "https://ybovo.com/en",
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: `https://ybovo.com/${locale}`,
      siteName: "YIBAI",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      type: "website",
      images: [
        {
          url: "https://ybovo.com/profile.png",
          width: 500,
          height: 500,
          alt: "YIBAI Profile",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: ["https://ybovo.com/profile.png"],
    },
    icons: {
      icon: "/favicon.ico",
    },
  }
}

export default async function Home({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: "Metadata" })

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": locale === "zh" ? "毅白 · YIBAI" : "YIBAI",
    "url": `https://ybovo.com/${locale}`,
    "image": "https://ybovo.com/profile.png",
    "sameAs": [
      "https://github.com/ybttkx",
    ],
    "jobTitle": "Software Engineer",
    "description": t("description"),
  }

  return (
    <main className="flex flex-col items-center justify-center px-4 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Intro />
      <SectionDivider />
      <About />
      <Projects />
      <Skills />
      <Subscribe />
    </main>
  )
}
