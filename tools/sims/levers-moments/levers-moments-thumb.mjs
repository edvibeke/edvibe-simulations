
import { thumb, scratch } from '../../paths.mjs';
import { serve, Chrome, sleep } from '../../cdp.mjs';
import fs from 'node:fs';

const OUT = thumb('levers-moments');
const VW = 980;
const W = 1080;
const H = 675;
const BG = [15, 23, 42];

const server = await serve();
const chrome = await Chrome.launch({ url: 'about:blank', width: VW + 40, height: 1000 });
await chrome.attach();
await chrome.goto(server.url('/sims/levers-moments/index.html'));
await chrome.send('Emulation.setDeviceMetricsOverride',
  { width: VW, height: 900, deviceScaleFactor: 1, mobile: false }, chrome.session);
await sleep(1400);

const m = await chrome.eval(`
  scrollTo(0, 0);
  const h = document.querySelector('.ev-header').getBoundingClientRect();
  const s = document.querySelector('.ev-stage').getBoundingClientRect();
  const c = document.getElementById('stage').getBoundingClientRect();
  return { vw: innerWidth, docW: document.documentElement.scrollWidth,
           hy: h.y, stageBottom: s.bottom,
           canvas: { w: c.width, h: c.height, bottom: c.bottom } };
`);
const span = m.stageBottom - m.hy;
console.log('layout', JSON.stringify(m), '| stage span', span.toFixed(1), 'fits', H, '=', span <= H);
if (span > H) throw new Error(`stage does not fit: ${span} > ${H}`);

/* Lossless intermediate at the page's own width, then pad to the 1080x675
   contract in-page. Padding adds background only; nothing is resampled. */
const raw = await chrome.send('Page.captureScreenshot',
  { format: 'png', clip: { x: 0, y: Math.round(m.hy), width: VW, height: H, scale: 1 }, captureBeyondViewport: true }, chrome.session);
fs.writeFileSync(scratch('levers-thumb-raw.png'), Buffer.from(raw.data, 'base64'));

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
           ma: document.getElementById('maValue').textContent,
           inkPct: +(100 * ink / (d.length / 4)).toFixed(1) };
`);
console.log('post', JSON.stringify(state));

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
  return {
    size: img.naturalWidth + 'x' + img.naturalHeight,
    left: edge(0, ${H} >> 1, 1, 0, ${W} >> 1),
    right: edge(${W} - 1, ${H} >> 1, -1, 0, ${W} >> 1),
    bottom: edge(${W} >> 1, ${H} - 1, 0, -1, ${H}),
    /* jpeg chroma noise on a flat field stays well inside this band */
    bgSample: px(4, ${H} >> 1)
  };
`);
console.log('file', JSON.stringify(verify));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
await chrome.close();
await server.close();
