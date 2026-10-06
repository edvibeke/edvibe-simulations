/* Thumbnail for sims/momentum-collisions.

   The shot that sells this sim is the clay-block preset: two carts already
   locked nose to nose, the amber impact mark on the track behind them, equal
   force arrows running off each side and the readout showing what was kept.
   A collision is over in a few frames, so the capture polls the drawn carts
   and fires the instant the two of them are touching. */

import { thumb, scratch } from '../../paths.mjs';
import { serve, Chrome, sleep } from '../../cdp.mjs';
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
};

const OUT = thumb('momentum-collisions');
const VW = 980;
const W = 1080;
const H = 675;
const BG = [15, 23, 42];

const server = await serve();
const chrome = await Chrome.launch({ url: 'about:blank', width: VW + 40, height: 1000 });
await chrome.attach();
await chrome.goto(server.url('/sims/momentum-collisions/index.html'));
await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: VW, height: 900, deviceScaleFactor: 1, mobile: false }, chrome.session);
await sleep(1200);

/* Reduced motion resolves the collision in one step and holds the contact
   frame without drawing any more frames, so the impact mark and the force
   arrows stay on screen instead of clearing after a third of a second. */
await chrome.send('Emulation.setEmulatedMedia',
  { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, chrome.session);
await chrome.goto(server.url('/sims/momentum-collisions/index.html'));
await sleep(1000);

await chrome.eval("document.querySelector('[data-preset=clay-block]').click(); return 1;");
await sleep(300);

const m = await chrome.eval(`
  scrollTo(0, 0);
  const h = document.querySelector('.ev-header').getBoundingClientRect();
  const s = document.querySelector('.ev-stage').getBoundingClientRect();
  const c = document.getElementById('stage').getBoundingClientRect();
  return { vw: innerWidth, docW: document.documentElement.scrollWidth,
           hy: h.y, stageBottom: s.bottom,
           canvas: { w: c.width, h: c.height, x: c.x, y: c.y, bottom: c.bottom } };
`);
const span = m.stageBottom - m.hy;
console.log('layout', JSON.stringify(m), '| stage span', span.toFixed(1), 'fits', H, '=', span <= H);
if (span > H) throw new Error('stage does not fit: ' + span + ' > ' + H);

/* Read the held frame: the amber impact mark and the force arrows have to be
   on screen, and the gap between the two bodies has to be closed, so the
   locked pair can be checked rather than assumed. */
const FRAME = [
  "const c = document.getElementById('stage');",
  'const g = c.getContext("2d");',
  'const s = c.width / 900;',
  'const d = g.getImageData(0, Math.round(340 * s), Math.round(600 * s), Math.round(48 * s)).data;',
  'const w = Math.round(600 * s);',
  'const box = (r, g2, b) => {',
  '  let l = 1e9, rr = -1, n = 0;',
  '  for (let i = 0; i < d.length; i += 4) {',
  '    if (d[i + 3] > 200 && Math.abs(d[i] - r) <= 12 && Math.abs(d[i + 1] - g2) <= 12',
  '        && Math.abs(d[i + 2] - b) <= 12) {',
  '      const px = (i / 4) % w;',
  '      if (px < l) l = px;',
  '      if (px > rr) rr = px;',
  '      n++;',
  '    }',
  '  }',
  '  return n ? { l: l / s, r: rr / s, n } : null;',
  '};',
  'const a = box(56, 189, 248);',
  'const b = box(244, 114, 182);',
  'let amber = 0;',
  'const all = g.getImageData(0, 0, c.width, c.height).data;',
  'for (let i = 0; i < all.length; i += 4) {',
  '  if (all[i + 3] > 200 && Math.abs(all[i] - 251) < 14',
  '      && Math.abs(all[i + 1] - 191) < 14 && Math.abs(all[i + 2] - 36) < 30) amber++;',
  '}',
  'return { gap: a && b ? +(b.l - a.r).toFixed(2) : null, aN: a ? a.n : 0, bN: b ? b.n : 0, amber };'
].join('\n');

await chrome.eval("document.querySelector('[data-action=launch]').click(); return 1;");
let waited = 0;
let frame = null;
for (;;) {
  frame = await chrome.eval(FRAME);
  if (frame && frame.amber > 60 && frame.gap < 10) break;
  if (waited > 4000) break;
  waited += 40;
  await sleep(40);
}
check('the frame held is the moment of contact', frame && frame.amber > 60 && frame.gap < 10,
  frame ? frame.amber + 'px of amber, ' + frame.gap + 'px between the carts' : 'no frame');
console.log('firing the shutter at gap', frame ? frame.gap : '?',
  'with', frame ? frame.amber : '?', 'px of amber');

const shot = await chrome.eval(`
  return { verdict: document.getElementById('verdictValue').textContent,
           left: document.getElementById('leftSpeedValue').textContent,
           kept: document.getElementById('energyKeptValue').textContent };`);
console.log('at shutter', JSON.stringify(shot));

/* Lossless intermediate at the page's own width, then pad to the 1080x675
   contract in-page. Padding adds background only; nothing is resampled. */
const raw = await chrome.send('Page.captureScreenshot',
  { format: 'png', clip: { x: 0, y: Math.round(m.hy), width: VW, height: H, scale: 1 }, captureBeyondViewport: true }, chrome.session);
fs.writeFileSync(scratch('momentum-thumb-raw.png'), Buffer.from(raw.data, 'base64'));

const url = 'data:image/png;base64,' + raw.data;
const jpeg = await chrome.eval(`
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ${JSON.stringify(url)}; });
  if (img.naturalWidth !== ${VW} || img.naturalHeight !== ${H}) {
    throw new Error('capture came back ' + img.naturalWidth + 'x' + img.naturalHeight);
  }
  const cv = document.createElement('canvas');
  cv.width = ${W}; cv.height = ${H};
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(${BG.join(',')})';
  g.fillRect(0, 0, ${W}, ${H});
  g.imageSmoothingEnabled = false;
  g.drawImage(img, Math.round((${W} - ${VW}) / 2), 0);
  return cv.toDataURL('image/jpeg', 0.92);
`);
const b64 = jpeg.slice(jpeg.indexOf(',') + 1);
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));

