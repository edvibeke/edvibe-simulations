/* Geometry verifier for the digestive tract.
   Reads the layout constants out of script.js, rebuilds the spline the sim
   draws, and measures the things a screenshot would show: bounding box,
   panel clearances, self-intersection, laterality for an anterior view,
   coil spacing, and the data tables that can silently misfire.

   usage: node tools/sims/digestive-system/digestive-system-verify.mjs [--dump geom.json] */

import fs from 'node:fs';
import path from 'node:path';
import { sim } from '../../paths.mjs';
import { parseScript } from '../../parse.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && !a.endsWith('.json'))
  || sim('digestive-system');
const dumpTo = (() => {
  const i = args.indexOf('--dump');
  return i >= 0 ? args[i + 1] : null;
})();

const g = parseScript(path.join(dir, 'script.js'));

let fails = 0, warns = 0;
const ok = (c, m, hard) => {
  if (c) console.log('  PASS  ' + m);
  else if (hard === 'warn') { warns++; console.log('  WARN  ' + m); }
  else { fails++; console.log('  FAIL  ' + m); }
  return c;
};
const head = (t) => console.log('\n' + t);
const r1 = (v) => (+v).toFixed(1);

console.log('verifying ' + path.join(dir, 'script.js'));
console.log(`canvas ${g.W}x${g.H}   design->canvas x${g.S} at (${g.OX},${g.OY})   `
  + `midline x=${g.MID}   tube ${g.TUBE_W} wide, drawn reach ${g.REACH} design `
  + `(${r1(g.gs(g.REACH) * 2)}px tip to tip)`);

/* ══════════════════ 1. bounding box ══════════════════ */
head('BOUNDING BOX  (everything drawn must be on the canvas)');
/* axis-aligned design bounds of a rotated ellipse */
const shape = (e) => {
  const cx = e.cx === undefined ? e.x : e.cx, cy = e.cy === undefined ? e.y : e.cy;
  const c = Math.abs(Math.cos(e.rot || 0)), s = Math.abs(Math.sin(e.rot || 0));
  const hx = e.rx * c + e.ry * s, hy = e.rx * s + e.ry * c;
  return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy };
};
const boxes = {
  tract: {
    x0: Math.min(...g.dx), x1: Math.max(...g.dx),
    y0: Math.min(...g.dy), y1: Math.max(...g.dy)
  },
  stomach: shape(g.STOMACH),
  liver: { x0: g.LIVER.x - g.LIVER.rx - 2, x1: g.LIVER.x + g.LIVER.lobe.x + g.LIVER.lobe.rx + 2,
    y0: g.LIVER.y - g.LIVER.ry - 2, y1: Math.max(g.LIVER.y + g.LIVER.ry, g.LIVER.lobe.y + g.LIVER.lobe.ry) + 2 },
  gallbladder: { x0: g.GALLBLADDER.x - g.GALLBLADDER.rx, x1: g.GALLBLADDER.x + g.GALLBLADDER.rx,
    y0: g.GALLBLADDER.y - g.GALLBLADDER.ry, y1: g.GALLBLADDER.y + g.GALLBLADDER.ry },
  pancreas: shape(g.PANCREAS),
  portal: { x0: Math.min(...g.PORTAL.map((p) => p[0])), x1: Math.max(...g.PORTAL.map((p) => p[0])),
    y0: Math.min(...g.PORTAL.map((p) => p[1])), y1: Math.max(...g.PORTAL.map((p) => p[1])) },
  lymph: { x0: Math.min(...g.LYMPH.map((p) => p[0])), x1: Math.max(...g.LYMPH.map((p) => p[0])),
    y0: Math.min(...g.LYMPH.map((p) => p[1])), y1: Math.max(...g.LYMPH.map((p) => p[1])) }
};
/* labels are placed at their leader's end point, text centred, 9px above */
const MARGIN = 10;
for (const [name, b] of Object.entries(boxes)) {
  const c = { x0: g.gx(b.x0), x1: g.gx(b.x1), y0: g.gy(b.y0), y1: g.gy(b.y1) };
  ok(c.x0 >= MARGIN && c.x1 <= g.W - MARGIN && c.y0 >= MARGIN && c.y1 <= g.H - MARGIN,
    name + ' box inside the canvas with ' + MARGIN + 'px to spare ('
      + r1(c.x0) + ',' + r1(c.y0) + ' .. ' + r1(c.x1) + ',' + r1(c.y1) + ')');
}
for (const l of g.LABELS) {
  const halfW = l.text.length * 11 * 0.56 / 2;
  const cx = g.gx(l.to[0]), cy = g.gy(l.to[1]) - 9;
  ok(cx - halfW >= MARGIN && cx + halfW <= g.W - MARGIN && cy - 7 >= MARGIN && cy + 7 <= g.H - MARGIN,
    'label "' + l.text + '" on the canvas (centre ' + r1(cx) + ',' + r1(cy) + ', half width ' + r1(halfW) + ')');
}
for (const l of g.VESSEL_LABELS) {
  const halfW = l.text.length * 11 * 0.56 / 2;
  const cx = g.gx(l.at[0]), cy = g.gy(l.at[1]);
  ok(cx - halfW >= MARGIN && cx + halfW <= g.W - MARGIN && cy - 7 >= MARGIN && cy + 7 <= g.H - MARGIN,
    'vessel label "' + l.text + '" on the canvas');
}

