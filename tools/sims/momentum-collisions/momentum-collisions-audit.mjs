/* Headless behavioural + pixel audit for sims/momentum-collisions.

   Boots the real page, drives it with real pointer and key events, and checks
   the readouts, where the two carts are actually drawn, that the collision
   lands nose to nose, that momentum survives and energy does not always, that
   the ink stays inside the two blocks, and that the accessibility wiring
   holds. */

import { serve, Chrome, sleep } from '../../cdp.mjs';

const PAGE = '/sims/momentum-collisions/index.html';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
};

const server = await serve();
const chrome = await Chrome.launch({ url: 'about:blank', width: 1120, height: 1100 });
await chrome.attach();

await chrome.onNewDocument(`
  /* Errors are banked in sessionStorage so they survive the reloads below
     instead of being wiped along with the document. */
  const bank = [];
  try { JSON.parse(sessionStorage.getItem('audit-errs') || '[]').forEach(e => bank.push(e)); } catch (e) {}
  const note = (m) => { bank.push(m); try { sessionStorage.setItem('audit-errs', JSON.stringify(bank)); } catch (e) {} };
  window.addEventListener('error', e => note(String(e.message)));
  window.addEventListener('unhandledrejection', e => note('rejection: ' + e.reason));
  const ce = console.error;
  console.error = (...a) => { note('console: ' + a.join(' ')); ce(...a); };

  /* Every frame the simulation draws starts by clearing the canvas, so counting
     clearRect calls counts drawn frames. That is how we prove a settled run has
     actually stopped repainting rather than merely looking still. */
  window.__frames = 0;
  const proto = CanvasRenderingContext2D.prototype;
  const clear = proto.clearRect;
  proto.clearRect = function (...a) { window.__frames++; return clear.apply(this, a); };
`);

await chrome.goto(server.url(PAGE));
await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false }, chrome.session);
await sleep(900);

/* ── Probes, in logical canvas coordinates ──────────── */

const PROBES = `
  const canvas = document.getElementById('stage');
  const g = canvas.getContext('2d');
  const S = () => canvas.width / 900;

  window.__ink = (x0, y0, x1, y1) => {
    const s = S();
    const d = g.getImageData(Math.round(x0 * s), Math.round(y0 * s),
      Math.max(1, Math.round((x1 - x0) * s)), Math.max(1, Math.round((y1 - y0) * s))).data;
    let n = 0, t = 0;
    for (let i = 0; i < d.length; i += 4) { t++; if (d[i + 3] > 8) n++; }
    return +(100 * n / t).toFixed(2);
  };

  /* Bounding box and centroid of one cart's own fill. The two carts are drawn
     in unrelated hues, and the arrows use the lighter edge colour, so matching
     the body colour alone finds the body and nothing else. */
  window.__cart = (r, g2, b) => {
    const s = S();
    /* Read the scene block only. The panel draws its momentum bars in these
       same two hues, so a whole-canvas scan would fold them into the cart. */
    const d = g.getImageData(0, 0, Math.round(600 * s), canvas.height).data;
    const w = Math.round(600 * s);
    let sx = 0, n = 0, l = 1e9, rr = -1, top = 1e9, bottom = -1;
    const floorTop = Math.round(336 * s);
    const floorBottom = Math.round(394 * s);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200 && Math.abs(d[i] - r) <= 12
          && Math.abs(d[i + 1] - g2) <= 12 && Math.abs(d[i + 2] - b) <= 12) {
        const px = (i / 4) % w;
        const py = Math.floor((i / 4) / w);
        /* The body only: above it sits the speed label and the velocity arrow,
           and both would drag the probe off the cart it is measuring. */
        if (py < floorTop || py > floorBottom) continue;
        sx += px; n++;
        if (px < l) l = px;
        if (px > rr) rr = px;
        if (py < top) top = py;
        if (py > bottom) bottom = py;
      }
    }
    if (!n) return null;
    return { x: +(sx / n / s).toFixed(1), left: +(l / s).toFixed(1), right: +(rr / s).toFixed(1),
             top: +(top / s).toFixed(1), bottom: +(bottom / s).toFixed(1), n };
  };

  window.__carts = () => ({ a: __cart(56, 189, 248), b: __cart(244, 114, 182) });

  /* Pixel count in one exact colour family: the amber impact mark and force
     arrows, and the two light arrow colours. */
  window.__count = (r, g2, b, tol) => {
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200 && Math.abs(d[i] - r) <= tol
          && Math.abs(d[i + 1] - g2) <= tol && Math.abs(d[i + 2] - b) <= tol) n++;
    }
    return n;
  };

  /* The amber ink, split into the mark above the carts and the force arrows
     across them, so the two can be told apart. */
  window.__amber = () => {
    const s = S();
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let mark = 0, arrows = 0, label = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 200) continue;
      if (Math.abs(d[i] - 251) > 14 || Math.abs(d[i + 1] - 191) > 14 || Math.abs(d[i + 2] - 36) > 30) continue;
      const y = Math.floor((i / 4) / canvas.width) / s;
      if (y < 300) mark++;
      else if (y < 330) label++;
      else arrows++;
    }
    return { mark, label, arrows };
  };

  /* Nothing may be drawn meaningfully outside the two blocks. A 1px stroke
     centred on a block edge straddles it, so give the halo two pixels of grace
     and fail on anything that spills further than that. */
  window.__outside = (pad) => {
    const grace = pad === undefined ? 2 : pad;
    const s = S();
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    const inScene = (x, y) => x >= 16 - grace && x < 600 + grace && y >= 16 - grace && y < 524 + grace;
    const inPanel = (x, y) => x >= 612 - grace && x < 884 + grace && y >= 16 - grace && y < 524 + grace;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 8) continue;
      const px = (i / 4) % canvas.width;
      const py = Math.floor((i / 4) / canvas.width);
      const x = px / s, y = py / s;
      if (!inScene(x, y) && !inPanel(x, y)) n++;
    }
    return n;
  };

  window.__said = [];
  const region = () => document.getElementById('ev-live');
  const watch = setInterval(() => {
    const t = region() ? region().textContent.trim() : '';
    if (t && window.__said[window.__said.length - 1] !== t) window.__said.push(t);
  }, 40);
  window.__stopWatch = () => clearInterval(watch);
  return 1;
`;

