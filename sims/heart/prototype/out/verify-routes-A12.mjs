import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const outDir = path.dirname(fileURLToPath(import.meta.url));
const proto = path.resolve(outDir, '..');
const svgPath = path.resolve(proto, '../art/heart-anatomy.svg');
const svgBase64 = fs.readFileSync(svgPath).toString('base64');
const routesPath = path.join(outDir, 'routes-A10.json');
export const ROOT_W = 662.65082;
export const ROOT_H = 651.49066;
const CW = Math.ceil(ROOT_W);
const CH = Math.ceil(ROOT_H);
let callNo = 0;
const IDS = ['dark', 'blue', 'red', 'orange', 'neutral'];

export function load() {
  return { routes: JSON.parse(fs.readFileSync(routesPath, 'utf8')) };
}

function runsOf(points, tag) {
  const runs = [];
  let current = [];
  points.forEach((p, i) => {
    if (p.tag === tag) current.push(i);
    else if (current.length) { runs.push(current); current = []; }
  });
  if (current.length) runs.push(current);
  return runs;
}

export function hiddenSegments(routes) {
  const out = [];
  for (const r of routes.routes) {
    for (const run of runsOf(r.points, 'hidden')) {
      const a = r.points[run[0]];
      const b = r.points[run[run.length - 1]];
      out.push({
        route: r.name,
        start: [a.x, a.y],
        end: [b.x, b.y],
        cover: a.cover || b.cover || [],
        length: Math.hypot(b.x - a.x, b.y - a.y),
        pts: [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }))
      });
    }
  }
  return out;
}

export function headingProbes(routes) {
  const probes = [];
  const runs = [];
  const counts = routes.routes.map(() => 0);
  routes.routes.forEach((r, ri) => {
    for (const run of runsOf(r.points, 'visible').concat(runsOf(r.points, 'exit'))) {
      if (run.length < 2) continue;
      const id = `${ri}:${runs.length}`;
      const cum = [0];
      for (let i = 1; i < run.length; i += 1) {
        const a = r.points[run[i - 1]];
        const b = r.points[run[i]];
        cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
      }
      const total = cum[cum.length - 1];
      for (let s = 0; s <= total; s += 8) {
        let j = 1;
        while (j < cum.length - 1 && cum[j] < s) j += 1;
        const span = cum[j] - cum[j - 1];
        const t = span ? (s - cum[j - 1]) / span : 0;
        const a = r.points[run[j - 1]];
        const b = r.points[run[j]];
        probes.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        runs.push(id);
        counts[ri] += 1;
      }
    }
  });
  return { probes, runs, counts };
}

