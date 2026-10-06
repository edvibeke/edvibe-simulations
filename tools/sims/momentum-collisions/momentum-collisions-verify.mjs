/* Static checks for sims/momentum-collisions.

   Parses the layout block, the panel rows and the preset table back out of
   script.js (so the checker cannot drift from the drawing code) and the slider
   bounds out of index.html, then asserts the geometry holds at the extremes
   of every control, that the collision conserves momentum across every
   reachable combination of the sliders, and that each preset's caption claims
   match what the physics actually does. */

import { sim } from '../../paths.mjs';
import fs from 'node:fs';

const DIR = sim('momentum-collisions');
const src = fs.readFileSync(DIR + '/script.js', 'utf8');
const html = fs.readFileSync(DIR + '/index.html', 'utf8');

const canvasW = +html.match(/<canvas id="stage" width="(\d+)"/)[1];
const canvasH = +html.match(/height="(\d+)"/)[1];

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
};

function block(startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0 || b <= a) throw new Error('cannot slice ' + startMark);
  return src.slice(a, b);
}

const L = new Function(block('/* ── Layout', '/* ── Presets') + `
  return { SCENE, PANEL, PAD, FLOOR_Y, PX_PER_M, TRACK_M, CENTRE_X, CART_H,
           CART_MIN_W, CART_MAX_W, CART_W_REF, GAP, START_X, BUFFER_H, V_EPS,
           SAY_V, CONTACT_S, CONTACT_T, ARROW_SPAN, ARROW_MIN, LANE_GAP, ROW };`)();

const P = new Function(block('/* ── Presets', '/* ── DOM') + `
  return { PRESETS, DEFAULT_PRESET };`)();

/* Sliders, straight from the markup. The markup spells them out in full
   (massA, speedA); script.js keys them short, so map once here. */
const HTML_ID = { massA: 'mA', massB: 'mB', speedA: 'vA', speedB: 'vB', bounce: 'e' };
const sliders = {};
for (const m of html.matchAll(/<input type="range" id="(\w+)" class="ev-slider"\s*\n?\s*min="([\d.]+)" max="([\d.]+)" step="([\d.]+)" value="([\d.]+)">/g)) {
  sliders[HTML_ID[m[1]]] = { min: +m[2], max: +m[3], step: +m[4], value: +m[5], id: m[1] };
}

/* ── Physics, mirroring script.js ───────────────────── */

const p = (m, v) => m * v;
const ke = (m, v) => 0.5 * m * v * v;

/* The same closed form script.js uses, with restitution e. */
function solve(mA, vA, mB, vB, e) {
  const r = vA - vB;
  return {
    a: (mA * vA + mB * vB - mB * e * r) / (mA + mB),
    b: (mA * vA + mB * vB + mA * e * r) / (mA + mB)
  };
}

function energyRatio(mA, vA, mB, vB, e) {
  const out = solve(mA, vA, mB, vB, e);
  const eIn = ke(mA, vA) + ke(mB, vB);
  return eIn > 0 ? (ke(mA, out.a) + ke(mB, out.b)) / eIn : 1;
}

/* The width law, re-derived from the coefficients script.js declares. */
const cartWidth = m => {
  const w = L.CART_MIN_W + (L.CART_MAX_W - L.CART_MIN_W) * Math.sqrt(Math.max(0, m) / L.CART_W_REF);
  return Math.max(L.CART_MIN_W, Math.min(L.CART_MAX_W, w));
};
/* Half a cart's length, in metres: this is what the contact test compares. */
const halfW = m => cartWidth(m) / 2 / L.PX_PER_M;
const heaviest = sliders.mA.max;

/* ── Canvas and block layout ────────────────────────── */

check('canvas matches the block layout',
  canvasW === L.SCENE.x + L.SCENE.w + 12 + L.PANEL.w + L.SCENE.x
  && canvasH === L.SCENE.y + L.SCENE.h + L.SCENE.y,
  canvasW + 'x' + canvasH + ' vs '
  + (L.SCENE.x + L.SCENE.w + 12 + L.PANEL.w + L.SCENE.x) + 'x' + (L.SCENE.y + L.SCENE.h + L.SCENE.y));

check('the two blocks exactly fill the canvas width',
  L.SCENE.x + L.SCENE.w === L.PANEL.x - 12,
  (L.SCENE.x + L.SCENE.w) + ' vs ' + (L.PANEL.x - 12));

check('both blocks are the same height',
  L.SCENE.h === L.PANEL.h, L.SCENE.h + ' / ' + L.PANEL.h);

check('the panels sit inside the canvas',
  L.PANEL.x + L.PANEL.w <= canvasW && L.PANEL.y + L.PANEL.h <= canvasH,
  'panel right ' + (L.PANEL.x + L.PANEL.w) + ' of ' + canvasW);

/* ── The track ──────────────────────────────────────── */

check('the whole track fits the scene at both ends',
  L.CENTRE_X - L.TRACK_M * L.PX_PER_M >= L.SCENE.x + L.PAD
  && L.CENTRE_X + L.TRACK_M * L.PX_PER_M <= L.SCENE.x + L.SCENE.w - L.PAD,
  'track spans ' + (L.CENTRE_X - L.TRACK_M * L.PX_PER_M).toFixed(1) + ' to '
  + (L.CENTRE_X + L.TRACK_M * L.PX_PER_M).toFixed(1)
  + ', scene ' + (L.SCENE.x + L.PAD) + ' to ' + (L.SCENE.x + L.SCENE.w - L.PAD));

