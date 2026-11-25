import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || '.');
const DIR = path.join(ROOT, 'sims', 'digestive-system');
const source = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');

function patchedIndex() {
  let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  let js = source;
  const probe = `
  window.__labelProbe = {
    constants: () => ({ W, H, RAIL, ORGAN_LABELS, LABEL_COLOURS, LABEL_STYLE, GEOM, COL }),
    labels: () => labels,
    box: (l) => labelPillBox(l),
    gs,
    groups: () => svgArtGroups(),
    routeGlowStyle,
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
    const { W, H, RAIL, ORGAN_LABELS, LABEL_COLOURS, LABEL_STYLE, GEOM, COL } = probe.constants();
    const offences = [];
    const fail = (kind, detail) => offences.push({ kind, detail });
    const ctx = document.createElement('canvas').getContext('2d');
    const raw = new Map();
    for (const g of GEOM.svgArt) {
      raw.set(g.tag, g.items.map((it) => ({
        tag: g.tag,
        id: it.id || '',
        path: new Path2D(it.d),
        m: it.m
      })));
    }
    const items = (tag) => raw.get(tag) || [];
    const masks = {
      mouth: [{ tag: 'mouth', id: 'mouthCavityPath', path: probe.mouthPath(), m: [1, 0, 0, 1, 0, 0] }],
      oesophagus: items('oesophagus'),
      liver: items('liver'),
      liver_detail: items('liver_detail'),
      gallbladder: items('gallbladder'),
      stomach: items('stomach'),
      pancreas: items('pancreas'),
      duodenum: items('duodenum'),
      small: items('small'),
      colon: items('colon')
    };
    const all = Object.values(masks).flat();
    function svgOf(item, x, y) {
      const m = item.m;
      const d = m[0] * m[3] - m[1] * m[2];
      return [
        +(((m[3] * (x - m[4]) - m[1] * (y - m[5])) / d).toFixed(1)),
        +(((-m[2] * (x - m[4]) + m[0] * (y - m[5])) / d).toFixed(1))
      ];
    }
    function hitsAt(x, y) {
      const out = [];
      for (const item of all) {
        const m = item.m;
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (ctx.isPointInPath(item.path, x, y)) {
          out.push({ tag: item.tag, id: item.id, svg: svgOf(item, x, y) });
        }
      }
      return out;
    }
    function hit(list, x, y) {
      for (const item of list) {
        const m = item.m;
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (ctx.isPointInPath(item.path, x, y)) return true;
      }
      return false;
    }
    function deepIn(tag, x, y, r) {
      const list = items(tag);
      const inside = (px, py) => hit(list, px, py);
      if (!inside(x, y)) return false;
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI * 2) / 24;
        if (!inside(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false;
      }
      return true;
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
    function channel(hex) {
      const s = hex.replace('#', '');
      return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
    }
    function luminance(hex) {
      return channel(hex).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    }
    function contrast(a, b) {
      const la = luminance(a), lb = luminance(b);
      return +((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2);
    }
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
    const endpoints = ORGAN_LABELS.map((l) => ({
      text: l.text,
      logical: l.anchor,
      hits: hitsAt(l.anchor[0], l.anchor[1])
    }));
    const endpointTags = {
      mouth: 'mouth', oesophagus: 'oesophagus', liver: 'liver', gallbladder: 'gallbladder',
      stomach: 'stomach', pancreas: 'pancreas', duodenum: 'duodenum',
      'small intestine': 'small', 'large intestine (colon)': 'colon', rectum: 'colon'
    };
    for (const e of endpoints) {
      if (!e.hits.some((h) => h.tag === endpointTags[e.text])) fail('endpoint-tag', e.text + ' ' + JSON.stringify(e.hits));
    }
    const pancreas = endpoints.find((e) => e.text === 'pancreas');
    if (!pancreas.hits.some((h) => h.tag === 'pancreas')) fail('pancreas-endpoint', JSON.stringify(pancreas.hits));
    if (pancreas.hits.some((h) => h.tag === 'duodenum')) fail('pancreas-duodenum', JSON.stringify(pancreas.hits));
    if (!pancreas.hits.some((h) => h.id === 'rect3958')) fail('pancreas-gland-id', JSON.stringify(pancreas.hits));
    const smallEnd = ORGAN_LABELS.find((l) => l.text === 'small intestine').anchor;
    if (!deepIn('small', smallEnd[0], smallEnd[1], 12)) fail('small-depth', JSON.stringify(smallEnd));
    const colourKeys = { mouth: 'mouth', oesophagus: 'oesophagus', liver: 'liver', gallbladder: 'gallbladder', stomach: 'stomach', pancreas: 'pancreas', duodenum: 'duodenum', 'small intestine': 'small', 'large intestine (colon)': 'colon', rectum: 'colon' };
    const contrastRatios = ORGAN_LABELS.map((l) => {
      if (l.colour !== LABEL_COLOURS[colourKeys[l.text]]) fail('colour', l.text + ' border/leader colour changed');
      return { text: l.text, ratio: contrast(LABEL_STYLE.text, LABEL_STYLE.pill) };
    });
    for (const item of contrastRatios) {
      if (item.ratio < 4.5) fail('contrast', item.text + ' ' + item.ratio);
    }
    if (luminance(LABEL_STYLE.text) < 0.8) fail('text-light', LABEL_STYLE.text);
    const routeLevels = {
      portal: { rest: probe.routeGlowStyle(false), active: probe.routeGlowStyle(true) },
      lymph: { rest: probe.routeGlowStyle(false), active: probe.routeGlowStyle(true) }
    };
    for (const route of ['portal', 'lymph']) {
      const levels = routeLevels[route];
      if (!(levels.rest.core <= 0.25 && levels.active.core >= 0.8)) fail('route-emphasis', route + ' ' + JSON.stringify(levels));
    }
    if (COL.portal !== '#60a5fa' || COL.lymph !== '#fcd34d') fail('route-colour', JSON.stringify({ portal: COL.portal, lymph: COL.lymph }));
    const boxes = ORGAN_LABELS.map((l) => probe.box(l));
    for (let i = 0; i < ORGAN_LABELS.length; i++) {
      const l = ORGAN_LABELS[i], box = boxes[i];
      if (!hit(masks[l.tag === 'small intestine' ? 'small' : l.text === 'rectum' ? 'colon' : l.tag], l.anchor[0], l.anchor[1])) fail('mask', l.text + ' anchor ' + JSON.stringify(l.anchor) + ' outside ' + l.tag);
      if (box.x < 8 || box.y < 8 || box.x + box.w > W - 8 || box.y + box.h > H - 8) fail('edge', l.text + ' ' + JSON.stringify(box));
      if (overlap(box, RAIL)) fail('legend', l.text + ' touches legend panel');
      if (boxHits(raw.get('outline') || [], box)) fail('outline', l.text + ' touches figure outline');
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
    return JSON.stringify({ count: ORGAN_LABELS.length, offences, endpoints, contrast: contrastRatios, routeLevels });
  `));
  for (const e of result.endpoints) {
    console.log(`endpoint ${e.text}: logical=${JSON.stringify(e.logical)} masks=${JSON.stringify(e.hits)}`);
  }
  console.log(`contrast: ${JSON.stringify(result.contrast)}`);
  console.log(`route glow: ${JSON.stringify(result.routeLevels)}`);
  if (!source.includes('c.strokeStyle = svgColour(l.colour, 0.72)')) {
    result.offences.push({ kind: 'leader-colour', detail: 'leader stroke no longer uses organ colour' });
  }
  if (!source.includes('c.strokeStyle = svgColour(l.colour, 0.42)')) {
    result.offences.push({ kind: 'pill-border-colour', detail: 'pill border no longer uses organ colour' });
  }
  if (!source.includes('paintRouteGlow(ctx);') || source.includes('paintSvgArt(c);\n    paintRouteGlow(c);')) {
    result.offences.push({ kind: 'route-cache', detail: 'route glow must be drawn per frame, not baked into SVG cache' });
  }
  for (const o of result.offences) console.log(`FAIL [${o.kind}] ${o.detail}`);
  console.log(`label-check: labels=${result.count} offences=${result.offences.length}`);
  if (result.offences.length) process.exitCode = 1;
} catch (e) {
  console.error('HARNESS ERROR: ' + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  srv.close();
}
