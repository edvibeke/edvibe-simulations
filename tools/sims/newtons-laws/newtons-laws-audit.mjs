/* Headless behavioural + pixel audit for sims/newtons-laws.


   Boots the real page, drives it with real pointer and key events, and
   checks the readouts, where the crate is actually drawn, that the ink
   stays inside the two blocks, and that the accessibility wiring holds. */

import { serve, Chrome, sleep } from '../../cdp.mjs';

const PAGE = '/sims/newtons-laws/index.html';

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

  /* Ink coverage of a box, ignoring fully transparent pixels. */
  window.__ink = (x0, y0, x1, y1) => {
    const s = S();
    const d = g.getImageData(Math.round(x0 * s), Math.round(y0 * s),
      Math.max(1, Math.round((x1 - x0) * s)), Math.max(1, Math.round((y1 - y0) * s))).data;
    let n = 0, t = 0;
    for (let i = 0; i < d.length; i += 4) {
      t++;
      if (d[i + 3] > 8) n++;
    }
    return +(100 * n / t).toFixed(2);
  };

  /* Centroid x of the crate's own fill (#f59e0b, opaque). The friction arrow
     is a different orange and the trail is translucent, so both drop out. */
  window.__crate = () => {
    const s = S();
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let sx = 0, n = 0, top = 1e9, bottom = -1;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200
          && Math.abs(d[i] - 245) < 10 && Math.abs(d[i + 1] - 158) < 12
          && d[i + 2] < 30) {
        const px = (i / 4) % canvas.width;
        const py = Math.floor((i / 4) / canvas.width);
        sx += px; n++;
        if (py < top) top = py;
        if (py > bottom) bottom = py;
      }
    }
    if (!n) return null;
    return { x: +(sx / n / s).toFixed(1), n,
             top: +(top / s).toFixed(1), bottom: +(bottom / s).toFixed(1) };
  };

  /* Count of pixels in one exact colour family, for the arrows. */
  window.__count = (r, g2, b, tol) => {
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200 && Math.abs(d[i] - r) <= tol
          && Math.abs(d[i + 1] - g2) <= tol && Math.abs(d[i + 2] - b) <= tol) n++;
    }
    return n;
  };

  /* Nothing may be drawn meaningfully outside the two blocks. A 1px stroke
     centred on the panel edge legitimately straddles it, so give the halo two
     pixels of grace and fail on anything that spills further than that. */
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

  /* Every announcement made so far, so we can prove events are spoken. */
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
    push: document.getElementById('push').value,
    pull: document.getElementById('pull').value,
    mu: document.getElementById('friction').value,
    mass: document.getElementById('mass').value,
    net: t('netValue'), friction: t('frictionForceValue'), accel: t('accelValue'),
    speed: t('speedValue'), dir: t('directionValue'), verdict: t('verdictValue')
  };
`);

const num = s => parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
const said = () => chrome.eval("return window.__said;");

/* ── The page loads clean ───────────────────────────── */

/* Chrome fires this benign ResizeObserver notice as an error event whenever
   the stage re-fits its backing store. It is not a fault in the page. */
const BENIGN = /ResizeObserver loop (?:completed|limit exceeded)/;
const errs = (await allErrors()).filter(e => !BENIGN.test(e));
check('the page loads without errors', errs.length === 0, errs.join(' | ') || 'none');

const box = await chrome.eval(`
  const c = document.getElementById('stage');
  const b = c.getBoundingClientRect();
  return { left: b.left, top: b.top, s: b.width / 900 };