/* ══════════════════ 2. panel clearances ══════════════════ */
head('PANEL CLEARANCES');
const box = (r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
const hit = (a, b) => !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
const overlaps = (a, b) => !(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0);
const inset = (a, b) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return (w > 0 && h > 0) ? Math.min(w, h) : null;
};
const rail = box(g.RAIL), foot = box(g.FOOT);
console.log(`  legend  ${rail.x0},${rail.y0} .. ${rail.x1},${rail.y1}`);
console.log(`  footer  ${foot.x0},${foot.y0} .. ${foot.x1},${foot.y1}`);
ok(!overlaps(rail, foot), 'legend and footer do not overlap (' +
  (overlaps(rail, foot) ? 'shared by ' + inset(rail, foot) + 'px' : 'gap ' + r1(foot.y0 - rail.y1) + 'px') + ')');
ok(gapOK(rail, foot), 'legend clears the footer by at least 24px (gap ' + r1(foot.y0 - rail.y1) + 'px)');
function gapOK() { return foot.y0 - rail.y1 >= 24; }
for (const [name, b] of [['legend', rail], ['footer', foot]]) {
  ok(b.x0 >= 8 && b.y0 >= 8 && b.x1 <= g.W - 8 && b.y1 <= g.H - 8,
    name + ' panel has an 8px margin to the canvas edge (right ' + r1(g.W - b.x1)
      + 'px, bottom ' + r1(g.H - b.y1) + 'px)');
}
/* the drawing area is what is left once the panels have taken their space */
const area = {
  x0: 0, y0: 0,
  x1: g.W - (g.W - rail.x0),
  y1: g.RAIL.y + g.RAIL.h < foot.y0 ? foot.y0 : g.H
};
const inArea = (b) => b.x1 <= area.x1 && b.y1 <= area.y1;
console.log(`  drawing area ${r1(area.x1)} x ${r1(area.y1)} (left of the legend, above the footer)`);
const drawn = {};
for (const [name, b] of Object.entries(boxes)) {
  drawn[name] = { x0: g.gx(b.x0), x1: g.gx(b.x1), y0: g.gy(b.y0), y1: g.gy(b.y1) };
}
/* the tract reaches further out than the wall, because of the villi */
drawn.tract = { x0: Math.min(...g.path.map((p) => p.x)) - g.gs(g.REACH),
  x1: Math.max(...g.path.map((p) => p.x)) + g.gs(g.REACH),
  y0: Math.min(...g.path.map((p) => p.y)) - g.gs(g.REACH),
  y1: Math.max(...g.path.map((p) => p.y)) + g.gs(g.REACH) };
for (const [name, b] of Object.entries(drawn)) {
  const railGap = b.x1 <= area.x1 ? 'clear' : 'OVERLAPS by ' + r1(b.x1 - area.x1) + 'px';
  const footGap = b.y1 <= area.y1 ? 'clear' : 'OVERLAPS by ' + r1(b.y1 - area.y1) + 'px';
  ok(b.x1 <= area.x1 && b.y1 <= area.y1, name + ' clears both panels (' + railGap + ', ' + footGap + ')');
}
/* panel text has to fit inside its own panel */
const lastBase = g.FOOT.y + g.FOOTER_LAST_BASELINE;
ok(g.FOOTER_LAST_BASELINE + 10 <= g.FOOT.h, 'footer last baseline + descender fits the panel (' +
  (g.FOOTER_LAST_BASELINE + 10) + ' of ' + g.FOOT.h + ')');