const installProbes = () => chrome.eval(PROBES);
const allErrors = () => chrome.eval("return JSON.parse(sessionStorage.getItem('audit-errs') || '[]');");
await installProbes();

const readouts = () => chrome.eval(`
  const t = id => document.getElementById(id).textContent;
  return {
    mA: document.getElementById('massA').value,
    mB: document.getElementById('massB').value,
    vA: document.getElementById('speedA').value,
    vB: document.getElementById('speedB').value,
    e: document.getElementById('bounce').value,
    mAOut: t('massAValue'), mBOut: t('massBValue'), vAOut: t('speedAValue'),
    vBOut: t('speedBValue'), eOut: t('bounceValue'),
    in: t('momentumInValue'), out: t('momentumOutValue'), kept: t('energyKeptValue'),
    left: t('leftSpeedValue'), right: t('rightSpeedValue'), verdict: t('verdictValue')
  };
`);

const num = s => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
const said = () => chrome.eval("return window.__said;");
const press = (sel) => chrome.eval(`document.querySelector(${JSON.stringify(sel)}).click(); return 1;`);

/* The page loads clean ──────────────────────────────── */

/* Chrome fires this benign ResizeObserver notice as an error event whenever the
   stage re-fits its backing store. It is not a fault in the page. */
const BENIGN = /ResizeObserver loop (?:completed|limit exceeded)/;
const errs = (await allErrors()).filter(e => !BENIGN.test(e));
check('the page loads without errors', errs.length === 0, errs.join(' | ') || 'none');

const box = await chrome.eval(`
  const c = document.getElementById('stage');
  const b = c.getBoundingClientRect();
  return { left: b.left, top: b.top, s: b.width / 900 };
`);
check('the canvas is not squashed', box.s > 0.9 && box.s < 1.05, 'scale ' + box.s.toFixed(3));

/* ── Initial state ──────────────────────────────────── */

const init = await readouts();
check('it opens on the equal-carts preset',
  init.mA === '20' && init.mB === '20' && init.vA === '8' && init.vB === '0' && init.e === '1',
  [init.mA, init.mB, init.vA, init.vB, init.e].join('/'));