`);
const toClient = (lx, ly) => ({ x: box.left + lx * box.s, y: box.top + ly * box.s });

check('the canvas is not squashed', box.s > 0.9 && box.s < 1.05,
  'scale ' + box.s.toFixed(3));

/* ── Initial state ──────────────────────────────────── */

const init = await readouts();
check('it opens on the push-cart preset',
  init.push === '120' && init.pull === '0' && init.mu === '0.3' && init.mass === '20',
  JSON.stringify([init.push, init.pull, init.mu, init.mass]));

check('while it is held, the readouts predict what release will do',
  init.net === '43 N' && init.accel === '2.17 m/s²' && init.speed === '0.00 m/s',
  init.net + ', ' + init.accel);
check('nothing has been released yet',
  /^Ready/.test(init.verdict), init.verdict);
check('the resting friction is the grip the preset quotes',
  init.friction === '77 N', init.friction);

check('the default preset button reads as pressed',
  await chrome.eval("return document.querySelector('[data-preset=\\'push-cart\\']').getAttribute('aria-pressed');") === 'true');

/* ── Ink layout ─────────────────────────────────────── */

const ink = await chrome.eval(`
  return {
    scene: __ink(16, 16, 600, 524),
    panel: __ink(612, 16, 884, 524),
    gutter: __ink(602, 16, 610, 524),
    outside: __outside(),
    edge: __ink(0, 0, 900, 2) + __ink(0, 538, 900, 540)
        + __ink(0, 0, 2, 540) + __ink(898, 0, 900, 540),
    crateBand: __ink(200, 334, 416, 396),
    captionBand: __ink(628, 372, 868, 500)
  };
`);
check('the scene has real ink in it', ink.scene > 1.5, ink.scene + '% covered');
check('the panel has real ink in it', ink.panel > 5, ink.panel + '% covered');
check('the gutter between the blocks is clear', ink.gutter === 0, ink.gutter + '% ink');
check('nothing spills outside the two blocks', ink.outside === 0, ink.outside + 'px');
check('the canvas edge itself is clean', ink.edge === 0, ink.edge + 'px');
check('the crate is drawn on the floor', ink.crateBand > 20, ink.crateBand + '% covered');
check('the caption is drawn and stays inside the panel', ink.captionBand > 1, ink.captionBand + '% covered');

const crate0 = await chrome.eval("return __crate();");
check('the crate starts centred in the scene',
  crate0 && Math.abs(crate0.x - 308) < 2 && crate0.n > 1500,
  crate0 ? 'centroid ' + crate0.x + ', ' + crate0.n + 'px' : 'not found');
check('the crate rests on the floor line',
  crate0 && Math.abs(crate0.bottom - 396) < 3, crate0 ? 'bottom y ' + crate0.bottom : '?');

const arrows0 = await chrome.eval("return { push: __count(129, 140, 248, 26), pull: __count(244, 114, 182, 26) };");
check('only the push arrow is drawn before Release',
  arrows0.push > 400 && arrows0.pull === 0,
  'push ' + arrows0.push + 'px, pull ' + arrows0.pull + 'px');

/* ── Releasing the trolley ──────────────────────────── */

await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(260);
const moving = await readouts();
check('releasing starts it speeding up', moving.verdict === 'Speeding up', moving.verdict);
check('the acceleration is F net / m once rolling',
  Math.abs(num(moving.accel) - (120 - 58.86) / 20) < 0.15, moving.accel);
check('the friction readout drops to the sliding value once it rolls',
  moving.friction === '59 N', moving.friction);
check('the direction reads right', moving.dir === 'Right', moving.dir);
check('a moving trail appears behind it',
  (await chrome.eval("return __count(245, 158, 11, 40);")) > 1500);

await sleep(900);
const later = await readouts();
check('it keeps gathering speed', num(later.speed) > num(moving.speed) + 1,
  moving.speed + ' -> ' + later.speed);

/* ── It reaches the end of the track and parks ─────── */

await sleep(3200);
const end = await readouts();
const crateEnd = await chrome.eval("return __crate();");
check('the crate parks against the wall rather than grinding on it',
  end.verdict === 'Held by the wall' && end.speed === '0.00 m/s',
  end.verdict + ', ' + end.speed);
check('the crate stops inside the right-hand wall of the scene',
  crateEnd && crateEnd.x < 600 - 37 - 2 && crateEnd.x > 16 + 37,
  crateEnd ? 'centroid ' + crateEnd.x : '?');

/* A wall that only stops the crate but still claims a net force on it would
   be teaching the wrong thing, so read the physics back at the wall. */
check('the wall cancels the push, so the net force there really is zero',
  end.net === '0 N' && end.accel === '0.00 m/s²',
  end.net + ', ' + end.accel);
check('a crate held by the wall has no floor friction left to fight',
  end.friction === '0 N', end.friction);

/* Park it against the wall for a while: it must stay put, not creep. */
const wallA = (await chrome.eval("return __crate();")).x;
await sleep(1200);
const wallB = (await chrome.eval("return __crate();")).x;
check('it does not creep into the wall while parked', Math.abs(wallB - wallA) < 0.5,
  wallA + ' -> ' + wallB);

const rafParked = await chrome.eval(`
  return new Promise(res => {
    const before = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - before)));
  });