check('the centre of the track is the centre of the scene',
  Math.abs(L.CENTRE_X - (L.SCENE.x + L.SCENE.w / 2)) < 0.01);

check('metre ticks are further apart than their labels',
  L.PX_PER_M * 3 > 16, (L.PX_PER_M * 3) + 'px between labels');

/* ── Carts ──────────────────────────────────────────── */

check('the track is wide enough for the two heaviest carts touching',
  2 * halfW(sliders.mA.max) < 2 * L.TRACK_M,
  'they need ' + (2 * halfW(sliders.mA.max)).toFixed(2) + 'm of ' + (2 * L.TRACK_M) + 'm');

check('the two heaviest carts start clear of each other',
  2 * L.START_X - 2 * halfW(sliders.mA.max) > L.GAP / L.PX_PER_M,
  ((2 * L.START_X - 2 * halfW(sliders.mA.max))).toFixed(2) + 'm apart at the start');

check('a parked cart stays inside the track',
  halfW(sliders.mA.max) < L.TRACK_M,
  'half-width ' + halfW(sliders.mA.max).toFixed(2) + 'm of ' + L.TRACK_M + 'm');

check('a parked cart stays inside the scene',
  (L.TRACK_M + halfW(sliders.mA.max)) * L.PX_PER_M <= L.SCENE.w / 2 - L.PAD,
  'outer edge at ' + ((L.TRACK_M + halfW(sliders.mA.max)) * L.PX_PER_M).toFixed(1)
  + 'px of ' + (L.SCENE.w / 2 - L.PAD) + 'px');

check('a cart starts inside its own parking limit, so it never jumps at launch',
  L.START_X <= L.TRACK_M - halfW(sliders.mA.max),
  'starts at ' + L.START_X + 'm, limit ' + (L.TRACK_M - halfW(sliders.mA.max)).toFixed(2) + 'm');

