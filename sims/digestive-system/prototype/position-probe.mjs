import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chrome } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.argv[2] || path.join(HERE, '..', '..', '..'));
const CHEW = Number(process.argv[3] || 0);
const OUT = path.join(HERE, `position-check-${CHEW}.json`);
const clockSource = fs.readFileSync(path.join(HERE, 'timing-clock.js'), 'utf8');
const anchorData = JSON.parse(fs.readFileSync(path.join(HERE, 'anchors.json'), 'utf8'));

function patchedIndex() {
  const dir = path.join(ROOT, 'sims', 'digestive-system');
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  let js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');
  const probe = `
  try {
  window.__dotRoutes = DOT_ROUTES;
  const anchors = ${JSON.stringify(anchorData)};
  const papillaAnchor = anchors.routes.papilla[0];
  const duodenumCentreline = anchors.segments.duodenum.anchors;
  const oesophagusCentreline = GEOM.trackSegments.oesophagus;
  const maskCtx = document.createElement('canvas').getContext('2d');
  const maskItems = (items) => items.map((item) => ({
    id: item.id,
    path: new Path2D(item.d),
    m: item.m || [1, 0, 0, 1, 0, 0]
  }));
  const groupItems = (tag) => {
    const group = GEOM.svgArt.find((g) => g.tag === tag);
    return group ? maskItems(group.items) : [];
  };
  const masks = {
    liver: groupItems('liver'),
    bile: groupItems('liver_detail').filter((i) => i.id === 'path2533')
      .concat(groupItems('gallbladder').filter((i) => i.id === '_223737152_1_'))
      .concat(groupItems('duodenum')),
    pancreatic: groupItems('pancreas').concat(groupItems('duodenum')),
    small: Object.values(GEOM.tubePaths).flat()
      .filter((item) => item.sourceTag === 'small intestine' || item.sourceTag === 'duodenum' || item.tag === 'small intestine' || item.tag === 'duodenum')
      .map((item) => ({ id: item.id, path: new Path2D(item.d), m: item.m || [1, 0, 0, 1, 0, 0] }))
      .concat(groupItems('small'))
      .concat(groupItems('duodenum'))
  };
  function pointInMasks(items, p) {
    for (const item of items) {
      maskCtx.setTransform(item.m[0], item.m[1], item.m[2], item.m[3], item.m[4], item.m[5]);
      if (maskCtx.isPointInPath(item.path, p.x, p.y)) return true;
    }
    return false;
  }
  function pointNearMasks(items, p, tol) {
    if (pointInMasks(items, p)) return true;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      if (pointInMasks(items, { x: p.x + Math.cos(a) * tol, y: p.y + Math.sin(a) * tol })) return true;
    }
    return false;
  }
  function routeDistance(points, p) {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const ax = Array.isArray(a) ? a[0] : a.x;
      const ay = Array.isArray(a) ? a[1] : a.y;
      const bx = Array.isArray(b) ? b[0] : b.x;
      const by = Array.isArray(b) ? b[1] : b.y;
      const dx = bx - ax, dy = by - ay;
      const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      best = Math.min(best, Math.hypot(ax + dx * t - p.x, ay + dy * t - p.y));
    }
    return best;
  }
  window.__posprobe = {
    check(chew) {
      const events = window.__dotEvents || [];
      const counts = {};
      const offences = [];
      for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1;
      const add = (kind, detail) => offences.push({ kind, detail });
      const names = ['portal', 'lymph', 'bile', 'pancreatic'];
      for (const route of names) {
        const source = GEOM.routes[route].points;
        (window.__dotRoutes[route] || []).forEach((p, i) => {
          const d = routeDistance(source, { x: p[0], y: p[1] });
          if (d > 3) add('traced-route', route + '[' + i + '] ' + d.toFixed(2) + 'px from current route');
          if (route === 'lymph') {
            const clearance = routeDistance(oesophagusCentreline, { x: p[0], y: p[1] });
            if (clearance < 4) add('lymph-clearance', route + '[' + i + '] ' + clearance.toFixed(2) + 'px from oesophagus');
          }
        });
      }
      const geometryPapilla = GEOM.routes.bile.points[GEOM.routes.bile.points.length - 1];
      const dotPapilla = window.__dotRoutes.papilla;
      if (!dotPapilla || Math.hypot(dotPapilla[0] - geometryPapilla[0], dotPapilla[1] - geometryPapilla[1]) > 0.01) {
        add('papilla-route', 'papilla endpoint does not match current geometry');
      }
      const papillaDistance = routeDistance(duodenumCentreline, { x: papillaAnchor[0], y: papillaAnchor[1] });
      if (papillaDistance > 12) {
        add('papilla-route', papillaDistance.toFixed(2) + ' SVG units from duodenum centreline over 12');
      }
      for (const kind of ['carb', 'protein', 'fat', 'bile', 'bicarbonate']) {
        if (!counts[kind]) add('missing-dots', kind + ' emitted zero dots');
      }
      for (let n = 0; n < events.length; n++) {
        const e = events[n];
        const label = e.kind + '#' + n;
        const points = [e.at(0), e.at(0.5), e.at(1)];
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const where = ['start', 'middle', 'end'][i];
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            add('bad-point', label + ' ' + where + ' is not finite');
            continue;
          }
          if (e.kind === 'carb' || e.kind === 'protein' || e.kind === 'fat') {
            const route = e.kind === 'fat' ? 'lymph' : 'portal';
            if (e.route !== route) add('wrong-route', label + ' route=' + e.route + ' expected=' + route);
            const d = routeDistance(GEOM.routes[route].points, p);
            if (d > 3) add('route-distance', label + ' ' + where + ' ' + d.toFixed(2) + 'px from current ' + route);
            if (i === 0 && !pointInMasks(masks.small, p)) {
              add('start-outside-lumen', label + ' start x=' + p.x.toFixed(2) + ' y=' + p.y.toFixed(2));
            }
            if (i === 2 && route === 'portal' && !pointNearMasks(masks.liver, p, 12)) {
              add('portal-end', label + ' end x=' + p.x.toFixed(2) + ' y=' + p.y.toFixed(2));
            }
            if (i === 2 && route === 'lymph' && (p.y < DOT_NECK_Y || p.y > H || p.x < 0 || p.x > W)) {
              add('lymph-end', label + ' end x=' + p.x.toFixed(2) + ' y=' + p.y.toFixed(2));
            }
            if (route === 'lymph' && routeDistance(oesophagusCentreline, p) < 4) {
              add('lymph-clearance', label + ' ' + where + ' ' + routeDistance(oesophagusCentreline, p).toFixed(2) + 'px from oesophagus');
            }
          } else {
            const route = e.kind === 'bile' ? 'bile' : 'pancreatic';
            if (e.route !== route) add('wrong-route', label + ' route=' + e.route + ' expected=' + route);
            if (!pointNearMasks(masks[route], p, 4)) {
              add('duct-offset', label + ' ' + where + ' x=' + p.x.toFixed(2) + ' y=' + p.y.toFixed(2) + ' outside ' + route + ' art');
            }
            if (i === 2 && dotPapilla && Math.hypot(p.x - dotPapilla[0], p.y - dotPapilla[1]) > 4) {
              add('papilla-end', label + ' end ' + Math.hypot(p.x - dotPapilla[0], p.y - dotPapilla[1]).toFixed(2) + 'px from papilla');
            }
          }
        }
      }
      const routeSamples = {};
      for (const route of names) {
        routeSamples[route] = window.__dotRoutes[route].map((p) =>
          routeDistance(GEOM.routes[route].points, { x: p[0], y: p[1] }));
      }
      return {
        chew: chew,
        counts: counts,
        routeSamples: routeSamples,
        emitted: events.length,
        offences: offences,
        masks: {
          liver: masks.liver.length,
          bile: masks.bile.length,
          pancreatic: masks.pancreatic.length,
          small: masks.small.length
        },
        geometry: {
          routes: Object.fromEntries(names.map((name) => [name, GEOM.routes[name].points.length])),
          papillaAnchor: papillaAnchor,
          papillaDistance: papillaDistance,
          oesophagusSamples: oesophagusCentreline.length
        }
      };
    }
  };
  } catch (error) {
    window.__probeError = String(error && error.stack || error);
  }
  `;
  const end = js.lastIndexOf('})();');
  if (end < 0) throw new Error('cannot find IIFE end in script.js');
  js = js.slice(0, end) + probe + js.slice(end);
  const hook = '<script>window.__dotEvents=[];window.__pageError=null;window.addEventListener("error",function(e){window.__pageError=e.message+" @"+e.lineno+":"+e.colno;});window.__EV_DOT_EMIT__=function(e){window.__dotEvents.push(e);};</script>';
  const tag = '<script src="script.js"></script>';
  if (!html.includes(tag)) throw new Error('cannot find script.js tag in index.html');
  html = html.replace(tag, '<script>\n' + js + '\n</script>');
  html = html.replace('<head>', '<head>\n<script>\n' + clockSource + '\n</script>\n' + hook);
  return html;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
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
    const diag = await browser.eval('return JSON.stringify({ clock: typeof window.__clock, probe: typeof window.__posprobe, events: typeof window.__dotEvents, readyState: document.readyState });');
    const error = await browser.eval('return window.__probeError || window.__pageError || null;');
    throw new Error('virtual clock or independent route oracle missing in page: ' + diag + ' error=' + error);
  }
  const result = JSON.parse(await browser.eval(`
    document.getElementById('feedBtn').click();
    for (let i = 0; i < ${CHEW}; i++) document.getElementById('chewBtn').click();
    const readout = document.getElementById('whereValue');
    for (let i = 0; i < 6000; i++) {
      window.__clock.step();
      if (readout.textContent === 'Eliminated') break;
    }
    return JSON.stringify(window.__posprobe.check(${CHEW}));
  `));
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  const kinds = Object.keys(result.counts).sort().map((k) => k + '=' + result.counts[k]).join(',');
  console.log(`position-probe: chew=${CHEW} emitted=${result.emitted} counts=${kinds} offences=${result.offences.length}`);
  for (const o of result.offences.slice(0, 12)) console.log(`FAIL [${o.kind}] ${o.detail}`);
  if (result.offences.length) process.exitCode = 1;
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