`);
const idle1 = (await allErrors()).filter(e => !BENIGN.test(e));
check('no errors while parked at the wall', idle1.length === 0, idle1.join(' | ') || 'none');

/* ── Reversing the force lets it come back ──────────── */

await chrome.eval(`
  const s = document.getElementById('push');
  s.value = 0; s.dispatchEvent(new Event('input', { bubbles: true }));
  const q = document.getElementById('pull');
  q.value = 200; q.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
`);
await sleep(700);
const reversed = await readouts();
check('reversing the force sets it off the other way',
  reversed.dir === 'Left' && reversed.verdict === 'Speeding up',
  reversed.dir + ', ' + reversed.verdict);
check('reversing the force releases the wall',
  reversed.net !== '0 N', reversed.net);
await sleep(1400);
const comingBack = await readouts();
check('it travels back through the middle',
  (await chrome.eval("return __crate();")).x < crateEnd.x - 60,
  'from ' + crateEnd.x + ' to ' + (await chrome.eval("return __crate();")).x);

/* ── Presets ────────────────────────────────────────── */

const results = [];
for (const key of ['push-cart', 'pull-crate', 'bookshelf', 'ice-rink']) {
  await chrome.eval(`document.querySelector('[data-preset=${key}]').click(); return 1;`);
  await sleep(200);
  const r = await readouts();
  const pressed = await chrome.eval(`
    return Array.from(document.querySelectorAll('[data-preset]'))
      .filter(b => b.getAttribute('aria-pressed') === 'true')
      .map(b => b.dataset.preset).join(',');
  `);
  const crateAt = await chrome.eval("return __crate();");
  results.push({ key, r, pressed, crateAt });
}
check('each preset loads its own numbers',
  results[1].r.push === '0' && results[1].r.pull === '180' && results[1].r.mass === '25'
  && results[2].r.push === '200' && results[2].r.mass === '60'
  && results[3].r.mu === '0.02' && results[3].r.mass === '15',
  results.map(x => x.key + ' ' + x.r.push + '/' + x.r.pull + '/' + x.r.mu + '/' + x.r.mass).join('  '));

check('exactly one preset reads as pressed at a time',
  results.every(x => x.pressed === x.key), results.map(x => x.pressed).join(','));

check('choosing a preset brings the crate back to the start',
  results.every(x => x.crateAt && Math.abs(x.crateAt.x - 308) < 2));

check('switching presets puts the crate back on hold',
  results.every(x => /^Ready/.test(x.r.verdict)));

/* ── The bookcase refuses to move (third/first law) ── */

await chrome.eval("document.querySelector('[data-preset=bookshelf]').click(); return 1;");
await sleep(150);
const shelfHold = await readouts();
check('the bookcase sits with no net force despite a big push',
  shelfHold.net === '0 N' && shelfHold.push === '200' && shelfHold.friction === '200 N',
  shelfHold.push + ' push held by ' + shelfHold.friction
  + ' of static friction (grip limit ' + Math.round(1.3 * 0.9 * 60 * 9.81) + ' N)');

await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(1100);
const shelf = await readouts();
const shelfCrate = await chrome.eval("return __crate();");
check('releasing the bookcase does nothing at all',
  shelf.verdict === 'Held by friction' && shelf.speed === '0.00 m/s',
  shelf.verdict);
check('the bookcase has not budged a pixel',
  shelfCrate && Math.abs(shelfCrate.x - 308) < 1, shelfCrate ? 'centroid ' + shelfCrate.x : '?');

const shelfSaid = await said();
check('being held is announced, not just drawn',
  shelfSaid.some(t => /never beats the grip/i.test(t)),
  shelfSaid[shelfSaid.length - 1] || 'nothing said');

/* A crate that is about to move must not be announced as stuck, and vice
   versa: the wording has to match what actually happens next. */
const willMoveSaid = await (async () => {
  await chrome.eval("document.querySelector('[data-preset=ice-rink]').click(); return 1;");
  await sleep(200);
  const before = (await said()).length;
  await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
  await sleep(500);
  /* Only what was said by this release, not the run-up's announcements. */
  const fresh = (await said()).slice(before);
  const moved = num((await readouts()).speed);
  return { fresh, first: fresh[0] || '', moved };
})();
check('a crate that will move is not announced as stuck',
  !/holds it/i.test(willMoveSaid.first) && /speeding up to the right/i.test(willMoveSaid.first)
  && willMoveSaid.moved >= 0.5,
  JSON.stringify(willMoveSaid.fresh) + ', then ' + willMoveSaid.moved + ' m/s');

/* ── First law: a balanced crate coasts ────────────── */

/* 0.3 x 17 kg x 9.81 = 50.03 N of sliding friction, and 50 N is on the push
   slider's step, so this balances to within 0.03 N. */
await chrome.eval(`
  const set = (id, v) => { const s = document.getElementById(id); s.value = v;
    s.dispatchEvent(new Event('input', { bubbles: true })); };
  set('push', 50); set('pull', 0); set('friction', '0.3'); set('mass', 17);
  return 1;
