import React from "react";
import { FaReact } from "react-icons/fa";
import GHS from "@/public/GHS.png";
import Blog from "@/public/blog.png";
import TimeX from "@/public/TimeX.webp";
import { CgWorkAlt } from "react-icons/cg";
import { LuGraduationCap } from "react-icons/lu";
import { FaRss } from "react-icons/fa6";
import corpcommentImg from "@/public/corpcomment.png";
import rmtdevImg from "@/public/rmtdev.png";
import wordanalyticsImg from "@/public/wordanalytics.png";

import { MdConstruction } from "react-icons/md";
import ios26Img from "@/public/ios26.png";

export const links = [
    {
        name: "Home",
        hash: "#home",
        name_zh: "首页",
    },
    {
        name: "About",
        hash: "#about",
        name_zh: "关于",
    },
    {
        name: "Projects",
        hash: "#projects",
        name_zh: "项目",
    },
    {
        name: "Skills",
        hash: "#skills",
        name_zh: "技能",
    },
    {
        name: "Subscribe",
        hash: "#subscribe",
        name_zh: "订阅",
    },
    // {
    //     name: "Experience",
    //     hash: "#experience",
    // },
    // {
    //     name: "Contact",
    //     hash: "#contact",
    // },
] as const;

export const headerLanguageMap = {
    Home: '首页',
    About: '关于我',
    Projects: '我的项目',
    Skills: '我的技能',
    Subscribe: '订阅',
}

export type ProjectTags = string[];

export const projectsData: {
    title: string;
    title_zh: string;
    description: string;
    desc_zh: string;
    tags: string[];
    imageUrl?: any;
    icon?: any;
    projectUrl: string;
    demoUrl: string;
}[] = [
    {
        title: "iOS26 Style Portfolio",
        title_zh: "iOS26 风格个人主页",
        description: "A classic route-switching portfolio themed after iOS flat glassmorphism design. Features native ping latency speedtest and redirect matching for multiple server mirrors.",
        desc_zh: "基于原生 HTML/CSS/JS 开发的经典拟物玻璃卡片风格个人主页，内置多线路连通性 RTT 延迟检测与智能重定向分发系统。",
        tags: ["HTML", "CSS", "JavaScript", "Speedtest"],
        imageUrl: ios26Img,
        projectUrl: "https://github.com/ybttkx/myself",
        demoUrl: "https://ybovo.com",
    },
    {
        title: "YIBAI's Technical Blog",
        title_zh: "毅白的个人博客",
        description: "A personal technical and hobby journal recording coding tutorials, AI programming VibeCoding insights, and curated anime review checklists.",
        desc_zh: "随缘更新的技术与兴趣生活博客，主要分享 Python、Web 前端开发、各类 AI 工具实践心得，以及个人的动漫追番记录清单。",
        tags: ["Markdown", "RSS", "Tech Blog"],
        imageUrl: Blog,
        projectUrl: "https://github.com/ybttkx/newblog",
        demoUrl: "https://blog.ybovo.com",
    },
    {
        title: "Next Project",
        title_zh: "正在探索的新项目",
        description: "Constantly learning front-end designs, Python applications, and AI integrations. Next project will be a fun Web game or an AI efficiency helper!",
        desc_zh: "目前正在努力学习更多前端设计、Python 应用和 AI 知识，下一个项目计划是一个好玩的网页小游戏或 AI 效率辅助工具，敬请期待！",
        tags: ["Python", "AI Integration", "Learning"],
        projectUrl: "https://github.com/ybttkx",
        demoUrl: "https://github.com/ybttkx",
        icon: MdConstruction,
    }
];

export const skillsData = [
    "Web",
    "Git",
    "Github",
    "VibeCoding",
] 
