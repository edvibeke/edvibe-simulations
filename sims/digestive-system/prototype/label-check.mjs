import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || '.');
const DIR = path.join(ROOT, 'sims', 'digestive-system');

function patchedIndex() {
  let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  let js = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');
  const probe = `
  window.__labelProbe = {
    constants: () => ({ W, H, RAIL, ORGAN_LABELS, LABEL_COLOURS, GEOM }),
    labels: () => labels,
    box: (l) => labelPillBox(l),
    gs,
    groups: () => svgArtGroups(),
    mouthPath: () => mouthCavityPath({
      first: GEOM.markers['feed first'],
      badge: GEOM.markers['Mouth badge'],
      join: GEOM.landmarks.oesophagus
    })
  };
`;
  const end = js.lastIndexOf('})();');
  if (end < 0) throw new Error('cannot find IIFE end in script.js');
  js = js.slice(0, end) + probe + js.slice(end);
  const tag = '<script src="script.js"></script>';
  if (!html.includes(tag)) throw new Error('cannot find script.js tag in index.html');
  return html.replace(tag, '<script>\n' + js + '\n</script>');
}

const html = patchedIndex();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
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
  await browser.goto(url);
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    ready = await browser.eval('return !!window.__labelProbe;');
    if (!ready) await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error('label probe missing in page');
  const result = JSON.parse(await browser.eval(`
    const probe = window.__labelProbe;
    const { W, H, RAIL, ORGAN_LABELS, GEOM } = probe.constants();
    const offences = [];
    const fail = (kind, detail) => offences.push({ kind, detail });
    const ctx = document.createElement('canvas').getContext('2d');
    const groups = new Map(probe.groups().map((g) => [g.tag, g.items]));
    const items = (tag) => groups.get(tag) || [];
    const masks = {
      mouth: [{ path: probe.mouthPath(), m: [1, 0, 0, 1, 0, 0] }],
      oesophagus: items('oesophagus'),
      liver: items('liver'),
      gallbladder: items('gallbladder'),
      stomach: items('stomach'),
      pancreas: items('pancreas'),
      duodenum: items('duodenum'),
      small: items('small'),
      colon: items('colon')
    };
    const outline = items('outline');
    function hit(list, x, y) {
      for (const item of list) {
        const m = item.m;
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (ctx.isPointInPath(item.path, x, y)) return true;
      }
      return false;
    }
    function boxHits(list, box) {
      for (let x = box.x + 3; x <= box.x + box.w - 3; x += 4) {
        if (hit(list, x, box.y + 3) || hit(list, x, box.y + box.h - 3)) return true;
      }
      for (let y = box.y + 3; y <= box.y + box.h - 3; y += 4) {
        if (hit(list, box.x + 3, y) || hit(list, box.x + box.w - 3, y)) return true;
      }
      return false;
    }
    function overlap(a, b) {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    }
    function segRect(a, b, r) {
      let t0 = 0, t1 = 1;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const p = [-dx, dx, -dy, dy];
      const q = [a[0] - r.x, r.x + r.w - a[0], a[1] - r.y, r.y + r.h - a[1]];
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
          if (q[i] < 0) return false;
          continue;
        }
        const t = q[i] / p[i];
        if (p[i] < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) return false;
      }
      return true;
    }
    function orient(a, b, c) {
      const v = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
      if (Math.abs(v) < 1e-9) return 0;
      return v > 0 ? 1 : 2;
    }
    function segSeg(a, b, c, d) {
      const o1 = orient(a, b, c), o2 = orient(a, b, d);
      const o3 = orient(c, d, a), o4 = orient(c, d, b);
      return o1 !== o2 && o3 !== o4;
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function badgeBox(sub, text, subText) {
      const spot = GEOM.markers['Mouth badge'];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = '700 11px system-ui, sans-serif';
      const w = Math.max(ctx.measureText(text).width, subText ? ctx.measureText(subText).width : 0) + 20;
      const x = clamp(spot.x - w / 2, 6, RAIL.x - w - 10);
      const y = Math.max(26, spot.y - probe.gs(sub ? 66 : 50));
      return { x, y: y - 12, w, h: sub ? 40 : 24 };
    }
    function surfaceBox() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const badge = GEOM.markers['Mouth badge'];
      const text = 'surface area x 3.40';
      ctx.font = '700 10px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 16;
      const x = clamp(badge.x - w - 18, 6, RAIL.x - w - 10);
      return { x, y: badge.y + 26 - 9, w, h: 18 };
    }
    const texts = ORGAN_LABELS.map((l) => l.text);
    const expected = ['mouth','oesophagus','liver','gallbladder','stomach','pancreas','duodenum','small intestine','large intestine (colon)','rectum'];
    if (JSON.stringify(texts) !== JSON.stringify(expected)) fail('label-set', JSON.stringify(texts));
    const boxes = ORGAN_LABELS.map((l) => probe.box(l));
    for (let i = 0; i < ORGAN_LABELS.length; i++) {
      const l = ORGAN_LABELS[i], box = boxes[i];
      if (!hit(masks[l.tag], l.anchor[0], l.anchor[1])) fail('mask', l.text + ' anchor ' + JSON.stringify(l.anchor) + ' outside ' + l.tag);
      if (box.x < 8 || box.y < 8 || box.x + box.w > W - 8 || box.y + box.h > H - 8) fail('edge', l.text + ' ' + JSON.stringify(box));
      if (overlap(box, RAIL)) fail('legend', l.text + ' touches legend panel');
      if (boxHits(outline, box)) fail('outline', l.text + ' touches figure outline');
      for (const tag of Object.keys(masks)) {
        if (boxHits(masks[tag], box)) fail('organ', l.text + ' box touches ' + tag);
      }
      for (let j = i + 1; j < ORGAN_LABELS.length; j++) {
        if (overlap(box, boxes[j])) fail('label-overlap', l.text + ' overlaps ' + ORGAN_LABELS[j].text);
      }
    }
    for (let i = 0; i < ORGAN_LABELS.length; i++) {
      const a = ORGAN_LABELS[i];
      const segA = [a.anchor, a.at];
      for (let j = i + 1; j < ORGAN_LABELS.length; j++) {
        const b = ORGAN_LABELS[j];
        if (segSeg(segA[0], segA[1], b.anchor, b.at)) fail('leader-cross', a.text + ' crosses ' + b.text);
      }
      for (let j = 0; j < ORGAN_LABELS.length; j++) {
        if (i === j) continue;
        if (segRect(segA[0], segA[1], boxes[j])) fail('leader-label', a.text + ' leader crosses ' + ORGAN_LABELS[j].text);
      }
    }
    const badge = badgeBox(false, 'Stomach · pH 2.0', '');
    const chewingBadge = badgeBox(true, 'In the mouth — chewing, amylase at work', 'smaller pieces = more surface for enzymes');
    const surface = surfaceBox();
    for (let i = 0; i < ORGAN_LABELS.length; i++) {
      if (overlap(boxes[i], badge)) fail('badge', ORGAN_LABELS[i].text + ' overlaps location badge');
      if (overlap(boxes[i], chewingBadge)) fail('badge', ORGAN_LABELS[i].text + ' overlaps mouth badge');
      if (overlap(boxes[i], surface)) fail('surface', ORGAN_LABELS[i].text + ' overlaps surface area pill');
    }
    let cavityMinY = Infinity;
    for (let y = 30; y < 140; y++) {
      for (let x = 240; x < 350; x++) {
        if (hit(masks.mouth, x, y)) { cavityMinY = Math.min(cavityMinY, y); break; }
      }
      if (cavityMinY < Infinity) break;
    }
    if (badge.y + badge.h >= cavityMinY) fail('mouth-badge', 'location badge overlaps mouth rim');
    if (chewingBadge.y + chewingBadge.h >= cavityMinY) fail('mouth-badge', 'chewing badge overlaps mouth rim');
    const canvas = document.getElementById('stage');
    const live = canvas.getContext('2d');
    const sample = boxes[0];
    const sx = Math.floor(sample.x), sy = Math.floor(sample.y);
    const sw = Math.ceil(sample.w), sh = Math.ceil(sample.h);
    const snap = () => Array.from(live.getImageData(sx, sy, sw, sh).data);
    const diff = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 20) n++;
      }
      return n;
    };
    const before = snap();
    const initial = probe.labels();
    document.getElementById('labelsBtn').click();
    const afterOff = snap();
    const off = probe.labels();
    document.getElementById('labelsBtn').click();
    const afterOn = snap();
    const on = probe.labels();
    if (initial !== true || off !== false || on !== true) fail('toggle-state', JSON.stringify({ initial, off, on }));
    if (diff(before, afterOff) < 20) fail('toggle-hide', 'labels did not disappear');
    if (diff(afterOff, afterOn) < 20) fail('toggle-show', 'labels did not reappear');
    return JSON.stringify({ count: ORGAN_LABELS.length, offences });
  `));
  for (const o of result.offences) console.log(`FAIL [${o.kind}] ${o.detail}`);
  console.log(`label-check: labels=${result.count} offences=${result.offences.length}`);
  if (result.offences.length) process.exitCode = 1;
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
