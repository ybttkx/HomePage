/**
 * probe.mjs —— 缓存策略 / 压缩 / 协议 探测
 *
 * 目的：定位「HTML 不可缓存」「EdgeOne 不压缩」这类 CDN 配置问题，
 *       对比静态资产与 HTML 的处理差异。
 */

import https from 'node:https';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const HOSTS = ['ybovo.com', 'cf.ybovo.com', 'eo.ybovo.com'];

const PATHS = [
  { p: '/', note: '首页(会 307)' },
  { p: '/zh', note: '中文页' },
  { p: '/en', note: '英文页' },
  { p: '/speedtest.txt', note: '静态文本' },
  { p: '/robots.txt', note: '静态文本' },
  { p: '/favicon.ico', note: '静态图标' },
  { p: '/ios26.png', note: '大图 0.92MB' },
  { p: '/TimeX.png', note: '大图 0.70MB' },
  { p: '/tx.jpg', note: '首屏头像图' },
  { p: '/bubble.wav', note: '音效 0.14MB' },
];

function req(host, path, { acceptEncoding = 'gzip, br', headers = {} } = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const r = https.request(
      {
        hostname: host,
        port: 443,
        path,
        method: 'GET',
        servername: host,
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          'Accept-Encoding': acceptEncoding,
          ...headers,
        },
      },
      (res) => {
        const ttfb = performance.now() - t0;
        let bytes = 0;
        let firstChunkAt = null;
        res.on('data', (c) => {
          if (firstChunkAt === null) firstChunkAt = performance.now() - t0;
          bytes += c.length;
        });
        res.on('end', () => {
          const done = performance.now() - t0;
          const alpn = res.socket?.alpnProtocol;
          resolve({
            ok: true,
            status: res.statusCode,
            ttfb,
            firstChunkAt,
            done,
            bytes,
            alpn,
            tlsVersion: res.socket?.getProtocol?.(),
            headers: res.headers,
          });
        });
        res.resume();
      }
    );
    r.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    r.setTimeout(25_000, () => r.destroy(new Error('ETIMEDOUT')));
    r.end();
  });
}

/** 用 HTTP/1.1 但声明 h2 探测协议支持：Node 原生不支持 h2 客户端简便调用，这里读取 ALPN 结果 */
function fmtMs(n) {
  return n == null ? '   -   ' : `${Math.round(n)}ms`.padStart(7);
}
function fmtB(n) {
  if (n == null) return '   -   ';
  return n < 1024 ? `${n}B`.padStart(8) : `${(n / 1024).toFixed(1)}KB`.padStart(8);
}

const summary = [];

for (const host of HOSTS) {
  console.log('\n' + '='.repeat(92));
  console.log(`【${host}】`);
  console.log('='.repeat(92));
  console.log(
    'path'.padEnd(18) +
      'status'.padEnd(8) +
      'TTFB'.padEnd(10) +
      '传输量'.padEnd(11) +
      '编码'.padEnd(8) +
      'ALPN'.padEnd(7) +
      'Cache-Control / 缓存状态'
  );
  console.log('-'.repeat(92));

  for (const { p } of PATHS) {
    const r = await req(host, p);
    if (!r.ok) {
      console.log(`${p.padEnd(18)}失败: ${r.error}`);
      summary.push({ host, path: p, error: r.error });
      continue;
    }
    const h = r.headers;
    const cc = h['cache-control'] || '-';
    const cacheState =
      h['cf-cache-status'] || h['x-vercel-cache'] || h['eo-cache-status'] || h['x-cache'] || '';
    const enc = h['content-encoding'] || '无(未压缩)';
    console.log(
      `${p.padEnd(18)}${String(r.status).padEnd(8)}${fmtMs(r.ttfb).padEnd(10)}${fmtB(r.bytes).padEnd(11)}${enc
        .padEnd(8)
        .slice(0, 8)}${String(r.alpn || '-').padEnd(7)}${cc}${cacheState ? `  [${cacheState}]` : ''}`
    );
    summary.push({
      host,
      path: p,
      status: r.status,
      ttfb: Math.round(r.ttfb),
      bytes: r.bytes,
      encoding: h['content-encoding'] || null,
      alpn: r.alpn,
      tls: r.tlsVersion,
      cacheControl: cc,
      cacheState: cacheState || null,
      server: h.server,
      location: h.location,
      vary: h.vary,
      age: h.age,
      etag: h.etag,
      lastModified: h['last-modified'],
    });
  }
}

// 压缩对比实验：同一路径分别用 identity 与 br 请求，看服务端是否真的压缩
console.log('\n' + '='.repeat(92));
console.log('压缩能力对比（/zh 页面：identity vs gzip vs br）');
console.log('='.repeat(92));
console.log('host'.padEnd(20) + 'identity'.padEnd(14) + 'gzip'.padEnd(14) + 'brotli'.padEnd(14) + '压缩收益');
console.log('-'.repeat(92));
for (const host of HOSTS) {
  const a = await req(host, '/zh', { acceptEncoding: 'identity' });
  const b = await req(host, '/zh', { acceptEncoding: 'gzip' });
  const c = await req(host, '/zh', { acceptEncoding: 'br' });
  const base = a.ok ? a.bytes : null;
  const gain = base && c.ok && c.bytes ? `${Math.round((1 - c.bytes / base) * 100)}%` : '-';
  console.log(
    host.padEnd(20) +
      fmtB(base).padEnd(14) +
      fmtB(b.ok ? b.bytes : null).padEnd(14) +
      fmtB(c.ok ? c.bytes : null).padEnd(14) +
      gain
  );
}

// 首屏 HTML 关键头对比
console.log('\n' + '='.repeat(92));
console.log('HTML 响应头明细（/zh）');
console.log('='.repeat(92));
for (const host of HOSTS) {
  const r = await req(host, '/zh');
  console.log(`\n--- ${host} ---`);
  if (!r.ok) {
    console.log(`  失败 ${r.error}`);
    continue;
  }
  for (const [k, v] of Object.entries(r.headers)) {
    console.log(`  ${k}: ${Array.isArray(v) ? v.join(' | ') : v}`);
  }
}

const { writeFileSync } = await import('node:fs');
writeFileSync(new URL('./probe-result.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log('\n明细数据 → perf-audit/probe-result.json');