ok(lastBase + 10 <= g.H - 8, 'footer text stays 8px off the canvas bottom (' + r1(lastBase + 10) + ' of ' + (g.H - 8) + ')');
ok(g.RAIL.y + g.RAIL.h + 24 <= g.FOOT.y, 'the gap between panels is a deliberate gutter, not a squeeze');

/* ══════════════════ 2. the fit ══════════════════ */
head('THE FIT');
console.log(`  panels leave ${g.AREA.x},${g.AREA.y} .. ${r1(g.AREA.x + g.AREA.w)},${r1(g.AREA.y + g.AREA.h)}`);
console.log(`  figure  ${g.FIGURE.x},${g.FIGURE.y} .. ${r1(g.FIGURE.x + g.FIGURE.w)},${r1(g.FIGURE.y + g.FIGURE.h)}`);
const fitS = Math.min(g.AREA.w / g.FIGURE.w, g.AREA.h / g.FIGURE.h);
ok(Math.abs(g.S - fitS) < 1e-9, 'the scale is the largest that fits the figure in the area left by the panels (' +
  r1(g.S) + ' vs ' + r1(fitS) + ')');
const midArea = { x: g.AREA.x + g.AREA.w / 2, y: g.AREA.y + g.AREA.h / 2 };
const midFig = { x: g.FIGURE.x + g.FIGURE.w / 2, y: g.FIGURE.y + g.FIGURE.h / 2 };
ok(Math.abs(g.gx(midFig.x) - midArea.x) < 1e-6 && Math.abs(g.gy(midFig.y) - midArea.y) < 1e-6,
  'the figure lands in the middle of that area (' + r1(g.gx(midFig.x)) + ',' + r1(g.gy(midFig.y)) +
    ' vs ' + r1(midArea.x) + ',' + r1(midArea.y) + ')');
/* a figure that does not hold its own anatomy is not a fit, it is a hope */
const spread = (list) => [...list];
const figBox = {
  x0: Math.min(...spread(g.anchors.map((a) => a[0])), ...spread(g.LABELS.flatMap((l) => [l.at[0], l.to[0]]))),
  x1: Math.max(...spread(g.anchors.map((a) => a[0])), ...spread(g.LABELS.flatMap((l) => [l.at[0], l.to[0]]))),
  y0: Math.min(...spread(g.anchors.map((a) => a[1])), ...spread(g.LABELS.flatMap((l) => [l.at[1], l.to[1]]))),
  y1: Math.max(...spread(g.anchors.map((a) => a[1])), ...spread(g.LABELS.flatMap((l) => [l.at[1], l.to[1]])))
};
ok(figBox.x0 >= g.FIGURE.x && figBox.x1 <= g.FIGURE.x + g.FIGURE.w &&
   figBox.y0 >= g.FIGURE.y && figBox.y1 <= g.FIGURE.y + g.FIGURE.h,
  'every anchor and label sits inside the declared figure box (' + figBox.x0 + ',' + figBox.y0 +
    ' .. ' + figBox.x1 + ',' + figBox.y1 + ')');

/* ══════════════════ 3. self-intersection ══════════════════ */
head('SELF-INTERSECTION');
const LAYERS = [
  { name: 'upper tract', s0: 0, s1: g.ARC.flexure },
  { name: 'colon frame', s0: g.ARC.caecum, s1: g.TUBE_END },
  { name: 'small intestine', s0: g.ARC.flexure, s1: g.ARC.caecum }
];
const layerOf = (s) => LAYERS.findIndex((L) => s >= L.s0 && s <= L.s1);
/* Proper segment intersection. The strict `sign(a) !== sign(b)` form misses a
   crossing that happens to land on a sample vertex, which the spline grid
   produces whenever two tidy numbers coincide — and two centrelines that
   touch at a point are still two centrelines that cross. */
const crosses = (a, b, c, d) => {
  const EPS = 1e-9;
  const cr = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const straddles = (u, v) => (u > EPS && v < -EPS) || (u < -EPS && v > EPS);
  const d1 = cr(a, b, c), d2 = cr(a, b, d), d3 = cr(c, d, a), d4 = cr(c, d, b);
  if (straddles(d1, d2) && straddles(d3, d4)) return true;
  const on = (p, q, r) => Math.abs(cr(p, q, r)) < EPS &&
    r.x >= Math.min(p.x, q.x) - EPS && r.x <= Math.max(p.x, q.x) + EPS &&
    r.y >= Math.min(p.y, q.y) - EPS && r.y <= Math.max(p.y, q.y) + EPS;
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
};
/* every pair of non-adjacent segments, once: `break` here would have skipped
   the whole tail of the inner loop, since arclength only grows with j */