check('the stops are drawn where the carts park',
  /const x0 = CENTRE_X - TRACK_M \* PX_PER_M;/.test(src)
    && /for \(const edge of \[x0, x1\]\)/.test(src)
    && /roundRect\(edge - 7, FLOOR_Y - BUFFER_H/.test(src));

check('the stops are taller than the carts, so they read as solid',
  L.BUFFER_H > L.CART_H + 10, L.BUFFER_H + ' vs ' + L.CART_H);

check('the stop label clears the floor hatching',
  L.FLOOR_Y + 38 < L.SCENE.y + L.SCENE.h - 6, 'label at y ' + (L.FLOOR_Y + 38)
  + ', scene ends at ' + (L.SCENE.y + L.SCENE.h));

check('a heavier cart is drawn longer',
  cartWidth(120) > cartWidth(20) && cartWidth(20) > cartWidth(1),
  [1, 20, 120].map(m => m + 'kg=' + cartWidth(m).toFixed(0)).join(' '));

check('cart width is clamped at both ends',
  cartWidth(0) === L.CART_MIN_W && cartWidth(10000) === L.CART_MAX_W,
  L.CART_MIN_W + '..' + L.CART_MAX_W);

check('the narrowest cart the sliders allow is still a cart',
  cartWidth(sliders.mA.min) > L.CART_MIN_W
    && cartWidth(sliders.mA.min) >= L.CART_H - 14,
  sliders.mA.min + ' kg = ' + cartWidth(sliders.mA.min).toFixed(1) + 'x' + L.CART_H + 'px');

check('the heaviest slider value reaches the top of the width range',
  cartWidth(heaviest) === L.CART_MAX_W, heaviest + ' kg = ' + cartWidth(heaviest) + 'px');

check('the tallest cart is the widest one, so mass never reads as height',
  cartWidth(heaviest) > cartWidth(sliders.mA.min) && L.CART_H === L.CART_H,
  'smallest ' + cartWidth(sliders.mA.min) + 'x' + L.CART_H
  + ', largest ' + cartWidth(heaviest) + 'x' + L.CART_H);

check('the carts sit on the track, not through it',
  L.FLOOR_Y - L.CART_H > L.SCENE.y + 40, 'cart top at y ' + (L.FLOOR_Y - L.CART_H));

/* ── Arrows ─────────────────────────────────────────── */

check('the velocity arrow stays inside the scene at top speed',
  L.ARROW_SPAN + L.ARROW_MIN <= L.SCENE.w / 2,
  'reach ' + (L.ARROW_SPAN + L.ARROW_MIN) + 'px of ' + (L.SCENE.w / 2) + 'px');

check('the fastest slider speed uses the whole arrow',
  sliders.vA.max / 20 * L.ARROW_SPAN === L.ARROW_SPAN,
  sliders.vA.max + ' m/s → ' + L.ARROW_SPAN + 'px');

check('the velocity arrow clears the top of the carts',
  L.LANE_GAP + 16 + L.CART_H / 2 < L.SCENE.h,
  'arrow at y ' + (L.FLOOR_Y - L.CART_H / 2 - 16 - L.LANE_GAP).toFixed(0));

check('the impact label has room above it',
  L.FLOOR_Y - L.CART_H - 40 > L.SCENE.y + 30,
  'label at y ' + (L.FLOOR_Y - L.CART_H - 48));

/* ── Sliders ────────────────────────────────────────── */

check('all five sliders are present', Object.keys(sliders).length === 5,
  Object.keys(sliders).join(','));

check('bounciness spans nothing to perfectly elastic',
  sliders.e.min === 0 && sliders.e.max === 1);

check('the defaults match the default preset',
  ['mA', 'mB', 'vA', 'vB', 'e'].every(k => sliders[k].value === P.PRESETS[P.DEFAULT_PRESET][k]),
  Object.entries(sliders).map(([k, v]) => k + '=' + v.value).join(' '));

check('every preset sits inside its slider bounds',
  Object.entries(P.PRESETS).every(([name, p2]) =>
    ['mA', 'mB', 'vA', 'vB', 'e'].every(k =>
      p2[k] >= sliders[k].min && p2[k] <= sliders[k].max)),
  Object.entries(P.PRESETS).map(([n, p2]) => n).join(','));

check('there is one preset button per preset',
  (html.match(/data-preset="/g) || []).length === Object.keys(P.PRESETS).length,
  Object.keys(P.PRESETS).length + ' presets');

check('no preset starts both carts stationary',
  Object.values(P.PRESETS).every(p2 => p2.vA > 0 || p2.vB > 0));

check('every preset actually closes on a collision',
  Object.values(P.PRESETS).every(p2 => p2.vA + p2.vB > 0));

check('every preset starts within its track',
  Object.values(P.PRESETS).every(p2 =>
    L.START_X + halfW(p2.mA) < L.TRACK_M && L.START_X + halfW(p2.mB) < L.TRACK_M));

/* ── Momentum and energy, across the whole slider space ── */

const MASSES = [1, 7, 20, 60, 120];
const SPEEDS = [0, 0.5, 4, 20];
const REST = [0, 0.05, 0.5, 1];

let worstDrift = 0, worstGain = 0, cases = 0;
const gains = [];

for (const mA of MASSES) for (const mB of MASSES) {
  for (const vA of SPEEDS) for (const vB of SPEEDS) {
    if (vA + vB <= 0) continue;                    /* not a closing setup */
    for (const e of REST) {
      cases++;
      const before = p(mA, vA) - p(mB, vB);
      const out = solve(mA, vA, mB, -vB, e);
      const after = p(mA, out.a) + p(mB, out.b);
      worstDrift = Math.max(worstDrift, Math.abs(after - before) / Math.max(1, Math.abs(before)));
      const eIn = ke(mA, vA) + ke(mB, vB);
      const eOut = ke(mA, out.a) + ke(mB, out.b);
      worstGain = Math.max(worstGain, (eOut - eIn) / eIn);
      if (e > 0 && eIn > 0 && eOut / eIn < 1 - 1e-9) gains.push([mA, mB, vA, vB, e]);
    }
  }
}

check('momentum survives every reachable collision', worstDrift < 1e-12,
  worstDrift.toExponential(1) + ' worst relative drift over ' + cases + ' setups');

check('no collision ever invents kinetic energy', worstGain <= 1e-12,
  worstGain.toExponential(1) + ' worst gain');

/* Only e = 1 gives all of it back. Any smaller e keeps a strictly smaller
   share, and equal masses keep exactly (1 + e²)/2 — worth pinning down, since
   it is the whole point of the bounciness slider. */
const notAll = [];
for (const mA of MASSES) for (const mB of MASSES) {
  for (const vA of SPEEDS) for (const vB of SPEEDS) {
    if (vA + vB <= 0) continue;
    if (energyRatio(mA, vA, mB, -vB, 1) < 1 - 1e-12) notAll.push([mA, mB, vA, vB]);
  }
}
check('a fully springy collision always returns every joule', notAll.length === 0,
  notAll.slice(0, 3).map(g => g.join('/')).join(' ') || 'all closing setups keep it');

const bouncy = [];
for (const mA of MASSES) for (const mB of MASSES) {
  for (const vA of SPEEDS) for (const vB of SPEEDS) {
    if (vA + vB <= 0) continue;
    const r = energyRatio(mA, vA, mB, -vB, 0.6);
    if (r >= 1 - 1e-12) bouncy.push([mA, mB, vA, vB, r]);
  }
}
check('a partly springy collision always loses something', bouncy.length === 0,
  bouncy.slice(0, 3).map(g => g.join('/')).join(' ') || 'e = 0.6 loses in every case');

check('equal masses keep exactly (1 + e²)/2 of the energy',
  [[0, 0.5], [0.5, 0.625], [0.95, 0.95125], [1, 1]].every(([e, want]) =>
    Math.abs(energyRatio(20, 8, 20, 0, e) - want) < 1e-12),
  [0, 0.5, 0.95, 1].map(e => e + ' → ' + energyRatio(20, 8, 20, 0, e).toFixed(5)).join(' '));

check('more bounciness never returns less energy',
  MASSES.every(mA => MASSES.every(mB => SPEEDS.every(vA => {
    const rs = [0, 0.2, 0.4, 0.6, 0.8, 1].map(e => energyRatio(mA, vA, mB, 0, e));
    return rs.every((r, i) => i === 0 || r >= rs[i - 1] - 1e-12);
  }))), 'swept ' + (MASSES.length * MASSES.length * SPEEDS.length) + ' setups');

check('a dead-stop collision keeps exactly the reduced-mass share',
  Math.abs(energyRatio(20, 8, 30, 0, 0) - 20 / 50) < 1e-12,
  (energyRatio(20, 8, 30, 0, 0) * 100).toFixed(1) + '%');

check('a stuck pair moves at the combined momentum over the combined mass',
  Math.abs(solve(20, 8, 30, 0, 0).a - (20 * 8) / 50) < 1e-12,
  solve(20, 8, 30, 0, 0).a.toFixed(3) + ' m/s');

check('the lighter cart cannot be thrown backwards by a heavier one',
  MASSES.every(mA => MASSES.every(mB => {
    if (mA <= mB) return true;
    return solve(mA, 20, mB, 0, 1).b > 0;
  })), 'checked ' + (MASSES.length ** 2) + ' mass pairs');

/* ── Claims made in the captions, checked ───────────── */

const out = (key) => {
  const p2 = P.PRESETS[key];
  return solve(p2.mA, p2.vA, p2.mB, -p2.vB, p2.e);
};

const truck = out('truck-bike');
check('the truck caption quotes the real speed of the bicycle',
  Math.abs(Math.abs(truck.b) - 10.4) < 0.05, Math.abs(truck.b).toFixed(2) + ' m/s');
check('the truck caption quotes the real speed of the truck',
  Math.abs(Math.abs(truck.a) - 4.7) < 0.05, Math.abs(truck.a).toFixed(2) + ' m/s');
check('the truck caption says the bike leaves faster than the truck arrived',
  Math.abs(truck.b) > truck.a && /thrown/.test(P.PRESETS['truck-bike'].caption),
  Math.abs(truck.b).toFixed(1) + ' vs ' + Math.abs(truck.a).toFixed(1));
check('the truck caption admits losing a little energy',
  energyRatio(P.PRESETS['truck-bike'].mA, 6, 15, 0, 0.95) < 0.995
    && /percent of the energy/.test(P.PRESETS['truck-bike'].caption),
  (energyRatio(120, 6, 15, 0, 0.95) * 100).toFixed(2) + '% kept');

const cue = out('cue-ball');
check('the cue ball caption is right that the striker nearly stops',
  Math.abs(cue.a) < 0.5 * 5 && /nearly stops/.test(P.PRESETS['cue-ball'].caption),
  cue.a.toFixed(2) + ' m/s from 5');
check('the cue ball caption is right about the 0.4 m/s it quotes',
  Math.abs(cue.a - 0.4) < 0.05, cue.a.toFixed(2) + ' m/s');
check('the cue ball hands on nearly all its speed',
  Math.abs(cue.b - 5) < 0.6, cue.b.toFixed(2) + ' m/s');

const clay = P.PRESETS['clay-block'];
const clayOut = out('clay-block');
const clayJoined = (clay.mA * clayOut.a + clay.mB * clayOut.b) / (clay.mA + clay.mB);
check('the clay caption is right that they lock together at 3.2 m/s',
  Math.abs(clayJoined - 3.2) < 0.05 && /lock together/.test(clay.caption),
  clayJoined.toFixed(3) + ' m/s');
check('the clay caption is right that three fifths of the energy is gone',
  Math.abs(energyRatio(clay.mA, clay.vA, clay.mB, clay.vB, clay.e) - 0.4) < 1e-12
    && /three fifths/.test(clay.caption),
  Math.round(energyRatio(clay.mA, clay.vA, clay.mB, clay.vB, clay.e) * 100) + '% kept');

const equal = P.PRESETS['equal-carts'];
const equalOut = out('equal-carts');
check('the equal carts really do swap speeds',
  Math.abs(equalOut.a) < 1e-9 && Math.abs(equalOut.b - equal.vA) < 1e-9,
  'left ' + equalOut.a.toFixed(3) + ', right ' + equalOut.b.toFixed(3));
check('the equal cart caption is right about the 8 m/s it quotes',
  /8 m\/s/.test(equal.caption) && Math.abs(equalOut.b - 8) < 1e-9);

check('every caption is a sentence, not a fragment',
  Object.entries(P.PRESETS).every(([n, p2]) => p2.caption.endsWith('.')),
  Object.entries(P.PRESETS).map(([n]) => n).join(','));

/* ── Panel layout ───────────────────────────────────── */

const rows = [L.ROW.pA, L.ROW.pB, L.ROW.eIn, L.ROW.eOut];

check('the panel rows are top to bottom and do not overlap',
  rows.every((r, i) => i === 0 || r - rows[i - 1] >= 50), rows.join(', '));

check('the panel heading clears the first row',
  L.ROW.heading < rows[0] - 20, L.ROW.heading + ' vs ' + (rows[0] - 20));

check('the divider sits between the momentum and energy rows',
  L.ROW.divider > rows[1] + 25 && L.ROW.divider < rows[2] - 20,
  L.ROW.divider + ' between ' + (rows[1] + 25) + ' and ' + (rows[2] - 20));

check('the force row clears the last bar',
  L.ROW.force > rows[3] + 37, L.ROW.force + ' vs ' + (rows[3] + 37));

check('the verdict box clears the force row',
  L.ROW.verdictT > L.ROW.force + 16, L.ROW.verdictT + ' vs ' + (L.ROW.force + 16));

check('the caption starts below the verdict box',
  L.ROW.caption > L.ROW.verdictT + 36, L.ROW.caption + ' vs ' + (L.ROW.verdictT + 36));

/* The caption is the longest text on the panel; at 15px lines it must not
   spill out of the bottom. */
const panelBottom = L.PANEL.y + L.PANEL.h - L.PAD;
const panelW = L.PANEL.w - L.PAD * 2;
const captionRows = countWrapped(P.PRESETS['clay-block'].caption);
check('the longest caption fits the panel',
  L.ROW.caption + (captionRows - 1) * 15 <= panelBottom,
  captionRows + ' lines, ends at y ' + (L.ROW.caption + (captionRows - 1) * 15)
  + ', panel ends at ' + panelBottom);

check('every caption fits the panel, not just the longest',
  Object.entries(P.PRESETS).every(([, p2]) =>
    L.ROW.caption + (countWrapped(p2.caption) - 1) * 15 <= panelBottom),
  Object.entries(P.PRESETS)
    .map(([n, p2]) => n + '=' + countWrapped(p2.caption)).join(' '));

check('the fallback caption fits too',
  L.ROW.caption + (countWrapped('Your own setup. Momentum is each mass times its '
    + 'velocity, and the two add to the same total before and after. Bounciness '
    + 'decides whether the kinetic energy comes back too.') - 1) * 15 <= panelBottom);

/* 12px sans averages about 6.1px a character; close enough to catch overflow. */
function countWrapped(text, maxW = panelW) {
  let line = '', row = 1;
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (next.length * 6.1 > maxW && line) { row++; line = word; }
    else line = next;
  }
  return row;
}

/* ── Contact force ──────────────────────────────────── */

check('the quoted force is an impulse over the contact time',
  /const impulse = Math\.abs\(state\.mA \* \(out\.a - preA\)\);/.test(src)
    && /state\.contactForce = impulse \/ CONTACT_T;/.test(src),
  L.CONTACT_T + ' s');

check('the contact time is short enough to be an impact',
  L.CONTACT_T > 0 && L.CONTACT_T < 0.1, L.CONTACT_T + ' s');

check('the contact arrows stay up long enough to be seen',
  L.CONTACT_S > 0.2 && L.CONTACT_S < 1, L.CONTACT_S + ' s');

check('both contact arrows use one shared length, so they are equal by construction',
  block('function drawContact()', '/* ── The arithmetic panel')
    .match(/const len = [^;]+;/g).length === 1
  && /for \(const dir of \[-1, 1\]\)/.test(src));

/* ── Reduced motion ─────────────────────────────────── */

check('reduced motion is resolved in one step rather than left frozen',
  /if \(EV\.reducedMotion\(\)\) resolveInstantly\(\);/.test(src));

check('the instant resolve advances in fixed slices and then holds',
  /const INSTANT_STEP = 1 \/ 240;/.test(src)
    && /for \(let i = 0; i < 4000 && !state\.collided; i\+\+\)/.test(src)
    && /contactTimer = CONTACT_S;/.test(src));

check('reduced motion starts no animation loop at all',
  /function startLoop\(\) \{\s*\n\s*if \(EV\.reducedMotion\(\) \|\| rafId !== null\) return;/.test(src));

check('the instant resolve shares the one model step with the live loop',
  /function stepModel\(dt\)/.test(src) && /stepModel\(INSTANT_STEP\)/.test(src)
    && /stepModel\(dt\)/.test(src));

/* ── Wiring and accessibility ───────────────────────── */

check('the loop is driven by the shared clock, not a raw timestamp',
  /EV\.delta\(now, lastTime\)/.test(src));

check('the sim registers an onPaint so a resize cannot blank it',
  /stage\.onPaint = /.test(src));

check('reset is wired through the shared helper', /EV\.onReset\(reset\)/.test(src));

check('the readouts are not a live region, and events go through EV.say',
  (html.match(/role="status"/g) || []).length === 0 && /EV\.say\(/.test(src));

check('the canvas is an image with a description',
  /<canvas id="stage"[^>]*role="img"/.test(html)
  && (html.match(/aria-label="[^"]{120,}"/) || []).length >= 1,
  (html.match(/aria-label="([^"]{0,40})/) || [])[1] + '...');

check('the canvas carries no tabindex of its own',
  !/<canvas[^>]*tabindex/.test(html));

check('the page offers a skip link and a help panel',
  /class="ev-skip"/.test(html) && /id="help"/.test(html) && /id="insight"/.test(html));

check('every readout has a label and a value',
  (html.match(/ev-readout__value(?![-])/g) || []).length
    === (html.match(/ev-readout__label/g) || []).length,
  (html.match(/ev-readout__label/g) || []).length + ' readouts');

const written = (block('function syncReadout()', 'function verdict()').match(/\w+Value\.textContent/g) || [])
  .map(t => t.replace('.textContent', ''));
check('syncReadout writes exactly the six readouts the markup declares',
  written.length === 6 && new Set(written).size === 6
    && written.every(id => html.includes('id="' + id + '"')),
  written.join(', '));

check('the help panel explains the model, not just the buttons',
  /momentum is mass times velocity/i.test(html) && /Newton's third law/.test(html));

check('the help panel states the contact time used for the force',
  /contact time of 0\.02 s/.test(html));

check('the insight panel takes a specific case, not a platitude',
  /brick dropped from a height/.test(html));

check('the scripts are loaded in the house order',
  /edvibe-sim\.css[\s\S]*edvibe-sim\.js[\s\S]*lucide\.min\.js[\s\S]*script\.js/.test(html));

check('the units are named in the markup',
  (html.match(/kg&middot;m\/s/g) || []).length >= 2 && /m\/s/.test(html));

check('every slider has a label bound to it',
  Object.values(sliders).every(s2 => html.includes('for="' + s2.id + '"')));

check('every slider value badge is bound to its slider',
  Object.values(sliders).every(s2 => html.includes('id="' + s2.id + 'Value"')));

/* ── Regression guards ──────────────────────────────── */

check('a slider tweak stops claiming a preset caption that no longer applies',
  /state\.preset = null;/.test(src) && /state\.preset && PRESETS\[state\.preset\]/.test(src));

check('changing a number restarts the run rather than corrupting a collision',
  /clearRun\(\);\s*\n\s*launched = false;/.test(src));

check('a locked pair cannot pull apart, because they are solved as one body',
  /if \(state\.collided && state\.stuck\) \{/.test(src)
    && /const v = \(state\.mA \* state\.vA \+ state\.mB \* state\.vB\) \/ \(state\.mA \+ state\.mB\);/.test(src));

check('only a closing pair can collide, so they cannot collide twice',
  /!state\.collided && closingSpeed\(\) > 0 && inContact\(\)/.test(src));

check('the carts are separated along the line they closed on, not the new one',
  /const dir = Math\.sign\(state\.xB - state\.xA\) \|\| 1;/.test(src));

check('the nudge pushes them apart, not into each other',
  /const overlap = halfWidthA\(\) \+ halfWidthB\(\) - Math\.abs\(state\.xA - state\.xB\);/.test(src)
    && src.indexOf('const dir = Math.sign(state.xB - state.xA)')
      < src.indexOf('state.xA = clampTrack(state.xA - dir * overlap / 2);'));

check('carts park by their own length, so a heavy cart never hangs off the end',
  /const limit = TRACK_M - half;/.test(src)
    && /const half = which === 'A' \? halfWidthA\(\) : halfWidthB\(\);/.test(src));

/* A locked pair is one body: if the two were parked on their own limits they
   would be pulled apart at the stop, so the pair has to be clamped together. */
const parkBody = block('function park()', 'function announceMotion()');
check('a locked pair is parked as one body, not as two carts',
  /if \(state\.collided && state\.stuck\) \{/.test(parkBody)
    && /const half = halfWidthA\(\) \+ halfWidthB\(\);/.test(parkBody)
    && /state\.xA = held - half \/ 2;\s*\n\s*state\.xB = held \+ half \/ 2;/.test(parkBody));

check('a locked pair only stops once it actually reaches a stop',
  /if \(mid > limit \|\| mid < -limit\) \{/.test(parkBody)
    && parkBody.indexOf('if (mid > limit || mid < -limit)') < parkBody.indexOf('state.vA = 0;'));

check('the pair is held together before it is moved, not after',
  src.indexOf('const mid = (state.xA + state.xB) / 2;') < src.indexOf('state.xA += state.vA * dt;'));

check('a locked pair is exactly as long as the two carts put side by side',
  Math.abs(2 * (halfW(20) + halfW(30)) - (cartWidth(20) + cartWidth(30)) / L.PX_PER_M) < 1e-12,
  'a 20 kg and a 30 kg cart are ' + ((cartWidth(20) + cartWidth(30)) / L.PX_PER_M).toFixed(2) + 'm together');

check('the contact test uses half-widths, so the carts meet nose to nose',
  /function halfWidth\(m\) \{ return cartWidth\(m\) \/ 2 \/ PX_PER_M; \}/.test(src)
    && /Math\.abs\(state\.xA - state\.xB\) <= halfWidthA\(\) \+ halfWidthB\(\) \+ GAP \/ PX_PER_M/.test(src));

check('the overlap nudge at contact uses those same half-widths',
  /const overlap = halfWidthA\(\) \+ halfWidthB\(\) - Math\.abs\(state\.xA - state\.xB\);/.test(src));

/* The first frame after the loop starts can hand back a timestamp older than
   the performance.now() the loop was primed with. A negative step would fling
   the carts across the track before the learner had pressed Launch. */
const stepBody = block('function stepModel(dt)', 'function resolveOverlap()');
check('nothing on the track moves until Launch',
  /function stepModel\(dt\) \{\s*\n\s*if \(!launched \|\| dt <= 0\) return;/.test(stepBody));

check('the run is stepped once per frame, from the one model step',
  /stepModel\(dt\);\s*\n\s*render\(\);/.test(src)
    && !/announceMotion\(\);\s*\n\s*render\(\);/.test(src));

check('the motion announcement is part of the step, so it cannot fire at rest',
  stepBody.indexOf('announceMotion();') > stepBody.indexOf('resolveOverlap();'));

/* The impact message already says where each cart is going, so the motion
   announcement must not replace it a frame later. */
const collideBody = block('function collide()', '/* Two carts on one track');
const resolveOverlap = block('function resolveOverlap()', '/* How far a cart');
check('the impact message is not talked over by the motion announcement',
  /wasMovingA = Math\.abs\(state\.vA\) >= SAY_V;\s*\n\s*wasMovingB = Math\.abs\(state\.vB\) >= SAY_V;/.test(collideBody));

/* Each cart stops with its own nose at the end of the track, so a cart that is
   still driving can arrive at a stop where another one is already standing. */
check('carts that reach the same stop are held apart, not left overlapping',
  /function resolveOverlap\(\)/.test(src)
    && /state\.xA = clampTrack\(state\.xA - dir \* slideA\);\s*\n\s*state\.xB = clampTrack\(state\.xB \+ dir \* slideB\);/.test(src));

check('a pair still nose to nose after a collision comes to rest',
  /state\.xA = clampTrack\(state\.xA - dir \* slideA\);\s*\n\s*state\.xB = clampTrack\(state\.xB \+ dir \* slideB\);\s*\n\s*state\.vA = 0;\s*\n\s*state\.vB = 0;/.test(src));

check('the slide room each cart has is its own parking limit, not half the track',
  /const roomA = dir > 0 \? state\.xA \+ limitFor\('A'\) : limitFor\('A'\) - state\.xA;/.test(src)
    && /function limitFor\(which\) \{\s*\n\s*return TRACK_M - \(which === 'A' \? halfWidthA\(\) : halfWidthB\(\)\);/.test(src));

check('a cart held up at a stop keeps the same gap a collision leaves',
  /const need = halfWidthA\(\) \+ halfWidthB\(\) \+ GAP \/ PX_PER_M;/.test(src));

/* Two carts that have just traded speeds are touching for a frame while they
   move apart. Treating that as a block would stop the cart that is supposed to
   be running away from the collision. */
check('a pair that is parting company is not treated as blocked',
  /if \(Math\.abs\(apart\) > need\) return;/.test(src)
    && /if \(closingSpeed\(\) <= 0\) return;/.test(src));

/* A blocked cart that is left moving would drive into its neighbour for ever,
   because the settling test watches the speeds and would never let go. */
check('a blocked pair stops, so the run can settle',
  /state\.xA = clampTrack\(state\.xA - dir \* slideA\);[\s\S]*?state\.xB = clampTrack\(state\.xB \+ dir \* slideB\);\s*\n\s*state\.vA = 0;\s*\n\s*state\.vB = 0;/.test(resolveOverlap),
  'zeroing follows the separation');

check('the separation is only taken where a cart has room to give it',
  /const slideA = Math\.min\(Math\.max\(roomA, 0\), over\);\s*\n\s*const slideB = over - slideA;/.test(src));

check('parking and separating carts measure their limit the same way',
  (src.match(/const limit = limitFor\(which\);/g) || []).length === 1);

check('overlap is resolved after parking, so a wall cannot push a cart into another',
  /park\(\);\s*\n\s*resolveOverlap\(\);/.test(stepBody));

check('a locked pair is left alone, because the two halves share one body',
  /function resolveOverlap\(\) \{\s*\n\s*if \(state\.collided && state\.stuck\) return;/.test(src));

/* Walk every reachable combination of the sliders: park both carts against the
   ends of the track as they would come to rest, then hold them apart the way
   resolveOverlap does, and prove the pair never ends up inside itself. */
function parkLimit(m) { return L.TRACK_M - halfW(m); }

let overlapWorst = Infinity, overlapAt = null, wallWorst = Infinity;
for (let mA = sliders.mA.min; mA <= sliders.mA.max; mA += sliders.mA.step) {
  for (let mB = sliders.mB.min; mB <= sliders.mB.max; mB += sliders.mB.step) {
    for (const spotA of [parkLimit(mA), -parkLimit(mA)]) {
      for (const spotB of [parkLimit(mB), -parkLimit(mB)]) {
        let xA = spotA, xB = spotB;
        const need = halfW(mA) + halfW(mB) + L.GAP / L.PX_PER_M;
        const apart = xB - xA;
        if (Math.abs(apart) < need) {
          const dir = apart >= 0 ? 1 : -1;
          const over = need - Math.abs(apart);
          const roomA = dir > 0 ? xA + parkLimit(mA) : parkLimit(mA) - xA;
          const roomB = dir > 0 ? parkLimit(mB) - xB : xB + parkLimit(mB);
          const slideA = Math.min(Math.max(roomA, 0), over);
          const slideB = over - slideA;
          xA = Math.max(-L.TRACK_M, Math.min(L.TRACK_M, xA - dir * slideA));
          xB = Math.max(-L.TRACK_M, Math.min(L.TRACK_M, xB + dir * slideB));
        }
        const gapNow = Math.abs(xB - xA) - need;
        if (gapNow < overlapWorst) { overlapWorst = gapNow; overlapAt = [mA, mB, spotA, spotB]; }
        wallWorst = Math.min(wallWorst, L.TRACK_M - Math.abs(xA), L.TRACK_M - Math.abs(xB));
      }
    }
  }
}

check('no pair of masses can end a run standing inside one another',
  overlapWorst >= -1e-9,
  overlapAt ? 'tightest gap ' + (overlapWorst * L.PX_PER_M).toFixed(2) + 'px for '
    + overlapAt[0] + '/' + overlapAt[1] + 'kg' : '');

check('separating a pair at a stop still leaves both inside the track',
  wallWorst >= 0, 'closest centre is ' + wallWorst.toFixed(2) + 'm from the middle');

check('momentum and energy are both captured before the collision is solved',
  /state\.pBefore = totalMomentum\(\);\s*\n\s*state\.eBefore = totalEnergy\(\);/.test(src)
    && /state\.pAfter = totalMomentum\(\);\s*\n\s*state\.eAfter = totalEnergy\(\);/.test(src));

/* A cart parked against a stop is at rest, so a readout of its live velocity
   would read zero for both carts at the end of every run. The speed the impact
   handed it has to be kept separately. */
check('the speed from just after the impact is kept, not recomputed',
  /vAout: null, vBout: null,/.test(src)
    && /state\.vAout = out\.a;\s*\n\s*state\.vBout = out\.b;/.test(src)
    && /state\.vAout = null;\s*\n\s*state\.vBout = null;/.test(src));

check('the speed readouts quote the impact once there has been one',
  /function speedOut\(which\) \{\s*\n\s*if \(state\.collided\) return Math\.abs\(which === 'A' \? state\.vAout : state\.vBout\);/.test(src)
    && /leftSpeedValue\.textContent\s*= speedOut\('A'\)/.test(src)
    && /rightSpeedValue\.textContent\s*= speedOut\('B'\)/.test(src));

check('the verdict reads the same post-impact speed as the readouts',
  /'Locked together at ' \+ speedOut\('A'\)/.test(src));

check('the drawn arrows still show live motion, not the remembered speed',
  /velocityArrow\('A', state\.vA,/.test(src) && /velocityArrow\('B', state\.vB,/.test(src));

/* EV.say debounces, so two calls close together leave only the second spoken:
   one message per event, not a queue of them. */
check('the impact is announced as one message, because the announcer debounces',
  (block('function announceImpact()', '/* ── Model step')
    .match(/EV\.say\(/g) || []).length === 1);

check('the launch primes the motion flags, so the speed is not announced twice',
  /wasMovingA = Math\.abs\(state\.vA\) >= SAY_V;\s*\n\s*wasMovingB = Math\.abs\(state\.vB\) >= SAY_V;/.test(src));

check('both sliders always point at each other, so no unreachable verdict is shipped',
  /vA: preset\.vA, vB: -preset\.vB,/.test(src)
    && /vA = state\.vA0;\s*\n\s*state\.vB = -state\.vB0;/.test(src)
    && !/Moving apart/.test(src) && !/already moving apart/.test(src));

check('the help no longer promises a collision that cannot be set up',
  /drift apart/.test(html) === false && /head on/.test(html) && /meet one head on/.test(html));

check('motion is announced once per cart, not once per frame',
  (src.match(/function announceMotion\(\)/g) || []).length === 1
    && (src.match(/announceMotion\(\);/g) || []).length === 1
    && stepBody.indexOf('announceMotion();') > stepBody.indexOf('state.xB += state.vB * dt;'));

check('the impact is announced once, guarded by a flag',
  (src.match(/function announceImpact\(\)/g) || []).length === 1
    && /if \(contactSaid\) return;/.test(src));

check('reset clears the flags that live outside the state object',
  /launched = false;\s*\n\s*clearRun\(\);/.test(src) && /function clearRun\(\)/.test(src));

check('the panel quotes the momentum of each cart, not the total twice',
  /'Left cart', fmtMomentum\(pA\)/.test(src) && /'Right cart', fmtMomentum\(pB\)/.test(src));

check('the panel quotes one force for both carts, as the third law requires',
  /fmtForce\(state\.contactForce\)/.test(src) && /'Push on each cart'/.test(src));

check('no stray one-letter alias survived a rename',
  !/\bp\.[A-Za-z_]/.test(src), 'no bare p. in the simulation');

check('there is no dead code left over from the first draft',
  !/canvasCoords|announce\(|state\.pAfter = 0;|const p = /.test(src)
    && /function momentumOf\(/.test(src) && /function energyOf\(/.test(src));

check('every named constant in the layout block is used',
  (() => {
    const declared = [...block('/* ── Layout', '/* ── Presets')
      .matchAll(/const (\w+)\s/g)].map(m => m[1]);
    const body = src.replace(block('/* ── Layout', '/* ── Presets'), '');
    const unused = declared.filter(n => !new RegExp('\\b' + n + '\\b').test(body));
    return unused.length === 0 || (console.log('        unused: ' + unused.join(', ')), false);
  })(),
  (block('/* ── Layout', '/* ── Presets').match(/const \w+\s/g) || []).length + ' constants');

check('nothing is logged from the simulation',
  !/console\.(log|warn|error)/.test(src));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'all static checks passed')
  + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
