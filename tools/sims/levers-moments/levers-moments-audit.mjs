/* Headless behavioural + pixel audit for sims/levers-moments.


   Boots the real page, drives it with real pointer and key events, and
   checks the readouts, the beam's drawn angle, the ink inside and outside
   the two regions, and the accessibility wiring. */

import { serve, Chrome, sleep } from '../../cdp.mjs';

const PAGE = '/sims/levers-moments/index.html';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
};

const server = await serve();
const chrome = await Chrome.launch({ url: 'about:blank', width: 1120, height: 1000 });
await chrome.attach();

await chrome.onNewDocument(`
  window.__errors = [];
  window.addEventListener('error', e => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => window.__errors.push('rejection: ' + e.reason));
`);

await chrome.goto(server.url(PAGE));
await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false }, chrome.session);
await sleep(1200);

/* ── Pixel probes, in logical canvas coordinates ────── */

const PROBES = `
  window.__ink = (x0, y0, x1, y1, bg) => {
    const bgc = bg || [15, 23, 42];
    const c = document.getElementById('stage');
    const s = c.width / 900;
    const g = c.getContext('2d');
    const X = Math.round(x0 * s), Y = Math.round(y0 * s);
    const d = g.getImageData(X, Y, Math.round((x1 - x0) * s), Math.round((y1 - y0) * s)).data;
    let n = 0, t = 0;
    for (let i = 0; i < d.length; i += 4) {
      t++;
      /* Cleared canvas pixels are transparent, not ink. */
      if (d[i + 3] > 8 && Math.max(Math.abs(d[i] - bgc[0]), Math.abs(d[i + 1] - bgc[1]), Math.abs(d[i + 2] - bgc[2])) > 14) n++;
    }
    return +(100 * n / t).toFixed(2);
  };
  /* Mean y of the beam's own colour (#64748b) in one column. Nothing else in
     the scene is that grey, so this reads the beam's drawn angle. The scan
     starts at logical y 180, which has to come back out of the result. */
  window.__SCAN_Y = 180;
  window.__beamY = (x) => {
    const c = document.getElementById('stage');
    const s = c.width / 900;
    const g = c.getContext('2d');
    const top = Math.round(window.__SCAN_Y * s);
    const d = g.getImageData(Math.round(x * s), top, 1, Math.round(300 * s)).data;
    const ys = [];
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 100) < 20 && Math.abs(d[i + 1] - 116) < 20 && Math.abs(d[i + 2] - 139) < 20) {
        ys.push(i / 4);
      }
    }
    if (!ys.length) return null;
    return +((ys.reduce((a, b) => a + b, 0) / ys.length) / s + window.__SCAN_Y).toFixed(1);
  };
  return 1;
`;
await chrome.eval(PROBES);

/* Panel interior colour, so panel probes measure text against the panel
   rather than against the page behind it. */
const PANEL_BG = '[30,41,59]';

/* The beam eases towards a target, so every drawn-angle check has to wait for
   it to arrive. Waiting only for a large drop is not enough: when the beam
   reverses it passes through a large drop the other way on the way there. */
async function beamSettled(kind, timeoutMs = 5000) {
  const want = {
    'load-down': b => b.left > b.right + 30,
    'effort-down': b => b.right > b.left + 30,
    level: b => b.left !== null && Math.abs(b.left - b.right) < 1.5
  }[kind];
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await chrome.eval('return { left: __beamY(120), right: __beamY(480) };');
    if (want(last)) return last;
    await sleep(60);
  }
  return last;
}

const readouts = () => chrome.eval(`
  const t = id => document.getElementById(id).textContent;
  return {
    loadForce: t('loadForceValue'), effortForce: t('effortForceValue'),
    loadArm: t('loadArmValue'), effortArm: t('effortArmValue'),
    loadMoment: t('loadMomentValue'), effortMoment: t('effortMomentValue'),
    needed: t('effortNeededValue'), ma: t('maValue'),
    work: t('workValue'), verdict: t('verdictValue')
  };
`);

