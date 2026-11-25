import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
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
    return rs.end(fs.readFileSync(path.join(ROOT, 'sims/digestive-system/index.html')));
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
  await browser.onNewDocument(`
    (() => {
      window.__yzero = [];
      const describe = (a) => typeof a === 'number'
        ? a
        : a && a.constructor ? a.constructor.name : String(a);
      const yArgs = {
        rect: [1], fillRect: [1], strokeRect: [1], clearRect: [1],
        moveTo: [1], lineTo: [1], arc: [1], ellipse: [1],
        quadraticCurveTo: [1, 3], bezierCurveTo: [1, 3, 5], arcTo: [1, 3],
        drawImage: [2], fillText: [2], strokeText: [2]
      };
      const record = (kind, method, args, target) => {
        const ys = (yArgs[method] || []).map((i) => args[i])
          .filter((y) => typeof y === 'number' && Number.isFinite(y));
        if (!ys.some((y) => y === 0)) return;
        window.__yzero.push({
          kind: kind,
          method: method,
          args: args.map(describe),
          ys: ys,
          canvasWidth: target && target.canvas ? target.canvas.width : null,
          canvasHeight: target && target.canvas ? target.canvas.height : null
        });
      };
      const methods = [
        'rect', 'fillRect', 'strokeRect', 'clearRect',
        'moveTo', 'lineTo', 'arc', 'ellipse',
        'quadraticCurveTo', 'bezierCurveTo', 'arcTo',
        'drawImage', 'fillText', 'strokeText'
      ];
      for (const [kind, proto] of [
        ['context', CanvasRenderingContext2D.prototype],
        ['path', Path2D.prototype]
      ]) {
        for (const method of methods) {
          const original = proto[method];
          if (!original) continue;
          proto[method] = function (...args) {
            record(kind, method, args, this);
            return original.apply(this, args);
          };
        }
      }
    })();
  `);
  const designs = {};
  for (const design of ['a', 'b']) {
    await browser.goto(url + '?mouth=' + design);
    await new Promise((r) => setTimeout(r, 500));
    await browser.eval(`
      document.getElementById('feedBtn').click();
      return true;
    `);
    await new Promise((r) => setTimeout(r, 500));
    const hits = await browser.eval('return window.__yzero;');
    const infrastructure = hits.filter((h) =>
      (h.method === 'clearRect' || h.method === 'fillRect' || h.method === 'strokeRect' || h.method === 'rect') &&
      h.args[0] === 0 && h.args[1] === 0 &&
      h.args[2] === 900 && h.args[3] === 540
    );
    const blits = hits.filter((h) => h.method === 'drawImage' && h.args[1] === 0 && h.args[2] === 0);
    designs[design] = {
      totalHits: hits.length,
      canvasClears: infrastructure.length,
      canvasBlits: blits.length,
      anatomyHits: hits.filter((h) => !infrastructure.includes(h) && !blits.includes(h)),
      allHits: hits
    };
  }
  const report = {
    verdict: designs.a.anatomyHits.length || designs.b.anatomyHits.length ? 'FAIL' : 'PASS',
    note: 'Only full-canvas clear/blit operations use y=0; no anatomy path or text does.',
    designs: designs
  };
  fs.writeFileSync(path.join(HERE, 'y-zero-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    verdict: report.verdict,
    a: { total: designs.a.totalHits, anatomy: designs.a.anatomyHits.length },
    b: { total: designs.b.totalHits, anatomy: designs.b.anatomyHits.length }
  }));
} finally {
  browser.ws.close();
  browser.proc.kill();
  srv.close();
}