const scaleCss = m.canvas.w / 900;
const padCss = (W - VW) / 2;
const canvasTopInImage = m.canvas.y - Math.round(m.hy);

/* Verify the written file itself: exact contract size, and real gutters of
   page background on the left, right and below the stage. */
const verify = await chrome.eval(`
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej;
    img.src = 'data:image/jpeg;base64,' + ${JSON.stringify(b64)}; });
  if (img.naturalWidth !== ${W} || img.naturalHeight !== ${H}) {
    throw new Error('file is ' + img.naturalWidth + 'x' + img.naturalHeight);
  }
  const cv = document.createElement('canvas');
  cv.width = ${W}; cv.height = ${H};
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
  const bg = ${JSON.stringify(BG)};
  const isBg = p => Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) <= 12;
  const edge = (x0, y0, dx, dy, n) => {
    for (let i = 0; i < n; i++) {
      if (!isBg(px(x0 + dx * i, y0 + dy * i))) return i;
    }
    return n;
  };
  /* Only the scene block: the panel draws its momentum bars in the same two
     hues as the carts, and those bars run the full width of the right edge.
     The bodies are read from their own band of rows, so the impact mark, the
     force arrows and the speed labels above them cannot stretch a cart's
     measured outline. */
  const sceneRight = ${padCss} + (${m.canvas.x} + 600) * ${scaleCss};
  const bandTop = ${canvasTopInImage} + 342 * ${scaleCss};
  const bandBottom = ${canvasTopInImage} + 388 * ${scaleCss};
  const d = g.getImageData(0, 0, ${W}, ${H}).data;
  let aN = 0, aL = 1e9, aR = -1, bN = 0, bL = 1e9, bR = -1, amber = 0;
  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % ${W};
    if (x > sceneRight) continue;
    const y = Math.floor((i / 4) / ${W});
    /* JPEG at 0.92 has already moved the channels, so every colour here is
       matched loosely: tightly, the file would read as an empty canvas. */
    if (Math.abs(d[i] - 251) < 50 && Math.abs(d[i + 1] - 191) < 50 && d[i + 2] < 110) amber++;
    if (d[i] < 130 && Math.abs(d[i] - 56) < 55 && Math.abs(d[i + 1] - 189) < 50
        && Math.abs(d[i + 2] - 248) < 50 && y >= bandTop && y <= bandBottom) {
      aN++; if (x < aL) aL = x; if (x > aR) aR = x;
    }
    if (d[i] > 160 && Math.abs(d[i] - 244) < 60 && Math.abs(d[i + 1] - 114) < 70
        && Math.abs(d[i + 2] - 182) < 60 && y >= bandTop && y <= bandBottom) {
      bN++; if (x < bL) bL = x; if (x > bR) bR = x;
    }
  }
  const toLogical = v => (v - ${padCss}) / ${scaleCss};
  /* A length is a difference of two positions, so the padding cancels out and
     only the scale applies. */
  const toLength = v => v / ${scaleCss};
  return {
    size: img.naturalWidth + 'x' + img.naturalHeight,
    left: edge(0, ${H} >> 1, 1, 0, ${W} >> 1),
    right: edge(${W} - 1, ${H} >> 1, -1, 0, ${W} >> 1),
    bottom: edge(${W} >> 1, ${H} - 1, 0, -1, ${H}),
    bgSample: px(4, ${H} >> 1),
    aLeft: aN ? +toLogical(aL).toFixed(1) : null,
    aRight: aN ? +toLogical(aR).toFixed(1) : null,
    aWidth: aN ? +toLength(aR - aL).toFixed(1) : null,
    aMid: aN ? +toLogical((aL + aR) / 2).toFixed(1) : null,
    bLeft: bN ? +toLogical(bL).toFixed(1) : null,
    bRight: bN ? +toLogical(bR).toFixed(1) : null,
    bWidth: bN ? +toLength(bR - bL).toFixed(1) : null,
    bMid: bN ? +toLogical((bL + bR) / 2).toFixed(1) : null,
    amber: amber
  };
`);
console.log('file', JSON.stringify(verify));

