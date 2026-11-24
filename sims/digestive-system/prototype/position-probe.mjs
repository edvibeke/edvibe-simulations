import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(HERE, '..', '..', '..'));
const MODE = process.argv[3] || 'landmarks';
const SUMMARY_FILE = path.join(HERE, 'landmark-positions.json');
const clockSource = fs.readFileSync(path.join(HERE, 'timing-clock.js'), 'utf8');

function patchedIndex() {
  const dir = path.join(ROOT, 'sims', 'digestive-system');
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  let js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');
  const probe = `
  window.__posprobe = {
    summary() {
      return {
        S: S,
        TUBE_END: TUBE_END,
        GEOM_TUBE_END: GEOM.TUBE_END,
        cumLast: cum[cum.length - 1],
        GEOM_cumLast: GEOM.cumulative[GEOM.cumulative.length - 1],
        pathLength: cum[cum.length - 1],
        pathPointCount: path.length,
        firstPathPoint: path[0],
        lastPathPoint: path[path.length - 1],
        firstTruePathPoint: GEOM.pathPoints[0],
        lastTruePathPoint: GEOM.pathPoints[GEOM.pathPoints.length - 1],
        truePathPointCount: GEOM.pathPoints.length,
        sampleAtTubeEnd: sampleAt(TUBE_END),
        halfTubePx: gs(TUBE_W / 2),
        mouthSpot: GEOM.markers['Mouth badge'],
        landmarks: ARC_ORDER.map((key) => ({
          key: key,
          s: ARC[key],
          sample: sampleAt(ARC[key]),
          committed: { x: GEOM.landmarks[key].x, y: GEOM.landmarks[key].y }
        }))
      };
    },
    capture() {
      window.__badgeSpot = null;
      window.__badgeText = null;
      const arcs = [];
      const originalArc = ctx.arc;
      ctx.arc = function (x, y, r) {
        arcs.push({ x: x, y: y, r: r });
        return originalArc.apply(this, arguments);
      };
      try {
        render(EV.visualTime(performance.now()));
      } finally {
        ctx.arc = originalArc;
      }
      const particlesNow = particles.map((p) => ({
        type: p.type,
        grams: p.grams,
        s: p.s,
        off: p.off,
        phase: p.phase,
        dig: p.dig
      }));
      return {
        frame: window.__clock.frame,
        virtualSeconds: window.__clock.ms / 1000,
        headS: headS,
        headSample: headS === null ? null : sampleAt(headS),
        mouthHold: mouthHold,
        badgeText: window.__badgeText,
        badgeSpot: window.__badgeSpot,
        badgeS: window.__badgeS,
        readout: document.getElementById('whereValue').textContent,
        tolerancePx: 0.6 * gs(TUBE_W / 2),
        particles: particlesNow.map((p, i) => {
          const drawn = arcs[i] || null;
          const sample = sampleAt(p.s);
          const inMouth = USE_SVG_ART && GEOM && GEOM.markers['feed first'] && GEOM.markers['feed last'] &&
            mouthHold > 0 && p.s <= ARC.mouth;
          const first = GEOM.markers['feed first'], last = GEOM.markers['feed last'];
          const sp = inMouth
            ? {
                x: first.x + (last.x - first.x) * clamp((p.s - 2) / 16, 0, 1),
                y: first.y + (last.y - first.y) * clamp((p.s - 2) / 16, 0, 1),
                a: -Math.PI / 2
              }
            : sample;
          const nx = -Math.sin(sp.a), ny = Math.cos(sp.a);
          const churn = p.s > ARC.stomach && p.s < ARC.pylorus
            ? Math.sin(simMin * 0.09 + p.phase) * gs(4)
            : 0;
          const shrink = 1 / Math.pow(chewFactor, 0.3);
          const r = Math.max(1.2, gs(3.4 + p.grams * 0.13) * shrink);
          return {
            index: i,
            type: p.type,
            s: p.s,
            organ: organAt(p.s),
            off: p.off,
            phase: p.phase,
            churn: churn,
            formula: { x: sp.x + nx * p.off, y: sp.y + ny * p.off + churn, r: r },
            drawn: drawn ? { x: drawn.x, y: drawn.y } : null,
            sample: { x: sample.x, y: sample.y, a: sample.a },
            distancePx: drawn ? Math.hypot(drawn.x - sample.x, drawn.y - sample.y) : null,
            nearestTruePathPx: drawn ? nearestTruePath(drawn.x, drawn.y) : null
          };
        })
      };
    },
    runTrace(every) {
      document.getElementById('feedBtn').click();
      const readout = document.getElementById('whereValue');
      const records = [];
      for (let i = 0; i < 6000; i++) {
        window.__clock.step();
        if (window.__clock.frame % every === 0) records.push(window.__posprobe.capture());
        if (readout.textContent === 'Eliminated') break;
      }
      return records;
    }
  };
  function nearestTruePath(x, y) {
    let best = Infinity;
    for (const q of GEOM.pathPoints) {
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < best) best = d;
    }
    return best;
  }
  `;
  const end = js.lastIndexOf('})();');
  if (end < 0) throw new Error('cannot find IIFE end in script.js');
  js = js.slice(0, end) + probe + js.slice(end);
  const spotLine = 'const spot = mouthSpot || sampleAt(s);';
  if (!js.includes(spotLine)) throw new Error('cannot find badge spot line');
  js = js.replace(spotLine, spotLine +
    ' window.__badgeSpot = { x: spot.x, y: spot.y }; window.__badgeS = s;');
  const textLine = 'ctx.fillText(text, x + w / 2, y);';
  if (!js.includes(textLine)) throw new Error('cannot find badge text line');
  js = js.replace(textLine, 'window.__badgeText = text; ' + textLine);
  const tag = '<script src="script.js"></script>';
  if (!html.includes(tag)) throw new Error('cannot find script.js tag in index.html');
  html = html.replace(tag, '<script>\n' + js + '\n</script>');
  html = html.replace('<head>', '<head>\n<script>\n' + clockSource + '\n</script>');
  return html;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const html = patchedIndex();
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (u === '/' || u === '/sims/digestive-system/index.html') {
    rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return rs.end(html);
  }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    rs.writeHead(404);
    return rs.end('not found');
  }
  rs.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rs);
});