const crossings = [];
for (let i = 0; i < g.path.length - 1; i++) {
  for (let j = i + 1; j < g.path.length - 1; j++) {
    if (g.cum[j] - g.cum[i] < 40) continue;
    if (crosses(g.path[i], g.path[i + 1], g.path[j], g.path[j + 1])) crossings.push([i, j]);
  }
}
const same = [], mixed = [];
for (const [i, j] of crossings) {
  const la = layerOf(g.cum[i]), lb = layerOf(g.cum[j]);
  (la === lb ? same : mixed).push(LAYERS[la].name + ' x ' + LAYERS[lb].name +
    ' at s=' + r1(g.cum[i]) + '/' + r1(g.cum[j]));
}
ok(same.length === 0, 'no layer crosses itself' + (same.length ? ': ' + same.slice(0, 6).join(', ') : ''));
ok(mixed.every((r) => /upper tract x colon frame|colon frame x small intestine/.test(r)),
  'every crossing is between neighbouring depth layers, never a jump' +
    (mixed.length ? ': ' + mixed.join(', ') : ''));
ok(mixed.length <= 2, 'at most two crossings in the whole tract (' + mixed.length + ')');
console.log('  ' + crossings.length + ' crossing(s): ' + (mixed.join(', ') || 'none'));

/* the crossing has to be the one the layering is there for: the descending
   duodenum passing behind the transverse colon, once, and nowhere else */
const duodenal = crossings.filter(([i, j]) =>
  g.cum[i] < g.ARC.hepatic && g.cum[j] > g.ARC.hepatic);
ok(duodenal.length === 1, 'the duodenum passes behind the transverse colon in exactly one place (' +
  duodenal.length + ')');
if (duodenal.length === 1) {
  const [i, j] = duodenal[0];
  /* a crossing has to look like a crossing: the two centrelines have to
     meet at an angle and then get away from each other again. Two curves
     that meet at a few degrees read as one tube, not as one passing behind
     the other, however they are layered. */
  const tan = (k) => {
    const a = g.path[Math.max(0, k - 1)], b = g.path[Math.min(g.path.length - 1, k + 1)];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  let dAng = Math.abs(tan(i) - tan(j));
  if (dAng > Math.PI / 2) dAng = Math.PI - dAng;
  ok(dAng * 180 / Math.PI > 25, 'the two structures cross at an angle, not head-on (' +
    r1(dAng * 180 / Math.PI) + ' degrees)');
  const at = { x: g.dx[i], y: g.dy[i] };
  ok(Math.abs(at.y - g.LANDMARK.transverse.y) < 90,
    'and it crosses level with the transverse colon, not somewhere else (' + JSON.stringify(at) + ')');
  const frame = g.dx.map((x, k) => (g.cum[k] >= g.ARC.caecum ? { x, y: g.dy[k] } : null)).filter(Boolean);
  for (const off of [-80, -40, 40, 80]) {
    const s = Math.min(Math.max(g.cum[i] + off, 0), g.TUBE_END);
    const k = g.iAt(s);
    let d = Infinity;
    for (const q of frame) d = Math.min(d, Math.hypot(q.x - g.dx[k], q.y - g.dy[k]));
    ok(d > g.TUBE_W, 'the duodenum is ' + r1(d) + ' design from the colon frame ' +
      Math.abs(off) + 'px along, clear of the ' + g.TUBE_W + 'px it needs');
  }
}
const sorted = [...LAYERS].sort((a, b) => a.s0 - b.s0);
ok(sorted[0].s0 === 0 && Math.abs(sorted[sorted.length - 1].s1 - g.TUBE_END) < 0.5
  && sorted.every((L, i) => i === 0 || Math.abs(L.s0 - sorted[i - 1].s1) < 0.5),
  'the depth layers tile the tract from 0 to the anus with no gaps or overlaps');

/* a doubled-back leg reads on screen as a hairpin, whatever the anchors say */
let hairpin = null;
for (let s0 = 0; s0 < g.TUBE_END; s0 += 0.5) {
  for (let s1 = s0 + 24; s1 < Math.min(g.TUBE_END, s0 + 240); s1 += 0.5) {
    const a = g.at(s0), b = g.at(s1), d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < g.gs(6) && (!hairpin || s1 - s0 < hairpin.arc))
      hairpin = { s0, s1, d, arc: s1 - s0 };
  }
}
ok(!hairpin, 'no doubled-back tube legs (no zero-width hairpin)' + (hairpin
  ? ': s=' + r1(hairpin.s0) + ' and ' + r1(hairpin.s1) + ' are ' + r1(hairpin.d) +
    'px apart after ' + r1(hairpin.arc) + 'px of path' : ''));
