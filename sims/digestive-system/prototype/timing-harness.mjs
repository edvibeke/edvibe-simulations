import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || '.');
const LABEL = process.argv[3] || 'run';
const RUNS = Number(process.argv[4] || 2);
const clockSource = fs.readFileSync(path.join(HERE, 'timing-clock.js'), 'utf8');

function patchedIndex() {
  const dir = path.join(ROOT, 'sims', 'digestive-system');
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  let js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');
  const probe = `
  window.__probe = function () {
    return {
      s: headS,
      simMin: simMin,
      simSec: simSec,
      peristalsis: peristalsis,
      speed: speedAt(headS)
    };
  };
`;
  const end = js.lastIndexOf('})();');
  if (end < 0) throw new Error('cannot find IIFE end in script.js');
  js = js.slice(0, end) + probe + js.slice(end);
  const tag = '<script src="script.js"></script>';
  if (!html.includes(tag)) throw new Error('cannot find script.js tag in index.html');
  html = html.replace(tag, '<script>\n' + js + '\n</script>');
  if (!html.includes('<head>')) throw new Error('cannot find head in index.html');
  html = html.replace('<head>', '<head>\n<script>\n' + clockSource + '\n</script>');
  return html;
}

const html = patchedIndex();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (u === '/' || u === '/sims/digestive-system/index.html') {
    rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    rs.end(html);
    return;
  }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    rs.writeHead(404);
    rs.end('not found');
    return;
  }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});

await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/sims/digestive-system/index.html`;
let browser;
try {
  browser = await Chrome.launch({ url, width: 1280, height: 1500 });
  await browser.attach();
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    await browser.goto(url);
    await new Promise((r) => setTimeout(r, 250));
    const ready = await browser.eval('return !!(window.__clock && window.__probe);');
    if (!ready) throw new Error('virtual clock or probe missing in page');
    runs.push(JSON.parse(await browser.eval('return window.__clock.run(6000);')));
  }
  console.log(JSON.stringify({ label: LABEL, runs }));
} catch (e) {
  console.error('HARNESS ERROR: ' + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  if (browser) {
    try { browser.ws.close(); } catch {}
    browser.proc.kill();
  }
  srv.close();
}