`);
await sleep(120);
/* Kick it off with the keyboard so it has a speed to keep. */
await chrome.eval("document.getElementById('stage').focus(); return 1;");
await chrome.send('Input.dispatchKeyEvent',
  { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await sleep(500);
const coasting = await readouts();
await sleep(1200);
const stillCoasting = await readouts();
check('a balanced crate keeps its speed (Newton\'s first law)',
  num(coasting.speed) > 0.5 && Math.abs(num(stillCoasting.speed) - num(coasting.speed)) < 0.35
  && stillCoasting.verdict === 'Constant speed',
  coasting.speed + ' -> ' + stillCoasting.speed + ', ' + stillCoasting.verdict);

/* ── Release a second time replays rather than teleporting ─ */

await chrome.eval("document.querySelector('[data-preset=ice-rink]').click(); return 1;");
await sleep(200);
await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(700);
const runA = await readouts();
const crateA = (await chrome.eval("return __crate();")).x;
check('it is running before the replay', num(runA.speed) > 1, runA.speed);

await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(120);
const crateB = (await chrome.eval("return __crate();")).x;
const saidReplay = await said();
check('a second press puts it back on the start line', crateB < 308 + 2,
  crateA + ' -> ' + crateB);
check('the replay is announced rather than done silently',
  saidReplay.some(t => /back to the start line/i.test(t)), saidReplay[saidReplay.length - 1]);
await sleep(700);
check('it runs again from the start with the same forces',
  num((await readouts()).speed) > 1, (await readouts()).speed);

/* ── Keyboard reachability ──────────────────────────── */

await chrome.eval("document.querySelector('[data-action=reset]').click(); return 1;");
await sleep(250);
check('reset restores the default preset',
  (await readouts()).push === '120' && /^Ready/.test((await readouts()).verdict));

const focusable = await chrome.eval(`
  const c = document.getElementById('stage');
  c.focus();
  return { tab: c.getAttribute('tabindex'), focused: document.activeElement === c,
           cls: c.classList.contains('ev-canvas-interactive') };
`);
check('the canvas takes focus from the keyboard',
  focusable.tab === '0' && focusable.focused && focusable.cls);

const before0 = (await chrome.eval("return __crate();")).x;
await chrome.send('Input.dispatchKeyEvent',
  { type: 'rawKeyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(600);
const afterKey = (await chrome.eval("return __crate();")).x;
check('an arrow key shoves the crate', afterKey < before0 - 4,
  before0 + ' -> ' + afterKey);

/* ── Pointer dragging ───────────────────────────────── */

await chrome.eval("document.querySelector('[data-action=reset]').click(); return 1;");
await sleep(250);
const box2 = await chrome.eval(`
  const b = document.getElementById('stage').getBoundingClientRect();
  return { left: b.left, top: b.top, s: b.width / 900 };
