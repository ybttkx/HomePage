/**
 * cf-probe.mjs —— 探测 wrangler OAuth 凭据对 Cloudflare API 的实际权限范围
 *
 * 只读取凭据用于鉴权，绝不打印凭据内容。
 * 目的：确认能否通过 API 配置 Zone 级 Cache Rules（wrangler whoami 未列出 zone 权限，
 *       但实际 scope 可能更宽，需要实测）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CFG = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'xdg.config',
  '.wrangler',
  'config',
  'default.toml'
);

function readToken() {
  if (!fs.existsSync(CFG)) return null;
  const text = fs.readFileSync(CFG, 'utf8');
  const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

const token = readToken();
if (!token) {
  console.log('未找到 oauth_token，路径：' + CFG);
  process.exit(1);
}
console.log(`已读取凭据（长度 ${token.length}，内容不打印）\n`);

async function api(pathname, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { parse: 'non-json' };
  }
  return { status: res.status, body };
}

function summarize(label, r, mapper) {
  const ok = r.body?.success;
  console.log(`── ${label}`);
  console.log(`   HTTP ${r.status}  success=${ok}`);
  if (!ok) {
    const errs = r.body?.errors || [];
    for (const e of errs) console.log(`   ✗ [${e.code}] ${e.message}`);
  } else if (mapper) {
    mapper(r.body.result);
  }
  console.log('');
  return ok;
}

// 1) 能否读取 Zone 列表
const zones = await api('/zones?per_page=50');
summarize('读取 Zone 列表', zones, (result) => {
  if (!result?.length) return console.log('   （无可见 Zone）');
  for (const z of result) {
    console.log(`   ✓ ${z.name}  zone_id=${z.id}  plan=${z.plan?.name}  status=${z.status}`);
  }
});

// 2) 能否读取账号下已有 Cache Rules（rulesets）
let zoneId = null;
if (zones.body?.result?.length) {
  const target = zones.body.result.find((z) => /ybovo\.com$/.test(z.name)) || zones.body.result[0];
  zoneId = target.id;
  console.log(`选定 Zone: ${target.name} (${target.id})\n`);

  const rulesets = await api(`/zones/${zoneId}/rulesets`);
  summarize('读取 Zone Rulesets（Cache Rules 载体）', rulesets, (result) => {
    if (!result?.length) return console.log('   （无 ruleset）');
    for (const r of result) {
      console.log(`   ✓ ${r.phase.padEnd(28)} ${r.name}  id=${r.id}  rules=${r.rules?.length ?? 0}`);
    }
  });

  // 3) 尝试读取单个 zone 详情（更细的权限）
  const zd = await api(`/zones/${zoneId}`);
  summarize('读取 Zone 详情', zd, (z) => console.log(`   ✓ ${z.name} plan=${z.plan?.name}`));

  // 4) 读取 zone 的缓存级别设置
  const cl = await api(`/zones/${zoneId}/settings/cache_level`);
  summarize('读取缓存级别设置', cl, (r) => console.log(`   ✓ ${JSON.stringify(r)}`));

  // 5) 读取 brotli 压缩等设置（判断能否改 EdgeOne 的同类项）
  const br = await api(`/zones/${zoneId}/settings/brotli`);
  summarize('读取 Brotli 设置', br, (r) => console.log(`   ✓ ${JSON.stringify(r)}`));
}

console.log('='.repeat(70));
console.log('结论提示：若上述「读取」多为 403 / code 10000，则当前凭据无 Zone 权限，');
console.log('无法通过 API 配置 Cache Rules，需要另行提供带 Zone 权限的 API Token。');
console.log('='.repeat(70));
