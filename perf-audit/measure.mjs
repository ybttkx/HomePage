/**
 * ybovo.com 多 CDN 性能测量脚本 v2
 *
 * 相对 v1 的改进：
 *  1. 跟踪 307/308 重定向链，测出「用户输入域名 → 首屏 HTML 到达」的真实累计耗时
 *  2. 区分「连接复用」（浏览器真实行为）与「冷连接」两种情况
 *  3. 对最终页面做静态资源清单与抽样测速
 *
 * 用法：
 *   node measure.mjs [--rounds 5] [--host ybovo.com]
 */

import https from 'node:https';
import dns from 'node:dns';
import zlib from 'node:zlib';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SITES = [
  { key: 'vercel/origin', host: 'ybovo.com' },
  { key: 'cloudflare', host: 'cf.ybovo.com' },
  { key: 'edgeone', host: 'eo.ybovo.com' },
];

function agent(keepAlive) {
  return new https.Agent({ keepAlive, maxSockets: 1, maxFreeSockets: 1, timeout: 30_000 });
}

/** 单跳请求；返回时序与响应头/正文 */
function fetchHop(url, { agent: ag, acceptEncoding = 'gzip, br', maxBytes = 4_000_000, timeout = 30_000 } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const t0 = performance.now();
    const marks = {};
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };

    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'GET',
        servername: u.hostname,
        agent: ag,
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': acceptEncoding,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      },
      (res) => {
        marks.ttfb = performance.now() - t0;
        const chunks = [];
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
          if (bytes <= maxBytes) chunks.push(c);
        });
        res.on('end', () => {
          marks.total = performance.now() - t0;
          let body = Buffer.concat(chunks);
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          try {
            if (enc.includes('br')) body = zlib.brotliDecompressSync(body);
            else if (enc.includes('gzip')) body = zlib.gunzipSync(body);
          } catch {
            /* 保留原始 */
          }
          done({
            ok: true,
            url,
            finalUrl: url,
            status: res.statusCode,
            headers: res.headers,
            wireBytes: bytes,
            body: body.toString('utf8'),
            marks,
          });
        });
      }
    );

    // 记录本跳是否复用了已有连接
    req.on('socket', (s) => {
      marks.reused = s.__dshUsed === true;
      s.__dshUsed = true;
      s.on('connect', () => {
        if (marks.connect === undefined) marks.connect = performance.now() - t0;
      });
      s.on('secureConnect', () => {
        if (marks.tls === undefined) marks.tls = performance.now() - t0;
      });
    });
    req.on('error', (e) => done({ ok: false, url, error: e.code || e.message, marks }));
    req.setTimeout(timeout, () => req.destroy(new Error('ETIMEDOUT')));
    req.end();
  });
}

/** 跟随重定向，返回各跳结果与累计总耗时 */
async function fetchChain(startUrl, { keepAlive = true, maxHops = 4 } = {}) {
  const ag = agent(keepAlive);
  const hops = [];
  const t0 = performance.now();
  let url = startUrl;
  try {
    for (let i = 0; i < maxHops; i++) {
      const r = await fetchHop(url, { agent: ag });
      hops.push(r);
      if (!r.ok) break;
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        url = new URL(r.headers.location, url).href;
        continue;
      }
      break;
    }
  } finally {
    ag.destroy();
  }
  const last = hops[hops.length - 1];
  return {
    hops,
    cumulativeMs: performance.now() - t0,
    finalUrl: last?.url,
    finalStatus: last?.status,
    finalBody: last?.ok ? last.body : '',
    finalBytes: last?.wireBytes ?? 0,
  };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y).filter((v) => v != null);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (n) => (n == null ? '   -  ' : `${Math.round(n)}ms`.padStart(7));

