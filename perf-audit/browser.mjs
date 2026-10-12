/**
 * browser.mjs —— 基于 CDP 的浏览器操控（零依赖，使用 Node 内置 WebSocket）
 *
 * 前置：Edge 需以 --remote-debugging-port=9222 启动（见启动 Edge 的说明）。
 *
 * 用法：
 *   node browser.mjs goto <url> [settleMs]   导航并等待渲染
 *   node browser.mjs shot <file.png>         截图当前页面
 *   node browser.mjs text [maxChars]         输出页面可见文本
 *   node browser.mjs eval "<js>"             执行 JS 并输出结果
 *   node browser.mjs click "<selector>"      点击元素
 *   node browser.mjs url                     输出当前 URL 与标题
 *   node browser.mjs tabs                    列出所有标签页
 *   node browser.mjs newtab [url]            新建标签页并切换
 *
 * 说明：所有命令都作用于同一个 page target，因此状态（登录态、滚动位置）在多次调用间保持。
 */

import fs from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9222);
const BASE = `http://127.0.0.1:${PORT}`;

async function listTargets() {
  const res = await fetch(`${BASE}/json/list`);
  return res.json();
}

/** 取当前操作的 page target（优先复用已存在的，其次新建） */
async function getPageTarget() {
  let targets = await listTargets();
  let page = targets.find((t) => t.type === 'page' && !t.url.startsWith('edge://newtab'));
  if (!page) page = targets.find((t) => t.type === 'page');
  if (page) return page;

  // 没有任何标签页时新建一个
  await fetch(`${BASE}/json/new?about:blank`, { method: 'PUT' }).catch(() => {});
  targets = await listTargets();
  page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('无法获取 page target');
  return page;
}

class CDP {
  constructor(url) {
    this.url = url;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebSocket 连接超时')), 10000);
      this.ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(t);
        reject(new Error('WebSocket 连接失败'));
      };
    });
    this.ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        const arr = this.listeners.get(msg.method) || [];
        for (const fn of [...arr]) fn(msg.params);
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 命令超时: ${method}`));
        }
      }, 30000);
    });
  }

  once(method, timeout = 20000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeout);
      const arr = this.listeners.get(method) || [];
      const fn = (p) => {
        clearTimeout(timer);
        this.listeners.set(
          method,
          (this.listeners.get(method) || []).filter((f) => f !== fn)
        );
        resolve(p);
      };
      arr.push(fn);
      this.listeners.set(method, arr);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  }
  return r.result?.value;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.log('用法: node browser.mjs <goto|shot|text|eval|click|url|tabs|newtab> [参数]');
    process.exit(1);
  }

  if (cmd === 'tabs') {
    const targets = await listTargets();
    for (const t of targets.filter((x) => x.type === 'page')) {
      console.log(`${t.title}\n   ${t.url}\n   id=${t.id}`);
    }
    return;
  }

  const target = await getPageTarget();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    switch (cmd) {
      case 'goto': {
        const url = args[0];
        const settle = Number(args[1] ?? 3000);
        await cdp.send('Page.navigate', { url });
        await cdp.once('Page.loadEventFired', 30000);
        await sleep(settle); // 等待 SPA 渲染 / 客户端跳转
        const info = await evaluate(
          cdp,
          'JSON.stringify({url: location.href, title: document.title, ready: document.readyState})'
        );
        console.log(info);
        break;
      }

      case 'shot': {
        const file = args[0] || 'shot.png';
        const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
        const st = fs.statSync(file);
        console.log(`已保存 ${file} (${(st.size / 1024).toFixed(1)} KB)`);
        break;
      }

      case 'text': {
        const max = Number(args[0] ?? 4000);
        const t = await evaluate(
          cdp,
          'document.body ? document.body.innerText.replace(/\\n{3,}/g,"\\n\\n") : ""'
        );
        const s = String(t ?? '');
        console.log(s.length > max ? s.slice(0, max) + `\n...[共 ${s.length} 字符，已截断]` : s);
        break;
      }

      case 'eval': {
        const v = await evaluate(cdp, args[0]);
        console.log(typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));
        break;
      }

      case 'click': {
        const sel = args[0];
        const r = await evaluate(
          cdp,
          `(() => {
             const el = document.querySelector(${JSON.stringify(sel)});
             if (!el) return 'NOT_FOUND';
             el.scrollIntoView({block:'center'});
             el.click();
             return 'CLICKED: ' + (el.innerText || el.getAttribute('aria-label') || el.tagName).slice(0,60);
           })()`
        );
        console.log(r);
        await sleep(1500);
        break;
      }

      case 'newtab': {
        const url = args[0] || 'about:blank';
        await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
        console.log('已新建标签页: ' + url);
        break;
      }

      case 'url': {
        const info = await evaluate(cdp, 'JSON.stringify({url: location.href, title: document.title})');
        console.log(info);
        break;
      }

      default:
        console.log('未知命令: ' + cmd);
    }
  } finally {
    cdp.close();
  }
}

main().catch((e) => {
  console.error('错误: ' + e.message);
  process.exit(1);
});