check('the slider badges name their units',
  init.mAOut === '20 kg' && init.vAOut === '8 m/s' && init.eOut === '1.00',
  [init.mAOut, init.vAOut, init.eOut].join(', '));

check('before the run the momentum in and out are already equal',
  init.in === '160 kg·m/s' && init.out === init.in, init.in + ' / ' + init.out);

check('nothing has been launched yet',
  init.kept === '—' && /^Ready/.test(init.verdict), init.verdict);

check('the two carts start at their set speeds',
  init.left === '8.00 m/s' && init.right === '0.00 m/s', init.left + ', ' + init.right);

check('the default preset button reads as pressed',
  await chrome.eval("return document.querySelector('[data-preset=\\'equal-carts\\']').getAttribute('aria-pressed');") === 'true');

check('no other preset button is pressed',
  await chrome.eval(`
    return Array.from(document.querySelectorAll('[data-preset]'))
      .filter(b => b.getAttribute('aria-pressed') === 'true').length;`) === 1);

/* ── Ink layout ─────────────────────────────────────── */

const ink = await chrome.eval(`
  return {
    scene: __ink(16, 16, 600, 524),
    panel: __ink(612, 16, 884, 524),
    gutter: __ink(602, 16, 610, 524),
    outside: __outside(),
    edge: __ink(0, 0, 900, 2) + __ink(0, 538, 900, 540)
        + __ink(0, 0, 2, 540) + __ink(898, 0, 900, 540),
    track: __ink(120, 380, 500, 392),
    caption: __ink(628, 388, 872, 500)
  };
`);
check('the scene has real ink in it', ink.scene > 1.5, ink.scene + '% covered');
check('the panel has real ink in it', ink.panel > 5, ink.panel + '% covered');
check('the gutter between the blocks is clear', ink.gutter === 0, ink.gutter + '% ink');
check('nothing spills outside the two blocks', ink.outside === 0, ink.outside + 'px');
check('the canvas edge itself is clean', ink.edge === 0, ink.edge + 'px');
check('the track is drawn across the scene', ink.track > 30, ink.track + '% covered');
check('the caption is drawn and stays inside the panel', ink.caption > 1, ink.caption + '% covered');

/* The carts start 3.5 m either side of the centre, which is 91 px away. */
const start = await chrome.eval("return __carts();");
check('both carts are drawn before the launch',
  start.a && start.b && start.a.n > 900 && start.b.n > 900,
  start.a ? start.a.n + 'px, ' + start.b.n + 'px' : 'missing');
check('the carts start symmetrically about the centre',
  start.a && start.b && Math.abs(start.a.x - 217) < 2 && Math.abs(start.b.x - 399) < 2,
  start.a && start.b ? start.a.x + ' and ' + start.b.x : '?');
check('the two carts are the same length, because their masses match',
  start.a && start.b && Math.abs((start.a.right - start.a.left) - (start.b.right - start.b.left)) < 2,
  start.a && start.b ? (start.a.right - start.a.left).toFixed(1) + ' vs ' + (start.b.right - start.b.left).toFixed(1) : '?');
check('the carts rest on the floor line',
  start.a && start.b && Math.abs(start.a.bottom - 385) < 3 && Math.abs(start.b.bottom - 385) < 3,
  start.a && start.b ? start.a.bottom + ' / ' + start.b.bottom : '?');
check('the carts do not start overlapping',
  start.a && start.b && start.b.left - start.a.right > 60,
  start.a && start.b ? (start.b.left - start.a.right).toFixed(1) + 'px apart' : '?');

const amber0 = await chrome.eval("return __amber();");
check('nothing amber is drawn before the launch',
  amber0.mark === 0 && amber0.arrows === 0, JSON.stringify(amber0));

/* ── Launching the equal carts ──────────────────────── */

await chrome.eval("window.__frames = 0; return 1;");
await press('[data-action=launch]');
await sleep(160);
const closing = await readouts();
check('launching sets the verdict to closing', /^Closing at/.test(closing.verdict), closing.verdict);

const framesWhileRunning = await chrome.eval("return window.__frames;");
check('the run is actually animating', framesWhileRunning > 3, framesWhileRunning + ' frames in 160ms');