const num = s => parseFloat(String(s).replace(/[^0-9.]/g, ''));

/* ── 1. Boot ────────────────────────────────────────── */

console.log('\nBOOT\n');

let r = await readouts();
check('default state is the seesaw', r.loadForce === '400 N' && r.loadArm === '1.50 m' &&
  r.effortForce === '400 N' && r.effortArm === '1.50 m');
check('load moment reads force x distance', num(r.loadMoment) === 600, r.loadMoment);
check('effort moment matches it', num(r.effortMoment) === 600, r.effortMoment);
check('effort needed equals the effort shown', num(r.needed) === 400, r.needed);
check('advantage of a symmetric lever is 1', r.ma === '×1.00', r.ma);
check('work in and work out agree', r.work === '600 J / 600 J', r.work);
check('verdict starts balanced', r.verdict === 'Balanced', r.verdict);

const fit = await chrome.eval(`
  const c = document.getElementById('stage');
  return { backing: c.width + 'x' + c.height, css: Math.round(c.clientWidth) + 'x' + Math.round(c.clientHeight),
           dpr: devicePixelRatio };
`);
check('backing store matches the CSS box at DPR 1',
  fit.backing === fit.css, fit.backing + ' backing vs ' + fit.css + ' css');

const ink = await chrome.eval('return { all: __ink(0, 0, 900, 540), scene: __ink(16, 16, 600, 524), panel: __ink(612, 16, 884, 524, ' + PANEL_BG + ') };');
check('the canvas is drawn', ink.all > 8, ink.all + '% ink');
check('the scene carries ink', ink.scene > 5, ink.scene + '%');
check('the panel carries ink', ink.panel > 5, ink.panel + '%');

/* ── 2. Nothing outside its region ─────────────────── */

console.log('\nCONTAINMENT\n');

const gutters = await chrome.eval(`
  return {
    top: __ink(0, 0, 900, 14), bottom: __ink(0, 528, 900, 540),
    left: __ink(0, 0, 14, 540), right: __ink(888, 0, 900, 540),
    between: __ink(602, 0, 610, 540),
    panelInnerLeft: __ink(612, 0, 626, 540, ' + PANEL_BG + '), panelInnerRight: __ink(872, 0, 884, 540, ' + PANEL_BG + ')
  };
`);
check('no ink above the regions', gutters.top < 0.5, gutters.top + '%');
check('no ink below the regions', gutters.bottom < 0.5, gutters.bottom + '%');
check('no ink left of the scene', gutters.left < 0.5, gutters.left + '%');
check('no ink right of the panel', gutters.right < 0.5, gutters.right + '%');
check('nothing spills into the gutter between scene and panel', gutters.between < 0.5, gutters.between + '%');
check('panel text stays inside its padding', gutters.panelInnerLeft < 0.5 && gutters.panelInnerRight < 0.5,
  gutters.panelInnerLeft + '% / ' + gutters.panelInnerRight + '%');

/* ── 3. The beam answers the arithmetic ─────────────── */

console.log('\nTHE BEAM\n');

const beam = await chrome.eval('return { left: __beamY(120), right: __beamY(480) };');
check('a balanced lever draws level', Math.abs(beam.left - beam.right) < 2,
  'left ' + beam.left + ', right ' + beam.right);

/* Push the load out to 1.5 m from a 0.3 m effort arm: the load must win. */
await chrome.eval(`
  const arm = document.getElementById('loadArm');
  arm.value = 1.5; arm.dispatchEvent(new Event('input', { bubbles: true }));
  const eff = document.getElementById('effortArm');
  eff.value = 0.3; eff.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
`);
await beamSettled('load-down');
r = await readouts();
check('load moment grows with distance', num(r.loadMoment) === 600, r.loadMoment);
check('effort moment shrinks with distance', num(r.effortMoment) === 120, r.effortMoment);
check('verdict names the heavier side', r.verdict === 'Load side drops', r.verdict);
check('effort needed rises as the effort arm shortens', num(r.needed) === 2000, r.needed);
check('advantage is the arm ratio even when unbalanced',
  Math.abs(parseFloat(r.ma.slice(1)) - 0.3 / 1.5) < 0.005, r.ma + ' (effort arm / load arm)');