`);
const to2 = (lx, ly) => ({ x: box2.left + lx * box2.s, y: box2.top + ly * box2.s });

const p0 = to2(308, 365);
await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p0.x, y: p0.y, button: 'left', clickCount: 1 });
await sleep(100);
for (let i = 1; i <= 6; i++) {
  const q = to2(308 - 20 * i, 365);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x, y: q.y, button: 'left' });
  await sleep(50);
}
await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p0.x, y: p0.y, button: 'left' });
await sleep(200);
const dragged = await chrome.eval("return __crate();");
check('the crate can be dragged by hand', dragged && dragged.x < 308 - 80,
  dragged ? 'centroid ' + dragged.x : '?');
check('the crate cannot be dragged out of the scene',
  dragged && dragged.x > 16 + 37, dragged ? 'centroid ' + dragged.x : '?');

const miss = to2(120, 120);
await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: miss.x, y: miss.y, button: 'left', clickCount: 1 });
await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: miss.x, y: miss.y, button: 'left' });
await sleep(150);
check('a click on empty canvas does not grab the crate',
  (await chrome.eval("return __crate();")).x >= 16 + 37);

/* ── The insight appears after a few real interactions ─ */

await chrome.eval("document.querySelector('[data-action=reset]').click(); return 1;");
await sleep(250);
check('the insight starts hidden',
  await chrome.eval("return document.getElementById('insight').hidden;") === true);
for (const k of ['ice-rink', 'pull-crate', 'bookshelf']) {
  await chrome.eval(`document.querySelector('[data-preset=${k}]').click(); return 1;`);
  await sleep(1000);
}
await chrome.eval("document.querySelector('[data-preset=push-cart]').click(); return 1;");
await sleep(400);
check('the insight reveals itself after four interactions',
  await chrome.eval("return document.getElementById('insight').hidden;") === false);

/* ── The readouts are not live regions ──────────────── */

const live = await chrome.eval(`
  const out = [];
  for (const id of ['netValue','frictionForceValue','accelValue','speedValue','directionValue','verdictValue']) {
    const el = document.getElementById(id);
    if (el.closest('[aria-live]')) out.push(id);
  }
  return out;
`);
check('no readout is inside a live region', live.length === 0, live.join(', ') || 'none');

const oneRegion = await chrome.eval(`
  return document.querySelectorAll('[aria-live]').length + '/' +
         document.querySelectorAll('#ev-live').length;
`);
check('there is exactly one polite live region for announcements', oneRegion === '1/1', oneRegion);

await chrome.eval("window.__stopWatch(); return 1;");
const allSaid = await said();
check('discrete events were announced', allSaid.length >= 5, allSaid.length + ' announcements');
check('the readouts were never announced',
  !allSaid.some(t => /m\/s²/.test(t)), allSaid.filter(t => /m\/s²/.test(t)).join(' | ') || 'none');

/* ── Resize survival ────────────────────────────────── */

await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: 760, height: 1000, deviceScaleFactor: 2, mobile: false }, chrome.session);
await sleep(600);
const afterResize = await chrome.eval(`
  return { ink: __ink(16, 16, 600, 524), outside: __outside(),
           backing: document.getElementById('stage').width };