await sleep(2200);
const swapped = await readouts();
check('two equal carts swap their speeds',
  num(swapped.left) < 0.01 && Math.abs(num(swapped.right) - 8) < 0.01,
  swapped.left + ', ' + swapped.right);
check('momentum still adds to the same total',
  swapped.in === '160 kg·m/s' && swapped.out === swapped.in, swapped.in + ' / ' + swapped.out);
check('a springy collision keeps all of the energy',
  swapped.kept === '100%' && /Momentum kept, 100%/.test(swapped.verdict),
  swapped.kept + ', ' + swapped.verdict);

const afterSwap = await chrome.eval("return __carts();");
const markInk = await chrome.eval("return __amber().mark;");
check('the impact mark is left where they met',
  markInk > 60, markInk + 'px of mark');

/* The left cart travels right until its nose reaches the parked cart, so the
   meeting point is the initial gap, not the centre of the track. */
const CONTACT_X = 308 + 3.5 * 26 - (48.8 / 2 + 48.8 / 2 + 4);
check('the stopped cart stays where the collision caught it',
  afterSwap.a && Math.abs(afterSwap.a.x - CONTACT_X) < 3,
  afterSwap.a ? 'centroid ' + afterSwap.a.x + ', expected ' + CONTACT_X.toFixed(1) : '?');
check('the cart that was hit runs on to the far stop',
  afterSwap.b && afterSwap.b.right > 485 && afterSwap.b.left < 445,
  afterSwap.b ? 'spans ' + afterSwap.b.left + '..' + afterSwap.b.right : '?');

/* ── Momentum is conserved, energy is not always ───── */

const runPreset = async (key, settle) => {
  await press('[data-preset=' + key + ']');
  await sleep(120);
  await press('[data-action=launch]');
  await sleep(settle);
  return { ro: await readouts(), drawn: await chrome.eval('return __carts();') };
};

const truck = await runPreset('truck-bike', 2600);
check('the truck keeps most of its speed and the bike is thrown out',
  Math.abs(num(truck.ro.left) - 4.7) < 0.02 && Math.abs(num(truck.ro.right) - 10.4) < 0.02,
  truck.ro.left + ', ' + truck.ro.right);
check('a 120 kg truck throws a 15 kg bike without losing momentum',
  truck.ro.in === '720 kg·m/s' && truck.ro.out === truck.ro.in, truck.ro.in + ' / ' + truck.ro.out);
check('the truck-bike collision keeps all but a percent of the energy',
  truck.ro.kept === '99%', truck.ro.kept);
check('the heavier cart is drawn longer than the lighter one',
  truck.drawn.a && truck.drawn.b
    && (truck.drawn.a.right - truck.drawn.a.left) > (truck.drawn.b.right - truck.drawn.b.left) + 8,
  truck.drawn.a ? (truck.drawn.a.right - truck.drawn.a.left).toFixed(1) + ' vs '
    + (truck.drawn.b.right - truck.drawn.b.left).toFixed(1) : '?');

const cue = await runPreset('cue-ball', 2200);
check('a 7 kg ball into a 6 kg ball nearly stops the striker',
  Math.abs(num(cue.ro.left) - 0.38) < 0.02 && Math.abs(num(cue.ro.right) - 5.38) < 0.02,
  cue.ro.left + ', ' + cue.ro.right);
check('the near-equal masses still keep every joule',
  cue.ro.in === '35 kg·m/s' && cue.ro.out === cue.ro.in && cue.ro.kept === '100%',
  cue.ro.in + ' / ' + cue.ro.out + ', ' + cue.ro.kept);

const clay = await runPreset('clay-block', 3400);
check('clay and cart lock together at a third of the closing speed',
  Math.abs(num(clay.ro.left) - 3.2) < 0.02 && Math.abs(num(clay.ro.right) - 3.2) < 0.02,
  clay.ro.left + ', ' + clay.ro.right);
check('the locked pair is drawn nose to nose, with no gap',
  clay.drawn.a && clay.drawn.b && clay.drawn.b.left - clay.drawn.a.right < 5
    && clay.drawn.b.left - clay.drawn.a.right > -5,
  clay.drawn.a && clay.drawn.b
    ? (clay.drawn.b.left - clay.drawn.a.right).toFixed(1) + 'px between them' : '?');