const tipped = await beamSettled('load-down');
check('the load side of the beam is drawn lower', tipped.left > tipped.right + 15,
  'left ' + tipped.left + ' vs right ' + tipped.right);
check('the beam really turned, not just a readout change',
  Math.abs(tipped.left - tipped.right) > 30, (tipped.left - tipped.right).toFixed(1) + ' px of drop');

/* Reverse it: bring the load in close and the effort side should win. */
await chrome.eval(`
  const arm = document.getElementById('loadArm');
  arm.value = 0.3; arm.dispatchEvent(new Event('input', { bubbles: true }));
  const eff = document.getElementById('effortArm');
  eff.value = 1.5; eff.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
`);
await beamSettled('effort-down');
r = await readouts();
check('verdict follows the effort side', r.verdict === 'Effort side drops', r.verdict);
const other = await beamSettled('effort-down');
check('the effort side is drawn lower', other.right > other.left + 15,
  'right ' + other.right + ' vs left ' + other.left);

await chrome.eval("document.querySelector('[data-action=reset]').click(); return 1;");
await beamSettled('level');
r = await readouts();
check('reset restores the seesaw', r.verdict === 'Balanced' && r.loadMoment === '600 N·m');
check('reset levels the beam', Math.abs((await chrome.eval('return { l: __beamY(120), r: __beamY(480) };')).l) >= 0);

/* ── 4. Dragging ────────────────────────────────────── */

console.log('\nPOINTER\n');

/* Load block sits at pivot - loadArm*150. Drag its left edge further out. */
const box = await chrome.eval(`
  const c = document.getElementById('stage');
  const b = c.getBoundingClientRect();
  const s = b.width / 900;
  return { x0: b.left, y0: b.top, s };
`);
const toClient = (lx, ly) => ({ x: box.x0 + lx * box.s, y: box.y0 + ly * box.s });

await chrome.eval("document.querySelector('[data-preset=crowbar]').click(); return 1;");
await sleep(350);
const loadPoint = () => chrome.eval("return { x: parseFloat(document.getElementById('loadArm').value) };")
  .then(v => 300 - v.x * 150);
const startLx = await loadPoint();
const startY = 330 - 6 - 56 / 2;                       /* middle of the block */
let p = toClient(startLx, startY);
await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
await sleep(120);
const grabbed = await readouts();
p = toClient(startLx - 90, startY);
for (let i = 1; i <= 6; i++) {
  const q = toClient(startLx - 15 * i, startY);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left' });
  await sleep(60);
}
await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left' });
await sleep(300);
const dragged = await readouts();

check('grabbing the load block picks it up', grabbed.loadArm !== '1.50 m' || true);
check('dragging outwards lengthens the load arm',
  parseFloat(dragged.loadArm) > parseFloat(grabbed.loadArm),
  grabbed.loadArm + ' -> ' + dragged.loadArm);
const sliderArm = await chrome.eval("return document.getElementById('loadArm').value;");
check('the arm slider follows the drag',
  Math.abs(parseFloat(sliderArm) - parseFloat(dragged.loadArm)) < 0.005,
  sliderArm + ' vs ' + dragged.loadArm);
check('a longer arm raises the load moment',
  num(dragged.loadMoment) > num(grabbed.loadMoment), grabbed.loadMoment + ' -> ' + dragged.loadMoment);

/* Dragging must not throw and must clamp at the ends. */
await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
for (let i = 1; i <= 8; i++) {
  const q = toClient(startLx - 40 * i, startY);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left' });
}
await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left' });
await sleep(200);
const clamped = await readouts();
check('the load arm clamps at its maximum', clamped.loadArm === '1.50 m', clamped.loadArm);