export function browserScript() {
  return `
const points=POINTS_JSON;
const hidden=HIDDEN_JSON;
const probes=PROBES_JSON;
const frame=document.getElementById('f');
const img=new Image();
img.src='data:image/svg+xml;base64,SVG_B64';
const IDS=${JSON.stringify(IDS)};
function famOf(rgb){
 const [r,g,b]=rgb;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
 if(mx>=180&&(mx-mn)/mx<0.20)return 'neutral';
 if(mx<80)return 'dark';
 const d=mx-mn,sat=mx===0?0:d/mx;
 if(sat<0.12)return 'neutral';
 let h;if(d===0)h=0;else if(mx===r)h=60*(((g-b)/d)%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);h=(h+360)%360;
 if(h>=215&&h<335)return 'blue';
 if(h>=335||h<15)return 'red';
 if(h>=15&&h<45)return 'orange';
 return 'neutral';
}
Promise.all([new Promise(ok=>frame.addEventListener('load',ok,{once:true})),new Promise(ok=>{if(img.complete)ok();else img.addEventListener('load',ok,{once:true});})]).then(()=>{
 const W=${CW},H=${CH},R=80;
 const d=frame.contentDocument;
 const cx=document.getElementById('a').getContext('2d',{willReadFrequently:true});
 cx.drawImage(img,0,0,W,H);
 const data=cx.getImageData(0,0,W,H).data;
 const fm=new Uint8Array(W*H);
 for(let i=0;i<W*H;i+=1){fm[i]=IDS.indexOf(famOf([data[i*4],data[i*4+1],data[i*4+2]]));}
 const rgb=p=>{const x=Math.max(0,Math.min(W-1,Math.round(p.x)));const y=Math.max(0,Math.min(H-1,Math.round(p.y)));const i=(y*W+x)*4;return [data[i],data[i+1],data[i+2]];};
 const top=p=>{const e=d.elementFromPoint(p.x,p.y);return e?(e.id||e.tagName):'';};
 const margin=p=>{const id=top(p);if(!id)return {top:'',margin:0};const e=d.getElementById(id);if(!e||typeof e.isPointInFill!=='function')return {top:id,margin:0};const m=e.getCTM();if(!m)return {top:id,margin:0};const inv=m.inverse();const ins=(dx,dy)=>e.isPointInFill(new DOMPoint(p.x+dx,p.y+dy).matrixTransform(inv));if(!ins(0,0))return {top:id,margin:0};let best=0;for(let r=0.5;r<=12;r+=0.5){let ok=true;for(let k=0;k<8;k+=1){const a=k*Math.PI/4;if(!ins(Math.cos(a)*r,Math.sin(a)*r)){ok=false;break;}}if(!ok)break;best=r;}return {top:id,margin:best};};
 function nearest(p,wantIds){
  const x0=Math.round(p.x),y0=Math.round(p.y);let best=Infinity;
  for(let dy=-R;dy<=R;dy+=1)for(let dx=-R;dx<=R;dx+=1){
   const d2=dx*dx+dy*dy;if(d2>=best*best)continue;
   const x=x0+dx,y=y0+dy;if(x<0||y<0||x>=W||y>=H)continue;
   if(wantIds.includes(fm[y*W+x]))best=Math.sqrt(d2);
  }
  return best===Infinity?null:best;
 }
 const cov=hidden.map(p=>top(p));
 const probeTop=probes.map(p=>top(p));
 const BLUE=[IDS.indexOf('blue')],RED=[IDS.indexOf('red'),IDS.indexOf('orange')],DARK=[IDS.indexOf('dark')];
 const out=points.map(p=>{
  const c=rgb(p),f=famOf(c),m=margin(p);
  const expected=p.color==='blue'?BLUE:RED;
  const opposite=p.color==='blue'?RED:BLUE;
  const fId=IDS.indexOf(f);
  const inFam=expected.includes(fId);
  const notFam = p.color==='blue' ? [IDS.indexOf('red'),IDS.indexOf('orange'),IDS.indexOf('neutral'),IDS.indexOf('dark')] : [IDS.indexOf('blue'),IDS.indexOf('neutral'),IDS.indexOf('dark')];
  const dt = inFam ? nearest(p,notFam) : null;
  return {rgb:c,fam:f,top:m.top,margin:m.margin,clear:inFam?nearest(p,opposite):null,darkDist:inFam?nearest(p,DARK):null,dt};
 });
 document.getElementById('out').textContent=JSON.stringify({out,cov,probeTop,fmMeta:{type:'Uint8Array',w:W,h:H,scaleX:W/${ROOT_W},scaleY:H/${ROOT_H},ids:IDS}});
});
`;
}

