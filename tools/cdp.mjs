/* Minimal Chrome DevTools Protocol client + static file server.


   No dependencies: node 22 ships a global WebSocket. */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { ROOT } from './paths.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

export function serve(port = 0) {
  const srv = http.createServer((rq, rs) => {
    const u = decodeURIComponent(rq.url.split('?')[0]);
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      rs.writeHead(404); return rs.end('not found');
    }
    rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rs);
  });
  /* Port 0 lets the OS pick, so two suites can run at the same time. */
  return new Promise((res) => srv.listen(port, '127.0.0.1', () => {
    const at = srv.address().port;
    res({
      port: at,
      url: (p) => `http://127.0.0.1:${at}${p}`,
      close: () => new Promise((r) => srv.close(r))
    });
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForWs(port, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('chromium devtools endpoint never came up');
}

export class Chrome {
  constructor(proc, ws, profile) { this.proc = proc; this.ws = ws; this.profile = profile; this.id = 0; }

  /* The debugging port must be known before the browser starts, so it is
     picked at random and retried on the rare collision. */
  static async launch({ url, port = 10000 + Math.floor(Math.random() * 40000),
                       width = 1280, height = 1500, extraArgs = [] } = {}) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
    const args = [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--disable-lcd-text',
      `--window-size=${width},${height}`, '--remote-allow-origins=*',
      `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      ...extraArgs
    ];
    if (url) args.push(url);
    const proc = spawn(process.env.CHROME || 'chromium', args, { stdio: 'ignore' });
    const wsUrl = await waitForWs(port);
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new Chrome(proc, ws, profile);
    c.port = port;
    return c;
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`${method} timed out`)), 60000);
      const onMsg = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id !== id) return;
        clearTimeout(timer);
        this.ws.removeEventListener('message', onMsg);
        if (m.error) rej(new Error(method + ': ' + JSON.stringify(m.error)));
        else res(m.result);
      };
      this.ws.addEventListener('message', onMsg);
      this.ws.send(JSON.stringify(msg));
    });
  }

  /* Evaluate in the page and return the value, awaiting promises. */
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error('page eval threw: ' + (e.exception?.description || e.text));
    }
    return r.result.value;
  }

  async attach() {
    const { targetInfos } = await this.send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page');
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    this.session = sessionId;
    await this.send('Runtime.enable', {}, sessionId);
    await this.send('Page.enable', {}, sessionId);
    return sessionId;
  }

  async goto(url) {
    await this.send('Page.navigate', { url }, this.session);
    await sleep(400);
  }

  async screenshot(file, clip) {
    const r = await this.send('Page.captureScreenshot',
      clip ? { format: 'png', clip } : { format: 'png' }, this.session);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }

  /* Install a script that runs in every new document, before the page's
     own scripts, so load-time exceptions cannot hide. */
  async onNewDocument(source) {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source }, this.session);
  }

  async close() {
    try { this.ws.close(); } catch {}
    this.proc.kill();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(this.profile, { recursive: true, force: true }); break; }
      catch { await sleep(120); }
    }
  }
}

export { sleep };