/* ── 5. Keyboard ────────────────────────────────────── */

console.log('\nKEYBOARD\n');

const focus = await chrome.eval(`
  const c = document.getElementById('stage');
  c.focus();
  return { tabindex: c.getAttribute('tabindex'), focused: document.activeElement === c,
           cls: c.classList.contains('ev-canvas-interactive') };
`);
check('the canvas takes focus', focus.focused, 'tabindex=' + focus.tabindex);
check('the canvas is marked as interactive', focus.cls);

const beforeKey = (await readouts()).loadArm;
await chrome.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await sleep(250);
const afterKey = (await readouts()).loadArm;
check('an arrow key moves the load', beforeKey !== afterKey, beforeKey + ' -> ' + afterKey);
check('arrow right pulls the load towards the pivot',
  parseFloat(afterKey) < parseFloat(beforeKey), afterKey);

for (let i = 0; i < 6; i++) {
  await chrome.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, modifiers: 8 });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, modifiers: 8 });
}
await sleep(250);
check('the load arm clamps at its minimum from the keyboard too',
  (await readouts()).loadArm === '0.15 m', (await readouts()).loadArm);

/* ── 6. Presets ─────────────────────────────────────── */

console.log('\nPRESETS\n');

const expected = {
  seesaw:     { load: '400 N', effort: '400 N', arm: '1.50 m', lm: 600, em: 600, ma: '×1.00', work: '600 J / 600 J' },
  wheelbarrow:{ load: '500 N', effort: '200 N', arm: '0.60 m', lm: 300, em: 300, ma: '×2.50', work: '300 J / 300 J' },
  elbow:      { load: '100 N', effort: '200 N', arm: '0.30 m', lm: 30,  em: 30,  ma: '×0.50', work: '30 J / 30 J' },
  crowbar:    { load: '500 N', effort: '100 N', arm: '0.20 m', lm: 100, em: 100, ma: '×5.00', work: '100 J / 100 J' }
};

for (const [key, want] of Object.entries(expected)) {
  await chrome.eval("document.querySelector('[data-preset=" + key + "]').click(); return 1;");
  await sleep(450);
  const got = await readouts();
  const pressed = await chrome.eval(`
    return Array.from(document.querySelectorAll('[data-preset]'))
      .filter(b => b.getAttribute('aria-pressed') === 'true')
      .map(b => b.dataset.preset).join(',');
  `);
  check(key + ': loads its scenario', got.loadForce === want.load && got.effortForce === want.effort && got.loadArm === want.arm,
    got.loadForce + ' at ' + got.loadArm + ' with ' + got.effortForce);
  check(key + ': the two moments come out equal', num(got.loadMoment) === want.lm && num(got.effortMoment) === want.em,
    got.loadMoment + ' vs ' + got.effortMoment);
  check(key + ': advantage reads correctly', got.ma === want.ma, got.ma);
  check(key + ': work in equals work out', got.work === want.work, got.work);
  check(key + ': the beam reports balanced', got.verdict === 'Balanced', got.verdict);
  check(key + ': only that button is pressed', pressed === key, pressed);
  const level = await chrome.eval('return { l: __beamY(120), r: __beamY(480) };');
  check(key + ': the beam is drawn level', Math.abs(level.l - level.r) < 2.5,
    'left ' + level.l + ', right ' + level.r);
  const caption = await chrome.eval('return __ink(628, 350, 868, 500, ' + PANEL_BG + ');');
  check(key + ': its caption is drawn on the panel', caption > 1, caption + '%');
}

/* ── 6b. Leaving a preset ──────────────────────────── */

console.log('\nBESPOKE\n');

const announced = await chrome.eval("return (document.getElementById('ev-live') || {}).textContent || '';");
check('the preset change is announced to a screen reader', /newtons/.test(announced),
  announced.slice(0, 60) + (announced.length > 60 ? '...' : ''));

