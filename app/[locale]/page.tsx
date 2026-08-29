import Intro from "@/components/Intro"
import SectionDivider from "@/components/SectionDivider"
import About from "@/components/About"
import Projects from "@/components/Projects"
import Skills from "@/components/Skills"
import Experience from "@/components/Experience"
import Contact from "@/components/Contact"
import { locales } from "@/lib/data"
import { unstable_setRequestLocale } from "next-intl/server"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default function Home({
  params: { locale },
}: {
  params: { locale: string }
}) {
  unstable_setRequestLocale(locale)

  return (
    <main className="flex flex-col items-center justify-center px-4 overflow-x-hidden">
      <Intro />
      <SectionDivider />
      <About />
      <Projects />
      <Skills />
      <Experience />
      {/* <Subscribe /> */}
      <Contact />
    </main>
  )
}
