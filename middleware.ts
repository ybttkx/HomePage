import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

const locales = ['en', 'zh'] as const;
const defaultLocale = 'zh';

const intlMiddleware = createMiddleware({
    locales,
    defaultLocale,
    // 保持 /zh、/en 前缀，避免改变现有 URL 结构与外部链接
    localePrefix: 'always',
});

/** 静态资源与媒体文件，直接放行，不参与国际化处理 */
const ASSET_RE = /\.(ico|png|jpe?g|svg|gif|webp|avif|mp3|wav|ogg|woff2?|ttf|otf|txt|xml|json|webmanifest|css|js|map)$/i;

function isAsset(pathname: string) {
    return (
        pathname.startsWith('/_next/') ||
        pathname === '/favicon.ico' ||
        pathname.startsWith('/favicon') ||
        pathname === '/robots.txt' ||
        ASSET_RE.test(pathname)
    );
}

/**
 * 协商语言：优先用户显式选择（Cookie），其次 Accept-Language，最后默认中文。
 * 默认中文是因为站点主体受众为中文用户。
 */
function pickLocale(request: NextRequest): string {
    const cookie = request.cookies.get('NEXT_LOCALE')?.value;
    if (cookie === 'en' || cookie === 'zh') return cookie;

    const al = (request.headers.get('accept-language') || '').toLowerCase();
    const zhAt = al.indexOf('zh');
    const enAt = al.indexOf('en');
    if (zhAt !== -1 && (enAt === -1 || zhAt < enAt)) return 'zh';
    if (enAt !== -1) return 'en';
    return defaultLocale;
}

export default function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isAsset(pathname)) {
        return NextResponse.next();
    }

    // 未带语言前缀的路径（含首页）：内部 rewrite，而不是 307 跳转。
    // 浏览器地址栏保持原样，并省掉一次完整往返（原先约 300~500ms）。
    if (!/^\/(en|zh)(\/|$)/.test(pathname)) {
        const locale = pickLocale(request);
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
        return NextResponse.rewrite(url);
    }

    const response = intlMiddleware(request);

    // next-intl 默认会在响应上写入 NEXT_LOCALE Cookie。带 Set-Cookie 的响应
    // 无法进入任何共享缓存（CDN），会导致 HTML 每次回源实时渲染。
    // 语言选择已由 URL 前缀承载，这里剔除该 Cookie 以保证响应可缓存。
    response.headers.delete('set-cookie');

    return response;
}

export const config = {
    // 排除 _next、api 与带扩展名的静态文件；其余页面路径均交由中间件处理
    matcher: ['/((?!_next|api|.*\\..*).*)'],
};
