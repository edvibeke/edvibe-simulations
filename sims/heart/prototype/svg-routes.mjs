import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  batch,
  centrelines,
  edgeMarginMany,
  occlusion,
  outlines,
  geometry,
  FIT
} from './svg-inside-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const simRoot = path.resolve(here, '..');
const svgPath = path.join(simRoot, 'art', 'heart-anatomy.svg');
const shapeIds = Object.keys(geometry.shapes);
const valveIds = shapeIds.filter((id) => id.includes('valve'));
const centreIds = shapeIds.filter((id) => !valveIds.includes(id));

function point(x, y, shape, role, extra = {}) {
  return { x, y, shape, role, ...extra };
}

function orient(points, reverse = false) {
  return reverse ? [...points].reverse() : [...points];
}

function join(...groups) {
  const result = [];
  for (const group of groups) {
    for (const p of group) {
      const last = result[result.length - 1];
      if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.001 && last.shape === p.shape && !last.hidden && !p.hidden && !last.offart && !p.offart) continue;
      result.push(p);
    }
  }
  return result;
}

function svgPoint(p) {
  return { x: (p.x - FIT.tx) / FIT.scale, y: (p.y - FIT.ty) / FIT.scale };
}

function splitVeil(id, points) {
  const tops = occlusion(id, points.map((p) => ({ x: p.x, y: p.y })));
  const visible = tops.map((t) => t.topId === id);
  const firstHidden = visible.findIndex((v) => !v);
  let lastHidden = -1;
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    if (!visible[i]) {
      lastHidden = i;
      break;
    }
  }
  const before = points.slice(0, firstHidden);
  const after = points.slice(lastHidden + 1);
  const hiddenStart = before[before.length - 1];
  const hiddenEnd = after[0];
  const hidden = [
    point(hiddenStart.x, hiddenStart.y, id, 'hidden', { hidden: true }),
    point(hiddenEnd.x, hiddenEnd.y, id, 'hidden', { hidden: true })
  ];
  return { before, hidden, after, blockerIds: [...new Set(tops.slice(firstHidden, lastHidden + 1).map((t) => t.topId))] };
}

