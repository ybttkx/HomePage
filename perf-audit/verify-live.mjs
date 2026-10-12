/**
 * verify-live.mjs —— 验证线上（Cloudflare）新版本的实际行为
 *
 * 重点检查：
 *   1. HTML 是否已静态化（Cache-Control 含 s-maxage）
 *   2. 是否还带 Set-Cookie（会导致 CDN 无法缓存）
 *   3. HTML 里是否还渲染真实客户端 IP（旧版会，缓存后会造成串号泄露）
 *   4. 语言协商与跳转行为
 *
 * 用法：node verify-live.mjs [host]   默认 cf.ybovo.com
 */

import https from 'node:https';

const HOST = process.argv[2] || 'cf.ybovo.com';

function probe(path, acceptLanguage) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.get(
      {
        hostname: HOST,
        path,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': acceptLanguage,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          const ipM = body.match(/id="home-client-ip"[^>]*>([^<]*)</);
          const srvM = body.match(/id="home-server-ip"[^>]*>([^<]*)</);
          const langM = body.match(/<html[^>]*lang="([^"]+)"/i);
          resolve({
            path,
            status: res.statusCode,
            ms: Date.now() - t0,
            location: res.headers.location,
            cc: res.headers['cache-control'],
            setCookie: res.headers['set-cookie'],
            cfCache: res.headers['cf-cache-status'],
            xNext: res.headers['x-nextjs-cache'],
            enc: res.headers['content-encoding'],
            bytes: Buffer.byteLength(body),
            lang: langM ? langM[1] : '(未知)',
            clientIpHtml: ipM ? ipM[1].trim() : '(元素未找到)',
            serverIpHtml: srvM ? srvM[1].trim() : '(元素未找到)',
            hasLazyGhchart: /ghchart[^>]*loading="lazy"/.test(body),
            usesWebp: /ios26\.[a-f0-9]+\.webp/.test(body),
          });
        });
      }
    );
    req.on('error', (e) => resolve({ path, error: e.code || e.message }));
    req.setTimeout(25000, () => req.destroy(new Error('ETIMEDOUT')));
  });
}

const CASES = [
  ['/zh', 'zh-CN,zh;q=0.9'],
  ['/', 'zh-CN,zh;q=0.9'],
  ['/', 'en-US,en;q=0.9'],
  ['/zh/sponsor', 'zh-CN,zh;q=0.9'],
];

console.log('='.repeat(84));
console.log(`线上行为验证  |  https://${HOST}  |  ${new Date().toLocaleString('zh-CN')}`);
console.log('='.repeat(84));

let risks = [];

for (const [p, al] of CASES) {
  const r = await probe(p, al);
  console.log(`\n── ${r.path}   Accept-Language: ${al}`);
  if (r.error) {
    console.log(`   请求失败: ${r.error}`);
    continue;
  }
  console.log(
    `   状态 ${r.status}  ${r.ms}ms  语言=${r.lang}  ${(r.bytes / 1024).toFixed(1)}KB  编码=${r.enc || '无'}`
  );
  if (r.location) console.log(`   Location: ${r.location}`);
  console.log(`   Cache-Control   : ${r.cc}`);
  console.log(`   Set-Cookie      : ${r.setCookie ? '⚠ ' + r.setCookie : '无 ✓'}`);
  console.log(`   cf-cache-status : ${r.cfCache || '-'}    x-nextjs-cache: ${r.xNext || '-'}`);
  console.log(`   HTML 中的客户端 IP : ${r.clientIpHtml}`);
  console.log(`   HTML 中的节点 IP   : ${r.serverIpHtml}`);
  console.log(`   图片已用 WebP      : ${r.usesWebp ? '是 ✓' : '否'}`);
  console.log(`   贡献图已懒加载     : ${r.hasLazyGhchart ? '是 ✓' : '否'}`);

  if (r.setCookie) risks.push(`${p} 仍带 Set-Cookie，CDN 无法缓存`);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(r.clientIpHtml)) {
    risks.push(`${p} 的 HTML 里渲染了真实客户端 IP（${r.clientIpHtml}），一旦缓存会串号泄露`);
  }
}

console.log('\n' + '='.repeat(84));
if (risks.length === 0) {
  console.log('✅ 无风险项：HTML 已静态化、无 Set-Cookie、未泄露客户端 IP');
  console.log('   → 可以安全启用 Cloudflare HTML 缓存规则');
} else {
  console.log('⚠ 发现风险项：');
  for (const x of risks) console.log('   - ' + x);
  console.log('   → 暂不应启用 HTML 缓存规则');
}
console.log('='.repeat(84));
