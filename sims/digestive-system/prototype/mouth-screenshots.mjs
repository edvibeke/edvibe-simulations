import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DIR = path.join(ROOT, 'sims/digestive-system');
const OUT = path.join(HERE, 'screenshots');
const clockSource = fs.readFileSync(path.join(HERE, 'timing-clock.js'), 'utf8');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8')
  .replace('<head>', '<head>\n<script>\n' + clockSource + '\n</script>');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (u === '/' || u === '/sims/digestive-system/index.html') {
    rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return rs.end(html);
  }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    rs.writeHead(404);
    return rs.end('not found');
  }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});

await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/sims/digestive-system/index.html`;
const browser = await Chrome.launch({ url, width: 1280, height: 1500 });
try {
  await browser.attach();
  for (const design of ['a', 'b']) {
    for (const [stage, frame] of [['rest', 0], ['chewing', 30], ['swallowing', 390], ['oesophagus', 483]]) {
      await browser.goto(url + '?mouth=' + design);
      let ready = false;
      for (let i = 0; i < 25 && !ready; i++) {
        ready = await browser.eval('return !!window.__clock;');
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) throw new Error('virtual clock missing for ' + design + '/' + stage);
      await browser.eval(`
        if (${frame} > 0) document.getElementById('feedBtn').click();
        for (let i = 0; i < ${frame}; i++) window.__clock.step();
        return document.getElementById('whereValue').textContent;
      `);
      const clip = await browser.eval(`
        const c = document.getElementById('stage');
        const r = c.getBoundingClientRect();
        return JSON.stringify({
          x: r.left,
          y: r.top,
          width: r.width,
          height: 200 * r.height / c.height,
          scale: 1
        });
      `);
      const file = path.join(OUT, `mouth-${design}-${stage}.png`);
      await browser.screenshot(file, JSON.parse(clip));
      console.log(path.basename(file));
    }
  }
} finally {
  browser.ws.close();
  browser.proc.kill();
  srv.close();
}