function densify(points, step = 8) {
  const result = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    result.push(a);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const hidden = Boolean(a.hidden && b.hidden);
    const offart = Boolean(a.offart || b.offart);
    if (hidden || offart) continue;
    const connector = a.shape !== b.shape || a.role === 'valve-waypoint' || b.role === 'valve-waypoint';
    if (!connector && distance <= step) continue;
    const count = Math.max(1, Math.ceil(distance / step));
    for (let j = 1; j < count; j += 1) {
      const t = j / count;
      result.push(point(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        b.shape || a.shape,
        'sample',
        { kind: 'drawn', connector, interpolated: !connector }
      ));
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function buildRoutes() {
  const lines = centrelines(centreIds, 8);
  const centre = Object.fromEntries(lines.map((line) => [
    line.id,
    line.points.filter((p) => p.inside && p.margin >= 4).map((p) => point(p.x, p.y, line.id, 'centreline', { margin: p.margin, axis: p.axis, slice: p.slice }))
  ]));
  const valveSeeds = {
    tricuspid_valve_1: [232.55, 316.85],
    tricuspid_valve_2: [271.33, 259.91],
    mitral_valve_1: [351.93, 217.26],
    mitral_valve_2: [395.85, 202.30],
    pulmonary_valve_1: [282.11, 258.71],
    pulmonary_valve_2: [304.61, 257.49],
    aortic_valve_1: [331.35, 251.80],
    aortic_valve_2: [346.43, 228.13]
  };
  const valveChecks = edgeMarginMany(valveIds.map((id) => ({
    id,
    x: valveSeeds[id][0],
    y: valveSeeds[id][1],
    kind: 'valve-seed'
  })));
  const valvePoints = Object.fromEntries(valveChecks.map((r) => [
    r.id,
    point(r.x, r.y, r.id, 'valve-waypoint', { margin: r.margin, inside: r.inside })
  ]));

  const pv1 = splitVeil('pulmonary_vein_1', centre.pulmonary_vein_1);
  const pv2 = splitVeil('pulmonary_vein_2', centre.pulmonary_vein_2);

  const aorticValve = [
    valvePoints.aortic_valve_1,
    valvePoints.aortic_valve_2
  ];
  const aorticLoop = [
    ...centre.left_ventricle.slice(0, 5),
    ...aorticValve,
    ...centre.aorta.slice(-5)
  ];
  const mitralToAorta = [
    valvePoints.mitral_valve_2,
    valvePoints.mitral_valve_1,
    ...aorticLoop,
    point(315.3, 600, null, 'offart', { offart: true })
  ];

  const routes = [
    {
      name: 'blue-ivc-pa1',
      color: '#1166d6',
      points: densify(join(
        [point(20, 440, null, 'offart', { offart: true })],
        orient(centre.inferior_vena_cava, true),
        orient(centre.right_atrium.slice(11, 18), true),
        [valvePoints.tricuspid_valve_2, valvePoints.tricuspid_valve_1],
        centre.right_ventricle.slice(2, 8),
        [valvePoints.pulmonary_valve_2, valvePoints.pulmonary_valve_1],
        centre.pulmonary_artery_1,
        [point(980, 126.3, null, 'offart', { offart: true })]
      ))
    },
    {
      name: 'blue-svc-ra',
      color: '#1166d6',
      points: densify(join(
        [point(20, 52.3, null, 'offart', { offart: true })],
        centre.superior_vena_cava,
        centre.right_atrium.slice(0, 12)
      ))
    },
    {
      name: 'blue-rv-pa2',
      color: '#1166d6',
      points: densify(join(
        centre.right_ventricle.slice(2, 8),
        [valvePoints.pulmonary_valve_2, valvePoints.pulmonary_valve_1],
        orient(centre.pulmonary_artery_2, true),
        [point(20, 120.9, null, 'offart', { offart: true })]
      ))
    },
    {
      name: 'red-pv1-aorta',
      color: '#d62828',
      points: densify(join(
        [point(20, 150.8, null, 'offart', { offart: true })],
        pv1.before,
        pv1.hidden,
        pv1.after,
        orient(centre.left_atrium.slice(7, 11), true),
        mitralToAorta
      ))
    },
    {
      name: 'red-pv2-aorta',
      color: '#d62828',
      points: densify(join(
        [point(20, 181.7, null, 'offart', { offart: true })],
        pv2.before,
        pv2.hidden,
        pv2.after,
        orient(centre.left_atrium.slice(7, 11), true),
        mitralToAorta
      ))
    }
  ];
  for (const route of routes) {
    route.shapes = [...new Set(route.points.map((p) => p.shape).filter(Boolean))];
  }
  return { routes, hidden: { pulmonary_vein_1: pv1, pulmonary_vein_2: pv2 }, valvePoints };
}

function candidateShapes(a, b, extra = []) {
  return [...new Set([a.shape, b.shape, ...extra].filter(Boolean))];
}

function evaluateRoute(route) {
  const points = route.points;
  const jobs = [];
  const items = [];
  const addItem = (p, candidates, source, index) => {
    const unique = [...new Set(candidates.filter(Boolean))];
    const first = jobs.length;
    for (const shape of unique) jobs.push({ op: 'edge', id: shape, x: p.x, y: p.y });
    items.push({ p, candidates: unique, first, source, index });
  };
  points.forEach((p, index) => {
    if (p.hidden || p.offart || p.connector || p.interpolated) return;
    const prev = points[index - 1] || p;
    const next = points[index + 1] || p;
    const candidates = [p.shape, prev.shape, next.shape];
    addItem(p, candidates, 'point', index);
  });
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a.hidden && b.hidden || a.offart || b.offart || a.connector || b.connector || a.interpolated || b.interpolated) continue;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.max(1, Math.floor(distance / 4));
    for (let j = 1; j < count; j += 1) {
      const t = j / count;
      addItem(point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, null, 'sample'), candidateShapes(a, b, route.shapes), 'sample', i);
    }
  }
  const results = batch(jobs);
  const failures = [];
  let insideCount = 0;
  let total = 0;
  let minMargin = Infinity;
  let minSource = '';
  for (const item of items) {
    if (item.p.role === 'valve-waypoint') continue;
    let best = null;
    for (let i = 0; i < item.candidates.length; i += 1) {
      const r = results[item.first + i];
      if (r && r.inside && r.margin >= 4 && (!best || r.margin > best.margin)) best = r;
    }
    total += 1;
    if (best) {
      insideCount += 1;
      item.p.assignedShape = best.id;
      item.p.inside = true;
      item.p.margin = best.margin;
      if (best.margin < minMargin) {
        minMargin = best.margin;
        minSource = item.source;
      }
    } else {
      item.p.assignedShape = '';
      item.p.inside = false;
      item.p.margin = -Infinity;
      if (failures.length < 20) failures.push({ x: item.p.x, y: item.p.y, source: item.source, candidates: item.candidates });
    }
  }
  const gaps = [];
  const straights = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const hidden = Boolean(a.hidden && b.hidden);
    const offart = Boolean(a.offart || b.offart);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!hidden && !offart) {
      gaps.push(d);
      straights.push(d);
    }
  }
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const longestStraight = straights.length ? Math.max(...straights) : 0;
  const fraction = total ? insideCount / total : 0;
  const pass = maxGap <= 40 && longestStraight <= 60 && fraction === 1 && minMargin >= 4;
  return {
    points: points.length,
    maxGap,
    longestStraight,
    fraction,
    sampled: total,
    insideSamples: insideCount,
    connectors: points.filter((p) => p.connector).length,
    interpolated: points.filter((p) => p.interpolated).length,
    minMargin,
    minSource,
    failures,
    pass
  };
}

