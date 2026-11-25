import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DIR = path.join(ROOT, 'sims/digestive-system');
const OUT = path.join(HERE, 'screenshots');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    rs.writeHead(404);
    return rs.end('not found');
  }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});

await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/sims/digestive-system/prototype/index.html`;
const browser = await Chrome.launch({ url: base + '?mode=trace&labels=0&clean=1', width: 1280, height: 820 });

async function ready() {
  for (let i = 0; i < 30; i++) {
    if (await browser.eval('return !!window.__READY;')) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('trace editor did not become ready');
}

try {
  await browser.attach();
  for (const name of ['portal', 'lymph', 'bile', 'pancreatic']) {
    await browser.goto(base + '?mode=trace&labels=0&clean=1');
    await ready();
    await browser.eval(`localStorage.removeItem('digestive-svg-trace-v5'); return true;`);
    await browser.goto(base + '?mode=trace&labels=0&clean=1&route=' + name);
    await ready();
    const state = JSON.parse(await browser.eval(`
      const select = document.getElementById('segment');
      select.value = 'papilla';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('suggest').click();
      select.value = ${JSON.stringify(name)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('suggest').click();
      const v = window.__TRACE_VIEW;
      v.s = 2.3;
      v.tx = -420;
      v.ty = -290;
      window.__TRACE_RENDER();
      return JSON.stringify({
        segment: select.value,
        counts: Object.fromEntries(Object.entries(window.__TRACE_ANCHORS).map(([k, v]) => [k, v.length])),
        message: window.__TRACE_MESSAGE,
        hint: window.__TRACE_HINT
      });
    `));
    if (state.segment !== name || /^No suggestion/.test(state.message)) {
      throw new Error('suggestion failed for ' + name + ': ' + state.message);
    }
    const clip = await browser.eval(`
      const c = document.getElementById('stage');
      const r = c.getBoundingClientRect();
      return JSON.stringify({ x: r.left, y: r.top, width: r.width, height: r.height, scale: 1 });
    `);
    const file = path.join(OUT, 'route-' + name + '.png');
    await browser.screenshot(file, JSON.parse(clip));
    console.log(path.basename(file), JSON.stringify(state.counts));
  }
} finally {
  browser.ws.close();
  browser.proc.kill();
  srv.close();
}