check('a dead-stop collision keeps the momentum exactly',
  clay.ro.in === '160 kg·m/s' && clay.ro.out === clay.ro.in, clay.ro.in + ' / ' + clay.ro.out);
check('a dead-stop collision loses three fifths of the energy',
  clay.ro.kept === '40%' && /^Locked together/.test(clay.ro.verdict),
  clay.ro.kept + ', ' + clay.ro.verdict);
check('the locked pair says so in the verdict', /^Locked together at 3\.2 m\/s$/.test(clay.ro.verdict),
  clay.ro.verdict);

/* Every preset, one sweep: momentum in must equal momentum out, always. */
const conservation = [];
for (const key of ['equal-carts', 'truck-bike', 'cue-ball', 'clay-block']) {
  await press('[data-preset=' + key + ']');
  await sleep(100);
  await press('[data-action=launch]');
  await sleep(2600);
  const ro = await readouts();
  conservation.push({ key, in: num(ro.in), out: num(ro.out), kept: ro.kept });
}
check('every preset conserves momentum to the joule',
  conservation.every(r => Math.abs(r.in - r.out) < 1e-9 && r.in !== 0),
  conservation.map(r => r.key + ' ' + r.in + '=' + r.out).join(', '));
check('the energy share is lossless only where the collision really is springy',
  conservation.filter(r => r.kept === '100%').length === 2
    && conservation.filter(r => r.kept === '40%').length === 1
    && conservation.every(r => r.kept === '100%' || r.kept === '99%' || r.kept === '40%'),
  conservation.map(r => r.key + ' ' + r.kept).join(', '));

/* ── A settled run stops repainting ────────────────── */

await press('[data-preset=clay-block]');
await sleep(150);
await press('[data-action=launch]');
await sleep(4000);
const framesA = await chrome.eval("return window.__frames;");
await sleep(500);
const framesB = await chrome.eval("return window.__frames;");
check('a settled run stops drawing frames', framesB === framesA,
  framesA + ' → ' + framesB + ' over 500ms');

/* ── Setups that never collide ──────────────────────── */

await press('[data-preset=equal-carts]');
await sleep(120);
await chrome.eval(`
  const set = (id, v) => { const el = document.getElementById(id); el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('speedA', 0); set('speedB', 0);
  return 1;
`);
await sleep(150);
const still = await readouts();
check('a slider edit puts the verdict back to ready',
  still.verdict === 'Ready — press Launch', still.verdict);
await press('[data-action=launch]');
await sleep(600);
const nothing = await readouts();
check('launching two stationary carts says so',
  nothing.verdict === 'Nothing is moving', nothing.verdict);
const untouched = await chrome.eval('return __carts();');
check('and neither cart has moved',
  Math.abs(untouched.a.x - 217) < 3 && Math.abs(untouched.b.x - 399) < 3,
  untouched.a.x + ' and ' + untouched.b.x);

/* A cart set off from the right catches the one on the left instead: both
   sliders always point inwards, so the pair can only close or stand still. */
await chrome.eval(`
  const set = (id, v) => { const el = document.getElementById(id); el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('massA', 20); set('massB', 40); set('speedA', 0); set('speedB', 9); set('bounce', 1);
  return 1;
`);
await sleep(120);
const catchUp = await readouts();
check('with one cart parked the verdict is ready, not running',
  /^Ready/.test(catchUp.verdict), catchUp.verdict);
await press('[data-action=launch]');
await sleep(2600);
const caught = await readouts();
check('a cart arriving from the right pushes the parked one off at 12 m/s',
  Math.abs(num(caught.left) - 12) < 0.01 && Math.abs(num(caught.right) - 3) < 0.01,
  caught.left + ', ' + caught.right);
/* The pair set off to the left together, so the momentum is negative: the sign
   is kept on the readout so the number still adds up to what went in. */
check('and momentum still balances, sign and all',
  caught.in === '−360 kg·m/s' && caught.out === caught.in, caught.in + ' / ' + caught.out);

/* ── A closing pair that has both speeds ────────────── */

