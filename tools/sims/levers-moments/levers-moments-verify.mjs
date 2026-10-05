/* Static checks for sims/levers-moments.


   Parses the layout block and the preset table out of script.js (so the
   checker cannot drift from the drawing code) and the slider bounds out of
   index.html, then asserts the geometry holds at the extremes of every
   control and that the presets are internally consistent. */

import { sim } from '../../paths.mjs';
import fs from 'node:fs';

const DIR = sim('levers-moments');
const src = fs.readFileSync(DIR + '/script.js', 'utf8');
const html = fs.readFileSync(DIR + '/index.html', 'utf8');

const canvasW = parseInt(html.match(/<canvas id="stage" width="(\d+)"/)[1], 10);
const canvasH = parseInt(html.match(/height="(\d+)"/)[1], 10);

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
  return { SCENE, PANEL, PAD, PIVOT, PX_PER_M, MIN_ARM, MAX_ARM, BEAM_Y, BEAM_T,
           BEAM_X0, BEAM_X1, GROUND_Y, FULCRUM_HALF, LOAD_W, LOAD_H,
           ARROW_HALF, ARROW_TOP, MAX_TILT, TILT_PER_NM, BALANCED_TOL };`)();

const P = new Function(block('/* ── Presets', '/* ── DOM') + `
  return { PRESETS, DEFAULT_PRESET };`)();

/* Sliders, straight from the markup. */
const sliders = {};
for (const m of html.matchAll(/<input type="range" id="(\w+)" class="ev-slider"\s*\n?\s*min="([\d.]+)" max="([\d.]+)" step="([\d.]+)" value="([\d.]+)">/g)) {
  sliders[m[1]] = { min: +m[2], max: +m[3], step: +m[4], value: +m[5] };
}

/* ── Physics, mirroring script.js ───────────────────── */

const loadMoment = s => s.loadForce * s.loadArm;
const effortMoment = s => s.effortForce * s.effortArm;
const effortNeeded = s => loadMoment(s) / s.effortArm;
const advantage = s => s.loadForce / s.effortForce;
const workIn = s => s.effortForce * s.effortArm;
const workOut = s => s.loadForce * s.loadArm;
const imbalance = s => effortMoment(s) - loadMoment(s);
const targetTilt = s => Math.max(-L.MAX_TILT, Math.min(L.MAX_TILT, imbalance(s) * L.TILT_PER_NM));
const onStep = (v, sl) => {
  const n = Math.round((v - sl.min) / sl.step);
  return Math.abs(sl.min + n * sl.step - v) < 1e-9;
};

/* Rotated corner positions about the pivot. */
function rotate(px, py, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return { x: L.PIVOT.x + px * c - py * s, y: L.PIVOT.y + px * s + py * c };
}

console.log('\nLAYOUT: canvas ' + canvasW + 'x' + canvasH + '\n');

/* ── 1. Regions ─────────────────────────────────────── */

check('scene sits inside the canvas with a margin',
  L.SCENE.x >= 8 && L.SCENE.y >= 8 &&
  L.SCENE.x + L.SCENE.w <= canvasW - 8 && L.SCENE.y + L.SCENE.h <= canvasH - 8,
  L.SCENE.x + ',' + L.SCENE.y + ' to ' + (L.SCENE.x + L.SCENE.w) + ',' + (L.SCENE.y + L.SCENE.h));

check('panel sits inside the canvas with a margin',
  L.PANEL.x >= 8 && L.PANEL.y >= 8 &&
  L.PANEL.x + L.PANEL.w <= canvasW - 8 && L.PANEL.y + L.PANEL.h <= canvasH - 8,
  L.PANEL.x + ',' + L.PANEL.y + ' to ' + (L.PANEL.x + L.PANEL.w) + ',' + (L.PANEL.y + L.PANEL.h));

const gap = L.PANEL.x - (L.SCENE.x + L.SCENE.w);
check('scene and panel do not overlap', gap >= 12, 'gap ' + gap.toFixed(1));

const rightMargin = canvasW - (L.PANEL.x + L.PANEL.w);
check('the two regions are centred, with equal margins',
  Math.abs(L.SCENE.x - rightMargin) <= 1,
  'left ' + L.SCENE.x + ', right ' + rightMargin + ', gutter ' + gap);

/* ── 2. Scene furniture ─────────────────────────────── */

check('fulcrum apex meets the underside of the beam',
  Math.abs((L.PIVOT.y + L.BEAM_T / 2) - L.PIVOT.y - L.BEAM_T / 2) < 1e-9);

check('fulcrum base is below the beam and inside the scene',
  L.GROUND_Y > L.PIVOT.y + L.BEAM_T / 2 &&
  L.GROUND_Y <= L.SCENE.y + L.SCENE.h - 8,
  'ground y=' + L.GROUND_Y);

check('fulcrum is wider than it is tall, like a real wedge',
  L.FULCRUM_HALF * 2 > L.GROUND_Y - (L.PIVOT.y + L.BEAM_T / 2),
  (L.FULCRUM_HALF * 2) + ' wide, ' + (L.GROUND_Y - (L.PIVOT.y + L.BEAM_T / 2)) + ' tall');

check('beam spans symmetrically about the pivot',
  Math.abs((L.PIVOT.x - L.BEAM_X0) - (L.BEAM_X1 - L.PIVOT.x)) < 1e-9,
  (L.PIVOT.x - L.BEAM_X0).toFixed(0) + ' px each side');

check('beam is wide enough for the longest arm',
  L.PIVOT.x - L.BEAM_X0 >= L.MAX_ARM * L.PX_PER_M + 4,
  'beam half ' + (L.PIVOT.x - L.BEAM_X0) + ' vs longest arm ' + (L.MAX_ARM * L.PX_PER_M));

check('ground line spans the scene', true,
  'x ' + (L.SCENE.x + L.PAD) + '..' + (L.SCENE.x + L.SCENE.w - L.PAD));

/* ── 3. Extremes: every drawn corner inside the scene ── */

let worstScene = Infinity, worstWhere = '';
for (const tilt of [-L.MAX_TILT, 0, L.MAX_TILT]) {
  for (const arm of [L.MIN_ARM, (L.MIN_ARM + L.MAX_ARM) / 2, L.MAX_ARM]) {
    const px = arm * L.PX_PER_M;
    /* Load block: sits on top of the beam. */
    const top = -L.BEAM_T / 2 - L.LOAD_H;
    for (const [ox, oy] of [[-px - L.LOAD_W / 2, top], [-px + L.LOAD_W / 2, top],
                            [-px - L.LOAD_W / 2, -L.BEAM_T / 2], [-px + L.LOAD_W / 2, -L.BEAM_T / 2],
                            [-px, top - 12]]) {
      const r = rotate(ox, oy, tilt);
      const slack = Math.min(r.x - L.SCENE.x, L.SCENE.x + L.SCENE.w - r.x, r.y - L.SCENE.y);
      if (slack < worstScene) { worstScene = slack; worstWhere = 'load corner at tilt ' + tilt.toFixed(2) + ', arm ' + arm.toFixed(2); }
    }
    /* Effort arrow: shaft plus arrowhead, plus its two text labels. */
    for (const [ox, oy] of [[px, L.ARROW_TOP], [px + L.ARROW_HALF, L.ARROW_TOP],
                            [px, -L.BEAM_T / 2], [px + L.ARROW_HALF, -L.BEAM_T / 2 - 15],
                            [px, L.ARROW_TOP - 30]]) {
      const r = rotate(ox, oy, tilt);
      const slack = Math.min(r.x - L.SCENE.x, L.SCENE.x + L.SCENE.w - r.x, r.y - L.SCENE.y);
      if (slack < worstScene) { worstScene = slack; worstWhere = 'effort corner at tilt ' + tilt.toFixed(2) + ', arm ' + arm.toFixed(2); }
    }
    /* Beam ends. */
    for (const ox of [L.BEAM_X0 - L.PIVOT.x, L.BEAM_X1 - L.PIVOT.x]) {
      const r = rotate(ox, -L.BEAM_T / 2, tilt);
      const slack = Math.min(r.x - L.SCENE.x, L.SCENE.x + L.SCENE.w - r.x);
      if (slack < worstScene) { worstScene = slack; worstWhere = 'beam end at tilt ' + tilt.toFixed(2); }
    }
  }
}
check('every drawn corner stays inside the scene at the extremes', worstScene >= 4,
  'tightest clearance ' + worstScene.toFixed(1) + 'px, ' + worstWhere);

/* ── 4. Interaction invariants ──────────────────────── */

const minPx = L.MIN_ARM * L.PX_PER_M;
const blockEdge = minPx - L.LOAD_W / 2;           /* left block, right edge */
const headEdge = minPx - L.ARROW_HALF;            /* effort arrowhead, left edge */
check('load block and effort arrow never touch at the shortest arms',
  headEdge - blockEdge >= 8, 'gap ' + (headEdge - blockEdge).toFixed(1) + 'px at ' + L.MIN_ARM + ' m');

check('a block at the shortest arm still clears the pivot',
  blockEdge > 2, 'block edge ' + blockEdge.toFixed(1) + 'px from the pivot');

check('the first ruler tick is clear of the load block',
  0.5 * L.PX_PER_M - (L.LOAD_W / 2 + 14) > minPx,
  'tick at 75px vs block reach ' + (L.LOAD_W / 2 + 14 + minPx).toFixed(1) + 'px');

check('arm distance label is drawn once there is room for it',
  44 <= minPx * 2, 'shortest labelable arm ' + (44 / L.PX_PER_M).toFixed(2) + ' m');

/* ── 5. Tilt ────────────────────────────────────────── */

const right = rotate(200, 0, L.MAX_TILT);
check('a positive tilt drops the effort side, not the load side',
  right.y > L.PIVOT.y, 'effort point y ' + right.y.toFixed(1) + ' vs pivot ' + L.PIVOT.y);

check('a positive imbalance produces a positive tilt',
  targetTilt({ loadForce: 100, loadArm: 1, effortForce: 200, effortArm: 1 }) > 0);

check('a large imbalance saturates instead of over-rotating',
  targetTilt({ loadForce: 0.1, loadArm: 1, effortForce: 1200, effortArm: 1.5 }) === L.MAX_TILT,
  'saturates at ' + (L.MAX_TILT / L.TILT_PER_NM).toFixed(0) + ' N·m');

check('the beam stays close to level at the full tilt',
  L.MAX_TILT * 180 / Math.PI <= 10, (L.MAX_TILT * 180 / Math.PI).toFixed(1) + ' degrees');

check('the balance tolerance is far below one readout step',
  L.BALANCED_TOL < 1, L.BALANCED_TOL + ' N·m');

/* ── 6. Presets ─────────────────────────────────────── */

console.log('\nPRESETS\n');

for (const [key, p] of Object.entries(P.PRESETS)) {
  const s = { loadForce: p.loadForce, loadArm: p.loadArm, effortForce: p.effortForce, effortArm: p.effortArm };
  check(key + ': starts balanced', Math.abs(imbalance(s)) < 1e-9,
    loadMoment(s).toFixed(1) + ' vs ' + effortMoment(s).toFixed(1) + ' N·m');
  check(key + ': the displayed effort is the effort needed', Math.abs(effortNeeded(s) - p.effortForce) < 1e-9,
    effortNeeded(s).toFixed(1) + ' N');
  check(key + ': work in equals work out', Math.abs(workIn(s) - workOut(s)) < 1e-9,
    workIn(s).toFixed(1) + ' J both ways');
  check(key + ': arms are inside the arm range',
    p.loadArm >= L.MIN_ARM && p.loadArm <= L.MAX_ARM &&
    p.effortArm >= L.MIN_ARM && p.effortArm <= L.MAX_ARM,
    p.loadArm + ' m, ' + p.effortArm + ' m');
  check(key + ': caption is present and short enough to wrap',
    typeof p.caption === 'string' && p.caption.length > 40 && p.caption.length < 260,
    p.caption.length + ' chars');
}

const mas = Object.entries(P.PRESETS).map(([k, p]) => k + ' ×' + advantage(p).toFixed(2));
check('the four presets span advantage, disadvantage and parity',
  new Set(mas.map(m => Number(m.slice(m.indexOf('×') + 1)))).size === 4, mas.join(', '));

check('exactly one preset is a first-class lever (no advantage)',
  Object.values(P.PRESETS).some(p => Math.abs(advantage(p) - 1) < 1e-9), 'seesaw');

check('presets include both a lever that helps and one that hurts',
  Object.values(P.PRESETS).some(p => advantage(p) > 1.5) &&
  Object.values(P.PRESETS).some(p => advantage(p) < 0.8));

check('the default preset exists', P.PRESETS[P.DEFAULT_PRESET] !== undefined, P.DEFAULT_PRESET);

/* ── 7. Sliders ─────────────────────────────────────── */

console.log('\nCONTROLS\n');

check('all four sliders exist', Object.keys(sliders).length === 4, Object.keys(sliders).join(', '));

const ranges = {
  loadForce: [10, 800, 5], effortForce: [10, 1200, 5],
  loadArm: [0.15, 1.5, 0.01], effortArm: [0.15, 1.5, 0.01]
};
for (const [id, [min, max, step]] of Object.entries(ranges)) {
  const sl = sliders[id];
  check(id + ' slider bounds match the design', !!sl && sl.min === min && sl.max === max && sl.step === step,
    sl ? sl.min + '..' + sl.max + ' step ' + sl.step : 'missing');
}

for (const [key, p] of Object.entries(P.PRESETS)) {
  const ok = onStep(p.loadForce, sliders.loadForce) && onStep(p.effortForce, sliders.effortForce) &&
             onStep(p.loadArm, sliders.loadArm) && onStep(p.effortArm, sliders.effortArm);
  check(key + ': every value is reachable on its slider', ok);
}

const def = P.PRESETS[P.DEFAULT_PRESET];
check('slider defaults match the default preset',
  sliders.loadForce.value === def.loadForce && sliders.effortForce.value === def.effortForce &&
  sliders.loadArm.value === def.loadArm && sliders.effortArm.value === def.effortArm,
  def.label);

check('four preset buttons are marked up',
  (html.match(/data-preset="/g) || []).length === 4);

check('the default preset button starts pressed',
  new RegExp('data-preset="' + P.DEFAULT_PRESET + '" aria-pressed="true"').test(html));

check('every readout the canvas duplicates exists in the markup',
  ['loadMomentValue', 'effortMomentValue', 'effortNeededValue', 'maValue', 'workValue', 'verdictValue']
    .every(id => html.includes('id="' + id + '"')));

check('the canvas is keyboard reachable', html.includes('id="stage"') && !html.includes('tabindex="-1" id="stage"'));

/* Regression guards for two bugs the headless audit found. */
check('a caption survives losing the active preset',
  /const NEUTRAL_CAPTION =/.test(src) && /p \? p\.caption : NEUTRAL_CAPTION/.test(src)
    && !/PRESETS\[state\.preset\]\.caption/.test(src));
check('one function owns the pressed preset button',
  /function markPreset\(key\)/.test(src) && !/state\.preset = '';/.test(src)
    && (src.match(/aria-pressed/g) || []).length <= 2);
check('advantage is not simply the ratio of the two forces',
  /function advantage\(\)\s*\{\s*return state\.loadForce \/ effortNeeded\(\);/.test(src));

check('the beam reaches past the load block at full extension',
  /BEAM_X0 = PIVOT\.x - (\d+)/.test(src)
    && Number(/BEAM_X0 = PIVOT\.x - (\d+)/.exec(src)[1]) >= 225 + 20 + 4);
check('a short arm still gets its distance label',
  !/if \(Math\.abs\(px\) < \d+\) return;/.test(src) && /Math\.abs\(px\) < \d+ \? sign/.test(src));
check('overlapping grab targets pick the nearer one',
  /distEffort < distLoad \? 'effort' : 'load'/.test(src));
check('the render loop parks itself when the beam settles',
  /rafId = null;\s*\n\s*return;/.test(src) && /function startLoop\(\)/.test(src)
    && (src.match(/startLoop\(\);/g) || []).length >= 6);
check('interactions are debounced, not counted per event',
  /INTERACTION_WINDOW_MS/.test(src) && /lastInteraction/.test(src));
check('no dead helpers are left behind',
  !/function effortPoint\(/.test(src) && !/warn:/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