/* and the caecum, the one blind pouch, has to be a pouch rather than a corner.
   It is the first anchor of the colon frame, which is where the colon layer
   starts, so it needs no coordinates of its own. */
const cIdx = g.TRACK.upper.length + g.TRACK.small.length;
const pouch = g.anchors.slice(Math.max(0, cIdx - 3), cIdx + 3);
console.log('  caecum anchors ' + JSON.stringify(pouch));
ok(cIdx > 0 && cIdx < g.anchors.length - 3, 'caecum is on the tract');
const before = g.anchors[cIdx - 1], after = g.anchors[cIdx + 1];
const turn = Math.hypot(before[0] - after[0], before[1] - after[1]);
ok(turn > g.TUBE_W, 'caecum turns through more than a tube width, so it reads as a pouch not a corner (' +
  r1(turn) + ' design across the turn, tube ' + g.TUBE_W + ')');

/* two stretches of the same layer must not merge into one blob */
let merged = null;
for (let i = 0; i < g.path.length; i++) {
  for (let j = i + 1; j < g.path.length; j++) {
    if (g.cum[j] - g.cum[i] < 90) continue;
    if (layerOf(g.cum[i]) !== layerOf(g.cum[j])) continue;
    const d = Math.hypot(g.dx[i] - g.dx[j], g.dy[i] - g.dy[j]);
    if (d < g.TUBE_W + 4 && (!merged || d < merged.d))
      merged = { d, i, j, gap: g.cum[j] - g.cum[i] };
  }
}
ok(!merged, 'no two stretches of the same layer merge into one blob' + (merged
  ? ': design (' + g.dx[merged.i] + ',' + g.dy[merged.i] + ') and (' + g.dx[merged.j] + ',' + g.dy[merged.j] +
    ') are ' + r1(merged.d) + ' design apart after ' + r1(merged.gap) + 'px of path, need ' + (g.TUBE_W + 4)
  : ''));

/* ══════════════════ 4. laterality ══════════════════
   Anterior view: the viewer looks at the front of the body, so the
   patient's left is on the viewer's right. Design x above MID is the
   patient's LEFT. */
head('LATERALITY  (anterior view: design x > ' + g.MID + ' = patient LEFT = viewer RIGHT)');
const MID = g.MID;
const side = (x) => x < MID ? 'patient RIGHT' : 'patient LEFT';
ok(g.LIVER.x < MID, 'liver is on the patient RIGHT (x=' + g.LIVER.x + ', ' + side(g.LIVER.x) + ')');
ok(g.STOMACH.cx > MID, 'stomach is on the patient LEFT (x=' + g.STOMACH.cx + ', ' + side(g.STOMACH.cx) + ')');
ok(g.DUODENUM.x < MID, 'duodenum is on the patient RIGHT (x=' + g.DUODENUM.x + ')');
ok(g.GALLBLADDER.x < MID && g.GALLBLADDER.x > g.LIVER.x - g.LIVER.rx - 40
  && g.GALLBLADDER.x < g.LIVER.x + g.LIVER.rx,
  'gallbladder tucks under the right lobe of the liver (x=' + g.GALLBLADDER.x + ')');
ok(g.GALLBLADDER.y > g.LIVER.y + g.LIVER.ry - 20, 'gallbladder hangs below the liver (' +
  g.GALLBLADDER.y + ' vs ' + (g.LIVER.y + g.LIVER.ry) + ')');
ok(g.PANCREAS.x - g.PANCREAS.rx < MID - 20, 'pancreatic head reaches the patient RIGHT (head x=' +
  (g.PANCREAS.x - g.PANCREAS.rx) + ')');
