import path from 'node:path';
import { sim } from '../../paths.mjs';
import { parseScript } from '../../parse.mjs';
import { serve, Chrome, sleep } from '../../cdp.mjs';

/* the layout is read out of the sim rather than typed in here, so these
   probes cannot check a picture the sim stopped drawing */
const SIM = process.argv[2] || sim('digestive-system');
const G = parseScript(path.join(SIM, 'script.js'));
const W = G.W, H = G.H, RAIL = G.RAIL, FOOT = G.FOOT;
const server = await serve();
const chrome = await Chrome.launch({ url: 'about:blank', width: 1000, height: 1400 });

let fails = 0, warns = 0;
const ok = (c, m, hard) => {
  if (c) console.log('  PASS  ' + m);
  else if (hard === 'warn') { warns++; console.log('  WARN  ' + m); }
  else { fails++; console.log('  FAIL  ' + m); }
  return c;
};
const head = (t) => console.log('\n' + t);

/* installed before any page script: trap errors and record what is painted */
const TRAP = `
  window.__err = [];
  window.addEventListener('error', (e) =>
    window.__err.push((e.message || e.error) + ' @ ' + (e.filename||'?') + ':' + (e.lineno||'?')));
  window.addEventListener('unhandledrejection', (e) => window.__err.push('rejection: ' + e.reason));
  window.__frames = [];           /* ring buffer of the last 3 painted frames */
  window.__frame = []; window.__frameId = 0;
  const T = CanvasRenderingContext2D.prototype;
  const realText = T.fillText, realClear = T.clearRect;
  T.fillText = function (t, x, y) {
    window.__frame.push({ t: String(t), x: x, y: y, font: this.font,
                          align: this.textAlign, base: this.textBaseline });
    return realText.call(this, t, x, y);
  };
  T.clearRect = function (x, y, w, h) {
    if (x === 0 && y === 0 && w >= 800 && h >= 500) {
      window.__frames.push(window.__frame);
      if (window.__frames.length > 3) window.__frames.shift();
      window.__frame = [];
    }
    return realClear.call(this, x, y, w, h);
  };
  window.__painted = () => window.__frames[window.__frames.length - 1] || [];
  /* exact text boxes for the last painted frame, measured with the real font */
  window.__boxes = () => {
    const g = stage.getContext('2d');
    return window.__painted().map((s) => {
      g.font = s.font; g.textAlign = s.align; g.textBaseline = s.base;
      const w = g.measureText(s.t).width;
      const x0 = s.align === 'right' ? s.x - w : s.align === 'center' ? s.x - w / 2 : s.x;
      const y0 = s.base === 'middle' ? s.y - 6 : s.base === 'alphabetic' ? s.y - 8 : s.y - 5;
      return { t: s.t, x0: x0, y0: y0, x1: x0 + w, y1: y0 + 14 };
    });
  };
  /* device-pixel helpers: the context is pre-scaled by EV.stage */
  window.__px = () => ({ sx: stage.width / ${W}, sy: stage.height / ${H} });
  window.__ink = (box) => {
    const c = stage, g = c.getContext('2d');
    const sx = c.width / ${W}, sy = c.height / ${H};
    const x = Math.max(0, Math.floor(box.x0 * sx)), y = Math.max(0, Math.floor(box.y0 * sy));
    const w = Math.min(c.width - x, Math.ceil((box.x1 - box.x0) * sx));
    const h = Math.min(c.height - y, Math.ceil((box.y1 - box.y0) * sy));
    const d = g.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) n++;
    return { n: n, of: w * h, x: x, y: y, w: w, h: h };
  };
  /* count pixels close to a target colour, inside an optional logical box */
  window.__near = (hex, tol, box) => {
    const c = stage, g = c.getContext('2d'), sx = c.width / ${W}, sy = c.height / ${H};
    const r0 = parseInt(hex.slice(1, 3), 16), g0 = parseInt(hex.slice(3, 5), 16), b0 = parseInt(hex.slice(5, 7), 16);
    const x = Math.max(0, Math.floor((box ? box.x0 : 0) * sx)), y = Math.max(0, Math.floor((box ? box.y0 : 0) * sy));
    const w = Math.min(c.width - x, Math.ceil(((box ? box.x1 : ${W}) - (box ? box.x0 : 0)) * sx));
    const h = Math.min(c.height - y, Math.ceil(((box ? box.y1 : ${H}) - (box ? box.y0 : 0)) * sy));
    const d = g.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - r0) <= tol && Math.abs(d[i + 1] - g0) <= tol && Math.abs(d[i + 2] - b0) <= tol
          && d[i + 3] > 40) n++;
    }
    return n;
  };
  window.__read = () => ({ where: whereValue.textContent, digest: digestedValue.textContent,
    energy: energyValue.textContent, glucose: glucoseValue.textContent,
    water: waterValue.textContent, transit: transitValue.textContent,
    area: Array.from(document.querySelectorAll('.ev-footer, .ev-readout__value')).length,
    err: window.__err.length });
`;

