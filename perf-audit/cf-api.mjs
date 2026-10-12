/**
 * cf-api.mjs —— 用 API Token 操作 Cloudflare
 *
 * Token 通过环境变量 CF_TOKEN 传入，绝不写入文件或日志。
 *
 * 用法：
 *   node cf-api.mjs verify                       验证 token
 *   node cf-api.mjs zones                        列出可访问的区域
 *   node cf-api.mjs probe                        探测对目标区域的读写权限
 *   node cf-api.mjs cache-rules <zoneName>       读取现有缓存规则
 *   node cf-api.mjs settings <zoneName>          读取压缩等区域设置
 */

import fs from 'node:fs';

const TOKEN = process.env.CF_TOKEN;
if (!TOKEN) {
  console.error('缺少环境变量 CF_TOKEN');
  process.exit(1);
}

const API = 'https://api.cloudflare.com/client/v4';

async function api(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { success: false, errors: [{ message: 'non-json response' }] };
  }
  return { status: res.status, ...body };
}

function show(label, r) {
  const ok = r.success === true;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(46)} HTTP ${r.status}`);
  if (!ok) {
    for (const e of r.errors || []) console.log(`      [${e.code}] ${e.message}`);
  }
  return ok;
}

async function findZone(name) {
  const r = await api(`/zones?name=${encodeURIComponent(name)}`);
  if (!r.success || !r.result?.length) throw new Error(`找不到区域 ${name}`);
  return r.result[0];
}

const [cmd, arg] = process.argv.slice(2);

switch (cmd) {
  case 'verify': {
    const r = await api('/user/tokens/verify');
    show('Token 验证', r);
    if (r.success) console.log('  状态: ' + r.result.status + '  ID: ' + r.result.id);
    break;
  }

  case 'zones': {
    const r = await api('/zones?per_page=50');
    show('列出区域', r);
    for (const z of r.result || []) console.log(`  ${z.name.padEnd(20)} ${z.id}  ${z.plan?.name}`);
    break;
  }

  case 'probe': {
    const zone = await findZone(arg || 'ybovo.com');
    console.log(`目标区域: ${zone.name}  (${zone.id})\n`);

    const checks = [
      ['读取区域详情        (Zone:Read)', `/zones/${zone.id}`],
      ['读取 DNS 记录        (DNS:Read)', `/zones/${zone.id}/dns_records?per_page=1`],
      ['读取缓存规则        (Cache Rules:Read)', `/zones/${zone.id}/rulesets`],
      ['读取缓存级别设置    (Zone Settings:Read)', `/zones/${zone.id}/settings/cache_level`],
      ['读取 Brotli 设置    (Zone Settings:Read)', `/zones/${zone.id}/settings/brotli`],
      ['读取页面规则        (Page Rules:Read)', `/zones/${zone.id}/pagerules`],
    ];

    const results = {};
    for (const [label, path] of checks) {
      const r = await api(path);
      results[label] = show(label, r);
    }

    console.log('\n' + '='.repeat(74));
    const canCache = results['读取缓存规则        (Cache Rules:Read)'];
    console.log(
      canCache
        ? '✓ 具备缓存规则权限，可配置 HTML 边缘缓存'
        : '✗ 缺少「缓存规则」权限 —— 该 Token 无法配置 HTML 边缘缓存'
    );
    console.log('  需要的权限：Zone → Cache Rules → Edit（以及 Zone Settings → Edit 用于压缩）');
    console.log('='.repeat(74));
    break;
  }

  case 'cache-rules': {
    const zone = await findZone(arg || 'ybovo.com');
    const r = await api(`/zones/${zone.id}/rulesets`);
    show('读取 Rulesets', r);
    for (const rs of r.result || []) {
      console.log(`\n  [${rs.phase}] ${rs.name || '(未命名)'}  id=${rs.id}`);
      if (rs.rules?.length) {
        for (const rule of rs.rules) {
          console.log(`     - ${rule.description || '(无描述)'}  enabled=${rule.enabled}`);
          console.log(`       ${JSON.stringify(rule.expression)}`);
          console.log(`       ${JSON.stringify(rule.action_parameters)}`);
        }
      }
    }
    break;
  }

  case 'apply-cache-rule': {
    // 为 cf.ybovo.com 启用 HTML 边缘缓存
    // 背景：区域 cache_level = "simplified"，只缓存 js/css/图片等标准扩展名，
    //       HTML 一律回源。源站现已返回 s-maxage，但必须显式声明为可缓存才会生效。
    const zone = await findZone(arg || 'ybovo.com');
    const host = process.argv[4] || 'cf.ybovo.com';
    const ttl = Number(process.argv[5] || 3600);

    // 先读取现有规则，避免覆盖他人配置
    const before = await api(`/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`);
    const existing = before.result?.rules ?? [];
    console.log(`区域 ${zone.name} 现有缓存规则数: ${existing.length}`);
    for (const r of existing) console.log(`  - ${r.description || '(无描述)'}  enabled=${r.enabled}`);

    const ourRule = {
      action: 'set_cache_settings',
      description: 'HTML 边缘缓存（perf-audit 自动配置）',
      enabled: true,
      expression:
        `(http.host eq "${host}" and ` +
        `not starts_with(http.request.uri.path, "/api/") and ` +
        `not starts_with(http.request.uri.path, "/_next/") and ` +
        `not http.request.uri.path contains ".")`,
      action_parameters: {
        cache: true,
        edge_ttl: { mode: 'override_origin', default: ttl },
        browser_ttl: { mode: 'respect_origin' },
      },
    };

    // 同名规则去重（幂等）
    const merged = existing.filter((r) => r.description !== ourRule.description).concat([ourRule]);

    console.log(`\n写入规则: 表达式 = ${ourRule.expression}`);
    console.log(`          edge_ttl = ${ttl}s, browser_ttl = respect_origin\n`);

    const put = await api(`/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`, {
      method: 'PUT',
      body: JSON.stringify({ rules: merged }),
    });
    show('写入缓存规则', put);
    if (put.success) {
      for (const r of put.result.rules || []) {
        console.log(`  ✓ ${r.description}  id=${r.id}  enabled=${r.enabled}`);
      }
    }
    break;
  }

  case 'purge': {
    const zone = await findZone(arg || 'ybovo.com');
    const r = await api(`/zones/${zone.id}/purge_cache`, {
      method: 'POST',
      body: JSON.stringify({ purge_everything: true }),
    });
    show(`清除 ${zone.name} 全部边缘缓存`, r);
    if (r.success) console.log('  ' + JSON.stringify(r.result));
    break;
  }

  case 'rule-toggle': {
    // 启用/禁用指定描述的缓存规则：node cf-api.mjs rule-toggle <zone> <true|false>
    const zone = await findZone(arg || 'ybovo.com');
    const wantEnabled = String(process.argv[4] ?? 'false') === 'true';
    const desc = 'HTML 边缘缓存（perf-audit 自动配置）';

    const cur = await api(`/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`);
    if (!cur.success) {
      show('读取缓存规则', cur);
      break;
    }
    const rules = cur.result.rules || [];
    let found = false;
    for (const r of rules) {
      if (r.description === desc) {
        r.enabled = wantEnabled;
        found = true;
      }
    }
    if (!found) {
      console.log(`未找到规则: ${desc}`);
      break;
    }
    const put = await api(`/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`, {
      method: 'PUT',
      body: JSON.stringify({ rules }),
    });
    show(`将规则设为 enabled=${wantEnabled}`, put);
    for (const r of put.result?.rules || []) {
      console.log(`  ${r.enabled ? '✓ 启用' : '✗ 停用'}  ${r.description}`);
    }
    break;
  }

  case 'settings': {
    const zone = await findZone(arg || 'ybovo.com');
    for (const s of ['cache_level', 'brotli', 'automatic_https_rewrites', 'browser_cache_ttl']) {
      const r = await api(`/zones/${zone.id}/settings/${s}`);
      if (r.success) console.log(`✓ ${s.padEnd(28)} = ${JSON.stringify(r.result.value)}`);
      else console.log(`✗ ${s.padEnd(28)} ${r.errors?.[0]?.message || ''}`);
    }
    break;
  }

  default:
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n'));
}