export function query(points, hidden, probes) {
  callNo += 1;
  const stamp = `${Date.now()}-${callNo}`;
  const pageName = `query-a11-${stamp}.html`;
  const profile = `qa11-${stamp}`;
  const script = browserScript()
    .replace('POINTS_JSON', JSON.stringify(points))
    .replace('HIDDEN_JSON', JSON.stringify(hidden))
    .replace('PROBES_JSON', JSON.stringify(probes))
    .replace('SVG_B64', svgBase64);
  const html = `<!doctype html><meta charset="utf-8"><iframe id="f" src="${pathToFileURL(svgPath).href}" style="position:absolute;left:0;top:0;width:${ROOT_W}px;height:${ROOT_H}px;border:0"></iframe><canvas id="a" width="${CW}" height="${CH}" style="display:none"></canvas><pre id="out"></pre><script>${script}</script>`;
  fs.writeFileSync(path.join(outDir, pageName), html);
  const dom = execFileSync('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', `--user-data-dir=${profile}`, '--virtual-time-budget=20000', '--dump-dom', pageName], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, cwd: outDir, env: { ...process.env, TMPDIR: '.' }
  });
  const text = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  return JSON.parse(text);
}

export function family(rgb) {
  const [r, g, b] = rgb;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx >= 180 && (mx - mn) / mx < 0.20) return 'neutral';
  if (mx < 80) return 'dark';
  const d = mx - mn;
  const sat = mx === 0 ? 0 : d / mx;
  if (sat < 0.12) return 'neutral';
  let h;
  if (d === 0) h = 0;
  else if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  h = (h + 360) % 360;
  if (h >= 215 && h < 335) return 'blue';
  if (h >= 335 || h < 15) return 'red';
  if (h >= 15 && h < 45) return 'orange';
  return 'neutral';
}

function angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function delta(a, b) { let d = Math.abs(a - b) * 180 / Math.PI; return d > 180 ? 360 - d : d; }
const ALLOWED_TAGS = new Set(['hidden', 'offart', 'bridge', 'gap', 'exit']);
function fmtClear(v) { return v === null || v === undefined ? 'not in family' : +v.toFixed(2); }