function shiftRoute(route, dx) {
  return {
    name: route.name + '-shifted-' + dx,
    color: route.color,
    shapes: route.shapes,
    points: route.points.map((p) => ({ ...p, x: p.x + dx }))
  };
}

function render(routes, outlinesById, kinds) {
  const svgUrl = pathToFileURL(svgPath).href;
  const extents = FIT.extents;
  const crop = {
    x: extents.x - 24,
    y: extents.y - 24,
    w: extents.w + 48,
    h: extents.h + 48
  };
  const imgX = FIT.tx - geometry.visibleUnion.x * FIT.scale;
  const imgY = FIT.ty - geometry.visibleUnion.y * FIT.scale;
  const imgW = geometry.root.width * FIT.scale;
  const imgH = geometry.root.height * FIT.scale;

  function renderOne(name, selected, fileName) {
    const dir = fs.mkdtempSync('/var/tmp/opencode/routes-render-');
    const page = path.join(dir, 'page.html');
    const profile = path.join(dir, 'chrome');
    const html = `<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}canvas{display:block;width:${crop.w * 2}px;height:${crop.h * 2}px}</style>
<canvas id="c" width="${crop.w * 2}" height="${crop.h * 2}"></canvas>
<script>
const crop = ${JSON.stringify(crop)};
const routes = ${JSON.stringify(selected)};
const outlinesById = ${JSON.stringify(outlinesById)};
const svgUrl = ${JSON.stringify(svgUrl)};
const img = { x: ${imgX}, y: ${imgY}, w: ${imgW}, h: ${imgH} };
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.setTransform(2, 0, 0, 2, -crop.x * 2, -crop.y * 2);
ctx.fillStyle = '#fff';
ctx.fillRect(crop.x, crop.y, crop.w, crop.h);
const art = new Image();
art.onload = () => {
  ctx.drawImage(art, img.x, img.y, img.w, img.h);
  for (const [id, points] of Object.entries(outlinesById)) {
    if (!points.length) continue;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(20,20,20,0.38)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    const b = ${JSON.stringify(geometry.shapes)}[id].canvas.bbox;
    const labelX = Math.max(crop.x + 2, b.x - 2);
    const labelY = Math.max(crop.y + 7, b.y - 3);
    ctx.font = '7px sans-serif';
    const textWidth = ctx.measureText(id).width;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(labelX - 1, labelY - 6, textWidth + 2, 8);
    ctx.fillStyle = '#222';
    ctx.fillText(id, labelX, labelY);
  }
  for (const route of routes) {
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const a = route.points[i];
      const b = route.points[i + 1];
      const hidden = Boolean(a.hidden && b.hidden);
      const offart = Boolean(a.offart || b.offart);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (hidden) {
        ctx.strokeStyle = 'rgba(90,90,90,0.75)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 4.4;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = route.color;
        ctx.lineWidth = offart ? 1.8 : 3.2;
        ctx.setLineDash(offart ? [5, 3] : []);
      }
      ctx.stroke();
      ctx.restore();
    }
    for (const p of route.points) {
      if (p.hidden || p.offart || p.role === 'sample' && !p.margin) continue;
      const good = Boolean(p.inside === true && p.margin >= 4);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = good ? '#00a651' : '#e11d1d';
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.restore();
    }
  }
};
art.onerror = () => {
  ctx.fillStyle = '#111';
  ctx.font = '16px sans-serif';
  ctx.fillText('SVG load failed', crop.x + 10, crop.y + 20);
};
art.src = svgUrl;
</script>`;
    fs.writeFileSync(page, html);
    const output = path.join(here, fileName);
    execFileSync('chromium', [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
      '--hide-scrollbars',
      `--user-data-dir=${profile}`,
      `--window-size=${Math.ceil(crop.w * 2)},${Math.ceil(crop.h * 2)}`,
      '--virtual-time-budget=10000',
      `--screenshot=${output}`,
      pathToFileURL(page).href
    ], { stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, TMPDIR: '/var/tmp/opencode' } });
    console.log(`PNG:${name}\t${fileName}\t${Math.ceil(crop.w * 2)}x${Math.ceil(crop.h * 2)}\t${fs.statSync(output).size}`);
  }

  renderOne('blue', routes.filter((r) => r.color === '#1166d6'), 'blue-routes.png');
  renderOne('red', routes.filter((r) => r.color === '#d62828'), 'red-routes.png');
  renderOne('combined', routes, 'tracks-overlay.png');
}

