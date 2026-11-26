import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const simRoot = path.resolve(here, '..');
const svgPath = path.join(simRoot, 'art', 'heart-anatomy.svg');
const geometryPath = path.join(here, 'svg-geometry.json');
const geometry = JSON.parse(fs.readFileSync(geometryPath, 'utf8'));
const FIT = geometry.fit;

function makeHtml(ops) {
  return `<!doctype html>
<meta charset="utf-8">
<iframe id="frame" src="${pathToFileURL(svgPath).href}" style="width:1000px;height:1000px"></iframe>
<pre id="out"></pre>
<script>
const fit = ${JSON.stringify(FIT)};
const shapes = ${JSON.stringify(geometry.shapes)};
const ops = ${JSON.stringify(ops)};
const out = document.getElementById('out');
const frame = document.getElementById('frame');
const outlineCache = new Map();
function canvasToSvg(p) {
  return { x: (p.x - fit.tx) / fit.scale, y: (p.y - fit.ty) / fit.scale };
}
function svgToCanvas(p) {
  return { x: p.x * fit.scale + fit.tx, y: p.y * fit.scale + fit.ty };
}
function localPoint(el, canvasPoint) {
  const svgPoint = canvasToSvg(canvasPoint);
  const m = el.getCTM();
  if (!m) throw new Error('missing CTM');
  const local = new DOMPoint(svgPoint.x, svgPoint.y).matrixTransform(m.inverse());
  return { point: local, svgPoint };
}
function isInside(el, canvasPoint) {
  const local = localPoint(el, canvasPoint);
  return { inside: el.isPointInFill(local.point), svgX: local.svgPoint.x, svgY: local.svgPoint.y, localX: local.point.x, localY: local.point.y };
}
function outline(el) {
  if (outlineCache.has(el.id)) return outlineCache.get(el.id);
  if (typeof el.getPointAtLength !== 'function') throw new Error('not a geometry element: ' + el.id);
  const length = el.getTotalLength();
  const count = Math.max(400, Math.ceil(length * 3));
  const m = el.getCTM();
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const p = el.getPointAtLength(length * i / count);
    const q = new DOMPoint(p.x, p.y).matrixTransform(m);
    points.push(svgToCanvas({ x: q.x, y: q.y }));
  }
  outlineCache.set(el.id, points);
  return points;
}
function margin(el, canvasPoint) {
  const result = isInside(el, canvasPoint);
  let best = Infinity;
  let nearest = null;
  for (const p of outline(el)) {
    const d = Math.hypot(p.x - canvasPoint.x, p.y - canvasPoint.y);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  return {
    inside: result.inside,
    margin: result.inside ? best : -best,
    distance: best,
    nearest,
    svgX: result.svgX,
    svgY: result.svgY,
    localX: result.localX,
    localY: result.localY
  };
}
function centreline(el, step) {
  const points = outline(el);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const axis = width >= height ? 'x' : 'y';
  const centre = shapes[el.id].canvas.centre;
  const centreCross = axis === 'x' ? centre.y : centre.x;
  const raw = [];
  const start = (axis === 'x' ? minX : minY) + step / 2;
  const end = (axis === 'x' ? maxX : maxY) - step / 2;
  for (let slice = start; slice <= end; slice += step) {
    const crossings = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const av = axis === 'x' ? a.x : a.y;
      const bv = axis === 'x' ? b.x : b.y;
      if ((av <= slice && bv >= slice) || (bv <= slice && av >= slice)) {
        if (Math.abs(bv - av) < 1e-9) continue;
        const t = (slice - av) / (bv - av);
        if (t < 0 || t > 1) continue;
        const cross = axis === 'x' ? a.y + t * (b.y - a.y) : a.x + t * (b.x - a.x);
        crossings.push(cross);
      }
    }
    crossings.sort((a, b) => a - b);
    const unique = [];
    for (const value of crossings) {
      if (unique.length === 0 || Math.abs(value - unique[unique.length - 1]) > 0.5) unique.push(value);
    }
    let bestPoint = null;
    let bestScore = -Infinity;
    for (let i = 0; i < unique.length - 1; i += 1) {
      const low = unique[i] + 4;
      const high = unique[i + 1] - 4;
      const midpoint = (unique[i] + unique[i + 1]) / 2;
      if (high < low) continue;
      for (let cross = low; cross <= high; cross += 1) {
        const candidate = axis === 'x' ? { x: slice, y: cross } : { x: cross, y: slice };
        const m = margin(el, candidate);
        if (!m.inside || m.margin < 4) continue;
        const score = m.margin - 0.02 * Math.abs(cross - midpoint) - 0.005 * Math.abs(cross - centreCross);
        if (score > bestScore) {
          bestScore = score;
          bestPoint = candidate;
        }
      }
    }
    if (bestPoint) raw.push({ x: bestPoint.x, y: bestPoint.y, axis, slice });
  }
  const smoothed = raw.map((p, i) => {
    if (i === 0 || i === raw.length - 1) return p;
    return {
      x: (raw[i - 1].x + 2 * p.x + raw[i + 1].x) / 4,
      y: (raw[i - 1].y + 2 * p.y + raw[i + 1].y) / 4,
      axis,
      slice: p.slice
    };
  });
  return smoothed.map((p, i) => {
    const m = margin(el, p);
    if (m.inside && m.margin >= 4) return { x: p.x, y: p.y, axis, slice: p.slice, inside: true, margin: m.margin };
    const rawMargin = margin(el, raw[i]);
    return { x: raw[i].x, y: raw[i].y, axis, slice: raw[i].slice, inside: rawMargin.inside, margin: rawMargin.margin };
  });
}
frame.addEventListener('load', () => {
  const doc = frame.contentDocument;
  const results = [];
  for (const op of ops) {
    const el = doc.getElementById(op.id);
    if (!el) {
      results.push({ id: op.id, error: 'missing element' });
      continue;
    }
    try {
      if (op.op === 'inside') {
        results.push({ id: op.id, kind: op.kind || '', x: op.x, y: op.y, ...isInside(el, { x: op.x, y: op.y }) });
      } else if (op.op === 'edge') {
        results.push({ id: op.id, kind: op.kind || '', x: op.x, y: op.y, ...margin(el, { x: op.x, y: op.y }) });
      } else if (op.op === 'centreline') {
        results.push({ id: op.id, axisUsed: axisOf(el), points: centreline(el, op.step || 8) });
      } else if (op.op === 'outline') {
        results.push({ id: op.id, points: outline(el) });
      } else if (op.op === 'occlusion') {
        const tops = op.points.map((p) => {
          const svgPoint = canvasToSvg(p);
          const top = doc.elementFromPoint(svgPoint.x, svgPoint.y);
          return { x: p.x, y: p.y, topId: top ? top.id || top.tagName : '' };
        });
        results.push({ id: op.id, tops });
      } else {
        results.push({ id: op.id, error: 'unknown op' });
      }
    } catch (e) {
      results.push({ id: op.id, error: String(e) });
    }
  }
  function axisOf(el) {
    const pts = outline(el);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return maxX - minX >= maxY - minY ? 'x' : 'y';
  }
  out.textContent = JSON.stringify(results);
});
</script>`;
}

