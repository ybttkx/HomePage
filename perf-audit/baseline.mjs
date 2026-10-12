/**
 * baseline.mjs —— 首屏资源总体积与加载核算
 *
 * 抓取目标站点的中文首页，提取全部外部资源，并发测量真实传输体积与耗时，
 * 按类型汇总，找出体积和延迟的主要来源。
 *
 * 用法：node baseline.mjs [host]   默认 ybovo.com
 */

import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

const ARG = process.argv[2] || 'ybovo.com';
// 支持传完整 URL（便于对本地 next start 做改动前后的对比测量）
const START = /^https?:\/\//.test(ARG) ? ARG : `https://${ARG}/zh`;
const HOST = new URL(START).hostname;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetchRaw(url, { acceptEncoding = 'gzip, br', timeout = 25_000 } = {}) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return resolve({ ok: false, url, error: 'BAD_URL' });
    }
    const lib = u.protocol === 'http:' ? http : https;
    const t0 = performance.now();
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Encoding': acceptEncoding },
      },
      (res) => {
        const ttfb = performance.now() - t0;
        const chunks = [];
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
          if (bytes <= 6_000_000) chunks.push(c);
        });
        res.on('end', () => {
          let body = Buffer.concat(chunks);
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          try {
            if (enc.includes('br')) body = zlib.brotliDecompressSync(body);
            else if (enc.includes('gzip')) body = zlib.gunzipSync(body);
          } catch {}
          resolve({
            ok: true,
            url,
            status: res.statusCode,
            ttfb,
            total: performance.now() - t0,
            bytes,
            decodedBytes: body.length,
            body: body.toString('utf8'),
            headers: res.headers,
          });
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, url, error: e.code || e.message }));
    req.setTimeout(timeout, () => req.destroy(new Error('ETIMEDOUT')));
    req.end();
  });
}

/** 并发执行，限制并发数 */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

function classify(url, kind) {
  if (kind === 'script' || /\.js(\?|$)/.test(url)) return 'JS';
  if (kind === 'css' || /\.css(\?|$)/.test(url)) return 'CSS';
  if (kind === 'font' || /\.woff2?(\?|$)/.test(url)) return '字体';
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/.test(url) || kind === 'img') return '图片';
  if (/\.(mp3|wav|ogg)(\?|$)/.test(url)) return '音频';
  return '其他';
}

function extract(html, base) {
  const out = [];
  const add = (raw, kind) => {
    if (!raw || raw.startsWith('data:')) return;
    try {
      out.push({ kind, url: new URL(raw, base).href });
    } catch {}
  };
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) add(m[1], 'script');
  for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)) {
    const h = m[0].match(/href=["']([^"']+)["']/i);
    if (h) add(h[1], 'css');
  }
  for (const m of html.matchAll(/<link[^>]+rel=["']preload["'][^>]*>/gi)) {
    const h = m[0].match(/href=["']([^"']+)["']/i);
    const a = m[0].match(/as=["']([^"']+)["']/i);
    if (h) add(h[1], a ? a[1] : 'preload');
  }
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) add(m[1], 'img');
  const seen = new Set();
  return out.filter((o) => (seen.has(o.url) ? false : seen.add(o.url)));
}