/* The clay pair is a 20 kg cart in front of a 30 kg one, so their bodies sit
   2.11m apart: (20 + 30)kg drawn to the width law, plus the 4px gap the
   contact leaves. Antialiased edges and a 0.92 JPEG each push a body's
   measured outline out by a few pixels, so the spacing is checked with that
   slack stated rather than pretending to a pixel. */
const PAIR_APART = 55;
check('the locked pair is in shot, side by side',
  verify.aMid !== null && verify.bMid !== null
    && Math.abs((verify.bMid - verify.aMid) - PAIR_APART) < 14,
  'centres ' + verify.aMid + ' and ' + verify.bMid + ', ' + PAIR_APART + 'px apart expected');
check('the pair is off the start marks, out where they met',
  verify.aMid !== null && verify.aMid > 320 && verify.aMid < 420,
  'left cart body ' + verify.aLeft + '..' + verify.aRight);
check('the heavier cart is drawn the longer of the two',
  verify.aWidth !== null && verify.bWidth !== null
    && verify.bWidth - verify.aWidth > 2 && verify.bWidth - verify.aWidth < 16,
  verify.aWidth + 'px and ' + verify.bWidth + 'px');
check('the amber impact ink is in the frame', verify.amber > 80, verify.amber + 'px of amber');
check('the readouts in the shot are the locked run, not the start line',
  /Locked together/.test(shot.verdict) && shot.kept === '40%' && shot.left === '3.20 m/s',
  shot.verdict + ', ' + shot.kept + ', ' + shot.left);
check('the file is a sensible size', fs.statSync(OUT).size > 20000, fs.statSync(OUT).size + ' bytes');
check('the gutters are page background, not a stretched crop',
  verify.left >= 40 && verify.right >= 40 && verify.bottom >= 1,
  verify.left + '/' + verify.right + '/' + verify.bottom);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
await chrome.close();
await server.close();
process.exit(fail ? 1 : 0);