await chrome.eval(`
  const set = (id, v) => { const el = document.getElementById(id); el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('massA', 60); set('massB', 20); set('speedA', 6); set('speedB', 6); set('bounce', 0);
  return 1;
`);
await sleep(150);
await press('[data-action=launch]');
await sleep(2600);
const headOn = await readouts();
check('a head-on pair with no bounce moves off together at 3 m/s',
  Math.abs(num(headOn.left) - 3) < 0.02 && Math.abs(num(headOn.right) - 3) < 0.02,
  headOn.left + ', ' + headOn.right);
check('a head-on dead stop conserves momentum',
  Math.abs(num(headOn.in) - 240) < 1 && Math.abs(num(headOn.out) - 240) < 1,
  headOn.in + ' / ' + headOn.out);
check('and the heavier cart has to lose a quarter of the energy',
  headOn.kept === '25%', headOn.kept + ' (expected 25%)');
check('which is exactly the ratio the masses predict',
  Math.abs((headOn.kept === '25%' ? 0.25 : NaN)
    - (0.5 * 80 * 9) / (0.5 * 60 * 36 + 0.5 * 20 * 36)) < 0.005, 'measured against the closed form');

/* ── A slider change restarts the run ───────────────── */

await press('[data-preset=clay-block]');
await sleep(120);
await press('[data-action=launch]');
await sleep(2400);
const collided = await chrome.eval('return __carts();');
await chrome.eval(`
  const el = document.getElementById('massA');
  el.value = 100; el.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
`);
await sleep(200);
const afterEdit = await readouts();
const restarted = await chrome.eval('return __carts();');
check('changing a mass mid-run puts the verdict back to ready',
  /^Ready/.test(afterEdit.verdict), afterEdit.verdict);
check('and puts the carts back on their start marks',
  Math.abs(restarted.a.x - 217) < 3 && Math.abs(restarted.b.x - 399) < 3,
  restarted.a.x + ' and ' + restarted.b.x);
check('the collision record is cleared, not left stale',
  afterEdit.kept === '—' && Math.abs(num(afterEdit.in) - num(afterEdit.out)) < 1e-9,
  afterEdit.kept + ', ' + afterEdit.in);
check('a preset caption is dropped once the numbers no longer match it',
  await chrome.eval(`
    return Array.from(document.querySelectorAll('[data-preset]'))
      .every(b => b.getAttribute('aria-pressed') === 'false');`), 'all unpressed');
check('and the run starts again when Launch is pressed once more',
  (await (async () => { await press('[data-action=launch]'); await sleep(400);
    return readouts(); })()).verdict !== 'Ready — press Launch', 'running');

/* ── Keyboard ───────────────────────────────────────── */

