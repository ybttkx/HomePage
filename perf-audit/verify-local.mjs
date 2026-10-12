/**
 * verify-local.mjs —— 本地生产服务器行为验证
 *
 * 验证本次改动是否真的生效：
 *   1. 首页 / 是否变为内部 rewrite（200），而不是 307 跳转
 *   2. 响应是否还带 Set-Cookie（NEXT_LOCALE），即 HTML 是否恢复可缓存
 *   3. 页面是否被静态预渲染（x-nextjs-cache / cache-control）
 *   4. 语言协商是否按 Accept-Language 正确落到 zh / en
 *
 * 用法：node verify-local.mjs [port]   默认 3210
 */

import http from 'node:http';

const PORT = Number(process.argv[2]) || 3210;

function req(path, acceptLanguage) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'identity',
          'Accept-Language': acceptLanguage,
        },
      },
      (res) => {
        let bytes = 0;
        const chunks = [];
        res.on('data', (c) => {
          bytes += c.length;
          chunks.push(c);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            path,
            acceptLanguage,
            status: res.statusCode,
            ms: Date.now() - t0,
            bytes,
            headers: res.headers,
            lang: body.match(/<html[^>]*lang="([^"]+)"/i)?.[1] || '(未知)',
            // 中文页面标题含「毅白」，英文含 YIBAI
            hasZhText: /毅白|关于我|我的项目/.test(body),
          });
        });
      }
    );
    r.on('error', (e) => resolve({ path, error: e.code || e.message }));
    r.setTimeout(15000, () => r.destroy(new Error('ETIMEDOUT')));
    r.end();
  });
}

const CASES = [
  { path: '/', al: 'zh-CN,zh;q=0.9,en;q=0.8', note: '首页 + 中文浏览器' },
  { path: '/', al: 'en-US,en;q=0.9', note: '首页 + 英文浏览器' },
  { path: '/zh', al: 'zh-CN,zh;q=0.9', note: '显式中文页' },
  { path: '/en', al: 'en-US,en;q=0.9', note: '显式英文页' },
  { path: '/zh/sponsor', al: 'zh-CN,zh;q=0.9', note: '中文赞助页' },
  { path: '/sponsor', al: 'zh-CN,zh;q=0.9', note: '无前缀赞助页(应 rewrite)' },
];

console.log('='.repeat(96));
console.log(`本地生产服务器行为验证  |  127.0.0.1:${PORT}  |  ${new Date().toLocaleString('zh-CN')}`);
console.log('='.repeat(96));

let pass = true;

for (const c of CASES) {
  const r = await req(c.path, c.al);
  console.log(`\n── ${c.note}  [${c.path}] Accept-Language: ${c.al}`);
  if (r.error) {
    console.log(`   请求失败: ${r.error}`);
    pass = false;
    continue;
  }
  const h = r.headers;
  console.log(`   状态码        : ${r.status}${h.location ? `  → Location: ${h.location}` : ''}`);
  console.log(`   <html lang>   : ${r.lang}`);
  console.log(`   Cache-Control : ${h['cache-control'] || '-'}`);
  console.log(`   Set-Cookie    : ${h['set-cookie'] ? '⚠ ' + JSON.stringify(h['set-cookie']) : '无 ✓'}`);
  console.log(`   x-nextjs-cache: ${h['x-nextjs-cache'] || '-'}`);
  console.log(`   Vary          : ${h.vary || '-'}`);
  console.log(`   HTML 体积     : ${(r.bytes / 1024).toFixed(1)} KB`);
  console.log(`   响应耗时      : ${r.ms}ms`);

  // 断言
  if (c.path === '/' && r.status !== 200) {
    console.log(`   ❌ 首页应为 200（rewrite），实际 ${r.status}`);
    pass = false;
  }
  if (h['set-cookie']) {
    console.log('   ❌ 仍存在 Set-Cookie，HTML 无法被 CDN 缓存');
    pass = false;
  }
  if (c.path === '/' && c.al.startsWith('zh') && r.lang !== 'zh') {
    console.log(`   ❌ 中文浏览器访问首页应落到 zh，实际 ${r.lang}`);
    pass = false;
  }
  if (c.path === '/' && c.al.startsWith('en') && r.lang !== 'en') {
    console.log(`   ❌ 英文浏览器访问首页应落到 en，实际 ${r.lang}`);
    pass = false;
  }
}

console.log('\n' + '='.repeat(96));
console.log(pass ? '✅ 全部关键断言通过' : '❌ 存在未通过项，见上方标注');
console.log('='.repeat(96));
process.exit(pass ? 0 : 1);