async function main() {
  const start = START;
  console.log('='.repeat(100));
  console.log(`首屏资源核算  |  ${start}  |  ${new Date().toLocaleString('zh-CN')}`);
  console.log('='.repeat(100));

  const page = await fetchRaw(start);
  if (!page.ok) {
    console.error(`首页抓取失败: ${page.error}`);
    process.exit(1);
  }
  console.log(
    `HTML: ${page.status}  传输 ${page.bytes}B (压缩后) / 解码后 ${page.decodedBytes}B  TTFB ${Math.round(
      page.ttfb
    )}ms\n`
  );

  const assets = extract(page.body, start);
  console.log(`发现 ${assets.length} 个外部资源，开始并发测量...\n`);

  const results = await pool(assets, 5, async (a) => {
    const r = await fetchRaw(a.url, { acceptEncoding: 'gzip, br' });
    return { ...a, ...r, cat: classify(a.url, a.kind) };
  });

  // 明细
  console.log(
    '分类'.padEnd(8) + '资源'.padEnd(58) + '状态'.padEnd(6) + '传输量'.padEnd(11) + 'TTFB'.padEnd(9) + '耗时'
  );
  console.log('-'.repeat(100));
  const sorted = [...results].sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  for (const r of sorted) {
    const short = r.url.replace(/^https?:\/\//, '');
    const label = short.length > 56 ? short.slice(0, 53) + '...' : short;
    if (r.ok) {
      console.log(
        r.cat.padEnd(8) +
          label.padEnd(58) +
          String(r.status).padEnd(6) +
          `${r.bytes}B`.padEnd(11) +
          `${Math.round(r.ttfb)}ms`.padEnd(9) +
          `${Math.round(r.total)}ms`
      );
    } else {
      console.log(r.cat.padEnd(8) + label.padEnd(58) + '失败'.padEnd(6) + r.error);
    }
  }

  // 汇总
  const sums = {};
  let total = 0;
  let failed = 0;
  for (const r of results) {
    if (!r.ok) {
      failed++;
      continue;
    }
    sums[r.cat] = sums[r.cat] || { n: 0, bytes: 0, maxTtfb: 0, maxTotal: 0 };
    sums[r.cat].n++;
    sums[r.cat].bytes += r.bytes;
    sums[r.cat].maxTtfb = Math.max(sums[r.cat].maxTtfb, r.ttfb);
    sums[r.cat].maxTotal = Math.max(sums[r.cat].maxTotal, r.total);
    total += r.bytes;
  }

  console.log('\n' + '='.repeat(100));
  console.log('分类汇总');
  console.log('='.repeat(100));
  console.log('分类'.padEnd(10) + '数量'.padEnd(8) + '总传输量'.padEnd(14) + '占比'.padEnd(10) + '最慢TTFB');
  console.log('-'.repeat(100));
  for (const [k, v] of Object.entries(sums).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(
      k.padEnd(10) +
        String(v.n).padEnd(8) +
        `${(v.bytes / 1024).toFixed(1)} KB`.padEnd(14) +
        `${((v.bytes / total) * 100).toFixed(1)}%`.padEnd(10) +
        `${Math.round(v.maxTtfb)}ms`
    );
  }
  console.log('-'.repeat(100));
  console.log(
    `首页资源总计: ${(total / 1024).toFixed(1)} KB (${results.length - failed} 个成功 / ${failed} 个失败)`
  );
  console.log(`HTML 另计: ${(page.bytes / 1024).toFixed(1)} KB`);
  console.log(`首屏合计: ${((total + page.bytes) / 1024).toFixed(1)} KB`);

  // 第三方域名
  const thirdParty = results.filter((r) => {
    try {
      return new URL(r.url).hostname !== HOST;
    } catch {
      return false;
    }
  });
  if (thirdParty.length) {
    console.log('\n第三方资源（不受你控制，国内访问易慢/失败）:');
    for (const r of thirdParty) {
      console.log(
        `  ${r.url}  ${r.ok ? `${r.bytes}B ${Math.round(r.ttfb)}ms` : `失败 ${r.error}`}`
      );
    }
  }

  writeFileSync(
    new URL('./baseline-result.json', import.meta.url),
    JSON.stringify(
      {
        host: HOST,
        measuredAt: new Date().toISOString(),
        html: { bytes: page.bytes, decoded: page.decodedBytes, ttfb: Math.round(page.ttfb) },
        totalAssetBytes: total,
        sums,
        assets: results.map((r) => ({
          url: r.url,
          cat: r.cat,
          kind: r.kind,
          ok: r.ok,
          status: r.status,
          bytes: r.bytes,
          ttfb: r.ok ? Math.round(r.ttfb) : null,
          error: r.error,
        })),
      },
      null,
      2
    )
  );
  console.log('\n明细 → perf-audit/baseline-result.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
