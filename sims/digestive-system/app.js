(function () {
  'use strict';

  const D = window.ANATOMY_DATA;
  const C = D.crop;
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const toggleBtn = document.getElementById('toggle');
  const statusEl = document.getElementById('status');
  const diagEl = document.getElementById('diag');
  const traceUI = document.getElementById('trace-ui');
  const segmentSelect = document.getElementById('segment');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(900 * dpr);
  canvas.height = Math.round(540 * dpr);

  const query = new URLSearchParams(window.location.search);
  const viewName = query.get('view') || 'full';
  const traceMode = query.get('mode') === 'trace';
  let overlay = query.get('overlay') === '1';
  const labelsVisible = query.get('labels') !== '0';

  const VIEWS = {
    full: { label: 'FULL VIEW — recoloured SVG base art', rect: null },
    tags: { label: 'TAG CHECK VIEW — flat colour per tag', rect: null },
    liver: { label: 'LIVER + STOMACH ZOOM', rect: [235, 355, 375, 525] },
    small: { label: 'SMALL INTESTINE ZOOM', rect: [210, 585, 405, 685] },
    colon: { label: 'COLON ZOOM', rect: [190, 535, 415, 745] }
  };
  const view = VIEWS[viewName] || VIEWS.full;

  const P = {
    oesophagus: { fill: 'rgba(255,122,89,.24)', stroke: '#ff9a7a', glow: 'rgba(255,90,60,.16)', blur: 8 },
    stomach: { fill: 'rgba(220,20,60,.42)', stroke: '#dc143c', glow: 'rgba(220,20,60,.26)', blur: 13 },
    stomach_fundus: { fill: 'rgba(255,110,140,.62)', stroke: '#ff789e', glow: 'rgba(255,90,130,.22)', blur: 12 },
    liver: { fill: 'rgba(255,69,35,.62)', stroke: '#ff451f', glow: 'rgba(255,69,35,.30)', blur: 16 },
    liver_detail: { fill: 'rgba(255,89,40,.28)', stroke: '#ff5928', glow: 'rgba(255,89,40,.16)', blur: 6 },
    liver_glow: { fill: 'rgba(255,120,60,.22)', stroke: '#ff7840', glow: 'rgba(255,120,60,.16)', blur: 8 },
    gallbladder: { fill: 'rgba(57,255,20,.55)', stroke: '#39ff14', glow: 'rgba(57,255,20,.28)', blur: 14 },
    pancreas: { fill: 'rgba(255,0,255,.46)', stroke: '#ff3dff', glow: 'rgba(255,0,255,.26)', blur: 14 },
    duodenum: { fill: 'rgba(255,145,45,.44)', stroke: '#ff9a3d', glow: 'rgba(255,140,50,.22)', blur: 11 },
    small: { fill: 'rgba(255,92,78,.55)', stroke: '#ff6f61', glow: 'rgba(255,80,70,.26)', blur: 14, inner: 'rgba(255,190,175,.22)' },
    colon: { fill: 'rgba(216,192,240,.16)', stroke: '#d8c0f0', glow: 'rgba(196,162,235,.14)', blur: 9 },
    colon_detail: { fill: 'rgba(216,192,240,.12)', stroke: '#d8c0f0', glow: 'rgba(196,162,235,.12)', blur: 5 },
    mouth: { fill: 'rgba(125,211,252,.26)', stroke: '#7dd3fc', glow: 'rgba(125,211,252,.18)', blur: 8 },
    salivary: { fill: 'rgba(45,212,191,.30)', stroke: '#2dd4bf', glow: 'rgba(45,212,191,.18)', blur: 8 },
    teeth: { fill: 'rgba(226,232,240,.45)', stroke: '#cbd5e1', glow: 'rgba(203,213,225,.16)', blur: 6 },
    outline: { fill: 'rgba(148,163,184,.04)', stroke: '#94a3b8', glow: 'rgba(148,163,184,.12)', blur: 6 },
    detail: { fill: 'rgba(148,163,184,.14)', stroke: '#94a3b8', glow: 'rgba(148,163,184,.10)', blur: 4 },
    annotation: { fill: 'rgba(0,0,0,0)', stroke: '#334155', glow: 'transparent', blur: 0 }
  };

  D.items.forEach(function (item) { item.path = new Path2D(item.d); });
  const byId = new Map(D.items.map(function (item) { return [item.id, item]; }));

  const PA = window.PATH_ANCHORS;
  const ANALYSIS = window.PATH_ANALYSIS;
  const simSegments = PA.segments;
  const oeStartIndex = simSegments.oesophagus.findIndex(function (p) {
    return Math.abs(p[0] - PA.oesophagusStartSvg[0]) < 0.01 && Math.abs(p[1] - PA.oesophagusStartSvg[1]) < 0.01;
  });
  const simAnchorsSvg = simSegments.oesophagus.slice(oeStartIndex)
    .concat(simSegments.stomach.slice(1))
    .concat(simSegments.duodenum.slice(1))
    .concat(simSegments.small.slice(1))
    .concat(simSegments.colon.slice(1))
    .concat(simSegments.rectum.slice(1));
  const simAnchorPoints = PA.archLogical.slice(0, -1).map(function (p) {
    return { x: p[0], y: p[1] };
  }).concat(simAnchorsSvg.map(function (p) {
    const lp = logical(p[0], p[1]);
    return { x: lp[0], y: lp[1] };
  }));
  const anchorRefs = [];
  PA.archLogical.forEach(function (p, i) {
    anchorRefs.push({ label: 'arch[' + i + ']', x: p[0], y: p[1] });
  });
  Object.keys(simSegments).forEach(function (seg) {
    simSegments[seg].forEach(function (p, i) {
      const lp = logical(p[0], p[1]);
      anchorRefs.push({ label: seg + '[' + i + ']', x: lp[0], y: lp[1] });
    });
  });
  const offCanvasAnchors = D.anchors.filter(function (a) { return !a.onCanvas; }).map(function (a) { return a.i; });

  const LUMEN_IDS = {
    oesophagus: ['rect4987'],
    stomach: ['path6063', 'rect7359'],
    duodenum: ['path2174', 'rect4019', 'path3169'],
    small: ['path10149'],
    colon: ['path10151', 'path10145', 'path10147', 'path10143'],
    rectum: ['path10143']
  };

  function logical(sx, sy) {
    return [C.ox + (sx - C.x) * C.scale, C.oy + (sy - C.y) * C.scale];
  }

  function svgFromLogical(lx, ly) {
    return [C.x + (lx - C.ox) / C.scale, C.y + (ly - C.oy) / C.scale];
  }

  function baseTransform(c) {
    c.transform(C.scale, 0, 0, C.scale, C.ox - C.x * C.scale, C.oy - C.y * C.scale);
  }

  function camera() {
    if (!view.rect) return { s: 1, tx: 0, ty: 0 };
    const a = logical(view.rect[0], view.rect[1]);
    const b = logical(view.rect[2], view.rect[3]);
    const pad = 30, top = 50;
    const availW = 900 - pad * 2, availH = 540 - top - pad;
    const s = Math.min(availW / (b[0] - a[0]), availH / (b[1] - a[1]));
    const tx = pad - a[0] * s + (availW - (b[0] - a[0]) * s) / 2;
    const ty = top - a[1] * s + (availH - (b[1] - a[1]) * s) / 2;
    return { s: s, tx: tx, ty: ty };
  }

  const cam = camera();

  function setCamera(c) {
    c.setTransform(cam.s * dpr, 0, 0, cam.s * dpr, cam.tx * dpr, cam.ty * dpr);
  }

  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = 900;
  probeCanvas.height = 540;
  const probeCtx = probeCanvas.getContext('2d');

  function pointInItem(item, lx, ly) {
    if (!item) return false;
    probeCtx.setTransform(1, 0, 0, 1, 0, 0);
    probeCtx.clearRect(0, 0, 900, 540);
    baseTransform(probeCtx);
    probeCtx.transform(item.m[0], item.m[1], item.m[2], item.m[3], item.m[4], item.m[5]);
    return probeCtx.isPointInPath(item.path, lx, ly);
  }

  function pointInLumen(organ, lx, ly) {
    if (organ === 'mouth') return true;
    const ids = LUMEN_IDS[organ] || [];
    for (let i = 0; i < ids.length; i++) {
      if (pointInItem(byId.get(ids[i]), lx, ly)) return true;
    }
    return false;
  }

  const LEGACY_LUMEN_IDS = {};
  Object.keys(LUMEN_IDS).forEach(function (organ) {
    LEGACY_LUMEN_IDS[organ] = LUMEN_IDS[organ].filter(function (id) {
      return organ !== 'colon' || id !== 'path10143';
    });
  });

  function pointInLegacyLumen(organ, lx, ly) {
    if (organ === 'mouth') return true;
    return LEGACY_LUMEN_IDS[organ].some(function (id) {
      return pointInItem(byId.get(id), lx, ly);
    });
  }

  const TUBE_IDS = Array.from(new Set(Object.keys(LUMEN_IDS).reduce(function (all, organ) {
    return all.concat(LUMEN_IDS[organ]);
  }, [])));

  function containingTubes(lx, ly) {
    return TUBE_IDS.filter(function (id) {
      return pointInItem(byId.get(id), lx, ly);
    }).map(function (id) {
      const item = byId.get(id);
      return { id: id, tag: item ? item.tag : 'unknown' };
    });
  }

  function organForS(s) {
    const spans = ANALYSIS.spans;
    if (s < spans.mouth[1]) return 'mouth';
    if (s < spans.oesophagus[1]) return 'oesophagus';
    if (s < spans.stomach[1]) return 'stomach';
    if (s < spans.duodenum[1]) return 'duodenum';
    if (s < spans['small intestine'][1]) return 'small';
    if (s < spans['colon incl sigmoid'][1]) return 'colon';
    return 'rectum';
  }

  const HANDOFF_TOLERANCE = 15;

  function insideAt(organ, s, lx, ly) {
    if (pointInLumen(organ, lx, ly)) return true;
    const arc = ANALYSIS.ARC;
    const handoffs = [
      [arc.oesophagus, 'mouth', 'oesophagus'],
      [arc.cardia, 'oesophagus', 'stomach'],
      [arc.pylorus, 'stomach', 'duodenum'],
      [arc.flexure, 'duodenum', 'small'],
      [arc.jejunum, 'duodenum', 'small'],
      [arc.caecum, 'small', 'colon'],
      [arc.rectum, 'colon', 'rectum']
    ];
    for (let i = 0; i < handoffs.length; i++) {
      const h = handoffs[i];
      if (Math.abs(s - h[0]) <= HANDOFF_TOLERANCE &&
          (pointInLumen(h[1], lx, ly) || pointInLumen(h[2], lx, ly))) return true;
    }
    return false;
  }

  function curveFromLogical(points) {
    const pts = [];
    const n = points.length;
    if (n < 2) return { pts: pts, total: 0 };
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(n - 1, i + 2)];
      for (let j = 0; j < 9; j++) {
        const t = j / 9, t2 = t * t, t3 = t2 * t;
        pts.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
          seg: i
        });
      }
    }
    pts.push({ x: points[n - 1].x, y: points[n - 1].y, seg: n - 2 });
    let total = 0;
    pts[0].s = 0;
    for (let k = 1; k < pts.length; k++) {
      total += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      pts[k].s = total;
    }
    return { pts: pts, total: total };
  }

  function sampleCurve(curve, organForPoint) {
    const out = [];
    if (!curve.pts.length) return out;
    let k = 0;
    const add = function (s) {
      while (k < curve.pts.length - 2 && curve.pts[k + 1].s < s) k++;
      const p = curve.pts[k], q = curve.pts[k + 1];
      const span = q.s - p.s || 1;
      const f = Math.max(0, Math.min(1, (s - p.s) / span));
      const x = p.x + (q.x - p.x) * f;
      const y = p.y + (q.y - p.y) * f;
      const organ = organForPoint ? organForPoint(s) : null;
      out.push({
        s: s, x: x, y: y, organ: organ,
        inside: organ ? insideAt(organ, s, x, y) : true,
        seg: p.seg
      });
    };
    for (let s = 0; s < curve.total; s += 2) add(s);
    add(curve.total);
    return out;
  }

  function nearestAnchors(x, y) {
    return anchorRefs.map(function (a) {
      return { label: a.label, d: Math.hypot(a.x - x, a.y - y) };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2).map(function (a) { return a.label; });
  }

  function findRuns(samples) {
    const runs = [];
    let start = -1;
    for (let i = 0; i <= samples.length; i++) {
      const bad = i < samples.length && !samples[i].inside;
      if (bad && start < 0) start = i;
      if (!bad && start >= 0) {
        const count = i - start;
        if (count >= 3) {
          const a = samples[start], b = samples[i - 1], mid = samples[start + Math.floor(count / 2)];
          runs.push({
            startSample: start, endSample: i - 1, count: count,
            sStart: Math.round(a.s), sEnd: Math.round(b.s),
            xStart: Math.round(a.x), yStart: Math.round(a.y),
            xEnd: Math.round(b.x), yEnd: Math.round(b.y),
            xMid: Math.round(mid.x), yMid: Math.round(mid.y),
            organ: mid.organ, nearestAnchors: mid.nearest || nearestAnchors(mid.x, mid.y)
          });
        }
        start = -1;
      }
    }
    return runs;
  }

  function diagnoseRuns(runList, sampleList) {
    return runList.map(function (run) {
      const counts = {};
      for (let i = run.startSample; i <= run.endSample; i++) {
        const p = sampleList[i];
        containingTubes(p.x, p.y).forEach(function (tube) {
          const key = tube.id + '|' + tube.tag;
          if (!counts[key]) counts[key] = { id: tube.id, tag: tube.tag, count: 0 };
          counts[key].count++;
        });
      }
      const containing = Object.keys(counts).map(function (key) { return counts[key]; });
      return {
        sStart: run.sStart, sEnd: run.sEnd, organ: run.organ,
        nearestAnchors: run.nearestAnchors,
        classification: containing.length ? 'WRONG MASK' : 'TRULY OUTSIDE',
        containingTubes: containing
      };
    });
  }

  const normalCurve = curveFromLogical(simAnchorPoints);
  const samples = sampleCurve(normalCurve, organForS);
  const runs = findRuns(samples);
  const rawSamples = samples.map(function (s) {
    return Object.assign({}, s, { inside: pointInLegacyLumen(s.organ, s.x, s.y) });
  });
  const rawRuns = findRuns(rawSamples);
  const runDiagnostics = diagnoseRuns(rawRuns, samples);
  const insideCount = samples.filter(function (s) { return s.inside; }).length;
  const insidePct = samples.length ? (insideCount / samples.length) * 100 : 0;
  const catmullLength = normalCurve.total;
  const segmentStats = {};
  samples.forEach(function (s) {
    const key = s.organ || 'unknown';
    if (!segmentStats[key]) segmentStats[key] = { samples: 0, inside: 0, pct: 0 };
    segmentStats[key].samples++;
    if (s.inside) segmentStats[key].inside++;
  });
  Object.keys(segmentStats).forEach(function (key) {
    const st = segmentStats[key];
    st.pct = st.samples ? (st.inside / st.samples) * 100 : 0;
  });
  const anchorOutsideSet = new Set();

  function backdrop() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 900, 540);
    bg.addColorStop(0, '#070b1a');
    bg.addColorStop(0.55, '#0b1226');
    bg.addColorStop(1, '#050813');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 900, 540);
    ctx.strokeStyle = 'rgba(148,163,184,.055)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 900; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 540); ctx.stroke();
    }
    for (let y = 0; y <= 540; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(900, y); ctx.stroke();
    }
  }

  function paintItems(flat) {
    D.items.forEach(function (item) {
      if (item.tag === 'annotation') return;
      const style = flat ? flatColour(item.tag) : (P[item.tag] || P.detail);
      ctx.save();
      ctx.transform(item.m[0], item.m[1], item.m[2], item.m[3], item.m[4], item.m[5]);
      if (item.fill !== 'none') {
        if (!flat) { ctx.shadowColor = style.glow; ctx.shadowBlur = style.blur; }
        ctx.fillStyle = flat ? style.fill : style.fill;
        ctx.fill(item.path);
        if (!flat && style.inner) {
          ctx.shadowBlur = 8;
          ctx.fillStyle = style.inner;
          ctx.fill(item.path);
        }
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = flat ? style.stroke : style.stroke;
      ctx.lineWidth = flat ? 0.8 : Math.max(item.sw || 1, 0.9);
      ctx.stroke(item.path);
      ctx.restore();
    });
  }

  function drawArtNormal(flat) {
    setCamera(ctx);
    baseTransform(ctx);
    paintItems(flat);
  }

  function hashTag(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  const TAG_HUES = {
    stomach: 336,
    stomach_fundus: 350,
    duodenum: 38,
    pancreas: 286,
    gallbladder: 145,
    small: 8,
    colon: 255,
    liver: 18
  };

  function flatColour(tag) {
    const hue = TAG_HUES[tag] === undefined ? hashTag(tag) % 360 : TAG_HUES[tag];
    const sat = TAG_HUES[tag] === undefined ? 72 : 88;
    return { fill: 'hsl(' + hue + ' ' + sat + '% 56%)', stroke: 'hsl(' + hue + ' ' + sat + '% 28%)' };
  }

  function firstPoint(d) {
    const m = d.match(/[Mm]\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)[ ,]+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
  }

  function drawTagLabels() {
    const biggest = new Map();
    D.items.forEach(function (item) {
      if (item.tag === 'annotation') return;
      const cur = biggest.get(item.tag);
      if (!cur || item.d.length > cur.d.length) biggest.set(item.tag, item);
    });
    window.__TAG_LABELS = Array.from(biggest.keys());
    const colours = {};
    biggest.forEach(function (item, tag) { colours[tag] = flatColour(tag).fill; });
    window.__TAG_FLAT_COLOURS = colours;
    setCamera(ctx);
    ctx.save();
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    biggest.forEach(function (item, tag) {
      const p = firstPoint(item.d);
      const rx = item.m[0] * p[0] + item.m[2] * p[1] + item.m[4];
      const ry = item.m[1] * p[0] + item.m[3] * p[1] + item.m[5];
      const lp = logical(rx, ry);
      const w = ctx.measureText(tag).width;
      ctx.fillStyle = 'rgba(2,6,23,.78)';
      ctx.fillRect(lp[0] - 3, lp[1] - 8, w + 6, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(tag, lp[0], lp[1]);
    });
    ctx.restore();
  }

  function drawMouthAndThroat() {
    setCamera(ctx);
    const a = PA.archLogical;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(244,114,182,.48)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(244,114,182,.55)';
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(a[0][0], a[0][1]);
    for (let i = 1; i < a.length; i++) ctx.lineTo(a[i][0], a[i][1]);
    ctx.stroke();
    ctx.shadowBlur = 7;
    ctx.strokeStyle = '#fbcfe8';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(251,207,232,.9)';
    ctx.beginPath();
    ctx.ellipse(a[0][0], a[0][1], 11, 5.5, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function sampleAtS(s) {
    if (!samples.length) return null;
    if (s <= samples[0].s) return samples[0];
    if (s >= samples[samples.length - 1].s) return samples[samples.length - 1];
    let lo = 0, hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].s < s) lo = mid; else hi = mid;
    }
    const p = samples[lo], q = samples[hi];
    const f = (s - p.s) / (q.s - p.s || 1);
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, s: s };
  }

  function drawPathAnnotations() {
    setCamera(ctx);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(250,204,21,.95)';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].s < 2 || samples[i].s > 18) continue;
      if (!started) { ctx.moveTo(samples[i].x, samples[i].y); started = true; }
      else ctx.lineTo(samples[i].x, samples[i].y);
    }
    ctx.stroke();
    [2, 18].forEach(function (s, i) {
      const p = sampleAtS(s);
      if (!p) return;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef9c3';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.fillText(i === 0 ? 'feed 2' : '18', p.x + 6, p.y - 5);
    });
    const badge = sampleAtS(ANALYSIS.ARC.mouth);
    if (badge) {
      const label = 'Mouth';
      ctx.font = '800 11px system-ui, sans-serif';
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(15,23,42,.88)';
      ctx.beginPath();
      ctx.roundRect(badge.x - w / 2, badge.y - 31, w, 17, 5);
      ctx.fill();
      ctx.strokeStyle = '#f9a8d4';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fbcfe8';
      ctx.fillText(label, badge.x - w / 2 + 6, badge.y - 19);
    }
    ctx.restore();
  }

  function drawLandmarks() {
    if (!ANALYSIS.landmarks) return;
    const names = Object.keys(ANALYSIS.landmarks);
    const zoom = !!view.rect;
    const fontPx = zoom ? 7 : 9;
    const boxH = zoom ? 10 : 13;
    const radius = zoom ? 2.2 : 3.1;
    setCamera(ctx);
    ctx.save();
    ctx.font = '700 ' + fontPx + 'px ui-monospace, monospace';
    names.forEach(function (name, i) {
      const lm = ANALYSIS.landmarks[name];
      if (labelsVisible) {
        const label = name + ' ' + lm.s.toFixed(1);
        const w = ctx.measureText(label).width + 6;
        const dx = i % 2 === 0 ? -w - 7 : 7;
        const dy = i % 3 === 0 ? -(boxH + 5) : (i % 3 === 1 ? 5 : boxH + 5);
        const lx = lm.x + dx;
        const ly = lm.y + dy;
        ctx.strokeStyle = 'rgba(250,204,21,.65)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(lm.x, lm.y);
        ctx.lineTo(i % 2 === 0 ? lx + w : lx, ly + boxH / 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(15,23,42,.86)';
        ctx.beginPath();
        ctx.roundRect(lx, ly, w, boxH, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(250,204,21,.5)';
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.fillText(label, lx + 3, ly + boxH - (zoom ? 2 : 3));
      }
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawCentreline(strong) {
    setCamera(ctx);
    ctx.save();
    ctx.lineWidth = strong ? 2.4 : 1.5;
    ctx.lineCap = 'round';
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const outside = !a.inside || !b.inside;
      ctx.strokeStyle = outside
        ? (strong ? 'rgba(244,63,94,.98)' : 'rgba(244,63,94,.75)')
        : (strong ? 'rgba(34,211,238,.88)' : 'rgba(125,211,252,.62)');
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (strong) {
      simAnchorPoints.forEach(function (p, i) {
        ctx.fillStyle = i % 10 === 0 ? '#fbbf24' : '#a5f3fc';
        ctx.beginPath();
        ctx.arc(p.x, p.y, i % 10 === 0 ? 3.3 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function hud(text) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(text || view.label, 16, 20);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('SVG art recoloured in code — local prototype only — no physiology changes', 16, 36);
    if (!traceMode && viewName !== 'tags') {
      ctx.fillStyle = '#fde047';
      ctx.fillText('yellow = feed s=2..18 + ARC landmarks; badge = Mouth', 16, 502);
      ctx.fillStyle = '#22d3ee';
      ctx.fillText('cyan = centreline inside lumen', 16, 516);
      ctx.fillStyle = '#fb7185';
      ctx.fillText('red = leaves tube', 232, 516);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(insidePct.toFixed(1) + '% inside, ' + runs.length + ' runs >=3', 372, 516);
    }
  }

  function renderNormal() {
    const flat = viewName === 'tags';
    backdrop();
    drawArtNormal(flat);
    if (flat) drawTagLabels(); else {
      drawMouthAndThroat();
      drawCentreline(overlay);
      drawPathAnnotations();
      drawLandmarks();
    }
    hud();
    statusEl.textContent = 'view=' + viewName + '  path=' + catmullLength.toFixed(1) + 'px' +
      (flat ? '' : '  lumen=' + insidePct.toFixed(1) + '%  runs=' + runs.length);
  }

  const TRACE_SEGMENTS = ['oesophagus', 'stomach', 'duodenum', 'small', 'colon', 'rectum'];
  const TRACE_ORGAN = {
    oesophagus: 'oesophagus', stomach: 'stomach', duodenum: 'duodenum',
    small: 'small', colon: 'colon', rectum: 'rectum'
  };
  const SEGMENT_LABELS = {
    oesophagus: 'oesophagus', stomach: 'stomach', duodenum: 'duodenum',
    small: 'small intestine', colon: 'colon', rectum: 'rectum'
  };
  const STORAGE_KEY = 'digestive-svg-trace-v3';

  function emptyTrace() {
    const out = {};
    TRACE_SEGMENTS.forEach(function (s) { out[s] = []; });
    return out;
  }

  function referenceTrace() {
    const out = emptyTrace();
    const add = function (i, seg) { out[seg].push([D.anchors[i].svg[0], D.anchors[i].svg[1]]); };
    add(4, 'oesophagus'); add(5, 'oesophagus');
    add(5, 'stomach'); add(6, 'stomach'); add(7, 'stomach'); add(8, 'stomach');
    add(8, 'duodenum'); add(9, 'duodenum'); add(10, 'duodenum'); add(11, 'duodenum'); add(12, 'duodenum');
    for (let i = 12; i <= 23; i++) add(i, 'small');
    for (let i = 23; i <= 37; i++) add(i, 'colon');
    add(37, 'rectum'); add(38, 'rectum');
    return out;
  }

  const REFERENCE_ANCHORS = referenceTrace();

  function cleanAnchors(src) {
    if (!Array.isArray(src)) return [];
    return src.map(function (p) {
      if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
      return [Number(p && p.x), Number(p && p.y)];
    }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
  }

  function syncChains(t) {
    for (let i = 1; i < TRACE_SEGMENTS.length; i++) {
      const prev = t[TRACE_SEGMENTS[i - 1]];
      const cur = t[TRACE_SEGMENTS[i]];
      if (prev.length && cur.length) cur[0] = prev[prev.length - 1].slice();
    }
    return t;
  }

  function loadState() {
    const fallback = {
      anchors: JSON.parse(JSON.stringify(PATH_ANCHORS.segments)),
      activeSegment: 'oesophagus'
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      const src = saved.segments || saved;
      const anchors = emptyTrace();
      TRACE_SEGMENTS.forEach(function (seg) { anchors[seg] = cleanAnchors(src[seg]); });
      syncChains(anchors);
      const active = TRACE_SEGMENTS.indexOf(saved.activeSegment) >= 0 ? saved.activeSegment : 'oesophagus';
      return { anchors: anchors, activeSegment: active };
    } catch (e) {
      return fallback;
    }
  }

  const loadedState = loadState();
  let traceAnchors = loadedState.anchors;
  let activeSegment = loadedState.activeSegment;
  const traceView = { s: 1.3, tx: 60, ty: 10 };
  const undoStack = [];
  let drag = null;
  let showReference = false;
  let lastMessage = '';
  let lastAutoCentre = null;
  const distanceFields = {};

  function cloneTrace(t) { return JSON.parse(JSON.stringify(t)); }

  function saveTrace() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        segments: traceAnchors,
        activeSegment: activeSegment
      }));
    } catch (e) {
      setMessage('Auto-save unavailable in this browser context.');
    }
  }

  function setMessage(msg) {
    lastMessage = msg || '';
    const el = document.getElementById('trace-msg');
    if (el) el.textContent = lastMessage;
  }

  function pushUndo() {
    undoStack.push(cloneTrace(traceAnchors));
    if (undoStack.length > 80) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length) return;
    traceAnchors = syncChains(undoStack.pop());
    saveTrace();
    setMessage('Undid last change.');
    render();
  }

  function clearSegment() {
    pushUndo();
    traceAnchors[activeSegment] = [];
    syncChains(traceAnchors);
    saveTrace();
    setMessage('Cleared ' + SEGMENT_LABELS[activeSegment] + '.');
    render();
  }

  function canSelectSegment(seg) {
    const target = TRACE_SEGMENTS.indexOf(seg);
    for (let i = 0; i < target; i++) {
      const prior = TRACE_SEGMENTS[i];
      if (traceAnchors[prior].length < 3) {
        setMessage('Trace ' + SEGMENT_LABELS[prior] + ' first — it needs at least 3 anchors.');
        segmentSelect.value = activeSegment;
        return false;
      }
    }
    return true;
  }

  function selectSegment(seg) {
    if (!canSelectSegment(seg)) return;
    activeSegment = seg;
    const i = TRACE_SEGMENTS.indexOf(seg);
    if (i > 0 && traceAnchors[seg].length === 0) {
      const prev = TRACE_SEGMENTS[i - 1];
      const last = traceAnchors[prev][traceAnchors[prev].length - 1];
      if (last) {
        pushUndo();
        traceAnchors[seg].push(last.slice());
        setMessage('First anchor chained from ' + SEGMENT_LABELS[prev] + '.');
        saveTrace();
      }
    }
    render();
  }

  function updateTraceUI(data) {
    const counts = document.getElementById('trace-counts');
    if (counts) {
      counts.innerHTML = TRACE_SEGMENTS.map(function (seg) {
        const d = data[seg];
        const pct = d.pct === null ? '—' : d.pct.toFixed(0) + '%';
        return '<span class="' + (seg === activeSegment ? 'active' : '') + '">' +
          SEGMENT_LABELS[seg] + ': ' + traceAnchors[seg].length + ' anchors, ' + pct + '</span>';
      }).join('');
    }
    Array.prototype.forEach.call(segmentSelect.options, function (opt, i) {
      let locked = false;
      for (let j = 0; j < i; j++) {
        if (traceAnchors[TRACE_SEGMENTS[j]].length < 3) locked = true;
      }
      opt.disabled = locked;
    });
    segmentSelect.value = activeSegment;
  }

  function traceCurve(seg) {
    const pts = traceAnchors[seg].map(function (p) {
      const lp = logical(p[0], p[1]);
      return { x: lp[0], y: lp[1] };
    });
    return curveFromLogical(pts);
  }

  function referenceCurve(seg) {
    const pts = REFERENCE_ANCHORS[seg].map(function (p) {
      const lp = logical(p[0], p[1]);
      return { x: lp[0], y: lp[1] };
    });
    return curveFromLogical(pts);
  }

  function traceData() {
    const out = {};
    TRACE_SEGMENTS.forEach(function (seg) {
      const curve = traceCurve(seg);
      const ss = sampleCurve(curve, function () { return TRACE_ORGAN[seg]; });
      const inside = ss.filter(function (s) { return s.inside; }).length;
      out[seg] = {
        samples: ss,
        inside: inside,
        pct: ss.length ? (inside / ss.length) * 100 : null,
        length: curve.total
      };
    });
    return out;
  }

  const AUTO_CENTRE_RADIUS = 12;
  const AUTO_FIELD_STEP = 1;
  const AUTO_INF = 6000;

  function lumenField(organ) {
    if (distanceFields[organ]) return distanceFields[organ];
    const minX = C.x - 20, minY = C.y - 20;
    const maxX = C.x + C.w + 20, maxY = C.y + C.h + 20;
    const w = Math.ceil((maxX - minX) / AUTO_FIELD_STEP) + 1;
    const h = Math.ceil((maxY - minY) / AUTO_FIELD_STEP) + 1;
    const fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = w;
    fieldCanvas.height = h;
    const fc = fieldCanvas.getContext('2d');
    fc.setTransform(1 / AUTO_FIELD_STEP, 0, 0, 1 / AUTO_FIELD_STEP,
      -minX / AUTO_FIELD_STEP, -minY / AUTO_FIELD_STEP);
    fc.fillStyle = '#fff';
    (LUMEN_IDS[organ] || []).forEach(function (id) {
      const item = byId.get(id);
      if (!item) return;
      fc.save();
      fc.transform(item.m[0], item.m[1], item.m[2], item.m[3], item.m[4], item.m[5]);
      fc.fill(item.path);
      fc.restore();
    });
    const pixels = fc.getImageData(0, 0, w, h).data;
    const inside = new Uint8Array(w * h);
    const dist = new Uint16Array(w * h);
    for (let i = 0; i < inside.length; i++) {
      inside[i] = pixels[i * 4 + 3] > 64 ? 1 : 0;
      dist[i] = inside[i] ? AUTO_INF : 0;
    }
    const neighbours = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!inside[k]) continue;
        for (let n = 0; n < neighbours.length; n++) {
          const nx = x + neighbours[n][0], ny = y + neighbours[n][1];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || !inside[ny * w + nx]) {
            dist[k] = 10;
            break;
          }
        }
      }
    }
    const relax = function (k, n, weight) {
      if (inside[k] && dist[n] + weight < dist[k]) dist[k] = dist[n] + weight;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (!inside[k]) continue;
        if (x > 0) relax(k, k - 1, 10);
        if (y > 0) relax(k, k - w, 10);
        if (x > 0 && y > 0) relax(k, k - w - 1, 14);
        if (x < w - 1 && y > 0) relax(k, k - w + 1, 14);
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const k = y * w + x;
        if (!inside[k]) continue;
        if (x < w - 1) relax(k, k + 1, 10);
        if (y < h - 1) relax(k, k + w, 10);
        if (x < w - 1 && y < h - 1) relax(k, k + w + 1, 14);
        if (x > 0 && y < h - 1) relax(k, k + w - 1, 14);
      }
    }
    distanceFields[organ] = { minX: minX, minY: minY, w: w, h: h, dist: dist };
    return distanceFields[organ];
  }

  function fieldDepth(field, sx, sy) {
    const gx = Math.round((sx - field.minX) / AUTO_FIELD_STEP);
    const gy = Math.round((sy - field.minY) / AUTO_FIELD_STEP);
    if (gx < 0 || gx >= field.w || gy < 0 || gy >= field.h) return 0;
    return field.dist[gy * field.w + gx] / 10;
  }

  function bestCentre(organ, anchor) {
    const field = lumenField(organ);
    let best = null, bestDepth = -1, bestMove = Infinity;
    for (let dy = -AUTO_CENTRE_RADIUS; dy <= AUTO_CENTRE_RADIUS; dy++) {
      for (let dx = -AUTO_CENTRE_RADIUS; dx <= AUTO_CENTRE_RADIUS; dx++) {
        const move = Math.hypot(dx, dy);
        if (move > AUTO_CENTRE_RADIUS) continue;
        const sx = anchor[0] + dx, sy = anchor[1] + dy;
        const depth = fieldDepth(field, sx, sy);
        if (depth <= 0) continue;
        if (depth > bestDepth + 0.01 || (Math.abs(depth - bestDepth) <= 0.01 && move < bestMove)) {
          best = [sx, sy];
          bestDepth = depth;
          bestMove = move;
        }
      }
    }
    return best;
  }

  function segmentScore(seg, anchors) {
    const pts = anchors.map(function (p) {
      const lp = logical(p[0], p[1]);
      return { x: lp[0], y: lp[1] };
    });
    const curve = curveFromLogical(pts);
    const samples = sampleCurve(curve, function () { return TRACE_ORGAN[seg]; });
    if (!samples.length) return null;
    return samples.filter(function (s) { return s.inside; }).length / samples.length * 100;
  }

  function autoCentreSegment() {
    const seg = activeSegment;
    const before = segmentScore(seg, traceAnchors[seg]);
    if (before === null) {
      setMessage('Auto-centre needs at least two anchors.');
      return;
    }
    let next = cloneTrace(traceAnchors);
    let current = before;
    let moved = 0;
    const total = next[seg].length;
    for (let i = 0; i < total; i++) {
      if (i === 0 && seg !== 'oesophagus') continue;
      const original = next[seg][i].slice();
      const candidate = bestCentre(TRACE_ORGAN[seg], original);
      if (!candidate) continue;
      if (Math.hypot(candidate[0] - original[0], candidate[1] - original[1]) < 0.25) continue;
      const trial = cloneTrace(next);
      trial[seg][i] = candidate;
      syncChains(trial);
      const score = segmentScore(seg, trial[seg]);
      if (score !== null && score > current + 1e-6) {
        next = trial;
        current = score;
        moved++;
      }
    }
    if (!moved) {
      setMessage('Auto-centre found no move that improved ' + SEGMENT_LABELS[seg] + ' (' + before.toFixed(1) + '%).');
      render();
      return;
    }
    pushUndo();
    traceAnchors = syncChains(next);
    saveTrace();
    lastAutoCentre = { segment: seg, before: before, after: current, moved: moved, total: total };
    window.__AUTOCENTRE = lastAutoCentre;
    setMessage('Auto-centre ' + SEGMENT_LABELS[seg] + ': ' + before.toFixed(1) + '% → ' +
      current.toFixed(1) + '% inside; moved ' + moved + '/' + total +
      ' anchors. Undo once to revert.');
    render();
  }

  function setTraceTransform() {
    ctx.setTransform(dpr * traceView.s, 0, 0, dpr * traceView.s, dpr * traceView.tx, dpr * traceView.ty);
  }

  function drawTraceArt() {
    setTraceTransform();
    baseTransform(ctx);
    paintItems(false);
  }

  function drawTraceCurve(curve, colour, width) {
    if (curve.pts.length < 2) return;
    ctx.lineWidth = width / traceView.s;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(curve.pts[0].x, curve.pts[0].y);
    for (let i = 1; i < curve.pts.length; i++) ctx.lineTo(curve.pts[i].x, curve.pts[i].y);
    ctx.stroke();
  }

  function drawTraceSamples(seg, data) {
    const ss = data.samples;
    ctx.lineWidth = 2.2 / traceView.s;
    ctx.lineCap = 'round';
    for (let i = 1; i < ss.length; i++) {
      const a = ss[i - 1], b = ss[i];
      ctx.strokeStyle = (a.inside && b.inside) ? 'rgba(34,211,238,.85)' : 'rgba(244,63,94,.98)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const r = 4 / traceView.s;
    traceAnchors[seg].forEach(function (p, i) {
      const lp = logical(p[0], p[1]);
      ctx.fillStyle = i === traceAnchors[seg].length - 1 ? '#fbbf24' : '#a5f3fc';
      ctx.beginPath();
      ctx.arc(lp[0], lp[1], r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderTrace() {
    const data = traceData();
    backdrop();
    drawTraceArt();
    setTraceTransform();
    if (showReference) {
      ctx.save();
      ctx.setLineDash([5 / traceView.s, 4 / traceView.s]);
      TRACE_SEGMENTS.forEach(function (seg) {
        drawTraceCurve(referenceCurve(seg), 'rgba(148,163,184,.28)', 1.2);
      });
      ctx.restore();
    }
    TRACE_SEGMENTS.forEach(function (seg) {
      if (seg === activeSegment) return;
      drawTraceCurve(traceCurve(seg), 'rgba(148,163,184,.22)', 1.5);
    });
    drawTraceSamples(activeSegment, data[activeSegment]);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = '#e0f2fe';
    const autoText = lastAutoCentre
      ? ' | auto-centre ' + lastAutoCentre.before.toFixed(1) + '% → ' + lastAutoCentre.after.toFixed(1) + '%'
      : '';
    ctx.fillText('TRACE EDITOR — ' + SEGMENT_LABELS[activeSegment] + ' — ' +
      (data[activeSegment].pct === null ? 'n/a' : data[activeSegment].pct.toFixed(1) + '% inside lumen') + autoText, 16, 20);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('ordered + chained · click add · drag anchor · drag pan · wheel zoom · Backspace undo', 16, 36);
    updateTraceUI(data);
    window.__TRACE_MESSAGE = lastMessage;
    window.__TRACE_REFERENCE = REFERENCE_ANCHORS;
    window.__SHOW_REFERENCE = showReference;
    statusEl.textContent = 'anchors=' + traceAnchors[activeSegment].length +
      '  zoom=' + traceView.s.toFixed(2) + '  undo=' + undoStack.length;
    return data;
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function screenToLogical(p) {
    return { x: (p.x - traceView.tx) / traceView.s, y: (p.y - traceView.ty) / traceView.s };
  }

  function nearestTraceAnchor(p) {
    let best = -1, bd = 12;
    traceAnchors[activeSegment].forEach(function (a, i) {
      const lp = logical(a[0], a[1]);
      const sx = lp[0] * traceView.s + traceView.tx;
      const sy = lp[1] * traceView.s + traceView.ty;
      const d = Math.hypot(sx - p.x, sy - p.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function exportAnchors() {
    const data = traceData();
    const problems = [];
    TRACE_SEGMENTS.forEach(function (seg) {
      const n = traceAnchors[seg].length;
      const pct = data[seg].pct;
      if (n < 3) problems.push(SEGMENT_LABELS[seg] + ': ' + n + ' anchors');
      else if (pct === null || pct < 90) {
        problems.push(SEGMENT_LABELS[seg] + ': ' + (pct === null ? 'n/a' : pct.toFixed(1) + '% inside lumen'));
      }
    });
    if (problems.length) {
      window.__TRACE_EXPORT_BLOCK = problems;
      setMessage('Export blocked — ' + problems.join('; '));
      render();
      return;
    }
    window.__TRACE_EXPORT_BLOCK = null;
    const out = { segments: {} };
    TRACE_SEGMENTS.forEach(function (seg) {
      out.segments[seg] = {
        anchors: traceAnchors[seg].map(function (p) {
          return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
        }),
        samplePctInsideLumen: Math.round(data[seg].pct * 10) / 10,
        samples: data[seg].samples.length
      };
    });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anchors.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setMessage('Exported anchors.json for all six segments.');
    render();
  }

  function importAnchors(text) {
    const data = JSON.parse(text);
    const src = data.segments || data;
    const next = emptyTrace();
    TRACE_SEGMENTS.forEach(function (seg) {
      const raw = Array.isArray(src[seg]) ? src[seg] : (src[seg] && src[seg].anchors);
      next[seg] = cleanAnchors(raw);
    });
    syncChains(next);
    pushUndo();
    traceAnchors = next;
    saveTrace();
    setMessage('Loaded anchors.json.');
    render();
  }

  function onMouseDown(e) {
    if (!traceMode) return;
    const p = pointer(e);
    const idx = nearestTraceAnchor(p);
    if (idx >= 0) {
      pushUndo();
      drag = { type: 'anchor', idx: idx };
    } else {
      drag = { type: 'pan', x: p.x, y: p.y, moved: false, button: e.button };
    }
  }

  function onMouseMove(e) {
    if (!traceMode || !drag) return;
    const p = pointer(e);
    if (drag.type === 'anchor') {
      const lp = screenToLogical(p);
      const sp = svgFromLogical(lp.x, lp.y);
      traceAnchors[activeSegment][drag.idx] = [sp[0], sp[1]];
      syncChains(traceAnchors);
      saveTrace();
    } else {
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      traceView.tx += dx;
      traceView.ty += dy;
      drag.x = p.x;
      drag.y = p.y;
    }
    render();
  }

  function onMouseUp(e) {
    if (!traceMode || !drag) return;
    const p = pointer(e);
    if (drag.type === 'pan' && !drag.moved && drag.button === 0) {
      const lp = screenToLogical(p);
      const sp = svgFromLogical(lp.x, lp.y);
      pushUndo();
      traceAnchors[activeSegment].push([sp[0], sp[1]]);
      syncChains(traceAnchors);
      saveTrace();
    }
    drag = null;
    render();
  }

  function onWheel(e) {
    if (!traceMode) return;
    e.preventDefault();
    const p = pointer(e);
    const before = screenToLogical(p);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const s = Math.max(0.35, Math.min(8, traceView.s * factor));
    traceView.tx = p.x - before.x * s;
    traceView.ty = p.y - before.y * s;
    traceView.s = s;
    render();
  }

  function onKey(e) {
    if (!traceMode) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      undo();
    }
  }

  toggleBtn.addEventListener('click', function () {
    overlay = !overlay;
    render();
  });

  if (traceMode) {
    traceUI.hidden = false;
    toggleBtn.hidden = true;
    segmentSelect.value = activeSegment;
    segmentSelect.addEventListener('change', function () { selectSegment(segmentSelect.value); });
    document.getElementById('undo').addEventListener('click', undo);
    document.getElementById('auto-centre').addEventListener('click', autoCentreSegment);
    document.getElementById('clear').addEventListener('click', clearSegment);
    document.getElementById('reference').addEventListener('change', function (e) {
      showReference = e.target.checked;
      render();
    });
    document.getElementById('export').addEventListener('click', exportAnchors);
    document.getElementById('import').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { importAnchors(String(reader.result)); };
      reader.readAsText(file);
    });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
  } else if (viewName === 'tags') {
    toggleBtn.hidden = true;
  }

  function render() {
    if (traceMode) {
      window.__TRACE_ANCHORS = traceAnchors;
      window.__TRACE_DATA = traceData();
      renderTrace();
      return;
    }
    renderNormal();
  }

  window.__ITEM_AT_LOGICAL = function (lx, ly) {
    const ids = [];
    D.items.forEach(function (item) {
      if (item.tag === 'annotation') return;
      probeCtx.setTransform(1, 0, 0, 1, 0, 0);
      probeCtx.clearRect(0, 0, 900, 540);
      baseTransform(probeCtx);
      probeCtx.transform(item.m[0], item.m[1], item.m[2], item.m[3], item.m[4], item.m[5]);
      if (probeCtx.isPointInPath(item.path, lx, ly)) ids.push({ id: item.id, tag: item.tag });
    });
    return ids;
  };
  window.__ITEM_AT_SVG = function (sx, sy) {
    const lp = logical(sx, sy);
    return window.__ITEM_AT_LOGICAL(lp[0], lp[1]);
  };
  window.__POINT_IN_LUMEN = pointInLumen;
  window.__OFFCANVAS_ANCHORS = offCanvasAnchors;
  window.__LUMEN_STATS = {
    stepPx: 2, samples: samples.length, inside: insideCount,
    insidePct: insidePct, catmullLength: catmullLength, outsideRuns: runs.length
  };
  window.__LUMEN_RUNS = runs;
  window.__LUMEN_RAW_RUNS = rawRuns;
  window.__LUMEN_DIAGNOSTICS = runDiagnostics;
  window.__SEGMENT_STATS = segmentStats;
  window.__LUMEN_SAMPLES = samples;
  window.__TRACE_ANCHORS = traceAnchors;
  window.__TRACE_DATA = traceData();
  window.__TRACE_VIEW = traceView;
  window.__READY = true;
  diagEl.textContent =
    'OFFCANVAS_ANCHORS=' + JSON.stringify(offCanvasAnchors) + '\n' +
    'LUMEN_STATS=' + JSON.stringify(window.__LUMEN_STATS) + '\n' +
    'LUMEN_OUTSIDE_RUNS=' + JSON.stringify(runs) + '\n';
  render();
})();