ok(g.PANCREAS.x + g.PANCREAS.rx > MID + 40, 'pancreatic tail reaches the patient LEFT (tail x=' +
  (g.PANCREAS.x + g.PANCREAS.rx) + ')');
ok(g.PANCREAS.x + g.PANCREAS.rx < g.STOMACH.cx + 30, 'pancreas does not run past the stomach (tail ' +
  (g.PANCREAS.x + g.PANCREAS.rx) + ' vs stomach ' + g.STOMACH.cx + ')');
ok(Math.hypot(g.PANCREAS.x - g.PANCREAS.rx - g.PANCREATIC_HEAD.x,
  g.PANCREAS.y - g.PANCREATIC_HEAD.y) < 45,
  'pancreatic head sits in the duodenal curve');
ok(g.PANCREAS.y > g.STOMACH.cy + 20, 'pancreas lies below the stomach (' + g.PANCREAS.y + ' vs ' +
  g.STOMACH.cy + ')');
/* every stretch is asked for by the landmark that bounds it, never by
   coordinates typed in here, so the checks cannot drift from the drawing */
const L = g.LANDMARK;
const nearL = (name) => g.near(L[name].x, L[name].y);
const hepatic = nearL('hepatic'), splenic = nearL('splenic');
const iCaecum = g.iAt(g.ARC.caecum), iHepatic = g.iAt(g.ARC.hepatic);
const iSplenic = g.iAt(g.ARC.splenic), iRectum = g.iAt(g.ARC.rectum);
const ascendingX = Math.min(...g.dx.slice(iCaecum, iHepatic + 1));
const descendingX = Math.max(...g.dx.slice(iSplenic, iRectum + 1));
ok(ascendingX < MID, 'ascending colon is on the patient RIGHT (x=' + ascendingX + ')');
ok(descendingX > MID, 'descending colon is on the patient LEFT (x=' + descendingX + ')');
ok(hepatic.x >= g.LIVER.x - g.LIVER.rx - 20 && hepatic.x <= g.LIVER.x + g.LIVER.rx * 0.6,
  'hepatic flexure sits under the right lobe of the liver (x=' + hepatic.x + ')');
ok(splenic.x > MID + 200, 'splenic flexure is out on the patient LEFT flank (x=' + splenic.x + ')');
ok(descendingX > g.STOMACH.cx && g.at(g.ARC.descending).y > g.STOMACH.cy,
  'descending colon runs down the patient LEFT flank, outside and below the stomach (colon x=' +
    descendingX + ' vs stomach centre x=' + g.STOMACH.cx + ')');
const colonTop = Math.min(...g.dy.slice(iCaecum, iSplenic + 1));
ok(splenic.y <= colonTop + 2, 'splenic flexure is the high point of the colon (' + splenic.y +
  ' vs hepatic side ' + colonTop + ')');
const last = g.anchors[g.anchors.length - 1];
ok(Math.abs(last[0] - MID) < 120, 'rectum finishes back near the midline (x=' + last[0] + ')');
ok(g.dx[0] > MID - 80 && g.dx[0] < MID + 40, 'mouth starts near the midline (x=' + g.dx[0] + ')');

/* ══════════════════ 5. accessory organs ══════════════════ */
head('ACCESSORY ORGANS');
const inEllipse = (p, e, pad = 0) =>
  ((p[0] - e.x) / (e.rx + pad)) ** 2 + ((p[1] - e.y) / (e.ry + pad)) ** 2 <= 1;
const portalEnd = g.PORTAL[g.PORTAL.length - 1];
ok(inEllipse(portalEnd, g.LIVER) || inEllipse(portalEnd, g.LIVER.lobe),
  'portal vein ends inside the liver (ends at ' + JSON.stringify(portalEnd) + ')');
ok(Math.abs(g.PORTAL[0][0] - g.PANCREATIC_HEAD.x) < 100 &&
  Math.abs(g.PORTAL[0][1] - g.PANCREATIC_HEAD.y) < 40,
  'portal vein starts at the pancreatic head, as the drawing says');
ok(Math.abs(g.PORTAL[0][1] - g.DUODENUM.y) < 60, 'portal vein starts below the duodenum');
ok(Math.abs(g.PANCREAS.y - g.LIVER.y) > 40, 'pancreas is clear of the liver');
ok(g.LIVER.y - g.LIVER.ry > 20, 'liver clears the top of the drawing area');
ok(g.PANCREAS.x + g.PANCREAS.rx < MID + 120, 'pancreatic tail stays in the abdomen');
ok(g.LYMPH[g.LYMPH.length - 1][0] > MID && g.LYMPH[g.LYMPH.length - 1][1] < g.STOMACH.cy,
  'lymph duct finishes up on the patient LEFT, above the stomach');