const read = () => chrome.eval('return window.__read();');
const boxes = () => chrome.eval('return window.__boxes();');
const errs = () => chrome.eval('return window.__err;');
const click = (id) => chrome.eval(`document.getElementById(${JSON.stringify(id)}).click(); return 1;`);
const setRange = (id, v) => chrome.eval(`
  const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(String(v))};
  e.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);

try {
  await chrome.attach();
  await chrome.onNewDocument(TRAP);
  await chrome.goto(server.url('/sims/digestive-system/index.html'));
  await sleep(1200);

  /* ─────────────────────────── boot ─────────────────────────── */
  head('BOOT');
  const boot = await read();
  ok(await chrome.eval('return typeof window.EV === "object";'), 'shared runtime loaded');
  ok(boot.err === 0, 'no load-time exception' +
    (boot.err ? ': ' + JSON.stringify(await errs()) : ''));
  ok(boot.where === 'No meal yet', 'opens on an empty body ("Now in" = ' + boot.where + ')');
  ok(boot.digest === '0%', 'nothing digested at rest (' + boot.digest + ')');
  ok(boot.transit === '0.0 h', 'body clock at rest is 0.0 h, not ' + boot.transit);
  const inkBoot = await chrome.eval('return window.__ink({x0:0,y0:0,x1:900,y1:540});');
  ok(inkBoot.n / inkBoot.of > 0.15, 'canvas is painted (' + (100 * inkBoot.n / inkBoot.of).toFixed(1) + '% ink)');
  ok(await chrome.eval(`return document.querySelectorAll('svg').length > 5;`), 'icons rendered');

  /* idle clock must not creep while there is no meal */
  await sleep(2500);
  const idle = await read();
  ok(idle.transit === '0.0 h', 'transit clock stays at 0.0 h while nothing is fed (was ' + idle.transit + ')');
  ok(idle.where === 'No meal yet', 'still "No meal yet" after 3.5s idle');

  /* ─────────────────────── chew window ─────────────────────── */
  head('THE CHEW WINDOW (swallow delay)');
  await click('feedBtn');
  const t0 = Date.now();
  const mouthSamples = [];
  for (let i = 0; i < 26; i++) {
    await sleep(400);
    const r = await read();
    mouthSamples.push({ t: +((Date.now() - t0) / 1000).toFixed(1), where: r.where, transit: r.transit, d: r.digest });
    if (r.where !== 'Mouth (chewing)' && i > 2) break;
  }
  const chewing = mouthSamples.filter((s) => s.where === 'Mouth (chewing)');
  ok(chewing.length > 0, 'bolus waits in the mouth before the swallow');
  ok(chewing.length * 0.4 >= 5, 'chew window lasts at least 5s (was ' +
    (chewing.length * 0.4).toFixed(1) + 's)');
  ok(chewing.every((s) => s.transit === '0.0 h'), 'body clock is frozen through the chew window');
  const chewDigest = chewing.length ? parseInt(chewing[chewing.length - 1].d) : 0;
  ok(chewDigest > 0 && chewDigest < 45, 'salivary amylase does some but not all of the carb in the mouth (' +
    chewDigest + '% of the meal)');

  /* ─────────────────────── the meal ─────────────────────── */
  head('THE MEAL');
  const seen = new Set([(await read()).where]);
  let last = null, elapsed = 0;
  /* a second bite while the first is still inside has to be turned down, so
     ask for one in the middle of the meal rather than at the end of it */
  let refused = null;
  const inMouth = (w) => w === 'Mouth (chewing)' || w === 'Mouth (swallowing)' || w === 'No meal yet';
  for (let i = 0; i < 400; i++) {
    await sleep(250);
    last = await read();
    seen.add(last.where);
    elapsed = (Date.now() - t0) / 1000;
    if (refused === null && !inMouth(last.where) && last.where !== 'Eliminated') {
      const before = { where: last.where, transit: last.transit, digest: last.digest };
      await click('feedBtn');
      await sleep(150);
      const after = await read();
      refused = { before, after };
      ok(after.where === before.where && after.transit !== '0.0 h',
        'a second feed is refused while a meal is still inside (' + before.where + ' ' +
        before.transit + ' -> ' + after.where + ' ' + after.transit + ')');
    }
    if (last.where === 'Eliminated') break;
  }
  ok(refused !== null, 'the refusal was actually exercised during the meal');
  ok(elapsed < 240, 'meal completes in ' + elapsed.toFixed(0) + 's of real time');
  for (const w of ['Stomach', 'Duodenum', 'Small intestine', 'Large intestine'])
    ok(seen.has(w), 'readout reported "' + w + '" on the way past');
  ok(parseFloat(last.energy) > 0, 'energy absorbed > 0 (' + last.energy + ')');
  ok(parseFloat(last.water) > 0, 'colon reabsorbed water (' + last.water + ')');
  ok(parseFloat(last.glucose) > 90, 'blood glucose rose (' + last.glucose + ')');
  ok(seen.has('Rectum') || seen.has('Eliminated'), 'reached the rectum');

  /* feeding a second meal while one is inside must be refused */
  head('GUARDS');
  /* the meal has left, so a second one is allowed and starts from the mouth */
  await click('feedBtn');
  await sleep(300);
  ok((await read()).where.startsWith('Mouth'), 'a new meal can be fed once the body is empty (' +
    (await read()).where + ')');
  const t2 = Date.now();
  await sleep(2000);
  ok((await read()).where === 'Mouth (chewing)', 'and it starts by being chewed, not swallowed whole');

  /* pause freezes the clock */
  await click('pauseBtn');
  const p1 = await read();
  await sleep(1500);
  const p2 = await read();
  ok(p1.transit === p2.transit, 'Pause freezes the body clock (' + p1.transit + ' -> ' + p2.transit + ')');
  ok(await chrome.eval(`return pauseBtn.getAttribute('aria-pressed') === 'true';`), 'Pause sets aria-pressed');
  ok(await chrome.eval(`return pauseBtn.textContent.includes('Play');`), 'Pause button relabels to Play');
  await click('pauseBtn');

  /* labels toggle */
  await click('labelsBtn');
  await sleep(200);
  const noLabels = (await boxes()).map((b) => b.t);
  ok(!noLabels.includes('stomach') && !noLabels.includes('pancreas'), 'Labels off removes the anatomy labels');
  await click('labelsBtn');
  await sleep(200);
  ok((await boxes()).map((b) => b.t).includes('pancreas'), 'Labels on restores them');

  /* chewing multiplies surface area */
  for (let i = 0; i < 12; i++) await click('chewBtn');
  await sleep(300);
  const painted = (await boxes()).map((b) => b.t).join('|');
  ok(/×3\.\d\d/.test(painted), 'Chew raises the surface-area readout (' + (/×3\.\d\d/.exec(painted) || [''])[0] + ')');

  /* reset returns to an empty body */
  await chrome.eval(`document.querySelector('[data-action="reset"]').click(); return 1;`);
  await sleep(400);
  const after = await read();
  ok(after.where === 'No meal yet', 'Reset empties the body (' + after.where + ')');
  ok(after.transit === '0.0 h', 'Reset zeroes the transit clock (' + after.transit + ')');
  ok(after.digest === '0%' && after.energy === '0 kcal', 'Reset zeroes the totals');
  ok(await chrome.eval(`return document.getElementById('insight').hidden && document.getElementById('help').hidden;`),
    'Reset re-arms the help and insight panels');
  ok(await chrome.eval(`return peristalsis.value === '100' && acidity.value === '20' && bile.value === '60' && fibre.value === '10';`),
    'Reset restores the sliders');

  /* ─────────── canvas text layout, measured for real ─────────── */
  head('CANVAS TEXT (exact metrics from the live canvas)');
  const box = (b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
  const bs = await boxes();
  const offscreen = bs.filter((b) => b.x0 < -1 || b.y0 < -1 || b.x1 > W + 1 || b.y1 > H + 1);
  ok(offscreen.length === 0, 'every painted string is on the canvas' +
    (offscreen.length ? ': ' + offscreen.map((b) => `"${b.t}" ${b.x0.toFixed(0)},${b.y0.toFixed(0)}`).join(', ') : ''));

  /* text vs text: nothing may overlap, and the only strings allowed inside a
     panel are that panel's own text */
  const inR = (b) => b.x0 >= RAIL.x - 1 && b.x1 <= RAIL.x + RAIL.w + 1 && b.y0 >= RAIL.y - 1 && b.y1 <= RAIL.y + RAIL.h + 1;
  const inF = (b) => b.x0 >= FOOT.x - 1 && b.x1 <= FOOT.x + FOOT.w + 1 && b.y0 >= FOOT.y - 1 && b.y1 <= FOOT.y + FOOT.h + 1;
  const stray = bs.filter((b) => !inR(b) && !inF(b));
  let collisions = [];
  for (let i = 0; i < stray.length; i++)
    for (let j = i + 1; j < stray.length; j++) {
      const a = stray[i], c = stray[j];
      if (!(a.x1 <= c.x0 || c.x1 <= a.x0 || a.y1 <= c.y0 || c.y1 <= a.y0)) collisions.push(a.t + ' / ' + c.t);
    }
  ok(collisions.length === 0, 'drawing text never overlaps other drawing text' +
    (collisions.length ? ': ' + collisions.slice(0, 5).join(', ') : ''));
  const panelStray = stray.filter((b) => b.x1 > RAIL.x || b.y1 > FOOT.y);
  ok(panelStray.length === 0, 'drawing text stays clear of both panels' +
    (panelStray.length ? ': ' + panelStray.map((b) => `"${b.t}"`).join(', ') : ''));

  /* the enzyme line the Help text promises */
  head('ENZYME NAMING');
  const enzymeFor = async (stage) => {
    const r = await chrome.eval(`
      const b = window.__boxes().find((q) => q.t === ${JSON.stringify(stage)});
      const g = stage.getContext('2d'), sx = stage.width / ${W}, sy = stage.height / ${H};
      const d = g.getImageData(Math.floor(b.x0 * sx), Math.floor((b.y1 + 4) * sy),
        Math.ceil((b.x1 - b.x0) * sx), Math.ceil(12 * sy)).data;
      let green = 0, amber = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        const isGreen = Math.abs(d[i] - 52) < 60 && Math.abs(d[i+1] - 211) < 60 && Math.abs(d[i+2] - 153) < 60;
        const isAmber = Math.abs(d[i] - 100) < 70 && Math.abs(d[i+1] - 70) < 70 && Math.abs(d[i+2] - 20) < 70;
        if (isGreen) green++; if (isAmber) amber++;
      }
      return { green: green, amber: amber };`);
    return r;
  };
  const names = ['pepsin', 'amylase', 'trypsin', 'lipase'];
  /* the enzyme block is the bottom of the legend panel: the organ name on one
     line and the enzyme under it. Read the whole block and key it by the
     organ the canvas actually names, rather than trusting that the readout
     and the canvas changed on the same frame. */
  const ly0 = RAIL.y + RAIL.h - 45, ly1 = RAIL.y + RAIL.h;
  const readEnzyme = () => chrome.eval(`
    return window.__painted().filter((s) => s.x > ${RAIL.x} && s.y > ${ly0} && s.y < ${ly1})
      .map((s) => s.t.trim());`);
  const seenEnzyme = {};
  await click('feedBtn');
  for (let i = 0; i < 400; i++) {
    await sleep(250);
    const line = await readEnzyme();
    if (line.length < 2) continue;
    const organ = line[0], enzyme = line[line.length - 1];
    if (!(organ in seenEnzyme)) seenEnzyme[organ] = enzyme;
    if (seenEnzyme.Mouth === 'salivary amylase' && seenEnzyme.Stomach
        && (seenEnzyme.Duodenum || seenEnzyme['Small intestine'])) break;
  }
  ok(seenEnzyme.Mouth === 'salivary amylase', 'mouth names salivary amylase on canvas ("' +
    (seenEnzyme.Mouth || '') + '")');
  ok(/pepsin/.test(seenEnzyme.Stomach || ''), 'stomach names pepsin on canvas ("' +
    (seenEnzyme.Stomach || '') + '")');
  const duo = seenEnzyme.Duodenum || seenEnzyme['Small intestine'] || '';
  ok(names.some((n) => duo.includes(n)), 'small intestine names a pancreatic enzyme on canvas ("' +
    duo + '")');
  console.log('  enzyme blocks seen: ' + JSON.stringify(seenEnzyme));

  /* ─────────── pixel probes ─────────── */
  head('PIXELS');
  await chrome.eval(`document.querySelector('[data-action="reset"]').click(); return 1;`);
  await sleep(500);
  const ink = await chrome.eval('return window.__ink({x0:0,y0:0,x1:900,y1:540});');
  ok(ink.n / ink.of > 0.15, 'canvas repaints after reset (' + (100 * ink.n / ink.of).toFixed(1) + '% ink)');

  /* panels: no shared pixels, and a clear strip below the footer */
  const railInk = await chrome.eval(`return window.__ink({x0:${RAIL.x},y0:${RAIL.y},x1:${RAIL.x + RAIL.w},y1:${RAIL.y + RAIL.h}});`);
  ok(railInk.n / railInk.of > 0.9, 'legend panel is a solid block (' + (100 * railInk.n / railInk.of).toFixed(1) + '%)');
  /* the gutter and the margins: nothing may spill past a panel's own border,
     so the probes start 2px out — a 1px stroke centred on the panel edge is
     the panel, not a spill */
  const gapY = await chrome.eval(`return window.__ink({x0:${RAIL.x},y0:${RAIL.y + RAIL.h + 2},x1:${RAIL.x + RAIL.w},y1:${FOOT.y - 2}});`);
  ok(gapY.n === 0, 'nothing is drawn in the gutter between the panels');
  ok(FOOT.y + FOOT.h <= H, 'footer bottom +' + (H - (FOOT.y + FOOT.h)) + 'px from the canvas edge');
  const strip = await chrome.eval(`return window.__ink({x0:0,y0:${FOOT.y + FOOT.h + 2},x1:${W},y1:${H}});`);
  ok(strip.n === 0, 'nothing is drawn below the footer');
  const sideStrip = await chrome.eval(`return window.__ink({x0:${RAIL.x + RAIL.w + 2},y0:0,x1:${W},y1:${H}});`);
  ok(sideStrip.n === 0, 'nothing is drawn right of the legend');

  /* portal vein must reach inside the liver */
  const g = G;
  const gx = g.gx, gy = g.gy;
  const liverEnd = g.PORTAL[g.PORTAL.length - 1];
  const liverBox = { x0: gx(liverEnd[0]) - 26, y0: gy(liverEnd[1]) - 20, x1: gx(liverEnd[0]) + 26, y1: gy(liverEnd[1]) + 20 };
  const portalInLiver = await chrome.eval(`return window.__near('#60a5fa', 26, ${JSON.stringify(liverBox)});`);
  ok(portalInLiver > 12, 'portal vein is drawn where it enters the liver (' + portalInLiver + ' blue px)');

  /* villi must not interleave between two coil rows. The rows are grouped out
     of the anchors the same way the static verifier groups them, so this
     measures the rows that are actually drawn. */
  const rows = [];
  for (const a of G.TRACK.small) {
    if (rows.length && Math.abs(a[1] - rows[rows.length - 1].y) <= 12) {
      const r = rows[rows.length - 1];
      r.x0 = Math.min(r.x0, a[0]); r.x1 = Math.max(r.x1, a[0]);
    } else rows.push({ y: a[1], x0: a[0], x1: a[0] });
  }
  const runs = rows.filter((r) => r.x1 - r.x0 >= 150);
  for (let i = 0; i < runs.length - 1; i++) {
    const ya = runs[i].y, yb = runs[i + 1].y;
    const band = { x0: 0, y0: gy(ya) + 7, x1: RAIL.x, y1: gy(yb) - 7 };
    if (band.y1 <= band.y0) { ok(true, 'coil rows ' + ya + '-' + yb + ' do not overlap'); continue; }
    const villi = await chrome.eval(`return window.__near('#f9a8d4', 40, ${JSON.stringify(band)});`);
    ok(villi < 40, 'no villi interleave in the ' + (band.y1 - band.y0).toFixed(0) +
      'px band between coil rows ' + ya + '-' + yb + ' (' + villi + ' px)');
  }
  ok(runs.length >= 3, 'the small intestine is drawn as at least three sweeps (' + runs.length + ')');

  /* the label boxes, sampled for drawing underneath them */
  const labelTexts = ['mouth', 'oesophagus', 'stomach', 'liver', 'gallbladder', 'pancreas',
    'duodenum', 'small intestine', 'large intestine', 'rectum'];
  const allBoxes = await boxes();
  for (const name of labelTexts) {
    const b = allBoxes.find((q) => q.t === name);
    if (!b) { ok(false, 'label "' + name + '" is painted'); continue; }
    const under = await chrome.eval(`return window.__ink(${JSON.stringify(box(b))});`);
    ok(under.n / under.of < 0.5, 'label "' + name + '" sits on clear paper (' +
      (100 * under.n / under.of).toFixed(0) + '% ink under it)');
  }

  const finalErrs = await errs();
  ok(finalErrs.length === 0, 'no exception at any point in the session' +
    (finalErrs.length ? ': ' + JSON.stringify(finalErrs) : ''));

  console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'all checks passed')
    + (warns ? ', ' + warns + ' warning(s)' : ''));
} finally {
  await chrome.close();
  await server.close();
}
process.exit(fails ? 1 : 0);