export function checkRoute(route, sampled, probePoints, probeTop, probeRuns) {
  const expected = route.color === 'blue' ? ['blue'] : ['red', 'orange'];
  const opposite = route.color === 'blue' ? ['red', 'orange'] : ['blue'];
  const counts = {};
  for (const p of route.points) counts[p.tag] = (counts[p.tag] || 0) + 1;
  const vis = [];
  route.points.forEach((p, i) => { if (p.tag === 'visible' || p.tag === 'exit') vis.push({ p, s: sampled[i], i }); });
  const fams = vis.map((v) => family(v.s.rgb));
  const crossings = vis.filter((v, i) => opposite.includes(fams[i]));
  const neutral = vis.filter((v, i) => fams[i] === 'neutral');
  const dark = vis.filter((v, i) => fams[i] === 'dark');
  const ok = vis.filter((v, i) => expected.includes(fams[i]) || fams[i] === 'neutral');
  const clears = vis.filter((v, i) => expected.includes(fams[i]) && v.s.clear !== null).map((v) => v.s.clear);
  const darkDists = vis.filter((v, i) => expected.includes(fams[i]) && v.s.darkDist !== null).map((v) => v.s.darkDist);
  const minClear = clears.length ? Math.min(...clears) : null;
  const minDark = darkDists.length ? Math.min(...darkDists) : null;
  let maxHeading = 0;
  let maxHeadingAt = null;
  for (let i = 2; i < probePoints.length; i += 1) {
    if (probeRuns[i] !== probeRuns[i - 1] || probeRuns[i - 1] !== probeRuns[i - 2]) continue;
    if (String(probeTop[i]).includes('valve') || String(probeTop[i - 1]).includes('valve') || String(probeTop[i - 2]).includes('valve')) continue;
    const h = delta(angle(probePoints[i - 2], probePoints[i - 1]), angle(probePoints[i - 1], probePoints[i]));
    if (h > maxHeading) { maxHeading = h; maxHeadingAt = [probePoints[i - 1].x, probePoints[i - 1].y]; }
  }
  const groups = [];
  let current = null;
  for (let i = 0; i < route.points.length - 1; i += 1) {
    const a = route.points[i];
    const b = route.points[i + 1];
    const a1 = angle(a, b);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const tag = a.tag;
    const allowedTag = ALLOWED_TAGS.has(a.tag) || ALLOWED_TAGS.has(b.tag);
    const topId = sampled[i] ? String(sampled[i].top||'') : '';
    const item = { a: a1, len, allowedTag, tag, top: topId, start: [a.x, a.y], end: [b.x, b.y] };
    if (!current || delta(current.a, a1) >= 1 || current.tag !== tag) { current = { a: a1, tag, items: [item] }; groups.push(current); }
    else current.items.push(item);
  }
  const summarised = groups.map((g) => {
    const tally = {};
    for (const x of g.items) tally[x.tag] = (tally[x.tag] || 0) + 1;
    const topTally = {};
    for (const x of g.items) if (x.top) topTally[x.top] = (topTally[x.top] || 0) + 1;
    const shapeIds = [...new Set(g.items.map(x=>x.top).filter(Boolean))];
    const singleShape = shapeIds.length===1;
    return {
      len: g.items.reduce((s, x) => s + x.len, 0),
      allowed: g.items.every((x) => x.allowedTag) || singleShape,
      tag: g.tag || Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
      top: Object.entries(topTally).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
      shapeIds,
      start: g.items[0].start,
      end: g.items[g.items.length - 1].end
    };
  });
  const badStraights = summarised.filter((x) => x.len > 30 && !x.allowed);
  // centre offset: dt=distance to nearest pixel not in route family (neutral,dark,other). localmax within 10 units.
  const visWithDt = vis.map((v,i)=>({ ...v, fam: fams[i], dt: v.s.dt }));
  for (let i=0;i<visWithDt.length;i++) {
    const v=visWithDt[i];
    if (v.dt===null||v.dt===undefined) { v.localmax=null; v.ratio=null; continue; }
    let localmax=v.dt;
    for (let j=0;j<visWithDt.length;j++) {
      if (i===j) continue;
      const o=visWithDt[j]; if(o.dt===null||o.dt===undefined) continue;
      const d=Math.hypot(v.p.x-o.p.x, v.p.y-o.p.y);
      if (d<=10) localmax=Math.max(localmax,o.dt);
    }
    v.localmax=localmax; v.ratio=localmax>0?v.dt/localmax:null;
  }
  const ratios = visWithDt.filter(v=>v.ratio!==null).map(v=>v.ratio);
  const minRatio = ratios.length?Math.min(...ratios):null;
  const ratioUnder05 = ratios.length?ratios.filter(r=>r<0.5).length/ratios.length:null;
  const worst = visWithDt.map((v) => {
    const clear = v.s.clear;
    const darkDist = v.s.darkDist;
    return {
      x: +v.p.x.toFixed(2), y: +v.p.y.toFixed(2), family: v.fam,
      clear: fmtClear(clear), darkDist: fmtClear(darkDist), dt: fmtClear(v.dt), ratio: v.ratio===null?'not in family':+v.ratio.toFixed(4),
      margin: +v.s.margin.toFixed(2), top: v.s.top,
      score: (crossings.includes(v) ? 3 : 0) + (v.fam === 'dark' ? 2 : 0) + (v.fam === 'neutral' ? 1 : 0) + (clear !== null && clear < 4 ? 2 : 0)
    };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
  const okFraction = vis.length ? ok.length / vis.length : 0;
  const neutralFraction = vis.length ? neutral.length / vis.length : 0;
  const darkFraction = vis.length ? dark.length / vis.length : 0;
  const clearanceOK = minClear !== null && minClear >= 4;
  // self-intersections
  function segIntersect(a,b,c,d){
    const d1=b.x-a.x,d2=b.y-a.y,d3=d.x-c.x,d4=d.y-c.y;
    const den=d1*d4-d2*d3; if(Math.abs(den)<1e-9) return null;
    const t=((c.x-a.x)*d4-(c.y-a.y)*d3)/den;
    const u=((c.x-a.x)*d2-(c.y-a.y)*d1)/den;
    if(t>0.001&&t<0.999&&u>0.001&&u<0.999) return [+(a.x+t*d1).toFixed(2), +(a.y+t*d2).toFixed(2)];
    return null;
  }
  const selfIntersections=[];
  const pts=route.points;
  for(let i=0;i<pts.length-1;i++){
    for(let j=i+2;j<pts.length-1;j++){
      if(j===i+1) continue;
      const hit=segIntersect(pts[i],pts[i+1],pts[j],pts[j+1]);
      if(hit) selfIntersections.push({at:hit,i,j});
    }
  }
  const pass = crossings.length === 0 && darkFraction < 0.05 && neutralFraction <= 0.10 && clearanceOK && maxHeading < 35 && badStraights.length === 0 && okFraction >= 0.95 && selfIntersections.length===0;
  return {
    counts, samples: vis.length, okFraction, crossings: crossings.map((v) => [v.p.x, v.p.y]),
    neutralFraction, darkFraction, minClear, minDark, maxHeading, maxHeadingAt,
    badStraights: badStraights.map((s) => ({ start: s.start.map((n) => +n.toFixed(2)), end: s.end.map((n) => +n.toFixed(2)), len: +s.len.toFixed(2), tag: s.tag, shapeIds: s.shapeIds })),
    minRatio, ratioUnder05, selfIntersections: selfIntersections.map(s=>s.at), worst, pass
  };
}

export function analyse(routes) {
  const pts = [];
  routes.routes.forEach((r) => r.points.forEach((p) => pts.push({ x: p.x, y: p.y, color: r.color })));
  const hidden = hiddenSegments(routes);
  const hp = headingProbes(routes);
  const probePoints = hp.probes.map((p, i) => ({ ...p, id: hp.runs[i] }));
  const q = query(pts, hidden.flatMap((h) => h.pts), probePoints);
  let at = 0;
  let pt = 0;
  const perRoute = routes.routes.map((r, ri) => {
    const sampled = r.points.map(() => q.out[at++]);
    const n = hp.counts[ri];
    const res = checkRoute(r, sampled, hp.probes.slice(pt, pt + n), q.probeTop.slice(pt, pt + n), hp.runs.slice(pt, pt + n));
    pt += n;
    return res;
  });
  return { perRoute, hidden, covers: q.cov, fmMeta: q.fmMeta };
}

export const checkRoutes = analyse;
function fmt(n, d = 2) { return Number(n).toFixed(d); }

export function selfTest() {
  // 6 blue-family pixels at known distances (3,6,12) from nearest red-family pixel, and 3 red same.
  const W = 300, H = 200;
  const IDS_LOCAL = IDS;
  const fm = new Uint8Array(W * H);
  for (let i = 0; i < fm.length; i++) fm[i] = IDS_LOCAL.indexOf('neutral');
  // Each case gets its own isolated horizontal strip to avoid cross-interference.
  const cases = [
    { label: 'blue-near-red-3a',  y: 20, bx0: 50, bx1: 100, px: 100, color: 'blue', expect: 3,  ox: 103, ofam: 'red' },
    { label: 'blue-near-red-3b',  y: 30, bx0: 50, bx1: 100, px: 100, color: 'blue', expect: 3,  ox: 103, ofam: 'red' },
    { label: 'blue-near-red-6a',  y: 40, bx0: 50, bx1: 100, px: 100, color: 'blue', expect: 6,  ox: 106, ofam: 'red' },
    { label: 'blue-near-red-6b',  y: 50, bx0: 50, bx1: 100, px: 100, color: 'blue', expect: 6,  ox: 106, ofam: 'red' },
    { label: 'blue-near-red-12a', y: 60, bx0: 50, bx1: 100, px: 100, color: 'blue', expect: 12, ox: 112, ofam: 'red' },
    { label: 'blue-near-red-12b', y: 70, bx0: 50, bx1: 100, px: 100, color: 'blue', expect: 12, ox: 112, ofam: 'red' },
    { label: 'red-near-blue-3',   y: 90, bx0: 50, bx1: 100, px: 100, color: 'red',  expect: 3,  ox: 103, ofam: 'blue' },
    { label: 'red-near-blue-6',   y: 100,bx0: 50, bx1: 100, px: 100, color: 'red',  expect: 6,  ox: 106, ofam: 'blue' },
    { label: 'red-near-blue-12',  y: 110,bx0: 50, bx1: 100, px: 100, color: 'red',  expect: 12, ox: 112, ofam: 'blue' },
  ];
  for (const c of cases) {
    for (let x = c.bx0; x <= c.bx1; x++) fm[c.y * W + x] = IDS_LOCAL.indexOf(c.color === 'blue' ? 'blue' : 'red');
    fm[c.y * W + c.ox] = IDS_LOCAL.indexOf(c.ofam);
  }
  const picks = cases.map(({label,x,px,y,color,expect}) => ({label,x:px,y,color,expect}));

  const R = 80;
  function nearest(p, wantIds) {
    const x0 = Math.round(p.x), y0 = Math.round(p.y); let best = Infinity;
    for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) {
      const d2 = dx * dx + dy * dy; if (d2 >= best * best) continue;
      const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (wantIds.includes(fm[y * W + x])) best = Math.sqrt(d2);
    }
    return best === Infinity ? null : best;
  }
  const BLUE = [IDS_LOCAL.indexOf('blue')], RED = [IDS_LOCAL.indexOf('red'), IDS_LOCAL.indexOf('orange')];
  const results = picks.map((p) => {
    const opposite = p.color === 'blue' ? RED : BLUE;
    const got = nearest({ x: p.x, y: p.y }, opposite);
    const ok = got !== null && Math.abs(got - p.expect) <= 1;
    return { ...p, got, ok };
  });
  return results;
}

function bruteForceOppositeDistanceInRealFm(qOut, fmMeta, points, color) {
  // Build a mini fm by requerying a grid? No: we need real fm pixels. Instead, use query result and brute force via browser? 
  // We'll do it by asking browser for a patch: but simpler to compute brute force from sampled points by querying nearest in a dense local grid around point.
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { routes } = load();
  const probe = query([{ x: 10, y: 10, color: 'blue' }], [], []);
  console.log('FM_META\t' + JSON.stringify(probe.fmMeta));
  console.log('FM_NOTE\tfm=Uint8Array of family ids per pixel; want/opposite/dark passed as numeric id arrays; root-unit to fm-pixel scale should be 1:1');

  const st = selfTest();
  let allOk = true;
  for (const r of st) {
    const diff = r.got === null ? 'null' : Math.abs(r.got - r.expect);
    const ok = diff !== 'null' && diff <= 1;
    if (!ok) allOk = false;
    console.log(`SELFTEST\t${r.label}\texpect=${r.expect}\tgot=${r.got === null ? 'null' : +r.got.toFixed(4)}\tdiff=${diff}\t${ok ? 'OK' : 'FAIL'}`);
  }
  console.log(`SELFTEST_RESULT\t${allOk ? 'PASS' : 'FAIL'}`);
  if (!allOk) process.exit(1);

  // Real-fm self-test: pick 6 real pixels from routes, brute force opposite-family distance in separate code, compare with checker
  const picks = [];
  for (const r of routes.routes) {
    for (const p of r.points) {
      if (p.tag !== 'visible' && p.tag !== 'exit') continue;
      picks.push({ x: p.x, y: p.y, color: r.color, route: r.name });
      if (picks.length >= 60) break;
    }
    if (picks.length >= 60) break;
  }
  // choose 6 spread out
  const sel = [0,10,20,30,40,50].map(i=>picks[i]).filter(Boolean);
  const qSel = query(sel.map(p=>({x:p.x,y:p.y,color:p.color})), [], []);
  // brute force in separate code via browser: get full fm patch around each point
  // We'll run a separate browser query that returns distances computed by independent brute-force function.
  callNo += 1;
  const stamp = `${Date.now()}-${callNo}`;
  const pageName = `real-selftest-a12-${stamp}.html`;
  const profile = `ra12-${stamp}`;
  const script = `
const pts=${JSON.stringify(sel)};
const img=new Image(); img.src='data:image/svg+xml;base64,${svgBase64}';
const IDS=${JSON.stringify(IDS)};
function famOf(rgb){const [r,g,b]=rgb;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx>=180&&(mx-mn)/mx<0.20)return 'neutral';if(mx<80)return 'dark';const d=mx-mn,sat=mx===0?0:d/mx;if(sat<0.12)return 'neutral';let h;if(d===0)h=0;else if(mx===r)h=60*(((g-b)/d)%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);h=(h+360)%360;if(h>=215&&h<335)return 'blue';if(h>=335||h<15)return 'red';if(h>=15&&h<45)return 'orange';return 'neutral';}
new Promise(ok=>{if(img.complete)ok();else img.addEventListener('load',ok,{once:true});}).then(()=>{
 const W=${CW},H=${CH},R=80;
 const c=document.getElementById('a').getContext('2d',{willReadFrequently:true});
 c.drawImage(img,0,0,W,H); const data=c.getImageData(0,0,W,H).data;
 const fm=new Uint8Array(W*H); for(let i=0;i<W*H;i+=1) fm[i]=IDS.indexOf(famOf([data[i*4],data[i*4+1],data[i*4+2]]));
 function brute(p,wantIds){ // separate brute force implementation
   let best=Infinity; const x0=Math.round(p.x),y0=Math.round(p.y);
   for(let y=Math.max(0,y0-R);y<=Math.min(H-1,y0+R);y++) for(let x=Math.max(0,x0-R);x<=Math.min(W-1,x0+R);x++){
     const dx=x-x0,dy=y-y0; const d2=dx*dx+dy*dy; if(d2>R*R) continue;
     if(wantIds.includes(fm[y*W+x])){ const d=Math.sqrt(d2); if(d<best) best=d; }
   }
   return best===Infinity?null:best;
 }
 const BLUE=[IDS.indexOf('blue')],RED=[IDS.indexOf('red'),IDS.indexOf('orange')];
 const out=pts.map(p=>{ const opposite=p.color==='blue'?RED:BLUE; return {x:p.x,y:p.y,color:p.color,brute:brute(p,opposite)}; });
 document.getElementById('out').textContent=JSON.stringify(out);
});`;
  const html = `<!doctype html><meta charset="utf-8"><canvas id="a" width="${CW}" height="${CH}" style="display:none"></canvas><pre id="out"></pre><script>${script}</script>`;
  fs.writeFileSync(path.join(outDir, pageName), html);
  const dom = execFileSync('chromium', ['--headless','--no-sandbox','--disable-gpu','--allow-file-access-from-files',`--user-data-dir=${profile}`,'--virtual-time-budget=20000','--dump-dom',pageName], {encoding:'utf8',maxBuffer:128*1024*1024,cwd:outDir,env:{...process.env,TMPDIR:'.'}});
  const brute = JSON.parse(dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));
  let realOk=true;
  for(let i=0;i<sel.length;i++){
    const checker=qSel.out[i].clear;
    const b=brute[i].brute;
    const ok = (checker===null && b===null) || (checker!==null && b!==null && Math.abs(checker-b)<=1);
    if(!ok) realOk=false;
    console.log(`REAL_SELFTEST\t${sel[i].route}\t${sel[i].x.toFixed(2)},${sel[i].y.toFixed(2)}\tcolor=${sel[i].color}\texpect_brute=${b===null?'null':+b.toFixed(4)}\tchecker=${checker===null?'null':+checker.toFixed(4)}\t${ok?'OK':'FAIL'}`);
  }
  console.log(`REAL_SELFTEST_RESULT\t${realOk?'PASS':'FAIL'}`);
  if(!realOk) process.exit(1);

  const a = analyse(routes);
  console.log('FRAME_ROOT\t663x652');
  console.log('CHECKER_COPY\tout/verify-routes-A12.mjs\tfrom=out/verify-routes-A11.mjs');
  console.log('CHECKER_CHANGE\tbad straight excludes groups entirely inside one shape id; prints shapeIds');
  console.log('CHECKER_CHANGE\tcentre offset dt=dist to nearest pixel not in route family; localmax within 10u; ratio=dt/localmax; reports minRatio,fraction<0.5');
  console.log('CHECKER_CHANGE\treal-fm self-test: 6 real pixels brute-force opposite distance vs checker');
  for (let i = 0; i < routes.routes.length; i += 1) {
    const c = a.perRoute[i];
    const tags = Object.entries(c.counts).map(([k, v]) => `${k}=${v}`).join('\t');
    console.log(`TAGS\t${routes.routes[i].name}\t${tags}`);
    const lim = (name,val,limit,ok)=>console.log(`LIMIT\t${routes.routes[i].name}\t${name}\tvalue=${val}\tlimit=${limit}\t${ok?'PASS':'FAIL'}`);
    lim('crossings', c.crossings.length, '==0', c.crossings.length===0);
    lim('darkFraction', fmt(c.darkFraction,4), '<0.05', c.darkFraction<0.05);
    lim('neutralFraction', fmt(c.neutralFraction,4), '<=0.10', c.neutralFraction<=0.10);
    lim('clearOppMin', c.minClear===null?'not in family':fmt(c.minClear), '>=4', c.minClear!==null && c.minClear>=4);
    lim('maxHeading', fmt(c.maxHeading), '<35', c.maxHeading<35);
    lim('badStraights', c.badStraights.length, '==0', c.badStraights.length===0);
    lim('okFraction', fmt(c.okFraction,4), '>=0.95', c.okFraction>=0.95);
    lim('selfIntersections', c.selfIntersections.length, '==0', c.selfIntersections.length===0);
    console.log(`CENTRE_OFFSET\t${routes.routes[i].name}\tminRatio=${c.minRatio===null?'not in family':+c.minRatio.toFixed(4)}\tfractionUnder05=${c.ratioUnder05===null?'not in family':+c.ratioUnder05.toFixed(4)}`);
    console.log(`OVERALL\t${routes.routes[i].name}\t${c.pass?'PASS':'FAIL'}`);
    console.log(`CHECK\t${routes.routes[i].name}\tsamples=${c.samples}\tok=${fmt(c.okFraction, 4)}\tcrossings=${c.crossings.length}\tneutral=${fmt(c.neutralFraction, 4)}\tdark=${fmt(c.darkFraction, 4)}\tclearOpp=${c.minClear === null ? 'not in family' : fmt(c.minClear)}\tdarkStroke=${c.minDark === null ? 'not in family' : fmt(c.minDark)}\thead=${fmt(c.maxHeading)}\theadAt=${c.maxHeadingAt ? c.maxHeadingAt.map(n=>+n.toFixed(2)).join(',') : 'NA'}\tbadStraights=${c.badStraights.length}\tselfIntersections=${c.selfIntersections.length}\tpass=${c.pass ? 1 : 0}`);
    console.log(`SELF_INTERSECTIONS\t${routes.routes[i].name}\t${JSON.stringify(c.selfIntersections)}`);
    for (const bs of c.badStraights) console.log(`BAD_STRAIGHT\t${routes.routes[i].name}\tstart=${bs.start.join(',')}\tend=${bs.end.join(',')}\tlen=${bs.len}\ttag=${bs.tag}\tshapeIds=${JSON.stringify(bs.shapeIds)}`);
    console.log(`WORST\t${routes.routes[i].name}\t${c.worst.map((w) => `${w.x},${w.y},${w.family},clear=${w.clear},dark=${w.darkDist},dt=${w.dt},ratio=${w.ratio},margin=${w.margin},${w.top}`).join(';')}`);
  }
}
