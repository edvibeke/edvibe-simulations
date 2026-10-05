
import { thumb, scratch } from '../../paths.mjs';
import { serve, Chrome, sleep } from '../../cdp.mjs';
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
};

const OUT = thumb('newtons-laws');
const VW = 980;
const W = 1080;
const H = 675;
const BG = [15, 23, 42];

const server = await serve();
const chrome = await Chrome.launch({ url: 'about:blank', width: VW + 40, height: 1000 });
await chrome.attach();
await chrome.goto(server.url('/sims/newtons-laws/index.html'));
await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: VW, height: 900, deviceScaleFactor: 1, mobile: false }, chrome.session);
await sleep(1200);

/* Shoot it in motion, not parked on the start line: a running crate with its
   tail, its net force arrow and live readouts says far more than a still one. */
await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");
await sleep(2300);
await chrome.eval("scrollTo(0, 0); return 1;");
await sleep(120);

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
if (span > H) throw new Error(`stage does not fit: ${span} > ${H}`);

/* Shoot it in motion rather than parked on the start line: a running crate
   with its tail, its net force arrow and live readouts says far more than a
   still one. The capture itself costs a couple of seconds of wall clock, so
   poll the drawn crate and fire the instant it reaches the mark, rather than
   guessing with a sleep and landing against the wall. */
await chrome.eval("document.querySelector('[data-action=release]').click(); return 1;");

const CRATE_X = [
  "const c = document.getElementById('stage');",
  "const g = c.getContext('2d');",
  "const d = g.getImageData(0, 0, c.width, c.height).data;",
  'let sx = 0, n = 0;',
  'for (let i = 0; i < d.length; i += 4) {',
  '  if (d[i + 3] > 200 && Math.abs(d[i] - 245) < 10',
  '      && Math.abs(d[i + 1] - 158) < 12 && d[i + 2] < 30) {',
  '    sx += (i / 4) % c.width; n++;',
  '  }',
  '}',
  "return n ? sx / n / (c.width / 900) : -1;"
].join('\n');

const TARGET_X = 356;
let waited = 0;
let lastX = -1;
for (;;) {
  lastX = await chrome.eval(CRATE_X);
  if (lastX >= TARGET_X || waited > 7000) break;
  waited += 30;
  await sleep(30);
}
console.log('fired the shutter at crate x', lastX.toFixed(1), 'after', waited, 'ms');

/* Lossless intermediate at the page's own width, then pad to the 1080x675
   contract in-page. Padding adds background only; nothing is resampled. */
const raw = await chrome.send('Page.captureScreenshot',
  { format: 'png', clip: { x: 0, y: Math.round(m.hy), width: VW, height: H, scale: 1 }, captureBeyondViewport: true }, chrome.session);
fs.writeFileSync(scratch('newtons-thumb-raw.png'), Buffer.from(raw.data, 'base64'));

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

const state = await chrome.eval(`
  const c = document.getElementById('stage');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 60) ink++;
  return { vw: innerWidth, canvasStill: c.width === ${m.canvas.w},
           verdict: document.getElementById('verdictValue').textContent,
           net: document.getElementById('netValue').textContent,
           speed: document.getElementById('speedValue').textContent,
           inkPct: +(100 * ink / (d.length / 4)).toFixed(1) };
`);
console.log('post', JSON.stringify(state));
const shotState = { verdict: state.verdict, speed: state.speed, net: state.net };
console.log('at shutter', JSON.stringify(shotState));


const scaleCss = m.canvas.w / 900;
const padCss = (W - VW) / 2;
const canvasTopInImage = m.canvas.y - Math.round(m.hy);
const canvasLeftCss = m.canvas.x;

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
  /* Walk in from each edge until the first pixel that is not background. */
  const edge = (x0, y0, dx, dy, n) => {
    for (let i = 0; i < n; i++) {
      if (!isBg(px(x0 + dx * i, y0 + dy * i))) return i;
    }
    return n;
  };
  /* Find the crate's own orange inside the saved JPEG, then map it back to
     logical canvas coordinates. This proves what is in the file, rather than
     sampling a canvas that may have moved on after the shutter. */
  const d = g.getImageData(0, 0, ${W}, ${H}).data;
  let sx = 0, n = 0, top = 1e9;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 180 && Math.abs(d[i] - 245) < 46
        && Math.abs(d[i + 1] - 158) < 52 && d[i + 2] < 34) {
      const x = (i / 4) % ${W};
      const y = Math.floor((i / 4) / ${W});
      sx += x; n++;
      if (y < top) top = y;
    }
  }
  const crateX = n ? (sx / n - ${padCss} - ${canvasLeftCss}) / ${scaleCss} : null;
  return {
    size: img.naturalWidth + 'x' + img.naturalHeight,
    left: edge(0, ${H} >> 1, 1, 0, ${W} >> 1),
    right: edge(${W} - 1, ${H} >> 1, -1, 0, ${W} >> 1),
    bottom: edge(${W} >> 1, ${H} - 1, 0, -1, ${H}),
    bgSample: px(4, ${H} >> 1),
    crateX: crateX === null ? null : +crateX.toFixed(1),
    crateTop: n ? +(top - ${canvasTopInImage}).toFixed(1) : null,
    cratePx: n
  };
`);
console.log('file', JSON.stringify(verify));
check('the crate is in shot, well past the start line',
  verify.crateX !== null && verify.crateX > 348 && verify.crateX < 500,
  'logical x ' + verify.crateX + ' (start line is 308, scene ends at 600)');
check('the crate is fully inside the captured height',
  verify.crateTop !== null && verify.crateTop > 0,
  'crate top at logical y ' + verify.crateTop);
check('the readouts in the shot are live, not parked',
  shotState.speed !== '0.00 m/s' && /Speeding up|Slowing down|Constant speed/.test(shotState.verdict),
  shotState.verdict + ' at ' + shotState.speed);
check('the crate sits comfortably inside the scene',
  verify.crateX !== null && verify.crateX > 340 && verify.crateX < 428,
  'logical x ' + verify.crateX);
check('the file is a sensible size', fs.statSync(OUT).size > 20000, fs.statSync(OUT).size + ' bytes');
check('the gutters are page background, not a stretched crop',
  verify.left >= 40 && verify.right >= 40 && verify.bottom >= 1,
  verify.left + '/' + verify.right + '/' + verify.bottom);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
await chrome.close();
await server.close();
process.exit(fail ? 1 : 0);