export { buildRoutes, evaluateRoute, shiftRoute, svgPoint };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const built = buildRoutes();
  console.log('CENTRELINE_STEP:8');
  console.log('VALVE_WAYPOINT_MARGINS');
  for (const id of valveIds) {
    const p = built.valvePoints[id];
    console.log(`${id}\t${p.x.toFixed(2)},${p.y.toFixed(2)}\tinside=${p.inside}\tmargin=${p.margin.toFixed(2)}`);
  }
  console.log('HIDDEN_SEGMENTS');
  for (const [id, split] of Object.entries(built.hidden)) {
    const a = split.hidden[0];
    const b = split.hidden[1];
    const as = svgPoint(a);
    const bs = svgPoint(b);
    console.log(`${id}\tcanvas ${a.x.toFixed(2)},${a.y.toFixed(2)} -> ${b.x.toFixed(2)},${b.y.toFixed(2)}\tsvg ${as.x.toFixed(2)},${as.y.toFixed(2)} -> ${bs.x.toFixed(2)},${bs.y.toFixed(2)}\tblockers=${split.blockerIds.join(',')}`);
  }
  console.log('HIDDEN_OPTION_1: dot fades out at the visible edge and fades in at the atrium');
  console.log('HIDDEN_OPTION_2: viewer-left veins carry no dots');
  console.log('AORTA_ARCH_BRANCHES:not used; only the aorta body centreline and descending stub are used');

  for (const route of built.routes) {
    const m = evaluateRoute(route);
    console.log(`RULES\t${route.name}\tpoints=${m.points}\tconnectors=${m.connectors}\tinterpolated=${m.interpolated}\tmaxGap=${m.maxGap.toFixed(2)}\tlongest=${m.longestStraight.toFixed(2)}\tinside4px=${m.insideSamples}/${m.sampled}\tfraction=${(m.fraction * 100).toFixed(2)}%\tminMargin=${m.minMargin.toFixed(2)}\t${m.pass ? 'PASS' : 'FAIL'}`);
    if (process.env.DEBUG_ROUTES && m.failures.length) {
      for (const f of m.failures) console.log(`FAILPOINT\t${route.name}\t${f.source}\t${f.x.toFixed(2)},${f.y.toFixed(2)}\t${f.candidates.join(',')}`);
    }
  }

  const shifted = built.routes.map((r) => shiftRoute(r, 15));
  fs.writeFileSync('/tmp/opencode/heart-shifted-routes.json', JSON.stringify(shifted.map((r) => ({ name: r.name, points: r.points })), null, 2));
  let mutationPasses = 0;
  for (const route of shifted) {
    const m = evaluateRoute(route);
    if (m.pass) mutationPasses += 1;
    console.log(`MUTATION\t${route.name}\tx+15\tpoints=${m.points}\tmaxGap=${m.maxGap.toFixed(2)}\tlongest=${m.longestStraight.toFixed(2)}\tfraction=${(m.fraction * 100).toFixed(2)}%\tminMargin=${m.minMargin.toFixed(2)}\t${m.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`MUTATION_PASSES:${mutationPasses}`);

  const outlinesById = Object.fromEntries(outlines(shapeIds).map((o) => [o.id, o.points]));
  render(built.routes, outlinesById, ['blue', 'red', 'combined']);
}