/* fat leaves for the lymph, sugar and amino acids for the portal vein */
ok(g.LYMPH[0][0] > MID, 'lymph duct starts on the patient LEFT flank (x=' + g.LYMPH[0][0] + ')');

/* ══════════════════ 6. coiled bowel ══════════════════ */
head('COILED BOWEL');
const rows = [];
for (const a of g.TRACK.small) {
  if (rows.length && Math.abs(a[1] - rows[rows.length - 1].y) <= 12) {
    const r = rows[rows.length - 1];
    r.x0 = Math.min(r.x0, a[0]); r.x1 = Math.max(r.x1, a[0]);
  } else rows.push({ y: a[1], x0: a[0], x1: a[0] });
}
rows.forEach((r, i) => {
  r.run = r.x1 - r.x0 >= 150;
  console.log('  row ' + i + ': design y=' + r.y + '  x ' + r.x0 + '..' + r.x1 +
    '  canvas y=' + r1(g.gy(r.y)) + (r.run ? '' : '   (turn, not a run)'));
});
const runs = rows.filter((r) => r.run);
ok(runs.length >= 3, 'the small intestine is drawn as at least three sweeps (' + runs.length + ')');
for (let i = 0; i < rows.length - 1; i++) {
  if (!rows[i].run || !rows[i + 1].run) continue;
  const gap = rows[i + 1].y - rows[i].y;
  const clear = (gap - g.REACH * 2) * g.S;
  ok(clear > 4, 'rows ' + i + '-' + (i + 1) + ' clear each other by more than 4px (gap ' + gap +
    ' design = ' + r1(clear) + 'px between villus tips)');
}
const coilL = Math.min(...g.TRACK.small.map((a) => a[0]));
const coilR = Math.max(...g.TRACK.small.map((a) => a[0]));
ok(coilL - ascendingX > g.REACH * 2 + 4, 'coils clear the ascending colon (gap ' + (coilL - ascendingX) +
  ' design, need ' + (g.REACH * 2 + 4) + ')');
ok(descendingX - coilR > g.REACH * 2 + 4, 'coils clear the descending colon (gap ' + (descendingX - coilR) +
  ' design, need ' + (g.REACH * 2 + 4) + ')');
const transverseY = nearL('transverse').y;
ok(rows[0].y - transverseY > g.REACH * 2 + 4, 'first sweep clears the sagging transverse colon (gap ' +
  (rows[0].y - transverseY) + ' design = ' + r1((rows[0].y - transverseY - g.REACH * 2) * g.S) + 'px)');
/* ══════════════════ 7. tables that can silently misfire ══════════════════ */
head('DATA TABLES');
const known = new Set(g.arcNames);
for (const sec of g.SECRETIONS) {
  ok(known.has(sec.arc), "secretion '" + sec.name + "' is keyed to a real landmark ('" + sec.arc + "'" +
    (known.has(sec.arc) ? '' : ' — a missing key makes it fire on the first frame') + ')');
  ok(g.ARC[sec.arc] > 0, "secretion '" + sec.name + "' fires at arclength " + r1(g.ARC[sec.arc]) + ', not 0');
}
const fires = g.SECRETIONS.map((s) => g.ARC[s.arc]);
ok(fires.every((v, i) => i === 0 || v > fires[i - 1]), 'secretions fire in anatomical order, one per organ: ' +
  g.SECRETIONS.map((s) => s.arc + '@' + r1(g.ARC[s.arc])).join(' '));
ok(g.SECRETIONS.every((s) => s.ml > 0), 'every secretion carries a volume');

const organs = ['mouth', 'oesophagus', 'stomach', 'duodenum', 'ileum', 'colon', 'rectum'];
ok(Object.keys(g.ORGAN_ENZYME).length === organs.length,
  'the enzyme table covers all ' + organs.length + ' organs the readout can name (has ' +
  Object.keys(g.ORGAN_ENZYME).length + ')');
for (const o of organs) ok(!!g.ORGAN_ENZYME[o], "organ '" + o + "' names its enzyme");

