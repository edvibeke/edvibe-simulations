import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || '.');
const DIR = path.join(ROOT, 'sims', 'digestive-system');
const clockSource = fs.readFileSync(path.join(HERE, 'timing-clock.js'), 'utf8');

function patchedIndex() {
  let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  let js = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');
  const probe = `
  window.__probe = () => ({ s: headS, simMin: simMin, simSec: simSec });
  window.__phoneProbe = {
    layout: () => ({
      NARROW, COMPACT, W, H, TEXT, FIGURE_VIEW,
      innerWidth: window.innerWidth,
      dpr: window.devicePixelRatio || 1,
      canvas: {
        clientWidth: CANVAS.clientWidth,
        clientHeight: CANVAS.clientHeight,
        width: CANVAS.width,
        height: CANVAS.height,
        left: CANVAS.getBoundingClientRect().left,
        top: CANVAS.getBoundingClientRect().top
      },
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      },
      labelsOn: labels
    }),
    figureBox: () => {
      const raw = { x: 208, y: 70, w: 208, h: 456 };
      if (!NARROW) return raw;
      const at = viewPoint(raw.x, raw.y);
      return { x: at[0], y: at[1], w: raw.w * FIGURE_VIEW.scale, h: raw.h * FIGURE_VIEW.scale };
    },
    visible: () => {
      if (!labels) return [];
      const c = document.createElement('canvas').getContext('2d');
      const masks = new Map();
      for (const g of GEOM.svgArt) {
        masks.set(g.tag, g.items.map((it) => ({
          path: new Path2D(it.d), m: it.m
        })));
      }
      const mouth = [{
        path: mouthCavityPath({
          first: GEOM.markers['feed first'],
          badge: GEOM.markers['Mouth badge'],
          join: GEOM.landmarks.oesophagus
        }),
        m: [1, 0, 0, 1, 0, 0]
      }];
      const inMask = (tag, x, y) => {
        const list = tag === 'mouth' ? mouth : (masks.get(tag) || []);
        for (const item of list) {
          const m = item.m;
          c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          if (c.isPointInPath(item.path, x, y)) return true;
        }
        return false;
      };
      return (NARROW ? visibleLabels() : ORGAN_LABELS).map((l) => {
        const box = labelPillBox(l);
        const at = NARROW ? viewPoint(l.anchor[0], l.anchor[1]) : l.anchor;
        return {
          text: l.text,
          tag: l.tag,
          rawAnchor: l.anchor,
          anchor: { x: at[0], y: at[1] },
          at: { x: l.at[0], y: l.at[1] },
          box,
          lines: l.lines || [l.text],
          anchorOk: inMask(l.tag, l.anchor[0], l.anchor[1])
        };
      });
    },
    overlays: () => {
      if (headS === null) return [];
      const measure = document.createElement('canvas').getContext('2d');
      const s = clamp(headS, 0, TUBE_END);
      const rawSpot = (USE_SVG_ART && GEOM && mouthHold > 0 && GEOM.markers['Mouth badge'])
        || sampleAt(s);
      const spot = NARROW
        ? { x: viewPoint(rawSpot.x, rawSpot.y)[0], y: viewPoint(rawSpot.x, rawSpot.y)[1] }
        : rawSpot;
      const text = mouthHold > 0
        ? (mouthHold > SWALLOW_SEC
          ? 'In the mouth — chewing, amylase at work'
          : 'Swallowing — the bolus is on its way down')
        : ORGAN_NAME[headOrgan] + ' · pH ' + phAt(s).toFixed(1);
      const sub = mouthHold > 0 ? 'smaller pieces = more surface for enzymes' : '';
      measure.font = '700 ' + TEXT.badge + 'px system-ui, sans-serif';
      const w = Math.max(measure.measureText(text).width, sub ? measure.measureText(sub).width : 0)
        + (NARROW ? 32 : 20);
      const hi = NARROW ? W - w - 8 : RAIL.x - w - 10;
      const x = clamp(spot.x - w / 2, 6, hi);
      const y = NARROW
        ? Math.max(80, spot.y - (sub ? 120 : 90))
        : Math.max(26, spot.y - gs(sub ? 66 : 50));
      const h = NARROW ? (sub ? 78 : 42) : (sub ? 40 : 24);
      const out = [{ kind: 'badge', x, y: y - h / 2, w, h }];
      if (mouthHold && USE_SVG_ART && GEOM && GEOM.markers && GEOM.markers['Mouth badge']) {
        const surfaceText = 'surface area x ' + chewFactor.toFixed(2);
        measure.font = '700 ' + TEXT.surface + 'px system-ui, sans-serif';
        const sw = measure.measureText(surfaceText).width + (NARROW ? 28 : 16);
        const sx = clamp(spot.x - sw - 18, 6, NARROW ? W - sw - 8 : RAIL.x - sw - 10);
        const sy = spot.y + (NARROW ? 80 : 26);
        const sh = NARROW ? 30 : 18;
        out.push({ kind: 'surface', x: sx, y: sy - sh / 2, w: sw, h: sh });
      }
      return out;
    },
    panels: () => Array.from(document.querySelectorAll('.ev-stage-panel'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })),
    fonts: () => {
      const scale = CANVAS.clientWidth / W;
      const out = [];
      const add = (source, logical) => out.push({ source, cssPx: +(logical * scale).toFixed(2) });
      add('canvas label', TEXT.label);
      add('canvas badge', TEXT.badge);
      add('canvas badge sub', TEXT.sub);
      add('canvas surface pill', TEXT.surface);
      if (!COMPACT) {
        add('canvas legend title', 12);
        add('canvas legend body', 11);
        add('canvas legend organ', 15);
      }
      for (const el of document.querySelectorAll('.ev-stage-panels, .ev-stage-panels *')) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        out.push({
          source: 'html panel',
          cssPx: +parseFloat(getComputedStyle(el).fontSize).toFixed(2)
        });
      }
      return out;
    }
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
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
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

function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function segRect(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
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
function segSeg(a, b, c, d) {
  const orient = (p, q, r) => {
    const v = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(v) < 1e-9) return 0;
    return v > 0 ? 1 : 2;
  };
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
}

await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/sims/digestive-system/index.html`;
const offences = [];
const fail = (width, phase, detail) => offences.push({ width, phase, detail });
let browser;
try {
  browser = await Chrome.launch({ url, width: 1280, height: 1000 });
  await browser.attach();
  for (const width of [390, 768, 1280]) {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: width === 390 ? 2 : 1,
      mobile: width === 390
    }, browser.session);
    const phases = [
      { name: 'rest', frames: 0 },
      { name: 'stomach', frames: 485 },
      { name: 'small', frames: 691 },
      { name: 'labels-off', frames: 0, toggle: true }
    ];
    for (const phase of phases) {
      await browser.goto(url);
      let ready = false;
      for (let i = 0; i < 30 && !ready; i++) {
        ready = await browser.eval('return !!(window.__clock && window.__phoneProbe);');
        if (!ready) await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) throw new Error('phone probe or clock missing at ' + width);
      if (phase.frames) await browser.eval(`return window.__clock.run(${phase.frames});`);
      if (phase.toggle) await browser.eval(`document.getElementById('labelsBtn').click();`);
      const snap = JSON.parse(await browser.eval(`
        return JSON.stringify({
          layout: window.__phoneProbe.layout(),
          figure: window.__phoneProbe.figureBox(),
          visible: window.__phoneProbe.visible(),
          overlays: window.__phoneProbe.overlays(),
          panels: window.__phoneProbe.panels(),
          fonts: window.__phoneProbe.fonts(),
          where: document.getElementById('whereValue').textContent
        });
      `));
      const L = snap.layout;
      if (L.page.scrollWidth > L.page.clientWidth + 1) {
        fail(width, phase.name, 'sideways scroll ' + L.page.scrollWidth + ' > ' + L.page.clientWidth);
      }
      const expectedBacking = Math.round(L.canvas.clientWidth * L.dpr);
      if (Math.abs(L.canvas.width - expectedBacking) > 1) {
        fail(width, phase.name, 'canvas not HiDPI sharp: ' + L.canvas.width + ' vs ' + expectedBacking);
      }
      for (const f of snap.fonts) {
        if (f.cssPx < 10.99) fail(width, phase.name, 'text too small: ' + f.source + ' ' + f.cssPx + 'px');
      }
      const scale = L.canvas.clientWidth / L.W;
      if (width === 390) {
        const figureCss = snap.figure.w * scale;
        const ratio = figureCss / L.canvas.clientWidth;
        if (ratio < 0.55) fail(width, phase.name, 'figure only ' + ratio.toFixed(3) + ' of canvas width');
      }
      if (L.NARROW && snap.visible.length > 4) {
        fail(width, phase.name, 'too many labels ' + snap.visible.length);
      }
      for (const l of snap.visible) {
        if (!l.anchorOk) fail(width, phase.name, 'leader end outside organ ' + l.text);
      }
      const docBox = (b) => ({
        x: L.canvas.left + b.x * scale,
        y: L.canvas.top + b.y * scale,
        w: b.w * scale,
        h: b.h * scale
      });
      const docPoint = (p) => ({ x: L.canvas.left + p.x * scale, y: L.canvas.top + p.y * scale });
      const boxes = snap.visible.map((l) => ({ label: l.text, box: docBox(l.box) }));
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.box.x < L.canvas.left - 1 || b.box.y < L.canvas.top - 1
          || b.box.x + b.box.w > L.canvas.left + L.canvas.clientWidth + 1
          || b.box.y + b.box.h > L.canvas.top + L.canvas.clientHeight + 1) {
          fail(width, phase.name, 'label outside canvas ' + b.label);
        }
        for (let j = i + 1; j < boxes.length; j++) {
          if (overlap(b.box, boxes[j].box)) {
            fail(width, phase.name, 'labels overlap ' + b.label + ' / ' + boxes[j].label);
          }
        }
        for (const o of snap.overlays) {
          if (overlap(b.box, docBox(o))) fail(width, phase.name, b.label + ' overlaps ' + o.kind);
        }
        for (const p of snap.panels) {
          if (overlap(b.box, p)) fail(width, phase.name, b.label + ' overlaps html panel');
        }
      }
      for (let i = 0; i < snap.visible.length; i++) {
        const a = snap.visible[i];
        const segA = [docPoint(a.anchor), docPoint(a.at)];
        for (let j = 0; j < snap.visible.length; j++) {
          if (i === j) continue;
          if (segRect(segA[0], segA[1], boxes[j].box)) {
            fail(width, phase.name, a.text + ' leader crosses ' + boxes[j].label);
          }
        }
        for (let j = i + 1; j < snap.visible.length; j++) {
          const b = snap.visible[j];
          if (segSeg(segA[0], segA[1], docPoint(b.anchor), docPoint(b.at))) {
            fail(width, phase.name, a.text + ' leader crosses ' + b.text);
          }
        }
      }
      console.log(`width=${width} phase=${phase.name} where=${snap.where} labels=${snap.visible.map((l) => l.text).join('|') || 'off'}`);
    }
  }
  for (const o of offences) console.log(`FAIL [${o.width}/${o.phase}] ${o.detail}`);
  console.log(`phone-check: offences=${offences.length}`);
  if (offences.length) process.exitCode = 1;
} catch (e) {
  console.error('HARNESS ERROR: ' + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  srv.close();
}