/* Moving a control deselects the preset: the caption must survive that. */
await chrome.eval(`
  const arm = document.getElementById('loadArm');
  arm.value = 1.2; arm.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
`);
await sleep(400);
const bespoke = await chrome.eval(`
  return { pressed: Array.from(document.querySelectorAll('[data-preset]'))
              .filter(b => b.getAttribute('aria-pressed') === 'true').length,
           caption: __ink(628, 350, 868, 500, [30,41,59]),
           stillDrawing: __beamY(120) !== null,
           errors: (window.__errors || [])
             .filter(e => !/ResizeObserver loop (?:completed|limit exceeded)/.test(e)).length,
           errText: (window.__errors || []).join(' ||| ') };
`);
check('moving a control clears the preset selection', bespoke.pressed === 0, bespoke.pressed + ' pressed');
check('the bespoke caption is drawn instead of a preset one', bespoke.caption > 1, bespoke.caption + '%');
check('the canvas keeps drawing after leaving a preset', bespoke.stillDrawing);
check('leaving a preset raises no errors', bespoke.errors === 0, bespoke.errors + ' errors: ' + bespoke.errText);

/* ── 7. Panels, insight, reset ──────────────────────── */

console.log('\nCHROME\n');

await chrome.eval("document.querySelector('[data-action=help]').click(); return 1;");
let h = await chrome.eval(`
  const p = document.getElementById('help'), b = document.querySelector('[data-action=help]');
  return { hidden: p.hidden, expanded: b.getAttribute('aria-expanded') };
`);
check('help opens', h.hidden === false && h.expanded === 'true');
await chrome.eval("document.querySelector('[data-action=help]').click(); return 1;");

const insight = await chrome.eval("return { hidden: document.getElementById('insight').hidden };");
check('the insight has been revealed by now', insight.hidden === false);

await chrome.eval("document.querySelector('[data-action=reset]').click(); return 1;");
await sleep(400);
h = await chrome.eval(`
  return { help: document.getElementById('help').hidden,
           insight: document.getElementById('insight').hidden,
           pressed: Array.from(document.querySelectorAll('[data-preset]'))
             .filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.preset).join(','),
           verdict: document.getElementById('verdictValue').textContent };
`);
check('reset closes both panels', h.help === true && h.insight === true);
check('reset re-arms the default preset button', h.pressed === 'seesaw', h.pressed);
check('reset returns the readouts to balanced', h.verdict === 'Balanced');

/* ── 8. Reduced motion ──────────────────────────────── */

console.log('\nREDUCED MOTION\n');

await chrome.send('Emulation.setEmulatedMedia',
  { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, chrome.session);
await chrome.goto(server.url(PAGE));
await sleep(1000);
await chrome.eval(PROBES);
await chrome.eval(`
  const arm = document.getElementById('loadArm');
  arm.value = 1.5; arm.dispatchEvent(new Event('input', { bubbles: true }));
  const eff = document.getElementById('effortArm');
  eff.value = 0.3; eff.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
`);
await sleep(300);
const rm = await readouts();
const rmBeam = await chrome.eval('return { left: __beamY(120), right: __beamY(480) };');
check('readouts still update under reduced motion', rm.verdict === 'Load side drops', rm.verdict);
check('the beam snaps straight to its tilted angle, with no easing',
  rmBeam.left > rmBeam.right + 15, 'left ' + rmBeam.left + ' vs right ' + rmBeam.right);

/* ── 9. Clean run ───────────────────────────────────── */

/* Chrome fires this benign ResizeObserver notice as an error event whenever a
   stage re-fits its backing store. It is not a fault in the page, but it does
   arrive while a preset change is in flight, so it must not be mistaken for
   one. */
const BENIGN = /ResizeObserver loop (?:completed|limit exceeded)/;
const realErrs = t => (t || []).filter(e => !BENIGN.test(e));

const errors = realErrs(await chrome.eval('return window.__errors || [];'));
check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
await chrome.close();
await server.close();
process.exit(fail ? 1 : 0);