await chrome.goto(server.url(PAGE));
await sleep(700);
await installProbes();
const kbd0 = await readouts();
await chrome.eval("document.getElementById('massA').focus(); return 1;");
for (let i = 0; i < 4; i++) {
  await chrome.send('Input.dispatchKeyEvent',
    { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await chrome.send('Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
}
await sleep(250);
const kbd1 = await readouts();
check('a slider can be driven from the keyboard',
  num(kbd1.mA) === num(kbd0.mA) + 4 && kbd1.mAOut === kbd1.mA + ' kg',
  kbd0.mA + ' → ' + kbd1.mA + ' kg');
check('a keyboard change takes the setup off its preset',
  await chrome.eval("return document.querySelector('[data-preset=equal-carts]').getAttribute('aria-pressed');") === 'false');

await chrome.eval("document.querySelector('[data-action=launch]').focus(); return 1;");
await chrome.send('Input.dispatchKeyEvent',
  { type: 'rawKeyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
await chrome.send('Input.dispatchKeyEvent',
  { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
await sleep(1800);
check('Launch can be pressed from the keyboard too',
  num((await readouts()).out) === num((await readouts()).in), 'momentum still balances');

/* Every preset button is a real button, reachable and labelled. */
const buttons = await chrome.eval(`
  return Array.from(document.querySelectorAll('[data-preset]')).map(b => ({
    tag: b.tagName, text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'),
    keyable: b.tabIndex >= 0
  }));`);
check('every preset is a real button with a name',
  buttons.length === 4 && buttons.every(b => b.tag === 'BUTTON' && b.text && b.keyable),
  buttons.map(b => b.text).join(', '));

/* ── Announcements ──────────────────────────────────── */

await chrome.goto(server.url(PAGE));
await sleep(700);
await installProbes();
await press('[data-preset=clay-block]');
await sleep(200);
await press('[data-action=launch]');
await sleep(3400);
await chrome.eval("window.__stopWatch(); return 1;");
const allSaid = await said();
check('the preset, the launch and the impact were announced once each',
  allSaid.length === 3, allSaid.length + ': ' + allSaid.map(t => t.slice(0, 14)).join(' / '));
check('the impact was announced, with the size of the push',
  allSaid.some(t => /Impact\. Each cart is pushed with/.test(t)),
  (allSaid.find(t => /Impact/.test(t)) || 'none').slice(0, 60));
check('the locked pair was announced as one object, not as two separate carts',
  allSaid.some(t => /lock together and carry on as one/.test(t)),
  (allSaid.find(t => /lock/.test(t)) || 'none').slice(0, 70));
check('the announcement is a whole joule figure, not a per-frame readout',
  !allSaid.some(t => /kg·m\/s/.test(t)) && !allSaid.some(t => /40%/.test(t)),
  allSaid.filter(t => /kg·m\/s|40%/.test(t)).join(' | ') || 'none');
check('a hundred frames produced a handful of announcements, not a hundred',
  allSaid.length < 12, allSaid.length + ' over the whole run');

/* ── Reset ──────────────────────────────────────────── */

await press('[data-preset=truck-bike]');
await sleep(150);
await press('[data-action=launch]');
await sleep(2200);
await press('[data-action=reset]');
await sleep(250);
const afterReset = await readouts();
check('reset puts the sliders back on the default preset',
  afterReset.mA === '20' && afterReset.mB === '20' && afterReset.vA === '8' && afterReset.e === '1',
  [afterReset.mA, afterReset.mB, afterReset.vA, afterReset.e].join('/'));
check('reset clears the collision', afterReset.kept === '—' && /^Ready/.test(afterReset.verdict),
  afterReset.verdict);
check('reset clears the impact mark from the canvas',
  (await chrome.eval("return __amber().mark;")) === 0);
const resetDrawn = await chrome.eval('return __carts();');
check('reset returns the carts to their start marks',
  Math.abs(resetDrawn.a.x - 217) < 3 && Math.abs(resetDrawn.b.x - 399) < 3,
  resetDrawn.a.x + ' and ' + resetDrawn.b.x);

/* ── Resize survival ────────────────────────────────── */

await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: 760, height: 1000, deviceScaleFactor: 2, mobile: false }, chrome.session);
await sleep(600);
const afterResize = await chrome.eval(`
  return { ink: __ink(16, 16, 600, 524), outside: __outside(),
           backing: document.getElementById('stage').width };`);
check('the canvas repaints after a resize', afterResize.ink > 1.5, afterResize.ink + '% ink');
check('nothing spills outside the blocks after a resize', afterResize.outside === 0,
  afterResize.outside + 'px');
check('the backing store was re-fitted for the new ratio',
  afterResize.backing > 900, 'backing ' + afterResize.backing + 'px');

await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false }, chrome.session);
await sleep(500);

/* ── Reduced motion ─────────────────────────────────── */

await chrome.send('Emulation.setEmulatedMedia',
  { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, chrome.session);
await chrome.goto(server.url(PAGE));
await sleep(800);
await installProbes();
const rm0 = await readouts();
const rmDrawn0 = await chrome.eval('return __carts();');
check('a reduced-motion visitor still gets a drawn frame',
  (await chrome.eval('return __ink(16, 16, 600, 524);')) > 1.5);
check('a reduced-motion visitor still gets live controls',
  /^Ready/.test(rm0.verdict) && rm0.mA === '20', rm0.verdict);
check('nothing animates on its own under reduced motion',
  (await chrome.eval('return __frames;')) < 3, (await chrome.eval('return __frames;')) + ' frames drawn');

await press('[data-action=launch]');
await sleep(500);
const rm1 = await readouts();
const rmDrawn1 = await chrome.eval('return __carts();');
check('the collision is still resolved under reduced motion',
  Math.abs(num(rm1.left)) < 0.01 && Math.abs(num(rm1.right) - 8) < 0.01,
  rm1.left + ', ' + rm1.right);
check('the momentum still balances with no frames drawn',
  rm1.in === rm1.out && rm1.kept === '100%', rm1.in + ' / ' + rm1.out);
check('the frame is held at the moment of contact',
  rmDrawn0 && rmDrawn1 && Math.abs(rmDrawn1.a.x - rmDrawn0.a.x) > 20
    && Math.abs(rmDrawn1.a.x - CONTACT_X) < 3,
  'centroid ' + (rmDrawn1.a ? rmDrawn1.a.x : '?') + ', contact at ' + CONTACT_X.toFixed(1));
const rmArrows = await chrome.eval(
  "return { a: __count(125, 211, 252, 12), b: __count(244, 114, 182, 12) };");
check('and the force arrows are up in that still frame',
  rmArrows.a > 40 && rmArrows.b > 40,
  rmArrows.a + 'px and ' + rmArrows.b + 'px of arrow');
await sleep(600);
const rm2 = await chrome.eval('return __carts();');
check('the reduced-motion frame does not drift afterwards',
  Math.abs(rm2.a.x - rmDrawn1.a.x) < 0.5, rmDrawn1.a.x + ' → ' + rm2.a.x);
check('and no frames are being drawn to hold it there',
  (await chrome.eval("return window.__frames;")) < 6, (await chrome.eval("return window.__frames;")) + ' total');

await chrome.send('Emulation.setEmulatedMedia', { features: [] }, chrome.session);

/* ── Help, icons and accessibility wiring ───────────── */

await chrome.goto(server.url(PAGE));
await sleep(700);
await chrome.eval("document.querySelector('[data-action=help]').click(); return 1;");
await sleep(200);
const helpOpen = await chrome.eval(`
  return { hidden: document.getElementById('help').hidden,
           expanded: document.querySelector('[data-action=help]').getAttribute('aria-expanded') };`);
check('help opens and reports its state',
  helpOpen.hidden === false && helpOpen.expanded === 'true', JSON.stringify(helpOpen));

const icons = await chrome.eval(`
  const withIcon = sel => !!document.querySelector(sel + ' svg');
  return {
    total: document.querySelectorAll('svg.lucide, svg[class*=lucide]').length,
    back: withIcon('a.ev-btn'), reset: withIcon('[data-action=reset]'),
    launch: withIcon('[data-action=launch]'), insight: withIcon('#insight')
  };`);
check('every icon slot rendered a lucide svg',
  icons.total === 5 && icons.back && icons.reset && icons.launch && icons.insight,
  icons.total + ' svgs');

const a11y = await chrome.eval(`
  const c = document.getElementById('stage');
  return {
    role: c.getAttribute('role'),
    label: (c.getAttribute('aria-label') || '').length,
    tabindex: c.getAttribute('tabindex'),
    skip: !!document.querySelector('.ev-skip[href="#main"]'),
    live: document.querySelectorAll('[aria-live]').length,
    insight: document.getElementById('insight').hidden
  };`);
check('the canvas is an image with a real description',
  a11y.role === 'img' && a11y.label > 120, a11y.role + ', ' + a11y.label + ' chars');
check('the canvas is not in the tab order, because it is not a control',
  a11y.tabindex === null, String(a11y.tabindex));
check('the page has a skip link, and the insight starts hidden',
  a11y.skip && a11y.insight, 'skip=' + a11y.skip);

/* Four deliberate setups, each further apart than the 900ms interaction window,
   so one burst of clicking cannot reveal the insight on its own. */
for (const key of ['clay-block', 'clay-block', 'truck-bike', 'cue-ball']) {
  await press('[data-preset=' + key + ']');
  await sleep(950);
}
const insightShown = await chrome.eval("return !document.getElementById('insight').hidden;");
check('the insight appears once the learner has tried several setups', insightShown);

const finalErrs = (await allErrors()).filter(e => !BENIGN.test(e));
check('no errors across the whole session', finalErrs.length === 0, finalErrs.join(' | ') || 'none');

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
await chrome.close();
server.close();
process.exit(fail ? 1 : 0);