await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/sims/digestive-system/index.html`;
let browser;
try {
  browser = await Chrome.launch({ url, width: 1280, height: 1500 });
  await browser.attach();
  await browser.goto(url);
  let ready = false;
  for (let i = 0; i < 25 && !ready; i++) {
    ready = await browser.eval('return !!(window.__clock && window.__posprobe);');
    if (!ready) await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) {
    const htmlStart = await browser.eval('return document.documentElement.outerHTML.slice(0, 400);');
    throw new Error('virtual clock or position probe missing in page: ' + htmlStart);
  }

  if (MODE === 'landmarks' || MODE === 'trace') {
    const summary = await browser.eval('return window.__posprobe.summary();');
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
    console.log('CUM_SCRIPT=' + summary.cumLast.toFixed(6) +
      ' PATH_POINTS=' + summary.pathPointCount +
      ' GEOM_TUBE_END=' + summary.GEOM_TUBE_END +
      ' SCRIPT_TUBE_END=' + summary.TUBE_END);
    console.log('FIRST_PATH=' + JSON.stringify(summary.firstPathPoint) +
      ' LAST_PATH=' + JSON.stringify(summary.lastPathPoint));
    console.log('FIRST_TRUE=' + JSON.stringify(summary.firstTruePathPoint) +
      ' LAST_TRUE=' + JSON.stringify(summary.lastTruePathPoint));
    console.log('SAMPLE_AT_TUBE_END=' + JSON.stringify(summary.sampleAtTubeEnd));
    console.log('landmark,s,sample_x,sample_y,committed_x,committed_y,dx,dy');
    for (const l of summary.landmarks) {
      const dx = l.sample.x - l.committed.x;
      const dy = l.sample.y - l.committed.y;
      console.log([l.key, l.s.toFixed(3), l.sample.x.toFixed(3), l.sample.y.toFixed(3),
        l.committed.x.toFixed(3), l.committed.y.toFixed(3), dx.toFixed(3), dy.toFixed(3)].join(','));
    }
    const big = summary.landmarks.filter((l) =>
      Math.abs(l.sample.x - l.committed.x) > 2 || Math.abs(l.sample.y - l.committed.y) > 2);
    console.log('DIFF_GT_2PX=' + big.length + ':' + big.map((l) => l.key).join(','));
  }

  if (MODE === 'trace') {
    const records = await browser.eval('return window.__posprobe.runTrace(30);');
    fs.writeFileSync(path.join(HERE, 'position-trace.json'), JSON.stringify(records));
    console.log('TRACE_FRAMES=' + records.length +
      ' PARTICLES=' + records.reduce((n, r) => n + r.particles.length, 0));
    console.log('FIRST_FRAME=' + JSON.stringify(records[0], null, 2));
  }

  if (MODE === 'screens') {
    const trace = JSON.parse(fs.readFileSync(path.join(HERE, 'position-trace.json'), 'utf8'));
    const screenSummary = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
    const arc = Object.fromEntries(screenSummary.landmarks.map((l) => [l.key, l.s]));
    const stages = [
      ['stomach', (s, f) => s > arc.stomach && s < arc.pylorus && /Stomach/.test(f.badgeText)],
      ['duodenum', (s, f) => s > arc.pylorus && s < arc.jejunum && /Duodenum/.test(f.badgeText)],
      ['small-intestine', (s, f) => s > arc.jejunum && s < arc.caecum && /Small intestine/.test(f.badgeText)],
      ['ascending-colon', (s, f) => s > arc.caecum && s < arc.hepatic && /Large intestine/.test(f.badgeText)],
      ['transverse-colon', (s, f) => s > arc.hepatic && s < arc.transverse && /Large intestine/.test(f.badgeText)],
      ['rectum', (s, f) => s >= arc.rectum && /Rectum/.test(f.badgeText)]
    ];
    for (const [name, matches] of stages) {
      const frame = trace.find((f) => matches(f.headS, f));
      if (!frame) throw new Error('no sampled frame for ' + name);
      await browser.goto(url + '?debug=1');
      let readyScreen = false;
      for (let i = 0; i < 25 && !readyScreen; i++) {
        readyScreen = await browser.eval('return !!(window.__clock && window.__posprobe);');
        if (!readyScreen) await new Promise((r) => setTimeout(r, 200));
      }
      if (!readyScreen) throw new Error('debug page not ready for ' + name);
      const state = await browser.eval(`
        document.getElementById('feedBtn').click();
        for (let i = 0; i < ${frame.frame}; i++) window.__clock.step();
        return JSON.stringify(window.__posprobe.capture());
      `);
      const info = JSON.parse(state);
      const clip = await browser.eval(`
        const r = document.getElementById('stage').getBoundingClientRect();
        return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 });
      `);
      const file = path.join(HERE, `debug-${name}-frame-${frame.frame}.png`);
      await browser.screenshot(file, JSON.parse(clip));
      console.log(`${name}: frame=${info.frame} headS=${info.headS.toFixed(2)} badge="${info.badgeText}" file=${path.basename(file)}`);
    }
  }
} catch (e) {
  console.error('POSITION PROBE ERROR: ' + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  if (browser) {
    try { browser.ws.close(); } catch {}
    browser.proc.kill();
  }
  srv.close();
}
