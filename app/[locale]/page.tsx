import Intro from "@/components/Intro"
import SectionDivider from "@/components/SectionDivider"
import About from "@/components/About"
import Projects from "@/components/Projects"
import Skills from "@/components/Skills"
// import Experience from "@/components/Experience"
import { isMobileDevice } from "@/lib/utils"
// import Contact from "@/components/Contact"
import Subscribe from "@/components/Subscribe"

export const metadata = {
  title: "毅白 · YIBAI | 个人主页",
  description: "毅白 YIBAI 的个人主页，记录关于技术、生活与编程的思考。",
  icons: {
    icon: "/favicon.ico",
  },
}

export default function Home() {
  const isMobile = isMobileDevice()

  return (
    <main className="flex flex-col items-center justify-center px-4 overflow-x-hidden">
      <Intro />
      <SectionDivider />
      <About />
      <Projects />
      <Skills />
      <Subscribe />
      {/* <Experience isMobile={isMobile} /> */}      
      {/* <Contact /> */}
    </main>
  )
}