function extractAssets(html, baseUrl) {
  const out = [];
  const push = (raw, kind) => {
    if (!raw) return;
    try {
      out.push({ kind, url: new URL(raw, baseUrl).href });
    } catch {
      /* 忽略 */
    }
  };
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) push(m[1], 'script');
  for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)) {
    const h = m[0].match(/href=["']([^"']+)["']/i);
    if (h) push(h[1], 'css');
  }
  for (const m of html.matchAll(/<link[^>]+rel=["'](?:preload|modulepreload|dns-prefetch|preconnect)["'][^>]*>/gi)) {
    const h = m[0].match(/href=["']([^"']+)["']/i);
    const as = m[0].match(/as=["']([^"']+)["']/i);
    const rel = m[0].match(/rel=["']([^"']+)["']/i);
    if (h) push(h[1], `${rel ? rel[1] : 'preload'}${as ? ':' + as[1] : ''}`);
  }
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) push(m[1], 'img');
  const seen = new Set();
  return out.filter((a) => (seen.has(a.url) ? false : seen.add(a.url)));
}

async function measureSite(site, rounds) {
  const start = `https://${site.host}/`;
  const runs = [];
  for (let i = 0; i < rounds; i++) {
    runs.push(await fetchChain(start, { keepAlive: true }));
    await new Promise((r) => setTimeout(r, 300));
  }
  const good = runs.filter((r) => r.finalStatus && r.finalStatus < 400);
  const first = good[0] || runs[0];

  // 冷连接单跳（不复用），反映首次建连成本
  const cold = await fetchChain(start, { keepAlive: false });
  const coldFinal = cold.hops[cold.hops.length - 1];
  const coldFirst = cold.hops[0];

  return {
    site,
    start,
    rounds,
    okCount: good.length,
    redirect: first.hops.length > 1,
    status: first.finalStatus,
    location: first.hops[0]?.headers?.location,
    finalUrl: first.finalUrl,
    cumulative: median(runs.map((r) => r.cumulativeMs)),
    finalTtfb: median(runs.map((r) => r.hops[r.hops.length - 1]?.marks?.ttfb)),
    coldTtfbFirst: coldFirst?.marks?.ttfb,
    coldTtfbFinal: coldFinal?.marks?.ttfb,
    coldCumulative: cold.cumulativeMs,
    coldConnect: coldFirst?.marks?.connect,
    coldTls: coldFirst?.marks?.tls,
    coldDns: coldFirst?.marks?.dns !== undefined ? undefined : undefined,
    finalBytes: median(runs.map((r) => r.finalBytes)),
    headers: (first.hops[first.hops.length - 1] || {}).headers || {},
    firstHeaders: (first.hops[0] || {}).headers || {},
    html: first.finalBody,
    hopsSummary: first.hops.map((h) => ({
      url: h.url,
      status: h.status,
      location: h.headers?.location,
      ttfb: h.marks?.ttfb,
      total: h.marks?.total,
      reused: h.marks?.reused,
    })),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const ri = argv.indexOf('--rounds');
  const rounds = ri >= 0 ? Number(argv[ri + 1]) || 5 : 5;
  const hi = argv.indexOf('--host');
  const only = hi >= 0 ? argv[hi + 1] : null;
  const targets = only ? SITES.filter((s) => s.host === only) : SITES;

  console.log('='.repeat(80));
  console.log(`ybovo.com 多 CDN 性能测量 v2  |  ${rounds} 轮  |  ${new Date().toLocaleString('zh-CN')}`);
  console.log('='.repeat(80));

  const summary = [];
  for (const site of targets) {
    process.stdout.write(`\n测量 https://${site.host}/ ... `);
    let r;
    try {
      r = await measureSite(site, rounds);
    } catch (e) {
      console.log(`异常 ${e.message}`);
      continue;
    }
    console.log('完成');
    summary.push(r);

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`【${site.host}】 ${site.key}`);
    console.log('─'.repeat(80));
    console.log(`  重定向      : ${r.redirect ? `是 → ${r.location}` : '无'}`);
    console.log(`  最终 URL    : ${r.finalUrl}  [${r.status}]`);
    console.log(`  成功轮次    : ${r.okCount}/${r.rounds}`);
    console.log(`  ── 用户可感知首屏 HTML 耗时 ──`);
    console.log(`  累计(连接复用) : ${fmt(r.cumulative)}   ← 浏览器真实体验`);
    console.log(`  累计(冷连接)   : ${fmt(r.coldCumulative)}`);
    console.log(`  ── 冷连接分段 ──`);
    console.log(`  首跳 TCP    : ${fmt(r.coldConnect)}`);
    console.log(`  首跳 TLS    : ${fmt(r.coldTls)}`);
    console.log(`  首跳 TTFB   : ${fmt(r.coldTtfbFirst)}`);
    console.log(`  末跳 TTFB   : ${fmt(r.coldTtfbFinal)}`);
    console.log(`  最终 HTML   : ${r.finalBytes} 字节(压缩后)`);
    console.log('  ── 跳转链 ──');
    for (const h of r.hopsSummary) {
      console.log(
        `    ${String(h.status).padEnd(4)} ${h.url.replace(/^https:\/\//, '').slice(0, 52).padEnd(52)} ttfb=${fmt(
          h.ttfb
        )}${h.reused ? ' (复用连接)' : ''}${h.location ? ` → ${h.location}` : ''}`
      );
    }
    console.log('  ── 关键响应头 ──');
    const interesting = [
      'server',
      'cf-cache-status',
      'x-vercel-cache',
      'x-vercel-id',
      'age',
      'cache-control',
      'content-encoding',
      'cf-ray',
      'x-edgeone-request-id',
      'eo-cache-status',
      'x-ni-cache',
      'alt-svc',
      'link',
    ];
    for (const k of interesting) {
      if (r.headers[k]) console.log(`    ${k}: ${r.headers[k]}`);
    }
    const extra = Object.keys(r.headers).filter((k) => k.startsWith('x-') && !interesting.includes(k));
    if (extra.length) console.log(`    其他 x- 头: ${extra.join(', ')}`);
  }

  // 资源分析
  console.log(`\n${'='.repeat(80)}`);
  console.log('最终页面关键资源分析');
  console.log('='.repeat(80));

  const assetMap = {};
  for (const r of summary) {
    if (!r.html) {
      console.log(`\n--- ${r.site.host} --- 无 HTML 内容，跳过`);
      continue;
    }
    const assets = extractAssets(r.html, r.finalUrl || r.start);
    assetMap[r.site.host] = assets.map((a) => a.url);
    console.log(`\n--- ${r.site.host} --- ${assets.length} 个外部资源`);
    const counts = {};
    for (const a of assets) counts[a.kind] = (counts[a.kind] || 0) + 1;
    console.log('  ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  '));

    const sampled = assets.filter((a) => !a.kind.startsWith('dns-prefetch') && !a.kind.startsWith('preconnect')).slice(0, 10);
    for (const a of sampled) {
      const m = await fetchHop(a.url);
      const short = a.url.replace(/^https:\/\/[^/]+/, '');
      if (m.ok) {
        console.log(
          `    [${a.kind.padEnd(14)}] ${short.slice(0, 46).padEnd(46)} ${String(m.status).padEnd(4)} ${String(
            m.wireBytes
          ).padStart(7)}B  ttfb=${fmt(m.marks.ttfb)}  cache=${m.headers['cf-cache-status'] || m.headers['x-vercel-cache'] || m.headers['cache-control'] || '-'}`
        );
      } else {
        console.log(`    [${a.kind.padEnd(14)}] ${short.slice(0, 46).padEnd(46)} 失败 ${m.error}`);
      }
    }
  }

  writeFileSync(
    new URL('./result.json', import.meta.url),
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        rounds,
        sites: summary.map((r) => ({
          host: r.site.host,
          key: r.site.key,
          redirect: r.redirect,
          location: r.location,
          finalUrl: r.finalUrl,
          status: r.status,
          cumulative: r.cumulative,
          coldCumulative: r.coldCumulative,
          coldConnect: r.coldConnect,
          coldTls: r.coldTls,
          coldTtfbFirst: r.coldTtfbFirst,
          coldTtfbFinal: r.coldTtfbFinal,
          finalBytes: r.finalBytes,
          hops: r.hopsSummary,
          headers: r.headers,
        })),
        assets: assetMap,
      },
      null,
      2
    )
  );
  console.log('\n原始数据 → perf-audit/result.json');
}

main().catch((e) => {
  console.error('脚本异常:', e);
  process.exit(1);
});