/* every label the drawing paints has a leader that starts on the thing it names */
head('LABELS');
const labBoxes = [];
for (const l of g.LABELS) {
  const halfW = l.text.length * 11 * 0.56 / 2;
  const b = { t: l.text, x0: g.gx(l.to[0]) - halfW, x1: g.gx(l.to[0]) + halfW,
    y0: g.gy(l.to[1]) - 9 - 7, y1: g.gy(l.to[1]) - 9 + 7 };
  labBoxes.push(b);
  let worst = Infinity, worstS = 0;
  for (let i = 0; i < g.path.length; i++) {
    const px = g.path[i].x, py = g.path[i].y;
    const d = Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1));
    /* villi only exist between the pylorus and the caecum */
    const reach = (g.cum[i] > g.ARC.pylorus && g.cum[i] < g.ARC.caecum) ? g.gs(g.REACH) : g.gs(g.TUBE_W / 2);
    const c = d - reach;
    if (c < worst) { worst = c; worstS = g.cum[i]; }
  }
  ok(worst > 4, 'label "' + l.text + '" clears the tract by ' + r1(worst) + 'px (nearest s=' + r1(worstS) + ')');
  ok(b.x1 < g.RAIL.x - 6 && b.y1 < g.FOOT.y - 6,
    'label "' + l.text + '" clears both panels (right ' + r1(b.x1) + ' vs ' + (g.RAIL.x - 6) +
    ', bottom ' + r1(b.y1) + ' vs ' + (g.FOOT.y - 6) + ')');
}
for (let i = 0; i < labBoxes.length; i++)
  for (let j = i + 1; j < labBoxes.length; j++) {
    const a = labBoxes[i], b = labBoxes[j];
    ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0,
      'labels "' + a.t + '" and "' + b.t + '" do not collide');
  }
for (const l of g.VESSEL_LABELS) {
  const halfW = l.text.length * 11 * 0.56 / 2;
  const b = { t: l.text, x0: g.gx(l.at[0]) - halfW, x1: g.gx(l.at[0]) + halfW,
    y0: g.gy(l.at[1]) - 7, y1: g.gy(l.at[1]) + 7 };
  labBoxes.push(b);
  let worst = Infinity;
  for (let i = 0; i < g.path.length; i++) {
    const px = g.path[i].x, py = g.path[i].y;
    const reach = (g.cum[i] > g.ARC.pylorus && g.cum[i] < g.ARC.caecum) ? g.gs(g.REACH) : g.gs(g.TUBE_W / 2);
    const d = Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1)) - reach;
    if (d < worst) worst = d;
  }
  ok(worst > 4, 'vessel label "' + l.text + '" clears the tract by ' + r1(worst) + 'px');
  ok(b.x1 < g.RAIL.x - 6 && b.y1 < g.FOOT.y - 6, 'vessel label "' + l.text + '" clears both panels');
}
for (let i = 0; i < labBoxes.length; i++)
  for (let j = i + 1; j < labBoxes.length; j++) {
    const a = labBoxes[i], b = labBoxes[j];
    ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0,
      'vessel labels clear the anatomy labels: "' + a.t + '" / "' + b.t + '"');
  }

/* ══════════════════ summary ══════════════════ */
console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all geometry checks passed')
  + (warns ? ', ' + warns + ' warning(s)' : ''));

if (dumpTo) {
  fs.writeFileSync(dumpTo, JSON.stringify({
    W: g.W, H: g.H, S: g.S, OX: g.OX, OY: g.OY, MID: g.MID,
    RAIL: g.RAIL, FOOT: g.FOOT, TUBE_W: g.TUBE_W, REACH: g.REACH,
    VILLUS_INNER: g.VILLUS_INNER, VILLUS_OUTER: g.VILLUS_OUTER,
    LIVER: g.LIVER, GALLBLADDER: g.GALLBLADDER, PANCREAS: g.PANCREAS, STOMACH: g.STOMACH,
    DUODENUM: g.DUODENUM, PANCREATIC_HEAD: g.PANCREATIC_HEAD,
    PORTAL: g.PORTAL, LYMPH: g.LYMPH, TRACK: g.TRACK, ARC: g.ARC,
    SECRETIONS: g.SECRETIONS, ORGAN_ENZYME: g.ORGAN_ENZYME, LABELS: g.LABELS
  }, null, 1));
  console.log('wrote ' + dumpTo);
}
process.exit(fails ? 1 : 0);