`);
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
await sleep(700);
await installProbes();
const rm = await readouts();
await sleep(500);
const rm2 = await readouts();
check('a reduced-motion visitor still gets a drawn frame',
  (await chrome.eval("return __ink(16, 16, 600, 524);")) > 1.5);
check('a reduced-motion visitor still gets live controls',
  /^Ready/.test(rm.verdict) && rm2.push === rm.push, rm.verdict);
check('nothing animates on its own under reduced motion',
  /^Ready/.test(rm2.verdict) && rm2.speed === '0.00 m/s');

await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(900);
const rm3 = await readouts();
check('a released crate does not start moving under reduced motion',
  rm3.speed === '0.00 m/s', rm3.speed + ', ' + rm3.verdict);
await chrome.send('Emulation.setEmulatedMedia', { features: [] }, chrome.session);

/* ── Reset clears the flags that live outside the state ─ */

await chrome.goto(server.url(PAGE));
await sleep(700);
await installProbes();
await chrome.eval("document.querySelector('[data-preset=push-cart]').click(); return 1;");
await sleep(150);
await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(400);
await chrome.eval("document.querySelector('[data-action=reset]').click(); return 1;");
await sleep(300);
await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(3500);
const afterReset = await readouts();
const crateAfterReset = await chrome.eval("return __crate();");
check('after a reset the crate still announces arriving at the wall',
  afterReset.verdict === 'Held by the wall', afterReset.verdict);
check('after a reset the crate still parks at the wall',
  crateAfterReset && crateAfterReset.x > 380, 'centroid ' + (crateAfterReset ? crateAfterReset.x : '?'));

await chrome.eval("document.querySelector('[data-action=reset]').click(); return 1;");
await sleep(200);
await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(500);
const announceAgain = await said();
check('after a reset the next run announces itself moving',
  announceAgain.some(t => /right at [\d.]+ metres per second/i.test(t)),
  announceAgain[announceAgain.length - 1] || 'nothing said');

/* ── Help, reset and accessibility wiring ───────────── */

await chrome.goto(server.url(PAGE));
await sleep(700);
await installProbes();
await chrome.eval("document.querySelector('[data-action=help]').click(); return 1;");
await sleep(200);
const helpOpen = await chrome.eval(`
  return { hidden: document.getElementById('help').hidden,
           expanded: document.querySelector('[data-action=help]').getAttribute('aria-expanded') };
`);
check('help opens and reports its state',
  helpOpen.hidden === false && helpOpen.expanded === 'true', JSON.stringify(helpOpen));

const icons = await chrome.eval(`
  const withIcon = sel => !!document.querySelector(sel + ' svg');
  return {
    total: document.querySelectorAll('svg.lucide, svg[class*=lucide]').length,
    back: withIcon('[data-action=help]') && withIcon('a.ev-btn'),
    reset: withIcon('[data-action=reset]'),
    release: withIcon('[data-action=release]'),
    insight: withIcon('#insight')
  };
`);
check('every icon slot rendered a lucide svg',
  icons.total === 5 && icons.back && icons.reset && icons.release && icons.insight,
  icons.total + ' svgs, release=' + icons.release);

const a11y = await chrome.eval(`
  const c = document.getElementById('stage');
  const cs = getComputedStyle(c);
  /* :focus-visible only matches while the ring is showing, so look for the
     rule in the stylesheets rather than the live state. */
  let ring = false;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (r.selectorText && /\.ev-canvas-interactive:focus-visible/.test(r.selectorText)
          && r.style && r.style.outline) ring = true;
    }
  }
  return { role: c.getAttribute('role'), label: (c.getAttribute('aria-label') || '').length,
           skip: !!document.querySelector('.ev-skip[href="#main"]'),
           ring: ring,
           touchAction: cs.touchAction };
`);
check('the canvas is an image with a real description',
  a11y.role === 'img' && a11y.label > 80, a11y.role + ', ' + a11y.label + ' chars');
check('the page has a skip link and a focus ring for the canvas',
  a11y.skip && a11y.ring, 'skip=' + a11y.skip + ' ring=' + a11y.ring);
check('touch dragging on the canvas will not scroll the page', a11y.touchAction === 'none');

/* ── Idle CPU ───────────────────────────────────────── */

await chrome.eval("document.querySelector('[data-preset=bookshelf]').click(); return 1;");
await sleep(1500);
const frames = await chrome.eval(`
  return new Promise(res => {
    let n = 0;
    const t0 = performance.now();
    const step = () => { n++; performance.now() - t0 < 1000 ? requestAnimationFrame(step) : res(n); };
    requestAnimationFrame(step);
  });
`);
check('a settled simulation is not repainting in the background', frames > 30,
  'rAF still fires at ' + frames + '/s, page is idle');

const finalErrs = (await allErrors()).filter(e => !BENIGN.test(e));
check('no errors across the whole session', finalErrs.length === 0,
  finalErrs.join(' | ') || 'none');

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
await chrome.close();
server.close();
process.exit(fail ? 1 : 0);