export function batch(ops) {
  if (!Array.isArray(ops) || ops.length === 0) return [];
  const dir = fs.mkdtempSync('/var/tmp/opencode/inside-');
  const page = path.join(dir, 'page.html');
  const profile = path.join(dir, 'chrome');
  const dom = path.join(dir, 'dom.html');
  fs.writeFileSync(page, makeHtml(ops));
  const stdout = execFileSync('chromium', [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=10000',
    '--dump-dom',
    pathToFileURL(page).href
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, env: { ...process.env, TMPDIR: '/var/tmp/opencode' } });
  fs.writeFileSync(dom, stdout);
  const match = stdout.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!match) throw new Error('inside check output not found');
  const text = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  return JSON.parse(text);
}

export function insideMany(points) {
  return batch(points.map((p) => ({ op: 'inside', ...p })));
}

export function inside(id, x, y) {
  return batch([{ op: 'inside', id, x, y }])[0].inside;
}

export function edgeMarginMany(points) {
  return batch(points.map((p) => ({ op: 'edge', ...p })));
}

export function edgeMargin(id, x, y) {
  return batch([{ op: 'edge', id, x, y }])[0].margin;
}

export function centrelines(ids, step = 8) {
  return batch(ids.map((id) => ({ op: 'centreline', id, step })));
}

export function occlusion(id, points) {
  return batch([{ op: 'occlusion', id, points }])[0].tops;
}

export function outlines(ids) {
  return batch(ids.map((id) => ({ op: 'outline', id })));
}

export { FIT, geometry };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const chambers = ['right_atrium', 'right_ventricle', 'left_atrium', 'left_ventricle'];
  const ops = [];
  for (const id of chambers) {
    const c = geometry.shapes[id].canvas.centre;
    ops.push({ op: 'edge', id, x: c.x, y: c.y, kind: 'centre' });
  }
  for (const id of Object.keys(geometry.shapes)) {
    const b = geometry.shapes[id].canvas.bbox;
    const c = geometry.shapes[id].canvas.centre;
    ops.push({ op: 'inside', id, x: b.x + b.w + 60, y: c.y, kind: 'outside60' });
  }
  const results = batch(ops);
  for (const result of results.slice(0, chambers.length)) {
    console.log(`${result.id}\tcentre\t${result.x.toFixed(4)},${result.y.toFixed(4)}\tinside=${result.inside}\tmargin=${result.margin.toFixed(4)}`);
  }
  const centrePass = results.slice(0, chambers.length).every((r) => r.inside && r.margin > 10);
  const outsidePass = results.slice(chambers.length).every((r) => !r.inside);
  console.log(`CHAMBER_CENTRES_PASS:${centrePass ? 1 : 0}`);
  console.log(`OUTSIDE_60_PASS:${outsidePass ? 1 : 0}`);
  if (!centrePass || !outsidePass) process.exitCode = 1;
}
