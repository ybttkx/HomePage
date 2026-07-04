import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

const intlMiddleware = createMiddleware({
    // A list of all locales that are supported
    locales: ['en', 'zh'],

    // Used when no locale matches
    defaultLocale: 'en'
});

export default function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 跳过静态资源和媒体文件 ——
    // 在 OpenNext/EdgeOne 上中间件会拦截所有请求，国际化处理不应干涉这些路径
    if (
        pathname.startsWith('/_next/static') ||
        pathname.startsWith('/_next/image') ||
        pathname === '/favicon.ico' ||
        pathname.startsWith('/favicon') ||
        pathname === '/robots.txt' ||
        pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|mp3|wav)$/)
    ) {
        return NextResponse.next();
    }

    return intlMiddleware(request);
}

export const config = {
    // 仅在匹配的路径上运行（兼容 Vercel 等尊重 matcher 的平台）
    matcher: ['/', '/(zh|en)/:path*']
};
