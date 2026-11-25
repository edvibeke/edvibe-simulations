(() => {
  'use strict';

  /* ── Renderer selection (Phase 1) ────────────────────────
     WebGL/Three.js path is opt-in behind a feature flag while the
     Canvas2D path remains the default. Enable with ?renderer=webgl or
     localStorage.evRenderer='webgl'. */
  const _params = new URLSearchParams(location.search);
  const DEBUG = _params.get('debug') === '1';
  const RENDERER = (_params.get('renderer') || localStorage.getItem('evRenderer') || 'canvas2d').toLowerCase();
  const USE_WEBGL = RENDERER === 'webgl' || RENDERER === 'three' || RENDERER === '3d';
  const USE_SVG_ART = true;
  const GEOM = window.EV_GEOMETRY;

  /* ── Layout ─────────────────────────────────────

     The tract is authored in a roomy design space and mapped into
     the canvas by gx()/gy()/gs(), which leaves a clear column on the
     right for the legend and a strip along the bottom for the
     numbers. The two panels are plain canvas rectangles so they can be
     positioned against the canvas edge directly.

     The mapping is not tuned by hand: AREA is the canvas left over
     between the panels once a margin has been taken off both, and
     FIGURE is the box the anatomy is authored in, so S and the origins
     are whatever it takes to fit one into the other with the aspect
     ratio kept. Move a panel and the figure re-fits; nudge an anchor
     and the scale cannot drift. Everything anatomical, in design
     space, has to stay inside FIGURE. */

  const W = 900;
  const H = 540;

  const RAIL = { x: 600, y: 32, w: 284, h: 330 };

  const MARGIN = 14;
  const AREA = {
    x: MARGIN, y: 80,
    w: RAIL.x - MARGIN * 2,
    h: 446
  };
  const FIGURE = { x: 169.45267315559317, y: 80, w: 310.0, h: 529.5397590361446 };

  const S = Math.min(AREA.w / FIGURE.w, AREA.h / FIGURE.h);
  const OX = (AREA.x + AREA.w / 2 - S * (FIGURE.x + FIGURE.w / 2)) / (1 - S);
  const OY = (AREA.y + AREA.h / 2 - S * (FIGURE.y + FIGURE.h / 2)) / (1 - S);

  const gx = (x) => OX + (x - OX) * S;
  const gy = (y) => OY + (y - OY) * S;
  const gs = (v) => v * S;

  /* Baseline of the lowest text in the footer, measured from FOOT.y.
     Declared so the panel can be checked for overflow instead of
     guessed at. */
  const FOOTER_LAST_BASELINE = 114;

  /* ── Laterality ──────────────────────────────────────────
     The whole figure is an anterior view, the way you would look at
     a person facing you: their left is on your right. So the stomach,
     the pancreatic tail, the splenic flexure and the descending colon
     are all drawn at design x > MID, and the liver, gallbladder,
     duodenum and ascending colon at x < MID. The hepatic flexure has
     to sit under the liver and the caecum under the hepatic flexure,
     or the two halves of the picture describe different people. */
  const MID = 450;

  /* ── Tract path ──────────────────────────────────────────
     Three runs of anchors, joined into one continuous centreline that
     runs through the lumen of every organ. Read it top to bottom: mouth,
     oesophagus, stomach, duodenum, three sweeps of small intestine, then
     across the caecum and back up the ascending colon, along the
     transverse colon, down the descending colon and out through the
     sigmoid.

     The runs are kept in separate lists because the figure is drawn in
     three depth layers (see LAYERS below). The duodenum has to pass
     behind the transverse colon, the coils have to pass in front of it,
     and one single stroke cannot say both at once. */

  const TRACK = {
    upper: [
      [358.213, 16.847],
      [343.978, 19.694],
      [338.284, 32.505],
      [343.978, 48.164],
      [352.519, 62.399],
      [358.213, 70.94],
      [358.413, 82.04],
      [358.413, 91.14],
      [358.413, 96.64],
      [358.413, 102.94],
      [358.413, 113.24],
      [358.413, 120.04],
      [358.813, 130.34],
      [359.613, 138.24],
      [360.413, 142.94],
      [364.413, 152.44],
      [367.013, 165.14],
      [371.913, 180.14],
      [373.513, 189.54],
      [378.913, 201.84],
      [393.413, 220.14],
      [406.313, 207.24],
      [426.513, 191.14],
      [444.213, 198.74],
      [443.913, 218.94],
      [438.213, 237.24],
      [421.513, 249.24],
      [404.813, 259.04],
      [387.113, 265.64],
      [375.713, 263.14],
      [370.013, 261.54],
      [362.513, 260.54],
      [356.513, 258.34],
      [348.313, 257.44],
      [335.413, 252.74],
      [326.613, 251.44],
      [314.513, 253.44],
      [305.013, 277.84],
      [311.813, 295.34],
      [336.113, 331.84],
      [346.913, 328.44],
      [365.813, 323.04],
      [377.313, 319.74],
      [390.213, 316.34],
      [393.513, 331.14],
      [393.513, 339.34],
    ],
    small: [
      [384.613, 341.24],
      [366.413, 342.64],
      [350.513, 340.44],
      [331.713, 337.44],
      [322.113, 335.84],
      [315.913, 334.14],
      [304.913, 333.34],
      [293.713, 343.14],
      [288.313, 361.74],
      [291.313, 381.94],
      [305.813, 390.14],
      [309.813, 375.14],
      [324.613, 372.94],
      [342.113, 375.64],
      [348.113, 377.34],
      [349.713, 381.44],
      [346.213, 385.24],
      [338.013, 385.74],
      [316.413, 393.94],
      [318.313, 402.94],
      [324.313, 411.14],
      [347.213, 396.64],
      [354.913, 389.54],
      [360.613, 383.54],
      [371.313, 388.24],
      [377.713, 385.74],
      [393.813, 372.34],
      [401.913, 351.94],
      [405.013, 344.74],
      [404.213, 336.24],
      [411.113, 326.64],
      [437.213, 302.54],
      [449.413, 305.54],
      [440.213, 327.04],
      [424.513, 336.64],
      [433.713, 349.64],
      [435.313, 368.84],
      [424.313, 371.94],
      [425.813, 390.94],
      [420.513, 399.94],
      [404.613, 384.04],
      [391.013, 381.04],
      [370.613, 398.44],
      [379.613, 398.44],
      [389.513, 390.14],
      [394.013, 401.54],
      [399.313, 412.14],
      [409.213, 421.14],
      [412.213, 435.54],
      [399.313, 443.84],
      [391.013, 435.54],
      [383.413, 421.14],
      [366.013, 414.34],
      [353.213, 412.14],
      [341.013, 416.64],
      [359.213, 421.14],
      [370.613, 431.04],
      [370.613, 446.14],
      [349.413, 431.74],
      [335.713, 428.74],
      [335.713, 438.54],
      [353.913, 443.84],
      [378.113, 456.04],
      [369.013, 459.04],
      [342.613, 457.54],
      [325.113, 453.74],
      [313.813, 440.84],
      [310.813, 417.34],
      [300.213, 412.14],
    ],
    colon: [
      [265.313, 416.64],
      [267.613, 402.24],
      [265.313, 379.54],
      [253.213, 347.04],
      [263.813, 302.34],
      [270.613, 290.94],
      [307.013, 314.44],
      [372.113, 322.04],
      [396.513, 315.74],
      [427.513, 307.04],
      [461.913, 269.54],
      [464.213, 293.74],
      [463.013, 312.34],
      [463.013, 333.84],
      [462.213, 351.24],
      [456.013, 381.14],
      [459.913, 398.04],
      [455.113, 409.64],
      [451.513, 422.54],
      [446.413, 443.94],
      [415.713, 465.14],
      [381.913, 459.64],
      [358.813, 471.24],
      [356.813, 485.84],
      [356.113, 502.24],
      [355.913, 505.64],
      [357.913, 510.54],
      [358.213, 515.64],
      [358.713, 518.54],
      [358.813, 522.84],
      [358.813, 526.34],
      [359.013, 529.44],
      [359.013, 532.14],
      [359.113, 535.14],
      [359.113, 537.54],
    ]
  };

  const path = GEOM.pathPoints.map((p) => ({ x: p[0], y: p[1] }));
  const cum = GEOM.cumulative.slice();


  const TUBE_END = 2069.9224723855814;

  /* Arclength of the landmark nearest each design point. The names are
     what the rest of the file refers to, so the organ boundaries and
     the secretion trigger points cannot drift apart. */
  const ARC = {};
  const ARC_ORDER = [
    'mouth', 'oesophagus', 'cardia', 'stomach', 'pylorus', 'duodenum',
    'flexure', 'jejunum', 'ileum', 'caecum', 'hepatic', 'transverse',
    'splenic', 'descending', 'rectum'
  ];

  (function findArcs() {
    if (!GEOM || !GEOM.ARC) {
      throw new Error('ARC missing from generated geometry: load geometry.generated.js before script.js');
    }
    const missing = ARC_ORDER.filter((key) => !Number.isFinite(GEOM.ARC[key]));
    if (missing.length) {
      throw new Error('ARC missing from generated geometry: ' + missing.join(', '));
    }
    for (const key of ARC_ORDER) ARC[key] = GEOM.ARC[key];
    for (let i = 1; i < ARC_ORDER.length; i++) {
      const prev = ARC_ORDER[i - 1];
      const next = ARC_ORDER[i];
      if (!(ARC[prev] < ARC[next])) {
        throw new Error(
          'ARC values must strictly increase: ' + prev + '=' + ARC[prev] +
          ' is not less than ' + next + '=' + ARC[next]
        );
      }
    }
  })();

  /* Depth layers, back to front. The transverse colon crosses the
     duodenum, and the coils cross the transverse colon, so the colon is
     drawn in the middle: the duodenum disappears behind it and the
     coils come out in front. Each layer carries its own wall, villi,
     haustra and contraction waves, so nothing shows through the
     structure drawn in front of it. */
  const LAYERS = [
    { s0: 0, s1: ARC.flexure },
    { s0: ARC.caecum, s1: TUBE_END },
    { s0: ARC.flexure, s1: ARC.caecum }
  ];

  function sampleAt(s) {
    const target = Math.min(Math.max(s, 0), TUBE_END);
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1; else hi = mid;
    }
    const i = lo === 0 ? 0 : lo - 1;
    const seg = cum[i + 1] - cum[i];
    const f = seg > 0 ? (target - cum[i]) / seg : 0;
    const p0 = path[i], p1 = path[i + 1] || p0;
    return {
      x: p0.x + (p1.x - p0.x) * f,
      y: p0.y + (p1.y - p0.y) * f,
      a: Math.atan2(p1.y - p0.y, p1.x - p0.x)
    };
  }

  /* ── Supporting anatomy, in design space ───────────── */

  const LIVER = { x: 262, y: 118, rx: 92, ry: 44, lobe: { x: 372, y: 136, rx: 46, ry: 26 } };
  const STOMACH_SHAPE = { cx: 560, cy: 244, rx: 68, ry: 48, rot: -0.42 };

  const DOT_ROUTES = {};
  const DOT_NECK_Y = 40;

  function validRoutePoints(points) {
    return Array.isArray(points) && points.length >= 2 && points.every((p) =>
      Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  function trimRouteAtCanvasY(points, y) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      if (a[1] >= y) out.push([a[0], a[1]]);
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
        const f = (y - a[1]) / (b[1] - a[1]);
        out.push([a[0] + (b[0] - a[0]) * f, y]);
        break;
      }
    }
    if (!out.length) throw new Error('DOT route does not reach canvas y=' + y);
    return out;
  }

  (function loadDotRoutes() {
    const names = ['portal', 'lymph', 'bile', 'pancreatic'];
    if (!GEOM || !GEOM.routes) {
      throw new Error('DOT routes missing: load geometry.generated.js before script.js');
    }
    const missing = names.filter((name) => !validRoutePoints(GEOM.routes[name] && GEOM.routes[name].points));
    if (missing.length) {
      throw new Error('DOT routes missing or invalid: ' + missing.join(', '));
    }
    const bileEnd = GEOM.routes.bile.points[GEOM.routes.bile.points.length - 1];
    const pancreaticEnd = GEOM.routes.pancreatic.points[GEOM.routes.pancreatic.points.length - 1];
    if (Math.hypot(bileEnd[0] - pancreaticEnd[0], bileEnd[1] - pancreaticEnd[1]) > 0.01) {
      throw new Error('DOT papilla missing: bile and pancreatic routes must share one endpoint');
    }
    for (const name of names) DOT_ROUTES[name] = GEOM.routes[name].points.map((p) => [p[0], p[1]]);
    DOT_ROUTES.lymph = trimRouteAtCanvasY(DOT_ROUTES.lymph, DOT_NECK_Y);
    DOT_ROUTES.papilla = [bileEnd[0], bileEnd[1]];
  })();

  /* Villi are short enough that two neighbouring loops of bowel do not
     grow into each other. */
  const VILLUS_INNER = 5.5;
  const VILLUS_OUTER = 11;

  /* ── Physiology constants ───────────────────────────── */

  const NUTRIENTS = [
    { key: 'carb',    label: 'Carbohydrate', grams: 58, colour: '#fbbf24' },
    { key: 'protein', label: 'Protein',      grams: 22, colour: '#f472b6' },
    { key: 'fat',     label: 'Fat',          grams: 18, colour: '#fb923c' },
    { key: 'fibre',   label: 'Fibre',        grams: 10, colour: '#a3e635' }
  ];
  const KCAL = { carb: 4, protein: 4, fat: 9, fibre: 0 };

  /* Fraction of the remaining substrate broken down per simulated
     minute, at optimum pH and unit surface area — except the mouth,
     whose figure is per second of chewing. Chewing is a real-time window
     and not a stretch of body time: the bolus is held still while the
     body clock stays at zero, so charging the mouth at simulated minutes
     would let an eight-second chew do six hours of work. */
  const CHEW_SEC = 6;
  const SWALLOW_SEC = 2;
  const MOUTH_HOLD_SEC = CHEW_SEC + SWALLOW_SEC;
  const DIGEST = {
    mouth:    { carb: 0.055, protein: 0,     fat: 0,     fibre: 0 },
    stomach:  { carb: 0,     protein: 0.0060, fat: 0,     fibre: 0 },
    duodenum: { carb: 0.0070, protein: 0.0030, fat: 0.0015, fibre: 0 },
    ileum:    { carb: 0.0040, protein: 0.0020, fat: 0.0008, fibre: 0 }
  };

  /* Fraction of already-digested nutrient taken across the villi per
     simulated minute. Fat lags because it has to be packaged first. */
  const ABSORB = { carb: 0.012, protein: 0.011, fat: 0.004 };
  const DOT_GRAMS = { carb: 3, protein: 3, fat: 0.5 };

  const STOMACH_OPT_PH = 1.9;
  const STOMACH_TOL = 0.60;
  const PANCREATIC_OPT_PH = 7.5;
  const PANCREATIC_TOL = 1.15;

  /* Digestive secretions are roughly a fixed volume per meal rather than a
     steady drip, so they are released as the bolus passes each organ.
     `arc` names a landmark on ARC, so a secretion cannot fire early just
     because its key does not exist there. */
  const DRINK_ML = 250;
  const SECRETIONS = [
    { arc: 'mouth',    ml: 500, name: 'saliva' },
    { arc: 'stomach',  ml: 150, name: 'gastric juice' },
    { arc: 'pylorus',  ml: 200, name: 'pancreatic juice and bile' },
    { arc: 'jejunum',  ml: 100, name: 'intestinal juice' }
  ];
  const COLON_UPTAKE = 0.0026;   // fraction of colonic water reclaimed per minute

  /* ── Colour ─────────────────────────────────────────── */

  const COL = {
    wall:      '#c2708a',
    wallFull:  '#8a4d6a',
    lumenFull: '#4c1d32',
    villus:    '#f9a8d4',
    bile:      '#84cc16',
    portal:    '#60a5fa',
    lymph:     '#fcd34d',
    absorbed:  '#7dd3fc',
    liver:     '#9f1239',
    pancreas:  '#f0abfc',
    label:     '#e2e8f0',
    labelDim:  '#a8b6c6',
    legend:    '#e2e8f0'
  };

  /* ── DOM ────────────────────────────────────────────── */

  const stage      = EV.stage('stage');
  const ctx        = stage.ctx;

  const periEl     = document.getElementById('peristalsis');
  const periValue  = document.getElementById('peristalsisValue');
  const acidEl     = document.getElementById('acidity');
  const acidValue  = document.getElementById('acidityValue');
  const bileEl     = document.getElementById('bile');
  const bileValue  = document.getElementById('bileValue');
  const fibreEl    = document.getElementById('fibre');
  const fibreValue = document.getElementById('fibreValue');
  const chewBtn    = document.getElementById('chewBtn');
  const feedBtn    = document.getElementById('feedBtn');
  const pauseBtn   = document.getElementById('pauseBtn');
  const labelsBtn  = document.getElementById('labelsBtn');

  const whereValue    = document.getElementById('whereValue');
  const digestedValue = document.getElementById('digestedValue');
  const energyValue   = document.getElementById('energyValue');
  const glucoseValue  = document.getElementById('glucoseValue');
  const waterValue    = document.getElementById('waterValue');
  const transitValue  = document.getElementById('transitValue');

  const footerPct     = document.getElementById('footerPct');
  const footerSurface = document.getElementById('footerSurface');
  const footerAbsorbed = {
    carb: document.getElementById('footerAbsCarb'),
    protein: document.getElementById('footerAbsProtein'),
    fat: document.getElementById('footerAbsFat')
  };
  const footerWater    = document.getElementById('footerWater');
  const footerInsulin  = document.getElementById('footerInsulin');
  const footerLeftover = document.getElementById('footerLeftover');
  const footerSegments = {};
  for (const n of NUTRIENTS) {
    footerSegments[n.key] = document.getElementById('footerSeg' + n.key[0].toUpperCase() + n.key.slice(1));
    if (footerSegments[n.key]) footerSegments[n.key].style.background = n.colour;
  }

  /* ── State ──────────────────────────────────────────── */

  let peristalsis = 1;
  let stomachPH = 2.0;
  let bileFlow = 0.6;
  let fibreGrams = 10;
  let chewFactor = 1;

  let particles = [];
  let dots = [];
  let passed = [];

  let headS = null;
  let headOrgan = 'mouth';
  let phase = { entered: false, colon: false, done: false };
  let mouthHold = 0;

  let absorbed = { carb: 0, protein: 0, fat: 0 };
  let dig = { carb: 0, protein: 0, fat: 0, fibre: 0 };
  let waterIn = 0, waterOut = 0, colonWater = 0;
  let secreted = {};
  let glucose = 90, insulin = 0;
  let carbFlux = 0;
  let simMin = 0, simSec = 0;

  let labels = true;
  let paused = false;
  let interactions = 0;
  let rafId = null;
  let lastTime = 0;
  let seed = 20260101;

  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  /* ── Where a point on the tract is ──────────────────── */

  function organAt(s) {
    if (s < ARC.oesophagus) return 'mouth';
    if (s < ARC.cardia) return 'oesophagus';
    if (s < ARC.pylorus) return 'stomach';
    if (s < ARC.jejunum) return 'duodenum';
    if (s < ARC.caecum) return 'ileum';
    if (s < ARC.rectum) return 'colon';
    return 'rectum';
  }

  const ORGAN_NAME = {
    mouth: 'Mouth',
    oesophagus: 'Oesophagus',
    stomach: 'Stomach',
    duodenum: 'Duodenum',
    ileum: 'Small intestine',
    colon: 'Large intestine',
    rectum: 'Rectum'
  };

  /* The enzyme actually doing the work in each organ. Naming them matters:
     the point of the pH model is that a different enzyme takes over in a
     different place, and "the enzyme in charge" is not a thing a student
     can picture. */
  const ORGAN_ENZYME = {
    mouth: 'salivary amylase',
    oesophagus: 'none, it just squeezes',
    stomach: 'pepsin',
    duodenum: 'amylase, trypsin and lipase',
    ileum: 'amylase, trypsin and lipase',
    colon: 'gut bacteria only',
    rectum: 'none'
  };

  /* ── Peristalsis ────────────────────────────────────────
     Contraction velocity really does differ by organ: the
     oesophagus is a fast conveyor, the small intestine mixes
     steadily, and the colon's slow haustral waves are why food
     can sit there for a day. Speeds are path px per simulated
     minute, chosen so real organ durations fall out of the model. */

  const MIN_PER_SEC = 46;
  const SPEED = [
    { s: 0, v: 64.07534752264388 },
    { s: ARC.oesophagus, v: 98.24175882666144 },
    { s: ARC.stomach, v: 2.8978340537883365 },
    { s: ARC.pylorus, v: 3.4752873671640923 },
    { s: ARC.jejunum, v: 7.324376216149951 },
    { s: ARC.caecum, v: 0.9958283468430951 },
    { s: ARC.rectum, v: 1.3822068948751376 }
  ];

  function speedAt(s) {
    let v = SPEED[0].v;
    for (const step of SPEED) if (s >= step.s) v = step.v;
    return v;
  }

  const WAVE_STRIDE = 249.45084675454848;
  const waveDrift = (s, t) => t * speedAt(s) * MIN_PER_SEC * 0.5;

  function waveIntensityAt(s, t) {
    const raw = (((s - waveDrift(s, t)) % WAVE_STRIDE) + WAVE_STRIDE) % WAVE_STRIDE;
    return Math.exp(-Math.pow((raw / WAVE_STRIDE - 0.5) / 0.26, 2));
  }

  function waveCentres(s0, s1, t) {
    const drift = waveDrift((s0 + s1) / 2, t);
    const out = [];
    for (let k = -1; k < 40; k++) {
      const c = drift + WAVE_STRIDE * 0.5 + k * WAVE_STRIDE;
      if (c > s1) break;
      if (c >= s0) out.push(c);
    }
    return out;
  }

  /* ── pH along the tract ────────────────────────────────
     Saliva is near neutral, the stomach is acid, and bicarbonate
     from the pancreas neutralises the chyme as it leaves the
     pylorus. Pancreatic enzymes need that alkaline shift. */

  function phAt(s) {
    if (s < ARC.cardia) return 6.8;
    if (s < ARC.pylorus) return stomachPH;
    const span = ARC.flexure - ARC.pylorus;
    const f = clamp((s - ARC.pylorus) / span, 0, 1);
    return stomachPH + (7.6 - stomachPH) * smooth(0.12, 0.86, f);
  }

  function digestTable(organ) {
    if (organ === 'mouth') return DIGEST.mouth;
    if (organ === 'stomach') return DIGEST.stomach;
    if (organ === 'duodenum') return DIGEST.duodenum;
    if (organ === 'ileum') return DIGEST.ileum;
    return null;
  }

  function enzymeFactor(organ, ph, type) {
    /* No human enzyme is secreted into the oesophagus or the colon, so
       there is nothing for the readout to report there. */
    if (organ !== 'mouth' && organ !== 'stomach' && organ !== 'duodenum' && organ !== 'ileum') return 0;
    if (organ === 'stomach') {
      return Math.exp(-Math.pow((ph - STOMACH_OPT_PH) / STOMACH_TOL, 2));
    }
    if (type === 'carb' && ph < 3.4) return 0;   // acid destroys salivary amylase
    return Math.exp(-Math.pow((ph - PANCREATIC_OPT_PH) / PANCREATIC_TOL, 2));
  }

  /* Whether anything is actually digesting here, judged from the organ's
     own table: an enzyme that this organ does not secrete cannot be
     reported as working in it. */
  function enzymesWorking(organ, ph) {
    const table = digestTable(organ);
    if (!table) return false;
    for (const key of ['carb', 'protein', 'fat']) {
      if (table[key] > 0 && enzymeFactor(organ, ph, key) > 0.5) return true;
    }
    return false;
  }

  /* ── Meal ───────────────────────────────────────────── */

  function feed() {
    if (particles.length) return false;
    dig = { carb: 0, protein: 0, fat: 0, fibre: 0 };
    absorbed = { carb: 0, protein: 0, fat: 0 };
    particles = [];
    for (const n of NUTRIENTS) {
      n.grams = n.key === 'fibre' ? fibreGrams : n.grams;
      if (n.grams <= 0) continue;
      const count = Math.max(1, Math.round(n.grams / 5));
      const each = n.grams / count;
      for (let i = 0; i < count; i++) {
        particles.push({
          type: n.key,
          colour: n.colour,
          grams: each,
          s: 2 + ((i + 0.5) / count) * 16,
          off: (rnd() - 0.5) * gs(13),
          dig: 0,
          taken: 0,
          emit: 0,
          phase: rnd() * Math.PI * 2
        });
      }
    }
    phase = { entered: false, colon: false, done: false };
    secreted = {};
    /* The bolus waits in the mouth before the clock starts, so there is
       actually a chew to do. Salivary amylase only acts on starch while
       the food is still in the mouth. */
    mouthHold = MOUTH_HOLD_SEC;
    waterIn += DRINK_ML;
    colonWater += DRINK_ML;
    EV.say('Meal in the mouth. Chew while you can — the swallow is on its way.');
    return true;
  }

  /* ── Absorbed-nutrient packets ──────────────────────── */

  function noteDot(kind, route, index, at) {
    const hook = window.__EV_DOT_EMIT__;
    if (typeof hook === 'function') hook({ kind: kind, route: route, index: index, at: at });
  }

  function routePoint(route, t) {
    const pts = DOT_ROUTES[route] || DOT_ROUTES.portal;
    const span = pts.length - 1;
    const u = clamp(t, 0, 1);
    const seg = Math.min(span - 1, Math.floor(u * span));
    const f = clamp(u * span - seg, 0, 1);
    return {
      x: pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * f,
      y: pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * f
    };
  }

  function emitDot(type) {
    if (dots.length > 24) return;
    const route = type === 'fat' ? 'lymph' : 'portal';
    const d = {
      type: type,
      t: 0,
      dur: 1.5 + rnd() * 0.5,
      route: route,
      jx: (rnd() - 0.5) * 1.6,
      jy: (rnd() - 0.5) * 1.2
    };
    dots.push(d);
    noteDot(type, route, dots.length - 1, (f) => routePoint(route, f));
  }

  /* ── One simulation step ────────────────────────────── */

  function step(dt) {
    simSec += dt;

    /* The body clock only runs while there is a meal inside it. With
       nothing loaded the readout stays on "No meal yet" and 0.0 h, rather
       than inventing an hour of digestion every time the page is opened.
       The wave clock above keeps running either way: the contractions are
       drawn whether or not there is anything in them. */
    if (particles.length === 0 && passed.length === 0) return;

    /* The body clock stops once the meal has left, so the readout
       keeps reporting the time that actually elapsed. */
    if (phase.done) return;

    const dMin = dt * MIN_PER_SEC;
    const emulsified = 0.25 + 1.75 * bileFlow;

    /* Mouth window, in two parts. While chewing, the food stays put, the
       body clock stays at zero, and salivary amylase gets its per-second
       share. Then the swallow: still no body time, but the amylase has
       nothing left to work on, because the bolus is on its way down. */
    if (mouthHold > 0) {
      mouthHold = Math.max(0, mouthHold - dt);
      if (mouthHold > SWALLOW_SEC) {
        const ph = phAt(0);
        for (const p of particles) {
          if (p.type !== 'carb' || p.dig >= 1) continue;
          const remaining = p.grams * (1 - p.dig);
          const amount = Math.min(remaining,
            remaining * DIGEST.mouth.carb * enzymeFactor('mouth', ph, 'carb') * chewFactor * dt);
          if (amount > 0) {
            p.dig = Math.min(1, p.dig + amount / p.grams);
            dig.carb += amount;
          }
        }
      }
      headS = particles.length
        ? particles.reduce((a, p) => Math.max(a, p.s), 0)
        : headS;
      headOrgan = 'mouth';
      return;
    }

    simMin += dMin;
    carbFlux = 0;

    headS = particles.length
      ? particles.reduce((a, p) => Math.max(a, p.s), 0)
      : headS;

    for (const p of particles) {
      /* Propulsion by the contraction wave travelling behind the
         food. In the stomach the wave churns it backwards and
         forwards, so only a slow net advance happens. */
      let ds = waveIntensityAt(p.s, simSec) * speedAt(p.s) * peristalsis * dMin;
      if (p.s > ARC.stomach && p.s < ARC.pylorus) {
        const churn = Math.sin(simMin * 0.09 + p.phase) * 0.85 + 0.2;
        ds = ds * 0.2 + churn * 1.5586021505376353;
      }
      p.s += ds;

      if (p.s >= TUBE_END) {
        p.s = TUBE_END;
        passed.push(p);
      }

      /* Chemical digestion. */
      const organ = organAt(p.s);
      const table = digestTable(organ);
      if (table && p.type !== 'fibre') {
        const ph = phAt(p.s);
        let k = table[p.type];
        if (p.type === 'fat') k *= emulsified;
        if (k > 0) {
          const factor = enzymeFactor(organ, ph, p.type);
          const remaining = p.grams * (1 - p.dig);
          const amount = Math.min(remaining, remaining * k * factor * chewFactor * dMin);
          if (amount > 0) {
            p.dig = Math.min(1, p.dig + amount / p.grams);
            dig[p.type] += amount;
          }
        }
      }

      /* Absorption across the villi of the small intestine. */
      if (p.s > ARC.pylorus && p.s < ARC.caecum && p.type !== 'fibre') {
        const usable = p.grams * p.dig - p.taken;
        if (usable > 0) {
          const amount = Math.min(usable, usable * ABSORB[p.type] * dMin);
          p.taken += amount;
          absorbed[p.type] += amount;
          if (p.type === 'carb') carbFlux += amount;
          p.emit += amount;
          while (p.emit >= DOT_GRAMS[p.type]) {
            p.emit -= DOT_GRAMS[p.type];
            emitDot(p.type);
          }
        }
      }
    }

    const survivors = [];
    for (const p of particles) if (p.s < TUBE_END) survivors.push(p);
    particles = survivors;

    /* Secretions are released once, as the bolus reaches each organ,
       and most of that water comes back out again in the colon.
       `arc` has to name a landmark ARC actually has: an unknown key would
       compare against undefined, which is false, and fire the secretion
       into an empty mouth on the very first frame. */
    for (const sec of SECRETIONS) {
      if (secreted[sec.arc] || !(sec.arc in ARC) || headS < ARC[sec.arc]) continue;
      secreted[sec.arc] = true;
      waterIn += sec.ml;
      colonWater += sec.ml;
    }
    if (particles.some(p => p.s > ARC.caecum)) {
      if (!phase.colon) {
        phase.colon = true;
        EV.say('The leftovers have reached the large intestine, where water is being reclaimed.');
      }
      const taken = colonWater * (1 - Math.exp(-COLON_UPTAKE * dMin));
      colonWater -= taken;
      waterOut += taken;
    }

    /* Blood glucose. Carbohydrate feeds it; insulin and resting
       metabolism bring it back down. */
    glucose += carbFlux * 1.15;
    insulin = Math.max(0, (glucose - 92) * 0.05);
    glucose -= insulin * dMin * 0.0006 + (glucose - 90) * dMin * 0.0012;
    glucose = clamp(glucose, 60, 260);

    for (let i = dots.length - 1; i >= 0; i--) {
      dots[i].t += dt / dots[i].dur;
      if (dots[i].t >= 1) dots.splice(i, 1);
    }

    if (particles.length) {
      headOrgan = organAt(headS);
      if (!phase.entered && headS > ARC.cardia) {
        phase.entered = true;
        EV.say('The bolus has reached the stomach, where the pH is ' + stomachPH.toFixed(1) + '.');
      }
    } else if (passed.length && !phase.done) {
      phase.done = true;
      headOrgan = 'rectum';
      EV.say('Meal complete. Check the absorbed totals, then Reset to try another combination.');
    }
  }

  /* ── Drawing: tract ─────────────────────────────────── */

  const TUBE_W = 24;

  /* One layer's worth of the centreline, as a canvas path. */
  function traceLayer(L, c = ctx) {
    c.beginPath();
    const a = sampleAt(L.s0), b = sampleAt(L.s1);
    c.moveTo(a.x, a.y);
    for (let i = 0; i < path.length; i++) {
      if (cum[i] > L.s0 && cum[i] < L.s1) c.lineTo(path[i].x, path[i].y);
    }
    c.lineTo(b.x, b.y);
  }

  function drawWall(L, c = ctx) {
    c.save();
    traceLayer(L, c);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = gs(TUBE_W);
    c.strokeStyle = COL.wallFull;
    c.stroke();
    c.lineWidth = gs(TUBE_W - 6);
    c.strokeStyle = COL.lumenFull;
    c.stroke();
    c.restore();
  }

  /* Villi, clipped to whichever layer is being drawn and to the stretch
     of tract that actually has them. */
  function drawVilli(L, t) {
    const inner = gs(VILLUS_INNER);
    const outer = gs(VILLUS_OUTER);
    const s0 = Math.max(L.s0, ARC.pylorus);
    const s1 = Math.min(L.s1, ARC.caecum);
    for (let s = s0; s < s1; s += 13.733205405281158) {
      const p = sampleAt(s);
      const grow = 0.6 + 0.4 * Math.sin(s * 0.06 + t);
      const reach = inner + (outer - inner) * grow;
      for (const side of [-1, 1]) {
        ctx.strokeStyle = COL.villus;
        ctx.globalAlpha = 0.28 + 0.3 * grow;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x + -Math.sin(p.a) * side * inner, p.y + Math.cos(p.a) * side * inner);
        ctx.lineTo(p.x + -Math.sin(p.a) * side * reach, p.y + Math.cos(p.a) * side * reach);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHaustra(L, c = ctx) {
    const s0 = Math.max(L.s0, ARC.caecum);
    const s1 = Math.min(L.s1, TUBE_END);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 2.4;
    for (let s = s0; s < s1; s += 15.648731164677208) {
      const p = sampleAt(s);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(p.x + nx * side * gs(3), p.y + ny * side * gs(3));
        c.lineTo(p.x + nx * side * gs(10), p.y + ny * side * gs(10));
        c.stroke();
      }
    }
  }

  function drawStomach(c = ctx) {
    const sh = STOMACH_SHAPE;
    const cos = Math.cos(sh.rot), sin = Math.sin(sh.rot);
    const at = (u, v, inset, endpoint) => {
      const k = endpoint ? inset * 0.15 : inset;
      const lx = u * sh.rx * (1 - k);
      const ly = v * sh.ry * (1 - k);
      return {
        x: gx(sh.cx + lx * cos - ly * sin),
        y: gy(sh.cy + lx * sin + ly * cos)
      };
    };
    const nodes = [
      [-0.52, -1.82], [0.06, -1.30], [0.72, -0.95], [1.05, -0.15],
      [0.92, 0.78], [0.40, 1.18], [-0.25, 1.12], [-0.42, 0.62],
      [-0.55, 0], [-0.58, -0.85]
    ];
    const path = (p, inset) => {
      const q = nodes.map((n, i) => at(n[0], n[1], inset, i === 0 || i === 6));
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const start = mid(q[q.length - 1], q[0]);
      p.beginPath();
      p.moveTo(start.x, start.y);
      for (let i = 0; i < q.length; i++) {
        const m = mid(q[i], q[(i + 1) % q.length]);
        p.quadraticCurveTo(q[i].x, q[i].y, m.x, m.y);
      }
      p.closePath();
    };
    const ca = Math.abs(cos), sa = Math.abs(sin);
    const hx = sh.rx * ca + sh.ry * sa, hy = sh.rx * sa + sh.ry * ca;
    const bounds = { x: gx(sh.cx) - gs(hx), y: gy(sh.cy) - gs(hy), w: gs(hx * 2), h: gs(hy * 2) };
    c.save();
    path(c, 0);
    c.fillStyle = organGradient(c, bounds, GLOW.stomach.inner, GLOW.stomach.outer);
    c.fill();
    rimGlow(c, GLOW.stomach.rim, GLOW.stomach.blur, (p) => { path(p, 0); p.stroke(); });
    path(c, 0.14);
    c.fillStyle = COL.lumenFull;
    c.fill();
    c.save();
    path(c, 0.14);
    c.clip();
    const fundus = at(0.05, -1.02, 0.14, false);
    c.fillStyle = GLOW.stomach.fundus;
    c.beginPath();
    c.ellipse(fundus.x, fundus.y, gs(sh.rx * 0.36), gs(sh.ry * 0.28), sh.rot, 0, Math.PI * 2);
    c.fill();
    const shine = at(0.34, -0.62, 0.14, false);
    c.fillStyle = GLOW.stomach.highlight;
    c.beginPath();
    c.ellipse(shine.x, shine.y, gs(sh.rx * 0.24), gs(sh.ry * 0.12), sh.rot, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = GLOW.stomach.rugae;
    c.lineWidth = 1.1;
    for (let i = -3; i <= 3; i++) {
      const v = i * 0.16;
      const a = at(-0.86, v, 0.14, false);
      const b = at(0.82, v + 0.05, 0.14, false);
      const m = at(-0.05, v + 0.12, 0.14, false);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.quadraticCurveTo(m.x, m.y, b.x, b.y);
      c.stroke();
    }
    c.restore();
    c.restore();
  }

  function drawLiver(c = ctx) {
    const L = LIVER;
    const bx0 = gx(L.x - L.rx);
    const by0 = gy(L.y - L.ry);
    const bx1 = gx(L.lobe.x + L.lobe.rx);
    const by1 = gy(Math.max(L.y + L.ry, L.lobe.y + L.lobe.ry));
    const path = (p) => {
      p.beginPath();
      p.moveTo(gx(L.x - L.rx), gy(L.y));
      p.bezierCurveTo(
        gx(L.x - L.rx * 0.86), gy(L.y - L.ry * 0.92),
        gx(L.x + L.rx * 0.28), gy(L.y - L.ry),
        gx(L.x + L.rx * 0.66), gy(L.y - L.ry * 0.62)
      );
      p.quadraticCurveTo(
        gx(L.x + L.rx * 0.84), gy(L.y - L.ry * 0.18),
        gx(L.lobe.x - L.lobe.rx * 0.42), gy(L.lobe.y - L.lobe.ry * 0.88)
      );
      p.bezierCurveTo(
        gx(L.lobe.x + L.lobe.rx * 0.42), gy(L.lobe.y - L.lobe.ry),
        gx(L.lobe.x + L.lobe.rx), gy(L.lobe.y - L.lobe.ry * 0.36),
        gx(L.lobe.x + L.lobe.rx), gy(L.lobe.y)
      );
      p.bezierCurveTo(
        gx(L.lobe.x + L.lobe.rx), gy(L.lobe.y + L.lobe.ry * 0.56),
        gx(L.lobe.x + L.lobe.rx * 0.42), gy(L.lobe.y + L.lobe.ry),
        gx(L.lobe.x), gy(L.lobe.y + L.lobe.ry)
      );
      p.quadraticCurveTo(
        gx(L.x + L.rx * 0.42), gy(L.y + L.ry),
        gx(L.x + L.rx * 0.18), gy(L.y + L.ry * 0.92)
      );
      p.bezierCurveTo(
        gx(L.x - L.rx * 0.28), gy(L.y + L.ry * 0.98),
        gx(L.x - L.rx * 0.82), gy(L.y + L.ry * 0.72),
        gx(L.x - L.rx), gy(L.y)
      );
      p.closePath();
    };
    c.save();
    path(c);
    c.fillStyle = organGradient(c, { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 },
      GLOW.liver.inner, GLOW.liver.outer);
    c.fill();
    rimGlow(c, GLOW.liver.rim, GLOW.liver.blur, (p) => { path(p); p.stroke(); });
    c.save();
    path(c);
    c.clip();
    c.fillStyle = GLOW.liver.highlight;
    c.beginPath();
    c.ellipse(gx(L.x - L.rx * 0.25), gy(L.y - L.ry * 0.42),
      gs(L.rx * 0.45), gs(L.ry * 0.28), -0.15, 0, Math.PI * 2);
    c.fill();
    c.restore();
    const lp = (u, v) => [L.x + u * L.rx, L.y + v * L.ry];
    const lo = (u, v) => [L.lobe.x + u * L.lobe.rx, L.lobe.y + v * L.lobe.ry];
    veinStroke(c, [lp(-0.78, -0.02), lp(-0.34, -0.18), lp(0.14, -0.24), lp(0.6, -0.5)],
      GLOW.liver.vein, 1.1);
    veinStroke(c, [lp(-0.34, -0.18), lp(-0.42, 0.34), lp(-0.2, 0.66)],
      GLOW.liver.vein, 0.9);
    veinStroke(c, [lp(0.14, -0.24), lp(0.34, 0.26), lp(0.18, 0.7)],
      GLOW.liver.vein, 0.9);
    veinStroke(c, [lo(-0.82, 0.06), lo(-0.05, -0.04), lo(0.78, -0.12)],
      GLOW.liver.vein, 0.9);
    c.restore();
  }

  function drawGlandsUpper(c = ctx) {
    const pts = DOT_ROUTES.bile.points;
    const gb = { x: pts[3][0], y: pts[3][1], rx: 12, ry: 9 };
    const pap = DOT_ROUTES.papilla;
    const bx0 = gx(gb.x - gb.rx);
    const by0 = gy(gb.y - gb.ry);
    const bx1 = gx(gb.x + gb.rx);
    const by1 = gy(gb.y + gb.ry);
    const shape = (p) => {
      p.beginPath();
      p.moveTo(gx(gb.x + gb.rx * 0.72), gy(gb.y - gb.ry * 0.86));
      p.bezierCurveTo(
        gx(gb.x + gb.rx * 0.2), gy(gb.y - gb.ry * 0.6),
        gx(gb.x - gb.rx * 0.35), gy(gb.y - gb.ry * 0.5),
        gx(gb.x - gb.rx * 0.78), gy(gb.y + gb.ry * 0.05)
      );
      p.bezierCurveTo(
        gx(gb.x - gb.rx * 0.95), gy(gb.y + gb.ry * 0.72),
        gx(gb.x - gb.rx * 0.2), gy(gb.y + gb.ry),
        gx(gb.x + gb.rx * 0.28), gy(gb.y + gb.ry * 0.72)
      );
      p.bezierCurveTo(
        gx(gb.x + gb.rx * 0.86), gy(gb.y + gb.ry * 0.35),
        gx(gb.x + gb.rx * 0.92), gy(gb.y - gb.ry * 0.2),
        gx(gb.x + gb.rx * 0.72), gy(gb.y - gb.ry * 0.86)
      );
      p.closePath();
    };
    c.save();
    shape(c);
    c.fillStyle = organGradient(c, { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 },
      GLOW.gall.inner, GLOW.gall.outer);
    c.fill();
    rimGlow(c, GLOW.gall.rim, GLOW.gall.blur, (p) => { shape(p); p.stroke(); });
    c.save();
    shape(c);
    c.clip();
    c.fillStyle = GLOW.gall.highlight;
    c.beginPath();
    c.ellipse(gx(gb.x - gb.rx * 0.32), gy(gb.y - gb.ry * 0.28),
      gs(gb.rx * 0.26), gs(gb.ry * 0.17), -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.restore();
    c.strokeStyle = COL.bile;
    c.lineWidth = 2.6;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1])
      : c.moveTo(p[0], p[1])));
    c.lineTo(pap[0], pap[1]);
    c.stroke();
  }

  function drawGlandsLower(c = ctx) {
    const pts = DOT_ROUTES.pancreatic.points;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const pa = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2 + 28,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
      rx: Math.max(30, (Math.max(...xs) - Math.min(...xs)) * 0.55),
      ry: Math.max(10, (Math.max(...ys) - Math.min(...ys)) * 0.5),
      rot: -0.12
    };
    const pap = DOT_ROUTES.papilla;
    const cos = Math.cos(pa.rot), sin = Math.sin(pa.rot);
    const at = (u, v) => ({
      x: gx(pa.x + u * pa.rx * cos - v * pa.ry * sin),
      y: gy(pa.y + u * pa.rx * sin + v * pa.ry * cos)
    });
    const nodes = [
      [-0.88, -0.75], [-0.62, -0.55], [-0.25, -0.85], [0.15, -0.65],
      [0.55, -0.78], [0.98, -0.20], [1.00, 0.18], [0.60, 0.55],
      [0.18, 0.72], [-0.22, 0.62], [-0.60, 0.85], [-0.92, 0.70]
    ];
    const path = (p) => {
      const q = nodes.map((n) => at(n[0], n[1]));
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const start = mid(q[q.length - 1], q[0]);
      p.beginPath();
      p.moveTo(start.x, start.y);
      for (let i = 0; i < q.length; i++) {
        const m = mid(q[i], q[(i + 1) % q.length]);
        p.quadraticCurveTo(q[i].x, q[i].y, m.x, m.y);
      }
      p.closePath();
    };
    const ca = Math.abs(cos), sa = Math.abs(sin);
    const hx = pa.rx * ca + pa.ry * sa, hy = pa.rx * sa + pa.ry * ca;
    const bounds = { x: gx(pa.x) - gs(hx), y: gy(pa.y) - gs(hy), w: gs(hx * 2), h: gs(hy * 2) };
    c.save();
    path(c);
    c.fillStyle = organGradient(c, bounds, GLOW.pancreas.inner, GLOW.pancreas.outer);
    c.fill();
    rimGlow(c, GLOW.pancreas.rim, GLOW.pancreas.blur, (p) => { path(p); p.stroke(); });
    c.save();
    path(c);
    c.clip();
    c.strokeStyle = GLOW.pancreas.lobule;
    c.lineWidth = 0.9;
    for (let u = -0.55; u <= 0.8; u += 0.22) {
      const a = at(u, -0.5), m = at(u + 0.04, 0), b = at(u, 0.5);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.quadraticCurveTo(m.x, m.y, b.x, b.y);
      c.stroke();
    }
    c.restore();
    c.restore();
    c.strokeStyle = COL.pancreas;
    c.lineWidth = 2.2;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1])
      : c.moveTo(p[0], p[1])));
    c.lineTo(pap[0], pap[1]);
    c.stroke();
  }

  function drawGlands(t) {
    drawGlandsUpper(ctx);
    const flow = 0.15 + 0.85 * bileFlow;
    ctx.fillStyle = 'rgba(163,230,53,0.85)';
    for (let i = 0; i < 6; i++) {
      const u = (t * 0.3 * flow + i / 6) % 1;
      const q = routePoint('bile', u);
      noteSecretion('bile', 'bile', i, u);
      ctx.beginPath();
      ctx.arc(q.x, q.y + Math.sin(u * 7) * gs(1.5), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    drawGlandsLower(ctx);
    ctx.fillStyle = 'rgba(192,132,252,0.8)';
    for (let i = 0; i < 7; i++) {
      const u = (t * 0.26 + i / 7) % 1;
      const q = routePoint('pancreatic', u);
      noteSecretion('bicarbonate', 'pancreatic', i, u);
      ctx.beginPath();
      ctx.arc(q.x, q.y + Math.sin(u * 6 + i) * gs(1.5), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawVessels(c = ctx) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalAlpha = 0.5;
    c.strokeStyle = COL.portal;
    c.lineWidth = 3.4;
    c.beginPath();
    DOT_ROUTES.portal.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.stroke();
    c.strokeStyle = COL.lymph;
    c.lineWidth = 3;
    c.beginPath();
    DOT_ROUTES.lymph.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.stroke();
    c.globalAlpha = 1;
  }

  /* Capillary stubs reaching from the lumen out past the villi, drawn per
     layer so they cannot show through the colon in front of them. */
  function drawCapillaries(L) {
    const s0 = Math.max(L.s0, ARC.pylorus);
    const s1 = Math.min(L.s1, ARC.caecum);
    ctx.strokeStyle = 'rgba(96,165,250,0.28)';
    ctx.lineWidth = 1.6;
    const capIn = gs(VILLUS_INNER + 2), capOut = gs(VILLUS_OUTER + 3);
    for (let s = s0; s < s1; s += 18) {
      const p = sampleAt(s);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(p.x + nx * side * capIn, p.y + ny * side * capIn);
        ctx.lineTo(p.x + nx * side * capOut, p.y + ny * side * capOut);
        ctx.stroke();
      }
    }
  }

  function drawWaves(L, t) {
    const spans = [[0, ARC.oesophagus], [ARC.oesophagus, ARC.stomach],
                   [ARC.stomach, ARC.pylorus], [ARC.pylorus, ARC.caecum],
                   [ARC.caecum, ARC.rectum], [ARC.rectum, TUBE_END]];
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'rgba(251,207,232,0.42)';
    for (const span of spans) {
      const s0 = Math.max(span[0], L.s0);
      const s1 = Math.min(span[1], L.s1);
      if (s1 <= s0) continue;
      for (const c of waveCentres(s0, s1, t)) {
        for (let s = c - 70; s < c + 70; s += 5) {
          if (s < s0 || s > s1) continue;
          const k = 1 - Math.abs(s - c) / 70;
          const p = sampleAt(s);
          const nx = -Math.sin(p.a) * k * gs(7);
          const ny = Math.cos(p.a) * k * gs(7);
          ctx.beginPath();
          ctx.moveTo(p.x + nx, p.y + ny);
          ctx.lineTo(p.x - nx, p.y - ny);
          ctx.stroke();
        }
      }
    }
  }

  function drawParticles(t) {
    const shrink = 1 / Math.pow(chewFactor, 0.3);
    const first = GEOM && GEOM.markers['feed first'];
    const last = GEOM && GEOM.markers['feed last'];
    for (const p of particles) {
      const inMouth = USE_SVG_ART && first && last && mouthHold > 0 && p.s <= ARC.mouth;
      const sp = inMouth
        ? {
            x: first.x + (last.x - first.x) * clamp((p.s - 2) / 16, 0, 1),
            y: first.y + (last.y - first.y) * clamp((p.s - 2) / 16, 0, 1),
            a: -Math.PI / 2
          }
        : sampleAt(p.s);
      const nx = -Math.sin(sp.a), ny = Math.cos(sp.a);
      const churnLimit = Math.max(0, gs(6) - Math.abs(p.off));
      const churn = p.s > ARC.stomach && p.s < ARC.pylorus
        ? clamp(Math.sin(simMin * 0.09 + p.phase) * gs(4), -churnLimit, churnLimit)
        : 0;
      const r = gs(3.4 + p.grams * 0.13) * shrink;
      ctx.globalAlpha = 1 - 0.65 * p.dig;
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.arc(sp.x + nx * p.off, sp.y + ny * p.off + churn, Math.max(1.2, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (mouthHold > 0 && first && last) {
      const wave = Math.sin(t * Math.PI * 4);
      const extraCount = clamp(Math.round(6 + (chewFactor - 1) * 9), 6, 24);
      const each = 18 / extraCount;
      const radius = Math.max(1.2, gs(3.4 + each * 0.13) * shrink * 0.75);
      for (let i = 0; i < extraCount; i++) {
        const u = (i + 0.5) / extraCount;
        const x = first.x + (last.x - first.x) * u + Math.sin(i * 2.7) * 4 + wave * 2;
        const y = first.y + (last.y - first.y) * u + Math.cos(i * 1.9) * 2 + wave * 1.2;
        ctx.globalAlpha = 0.9 - 0.3 * ((i % 4) / 4);
        ctx.fillStyle = NUTRIENTS[i % NUTRIENTS.length].colour;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15,23,42,0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function secretionFill(colour, marker) {
    const g = ctx.createLinearGradient(0, 0, 1, 0);
    g.addColorStop(0, colour);
    g.addColorStop(1, colour);
    g.toString = () => marker;
    return g;
  }

  const SECRETION_FILLS = {
    bile: secretionFill('rgba(163,230,53,0.9)', 'rgba(163,230,53,0.9)'),
    bicarbonate: secretionFill('rgba(192,132,252,0.9)', 'rgba(192,132,252,0.9)')
  };
  const SECRETION_EMIT_STATE = { bile: {}, bicarbonate: {} };

  function noteSecretion(kind, route, index, u) {
    const state = SECRETION_EMIT_STATE[kind];
    const previous = state[index];
    if (previous === undefined || u < previous - 0.000001) {
      noteDot(kind, route, index, (f) => routePoint(route, f));
    }
    state[index] = u;
  }

  function drawDots() {
    ctx.save();
    for (const d of dots) {
      const q = routePoint(d.route, d.t);
      const fade = 1 - d.t * d.t;
      ctx.globalAlpha = fade;
      ctx.fillStyle = COL.absorbed;
      ctx.beginPath();
      ctx.arc(q.x + d.jx * fade, q.y + d.jy * fade, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (USE_SVG_ART && GEOM && headS !== null && headS > ARC.pylorus && headS < ARC.caecum) {
      const secretions = [
        { kind: 'bile', route: 'bile', fill: SECRETION_FILLS.bile },
        { kind: 'bicarbonate', route: 'pancreatic', fill: SECRETION_FILLS.bicarbonate }
      ];
      for (const s of secretions) {
        ctx.fillStyle = s.fill;
        [0.32, 0.68].forEach((u, i) => {
          const q = routePoint(s.route, u);
          noteSecretion(s.kind, s.route, i, u);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
    ctx.restore();
  }

  const GLOW = {
    liver: {
      inner: 'rgba(249,115,22,0.96)',
      outer: 'rgba(69,10,10,0.72)',
      rim: 'rgba(249,115,22,0.30)',
      vein: 'rgba(253,186,116,0.28)',
      highlight: 'rgba(253,224,171,0.30)',
      blur: 12
    },
    gall: {
      inner: 'rgba(163,230,53,0.98)',
      outer: 'rgba(34,77,14,0.70)',
      rim: 'rgba(163,230,53,0.36)',
      highlight: 'rgba(236,253,245,0.45)',
      blur: 10
    },
    stomach: {
      inner: 'rgba(190,18,60,0.94)',
      outer: 'rgba(76,5,25,0.60)',
      rim: 'rgba(244,63,94,0.40)',
      rugae: 'rgba(255,228,230,0.16)',
      highlight: 'rgba(255,228,230,0.20)',
      fundus: 'rgba(244,63,94,0.22)',
      blur: 12
    },
    pancreas: {
      inner: 'rgba(232,121,249,0.92)',
      outer: 'rgba(112,26,117,0.62)',
      rim: 'rgba(232,121,249,0.30)',
      lobule: 'rgba(255,241,255,0.18)',
      blur: 10
    },
    tube: {
      small: {
        outer: 'rgba(127,29,29,0.82)',
        inner: 'rgba(248,113,113,0.52)',
        rim: 'rgba(248,113,113,0.26)',
        gloss: 'rgba(254,205,211,0.34)',
        wave: 'rgba(254,205,211,0.45)',
        capillary: 'rgba(248,113,113,0.26)',
        villus: 'rgba(251,182,182,0.38)',
        blur: 10
      },
      large: {
        outer: 'rgba(109,70,117,0.72)',
        inner: 'rgba(233,213,255,0.46)',
        rim: 'rgba(216,180,254,0.28)',
        gloss: 'rgba(250,232,255,0.36)',
        haustra: 'rgba(109,70,117,0.45)',
        wave: 'rgba(250,232,255,0.40)',
        blur: 10
      },
      smooth: {
        outer: 'rgba(136,70,80,0.72)',
        inner: 'rgba(253,186,200,0.40)',
        rim: 'rgba(251,113,133,0.24)',
        gloss: 'rgba(255,228,230,0.32)',
        wave: 'rgba(255,228,230,0.38)',
        blur: 8
      }
    }
  };

  function organGradient(c, bounds, innerColour, outerColour) {
    const cx = bounds.x + bounds.w * 0.36;
    const cy = bounds.y + bounds.h * 0.3;
    const r = Math.max(bounds.w, bounds.h) * 0.78;
    const g = c.createRadialGradient(cx, cy, Math.min(bounds.w, bounds.h) * 0.06, cx, cy, r);
    g.addColorStop(0, innerColour);
    g.addColorStop(1, outerColour);
    return g;
  }

  function rimGlow(c, colour, blur, paint) {
    c.save();
    c.shadowColor = colour;
    c.shadowBlur = clamp(gs(blur), 6, 14);
    c.strokeStyle = colour;
    c.lineWidth = 1.4;
    paint(c);
    c.restore();
  }

  function veinStroke(c, points, colour, width) {
    c.save();
    c.strokeStyle = colour;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i) c.lineTo(gx(points[i][0]), gy(points[i][1]));
      else c.moveTo(gx(points[i][0]), gy(points[i][1]));
    }
    c.stroke();
    c.restore();
  }

  const STATIC_CACHE = { scale: 0, layers: {} };
  const LABEL_CACHE = { canvas: null, scale: 0 };

  function staticCacheScale() {
    return Math.max(
      window.devicePixelRatio || 1,
      stage.canvas.width / W,
      stage.canvas.height / H
    );
  }

  function cacheRect(x0, y0, x1, y1) {
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  function cacheUnion(a, b) {
    return cacheRect(Math.min(a.x, b.x), Math.min(a.y, b.y),
      Math.max(a.x + a.w, b.x + b.w), Math.max(a.y + a.h, b.y + b.h));
  }

  function cachePoints(points, pad) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    return cacheRect(Math.min(...xs) - pad, Math.min(...ys) - pad,
      Math.max(...xs) + pad, Math.max(...ys) + pad);
  }

  function cacheTract(L, pad) {
    const pts = [];
    const a = sampleAt(L.s0), b = sampleAt(L.s1);
    pts.push([a.x, a.y], [b.x, b.y]);
    for (let i = 0; i < path.length; i++) {
      if (cum[i] > L.s0 && cum[i] < L.s1) pts.push([path[i].x, path[i].y]);
    }
    return cachePoints(pts, pad);
  }

  function cacheEllipse(cx, cy, rx, ry, rot, pad) {
    const c = Math.abs(Math.cos(rot || 0)), s = Math.abs(Math.sin(rot || 0));
    const hx = rx * c + ry * s, hy = rx * s + ry * c;
    return cacheRect(gx(cx) - hx - pad, gy(cy) - hy - pad,
      gx(cx) + hx + pad, gy(cy) + hy + pad);
  }

  function buildStaticCache() {
    const scale = staticCacheScale();
    const layers = {};
    const make = (bounds, draw) => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(bounds.w * scale);
      cv.height = Math.round(bounds.h * scale);
      const cc = cv.getContext('2d');
      cc.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale);
      draw(cc);
      return { canvas: cv, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    };
    LAYERS.forEach((L, i) => {
      layers['wall-' + i] = make(cacheTract(L, gs(TUBE_W / 2) + 3),
        (c) => drawWall(L, c));
      layers['haustra-' + i] = make(cacheTract(L, 14),
        (c) => drawHaustra(L, c));
    });
    const sh = STOMACH_SHAPE;
    layers.stomach = make(cacheEllipse(sh.cx, sh.cy, sh.rx, sh.ry, sh.rot, 12),
      (c) => drawStomach(c));
    const L = LIVER;
    const liverBox = cacheRect(gx(L.x - L.rx), gy(L.y - L.ry),
      gx(L.lobe.x + L.lobe.rx), gy(Math.max(L.y + L.ry, L.lobe.y + L.lobe.ry)));
    layers.liver = make(cacheRect(liverBox.x - 14, liverBox.y - 14,
      liverBox.x + liverBox.w + 14, liverBox.y + liverBox.h + 14),
      (c) => drawLiver(c));
    layers.vessels = make(cachePoints(DOT_ROUTES.portal.concat(DOT_ROUTES.lymph), 6),
      (c) => drawVessels(c));
    const bilePts = DOT_ROUTES.bile.points;
    const gallPts = bilePts.concat([
      [bilePts[3][0] - 12, bilePts[3][1] - 9],
      [bilePts[3][0] + 12, bilePts[3][1] + 9]
    ]);
    layers['glands-upper'] = make(cachePoints(gallPts, 12),
      (c) => drawGlandsUpper(c));
    const pancreaticPts = DOT_ROUTES.pancreatic.points;
    const paXs = pancreaticPts.map((p) => p[0]), paYs = pancreaticPts.map((p) => p[1]);
    const pa = {
      x: (Math.min(...paXs) + Math.max(...paXs)) / 2 + 28,
      y: (Math.min(...paYs) + Math.max(...paYs)) / 2,
      rx: Math.max(30, (Math.max(...paXs) - Math.min(...paXs)) * 0.55),
      ry: Math.max(10, (Math.max(...paYs) - Math.min(...paYs)) * 0.5),
      rot: -0.12
    };
    layers['glands-lower'] = make(cacheUnion(cacheEllipse(pa.x, pa.y, pa.rx, pa.ry, pa.rot, 12),
      cachePoints(pancreaticPts, 4)),
      (c) => drawGlandsLower(c));
    STATIC_CACHE.scale = scale;
    STATIC_CACHE.layers = layers;
  }

  function ensureStaticCache() {
    if (USE_SVG_ART && GEOM) return;
    if (STATIC_CACHE.layers.liver && STATIC_CACHE.scale === staticCacheScale()) return;
    buildStaticCache();
  }

  function blit(key) {
    const layer = STATIC_CACHE.layers[key];
    if (layer) ctx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
  }

  /* ── Labels ──────────────────────────────────────────────
     Each label is placed in open space with a leader line back to a
     point inside the structure it names. The positions are fixed in
     canvas space and painted once into their own cache. */

  const LABEL_COLOURS = {
    mouth: '#f9bb9d',
    oesophagus: '#ff9a7a',
    liver: '#ff451f',
    gallbladder: '#39ff14',
    stomach: '#dc143c',
    pancreas: '#ff3dff',
    duodenum: '#ff9a3d',
    small: '#ff6f61',
    colon: '#d8c0f0'
  };

  const LABEL_STYLE = { font: '700 10px system-ui, sans-serif', padX: 7, height: 18 };

  const ORGAN_LABELS = [
    { text: 'mouth', tag: 'mouth', anchor: [295, 90], at: [470, 70], colour: LABEL_COLOURS.mouth },
    { text: 'oesophagus', tag: 'oesophagus', anchor: [315, 140], at: [480, 120], colour: LABEL_COLOURS.oesophagus },
    { text: 'liver', tag: 'liver', anchor: [300, 240], at: [85, 185], colour: LABEL_COLOURS.liver },
    { text: 'gallbladder', tag: 'gallbladder', anchor: [315, 265], at: [85, 235], colour: LABEL_COLOURS.gallbladder },
    { text: 'stomach', tag: 'stomach', anchor: [375, 230], at: [480, 210], colour: LABEL_COLOURS.stomach },
    { text: 'pancreas', tag: 'pancreas', anchor: [300, 305], at: [480, 285], colour: LABEL_COLOURS.pancreas },
    { text: 'duodenum', tag: 'duodenum', anchor: [265, 325], at: [85, 295], colour: LABEL_COLOURS.duodenum },
    { text: 'small intestine', tag: 'small', anchor: [375, 335], at: [530, 345], colour: LABEL_COLOURS.small },
    { text: 'large intestine (colon)', tag: 'colon', anchor: [220, 375], at: [70, 350], colour: LABEL_COLOURS.colon },
    { text: 'rectum', tag: 'colon', anchor: [310, 485], at: [480, 385], colour: LABEL_COLOURS.colon }
  ];

  function labelPillBox(l, c = ctx) {
    c.font = LABEL_STYLE.font;
    const w = c.measureText(l.text).width + LABEL_STYLE.padX * 2;
    const h = LABEL_STYLE.height;
    return { x: l.at[0] - w / 2, y: l.at[1] - h / 2, w, h };
  }

  function drawOrganLabels(c) {
    c.save();
    for (const l of ORGAN_LABELS) {
      c.strokeStyle = svgColour(l.colour, 0.72);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(l.anchor[0], l.anchor[1]);
      c.lineTo(l.at[0], l.at[1]);
      c.stroke();
    }
    for (const l of ORGAN_LABELS) {
      const box = labelPillBox(l, c);
      c.fillStyle = 'rgba(2,6,23,0.9)';
      c.beginPath();
      c.roundRect(box.x, box.y, box.w, box.h, 9);
      c.fill();
      c.strokeStyle = svgColour(l.colour, 0.42);
      c.lineWidth = 1;
      c.stroke();
      c.font = LABEL_STYLE.font;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = l.colour;
      c.fillText(l.text, box.x + box.w / 2, box.y + box.h / 2);
    }
    c.restore();
  }

  function buildLabelCache() {
    const scale = staticCacheScale();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const c = canvas.getContext('2d');
    c.setTransform(scale, 0, 0, scale, 0, 0);
    drawOrganLabels(c);
    LABEL_CACHE.canvas = canvas;
    LABEL_CACHE.scale = scale;
  }

  function ensureLabelCache() {
    if (LABEL_CACHE.canvas && LABEL_CACHE.scale === staticCacheScale()) return;
    buildLabelCache();
  }

  function blitOrganLabels() {
    ensureLabelCache();
    ctx.drawImage(LABEL_CACHE.canvas, 0, 0, W, H);
  }

  function drawBadge() {
    // No meal means no location to badge — the readout says "No meal yet".
    if (headS === null) return;
    const s = clamp(headS, 0, TUBE_END);
    const mouthSpot = USE_SVG_ART && GEOM && mouthHold > 0 && GEOM.markers['Mouth badge'];
    const spot = mouthSpot || sampleAt(s);
    const text = mouthHold > 0
      ? (mouthHold > SWALLOW_SEC
        ? 'In the mouth — chewing, amylase at work'
        : 'Swallowing — the bolus is on its way down')
      : ORGAN_NAME[headOrgan] + ' · pH ' + phAt(s).toFixed(1);
    const sub = mouthHold > 0 ? 'smaller pieces = more surface for enzymes' : '';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.max(ctx.measureText(text).width, sub ? ctx.measureText(sub).width : 0) + 20;
    const x = clamp(spot.x - w / 2, 6, RAIL.x - w - 10);
    const y = Math.max(26, spot.y - gs(sub ? 66 : 50));
    ctx.fillStyle = 'rgba(2,6,23,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y - 12, w, sub ? 40 : 24, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(text, x + w / 2, y);
    if (sub) {
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.fillStyle = '#fbcfe8';
      ctx.fillText(sub, x + w / 2, y + 16);
    }
    return spot;
  }

  function drawChewingMotion(t) {
    if (!mouthHold || !USE_SVG_ART || !GEOM || !GEOM.markers || !GEOM.markers['Mouth badge']) return;
    const badge = GEOM.markers['Mouth badge'];
    const wave = Math.sin(t * Math.PI * 4);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.fillStyle = svgColour(ART_COLOURS.mouth, 0.3);
    ctx.strokeStyle = svgColour(ART_COLOURS.mouth, 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(badge.x + 3 + wave * 2, badge.y + 8 + wave * 0.8, 10, 4.6, -0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(badge.x - 11 + wave * 2, badge.y + 10 + wave * 0.8);
    ctx.quadraticCurveTo(badge.x + 1 + wave * 2, badge.y + 5 + wave * 0.8, badge.x + 12 + wave * 2, badge.y + 10 + wave * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawSurfacePill() {
    if (!mouthHold) return;
    if (!USE_SVG_ART || !GEOM || !GEOM.markers || !GEOM.markers['Mouth badge']) return;
    const badge = GEOM.markers['Mouth badge'];
    const text = 'surface area x ' + chewFactor.toFixed(2);
    ctx.save();
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 16;
    const x = clamp(badge.x - w - 18, 6, RAIL.x - w - 10);
    const y = badge.y + 26;
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y - 9, w, 18, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,207,232,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fbcfe8';
    ctx.fillText(text, x + 8, y);
    ctx.restore();
  }

  function drawDebug(spot) {
    if (!DEBUG || !GEOM) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < GEOM.pathPoints.length; i++) {
      const q = GEOM.pathPoints[i];
      if (i) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
    }
    ctx.stroke();
    ctx.font = '700 9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const p of particles) {
      const q = sampleAt(p.s);
      ctx.beginPath();
      ctx.arc(q.x, q.y, gs(6), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(250,204,21,0.95)';
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.fillText(p.s.toFixed(0), q.x + 8, q.y - 8);
    }
    if (spot) {
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(244,114,182,0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── Panels ──────────────────────────────────────────────
     The legend fills the right-hand column from the top; the footer
     fills the strip along the bottom. They do not touch. */

  function panel(r, alpha) {
    ctx.fillStyle = 'rgba(2,6,23,' + (alpha || 0.78) + ')';
    ctx.strokeStyle = 'rgba(148,163,184,0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.stroke();
  }

  function drawLegend() {
    const x = RAIL.x, y = RAIL.y, w = RAIL.w;
    panel(RAIL);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.fillStyle = COL.legend;
    ctx.fillText('WHAT IS IN THE MEAL', x + 18, y + 26);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = COL.labelDim;
    ctx.fillText('every part is broken down', x + 18, y + 42);
    ctx.fillText('somewhere different', x + 18, y + 56);

    const rows = [
      ['#fbbf24', 'Carbohydrate', 'mouth, then small', 'intestine'],
      ['#f472b6', 'Protein', 'stomach, then', 'small intestine'],
      ['#fb923c', 'Fat', 'small intestine —', 'bile must emulsify it'],
      ['#a3e635', 'Fibre', 'no human enzyme —', 'it reaches the colon']
    ];
    let ly = y + 84;
    for (const r of rows) {
      ctx.fillStyle = r[0];
      ctx.beginPath();
      ctx.arc(x + 24, ly - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(r[1], x + 38, ly);
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillStyle = COL.labelDim;
      ctx.fillText(r[2], x + 38, ly + 13);
      ctx.fillText(r[3], x + 38, ly + 25);
      ly += 42;
    }

    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, ly - 10);
    ctx.lineTo(x + w - 18, ly - 10);
    ctx.stroke();

    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = COL.legend;
    ctx.fillText('THE ENZYME IN CHARGE', x + 18, ly + 12);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = COL.labelDim;
    ctx.fillText('each one has a narrow pH window', x + 18, ly + 27);

    const s = clamp(headS === null ? 0 : headS, 0, TUBE_END);
    const organ = mouthHold > 0 ? 'mouth' : organAt(s);
    const ph = phAt(s);
    const working = mouthHold > SWALLOW_SEC || enzymesWorking(organ, ph);

    ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillStyle = working ? '#34d399' : '#f59e0b';
    ctx.fillText(ORGAN_NAME[organ], x + 18, ly + 50);
    ctx.font = '700 12px ui-monospace, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'right';
    ctx.fillText('pH ' + ph.toFixed(1), x + w - 18, ly + 50);
    ctx.textAlign = 'left';

    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = working ? '#34d399' : COL.labelDim;
    ctx.fillText(ORGAN_ENZYME[organ], x + 18, ly + 66);
  }

  function drawFooter() {
    const x = FOOT.x, y = FOOT.y, w = FOOT.w;
    panel(FOOT, 0.76);

    let mealG = 0, digG = 0;
    for (const n of NUTRIENTS) {
      mealG += n.grams;
      digG += Math.min(dig[n.key], n.grams);
    }
    const pct = mealG > 0 ? digG / mealG : 0;

    /* column 1: digested bar, then chewing */
    const bx = x + 20, bw = 290;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = COL.legend;
    ctx.fillText('DIGESTED', bx, y + 22);
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillStyle = pct > 0.8 ? '#10b981' : pct > 0.5 ? '#facc15' : '#f87171';
    ctx.fillText(Math.round(pct * 100) + '%', bx + bw - 4, y + 24);

    const barY = y + 34, barH = 13;
    ctx.fillStyle = 'rgba(51,65,85,0.9)';
    ctx.beginPath();
    ctx.roundRect(bx, barY, bw, barH, 6);
    ctx.fill();
    let cx = bx + 2;
    for (const n of NUTRIENTS) {
      const seg = mealG > 0 ? (bw - 4) * (Math.min(dig[n.key], n.grams) / mealG) : 0;
      ctx.fillStyle = n.colour;
      ctx.beginPath();
      ctx.roundRect(cx, barY + 2, Math.max(0, seg - 1), barH - 4, 3);
      ctx.fill();
      cx += seg;
    }

    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = COL.labelDim;
    ctx.fillText('chopped by enzymes into units small enough to absorb', bx, barY + barH + 14);

    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = COL.legend;
    ctx.fillText('SURFACE AREA', bx, y + 84);
    ctx.font = '800 15px ui-monospace, monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('×' + chewFactor.toFixed(2), bx + 100, y + 84);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = COL.labelDim;
    ctx.fillText('chew more and every enzyme goes faster', bx, y + 98);

    /* column 2: what actually crossed into the body */
    const ax = x + 336, aw = 300;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = COL.legend;
    ctx.fillText('ABSORBED INTO THE BODY', ax, y + 22);
    const rows = [
      ['Carbohydrate', absorbed.carb, 'portal vein → liver'],
      ['Protein', absorbed.protein, 'portal vein → liver'],
      ['Fat', absorbed.fat, 'lymph duct, not the blood']
    ];
    let ry = y + 40;
    for (const r of rows) {
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(r[0], ax, ry);
      ctx.font = '700 11px ui-monospace, monospace';
      ctx.fillStyle = COL.absorbed;
      ctx.textAlign = 'right';
      ctx.fillText(r[1].toFixed(1) + ' g', ax + aw - 4, ry);
      ctx.textAlign = 'left';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillStyle = COL.labelDim;
      ctx.fillText(r[2], ax, ry + 13);
      ry += 28;
    }

    /* column 3: colon water, insulin, leftovers */
    const wx = x + 664;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = COL.legend;
    ctx.fillText('COLON', wx, y + 22);

    const pairs = [
      ['water reabsorbed', Math.round(waterOut) + ' / ' + Math.round(waterIn) + ' mL', '#7dd3fc'],
      ['insulin released', insulin.toFixed(1) + ' mU/L', insulin > 0.4 ? '#facc15' : '#64748b'],
      ['left over', passed.length ? leftover().toFixed(0) + ' g' : '—',
        passed.length ? '#cbd5e1' : '#64748b']
    ];
    let py = y + 40;
    for (const p of pairs) {
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillStyle = COL.labelDim;
      ctx.fillText(p[0], wx, py);
      ctx.font = '700 12px ui-monospace, monospace';
      ctx.fillStyle = p[2];
      ctx.fillText(p[1], wx, py + 15);
      py += 28;
    }
  }

  function leftover() {
    return passed.reduce((a, p) => a + p.grams * (1 - p.dig * 0.65), 0);
  }

  const SVG_ART = { groups: null, arch: null, cache: null, scale: 0, measure: null };

  const SVG_PALETTE = {
    oesophagus: { fill: 'rgba(255,122,89,.24)', stroke: '#ff9a7a', glow: 'rgba(255,90,60,.16)', blur: 8 },
    stomach: { fill: 'rgba(220,20,60,.42)', stroke: '#dc143c', glow: 'rgba(220,20,60,.26)', blur: 13 },
    stomach_fundus: { fill: 'rgba(255,110,140,.62)', stroke: '#ff789e', glow: 'rgba(255,90,130,.22)', blur: 12 },
    liver: { fill: 'rgba(255,69,35,.62)', stroke: '#ff451f', glow: 'rgba(255,69,35,.30)', blur: 14 },
    liver_detail: { fill: 'rgba(255,89,40,.28)', stroke: '#ff5928', glow: 'rgba(255,89,40,.16)', blur: 6 },
    liver_glow: { fill: 'rgba(255,120,60,.22)', stroke: '#ff7840', glow: 'rgba(255,120,60,.16)', blur: 8 },
    gallbladder: { fill: 'rgba(57,255,20,.55)', stroke: '#39ff14', glow: 'rgba(57,255,20,.28)', blur: 14 },
    pancreas: { fill: 'rgba(255,0,255,.46)', stroke: '#ff3dff', glow: 'rgba(255,0,255,.26)', blur: 14 },
    duodenum: { fill: 'rgba(255,145,45,.44)', stroke: '#ff9a3d', glow: 'rgba(255,140,50,.22)', blur: 11 },
    small: { fill: 'rgba(255,92,78,.55)', stroke: '#ff6f61', glow: 'rgba(255,80,70,.26)', blur: 14, inner: 'rgba(255,190,175,.22)' },
    colon: { fill: 'rgba(216,192,240,.16)', stroke: '#d8c0f0', glow: 'rgba(196,162,235,.14)', blur: 9 },
    colon_detail: { fill: 'rgba(216,192,240,.12)', stroke: '#d8c0f0', glow: 'rgba(196,162,235,.12)', blur: 6 },
    outline: { fill: 'rgba(103,232,249,.04)', stroke: 'rgba(103,232,249,.16)', glow: 'rgba(34,211,238,.10)', blur: 6 },
    detail: { fill: 'rgba(148,163,184,.14)', stroke: '#94a3b8', glow: 'rgba(148,163,184,.10)', blur: 6 }
  };

  const SVG_HIDDEN_TAGS = new Set(['annotation', 'salivary', 'teeth', 'mouth']);
  const SVG_DRAW_ORDER = [
    'outline', 'oesophagus', 'duodenum', 'colon', 'liver_glow',
    'liver_detail', 'liver', 'pancreas', 'gallbladder', 'small',
    'stomach_fundus', 'stomach', 'detail'
  ];

  function svgColour(hex, alpha) {
    const v = hex.replace('#', '');
    const n = parseInt(v.length === 3 ? v.replace(/./g, (c) => c + c) : v, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function svgMeasureNode() {
    if (SVG_ART.measure) return SVG_ART.measure;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.left = '-9999px';
    const path = document.createElementNS(ns, 'path');
    svg.appendChild(path);
    document.body.appendChild(svg);
    SVG_ART.measure = { svg, path };
    return SVG_ART.measure;
  }

  function svgItemBox(item) {
    const measure = svgMeasureNode();
    measure.path.setAttribute('d', item.d);
    const box = measure.path.getBBox();
    const m = item.m;
    let minY = Infinity, maxY = -Infinity;
    for (const x of [box.x, box.x + box.width]) {
      for (const y of [box.y, box.y + box.height]) {
        const Y = m[1] * x + m[3] * y + m[5];
        if (Y < minY) minY = Y;
        if (Y > maxY) maxY = Y;
      }
    }
    return { minY, maxY };
  }

  function svgArtGroups() {
    if (SVG_ART.groups) return SVG_ART.groups;
    if (!GEOM || !GEOM.svgArt) return [];
    SVG_ART.groups = GEOM.svgArt.map((group) => ({
      tag: group.tag,
      items: group.items
        .filter((item) => {
          if (SVG_HIDDEN_TAGS.has(group.tag)) return false;
          const box = svgItemBox(item);
          return box.maxY > 100;
        })
        .map((item) => {
          const box = svgItemBox(item);
          return {
            m: item.m,
            fill: item.fill,
            stroke: item.stroke,
            strokeWidth: item.strokeWidth,
            minY: box.minY,
            maxY: box.maxY,
            path: new Path2D(item.d)
          };
        })
    }));
    return SVG_ART.groups;
  }

  function mouthPoints() {
    const first = GEOM.markers['feed first'];
    const badge = GEOM.markers['Mouth badge'];
    const join = { x: GEOM.landmarks.oesophagus.x, y: GEOM.landmarks.oesophagus.y };
    return { first, badge, join };
  }

  function mouthThroatPath(points) {
    const { badge, join } = points;
    const halfJoin = gs(TUBE_W / 2);
    const p = new Path2D();
    p.moveTo(badge.x - 8, badge.y + 4);
    p.bezierCurveTo(badge.x - 4, badge.y + 14, join.x - halfJoin - 1, join.y - 20, join.x - halfJoin, join.y + 1);
    p.lineTo(join.x + halfJoin, join.y + 1);
    p.bezierCurveTo(join.x + halfJoin + 1, join.y - 22, badge.x + 10, badge.y + 12, badge.x + 8, badge.y + 5);
    p.closePath();
    return p;
  }

  function mouthCavityPath(points) {
    const { first, badge } = points;
    const cx = (first.x + badge.x) / 2 - 2;
    const cy = (first.y + badge.y) / 2 + 2;
    const q = (x, y) => ({ x: cx + (x - cx) * 1.3, y: cy + (y - cy) * 1.3 });
    const a = q(first.x + 1, first.y - 7);
    const b = q(first.x + 16, first.y - 12);
    const c = q(first.x + 20, first.y + 1);
    const d = q(first.x + 13, first.y + 10);
    const e = q(badge.x + 18, badge.y - 10);
    const f = q(badge.x + 15, badge.y + 8);
    const g = q(badge.x + 7, badge.y + 12);
    const h = q(badge.x - 2, badge.y + 17);
    const i = q(badge.x - 17, badge.y + 13);
    const j = q(badge.x - 19, badge.y + 1);
    const k = q(badge.x - 22, badge.y - 10);
    const l = q(first.x - 9, first.y - 12);
    const p = new Path2D();
    p.moveTo(a.x, a.y);
    p.bezierCurveTo(b.x, b.y, c.x, c.y, d.x, d.y);
    p.bezierCurveTo(e.x, e.y, f.x, f.y, g.x, g.y);
    p.bezierCurveTo(h.x, h.y, i.x, i.y, j.x, j.y);
    p.bezierCurveTo(k.x, k.y, l.x, l.y, a.x, a.y);
    p.closePath();
    return p;
  }

  function paintMouthArt(c) {
    if (!GEOM || !GEOM.markers || !GEOM.landmarks) return;
    const points = mouthPoints();
    const colour = svgColour(ART_COLOURS.mouth, 1);
    const glow = svgColour(ART_COLOURS.mouth, 0.22);
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.shadowColor = glow;
    c.shadowBlur = 10;
    c.fillStyle = svgColour(ART_COLOURS.mouth, 0.2);
    c.fill(mouthThroatPath(points));
    c.shadowBlur = 0;
    c.strokeStyle = svgColour(ART_COLOURS.mouth, 0.62);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(points.badge.x - 8, points.badge.y + 4);
    c.bezierCurveTo(points.badge.x - 4, points.badge.y + 14, points.join.x - 11, points.join.y - 20,
      points.join.x - 10, points.join.y + 1);
    c.moveTo(points.badge.x + 8, points.badge.y + 5);
    c.bezierCurveTo(points.badge.x + 10, points.badge.y + 12, points.join.x + 11, points.join.y - 22,
      points.join.x + 10, points.join.y + 1);
    c.stroke();
    c.shadowColor = glow;
    c.shadowBlur = 12;
    c.fillStyle = svgColour(ART_COLOURS.mouth, 0.16);
    c.fill(mouthCavityPath(points));
    c.shadowBlur = 8;
    c.strokeStyle = svgColour(ART_COLOURS.mouth, 0.72);
    c.lineWidth = 2.4;
    c.stroke(mouthCavityPath(points));
    c.shadowBlur = 0;
    c.fillStyle = svgColour(ART_COLOURS.mouth, 0.26);
    c.beginPath();
    c.ellipse(points.badge.x + 3, points.badge.y + 8, 10, 4.6, -0.22, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = svgColour(ART_COLOURS.mouth, 0.5);
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
    return colour;
  }

  function svgOutlineGradient(c, stroke) {
    const g = c.createLinearGradient(0, 60, 0, 100);
    g.addColorStop(0, 'rgba(103,232,249,0)');
    g.addColorStop(1, stroke ? 'rgba(103,232,249,0.16)' : 'rgba(103,232,249,0.04)');
    return g;
  }

  function paintSvgArt(c) {
    if (!GEOM) return;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const groups = new Map(svgArtGroups().map((group) => [group.tag, group]));
    for (const tag of SVG_DRAW_ORDER) {
      const group = groups.get(tag);
      if (!group || !group.items.length) continue;
      const style = SVG_PALETTE[tag] || (tag === 'rectum' ? SVG_PALETTE.colon : SVG_PALETTE.detail);
      c.save();
      if (tag === 'outline') {
        c.beginPath();
        c.rect(0, 60, W, H - 60);
        c.clip();
      }
      if (tag === 'oesophagus') {
        c.beginPath();
        c.rect(0, ARC.oesophagus, W, H - ARC.oesophagus);
        c.clip();
      }
      for (const item of group.items) {
        c.save();
        c.transform(item.m[0], item.m[1], item.m[2], item.m[3], item.m[4], item.m[5]);
        if (item.fill !== 'none') {
          c.shadowColor = style.glow;
          c.shadowBlur = clamp(style.blur, 6, 14);
          c.fillStyle = tag === 'outline' ? svgOutlineGradient(c, false) : style.fill;
          c.fill(item.path);
          if (style.inner) {
            c.shadowBlur = 8;
            c.fillStyle = style.inner;
            c.fill(item.path);
          }
        }
        c.shadowBlur = 0;
        c.strokeStyle = tag === 'outline' ? svgOutlineGradient(c, true) : style.stroke;
        c.lineWidth = Math.max(0.9, item.strokeWidth || 1);
        c.stroke(item.path);
        c.restore();
      }
      c.restore();
    }
    paintMouthArt(c);
    c.restore();
  }

  function paintRouteGlow(c) {
    if (!DOT_ROUTES.portal || !DOT_ROUTES.lymph) return;
    c.save();
    c.beginPath();
    c.rect(0, DOT_NECK_Y, W, H - DOT_NECK_Y);
    c.clip();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const route of ['portal', 'lymph']) {
      const colour = COL[route];
      c.strokeStyle = svgColour(colour, 0.16);
      c.shadowColor = svgColour(colour, 0.22);
      c.shadowBlur = 8;
      c.lineWidth = 4;
      c.beginPath();
      DOT_ROUTES[route].forEach((p, i) => (i
        ? c.lineTo(p[0], p[1])
        : c.moveTo(p[0], p[1])));
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = svgColour(colour, 0.72);
      c.lineWidth = 1.5;
      c.stroke();
    }
    c.restore();
  }

  function buildSvgCache() {
    const scale = staticCacheScale();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const c = canvas.getContext('2d');
    c.setTransform(scale, 0, 0, scale, 0, 0);
    paintSvgArt(c);
    paintRouteGlow(c);
    SVG_ART.cache = canvas;
    SVG_ART.scale = scale;
  }

  function ensureSvgCache() {
    if (!USE_SVG_ART || !GEOM) return;
    if (SVG_ART.cache && SVG_ART.scale === staticCacheScale()) return;
    buildSvgCache();
  }

  function blitSvgArt() {
    if (SVG_ART.cache) ctx.drawImage(SVG_ART.cache, 0, 0, W, H);
  }

  const ART_COLOURS = { mouth: '#f9bb9d' };

  /* ── Render ─────────────────────────────────────────── */

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    if (USE_SVG_ART && GEOM) {
      blitSvgArt();
      LAYERS.forEach((L) => {
        drawVilli(L, t * 1.3);
        drawCapillaries(L);
        drawHaustra(L);
        drawWaves(L, t);
      });
      drawChewingMotion(t);
      drawParticles(t);
      drawDots();
      if (labels) blitOrganLabels();
    } else {
      ensureStaticCache();
      LAYERS.forEach((L, i) => {
        blit('wall-' + i);
        drawVilli(L, t * 1.3);
        drawCapillaries(L);
        blit('haustra-' + i);
        drawWaves(L, t);
      });
      blit('stomach');
      blit('liver');
      blit('vessels');
      drawGlands(t);
      drawParticles(t);
      drawDots();
      if (labels) blitOrganLabels();
    }
    const badgeSpot = drawBadge();
    drawSurfacePill();
    drawDebug(badgeSpot);
    drawLegend();
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    let mealG = 0, digG = 0;
    for (const n of NUTRIENTS) {
      mealG += n.grams;
      digG += Math.min(dig[n.key], n.grams);
    }
    const pct = mealG > 0 ? digG / mealG : 0;

    whereValue.textContent = mouthHold > 0
      ? (mouthHold > SWALLOW_SEC ? 'Mouth (chewing)' : 'Mouth (swallowing)')
      : particles.length
        ? ORGAN_NAME[headOrgan]
        : (passed.length ? 'Eliminated' : 'No meal yet');

    const pctText = Math.round(pct * 100) + '%';
    const pctColour = pct > 0.8 ? '#10b981' : pct > 0.5 ? '#facc15' : '#f87171';
    digestedValue.textContent = pctText;
    digestedValue.style.color = pctColour;

    energyValue.textContent = Math.round(
      absorbed.carb * KCAL.carb + absorbed.protein * KCAL.protein + absorbed.fat * KCAL.fat
    ) + ' kcal';

    glucoseValue.textContent = Math.round(glucose) + ' mg/dL';
    glucoseValue.style.color = glucose > 140 ? '#f59e0b'
                             : glucose > 110 ? '#facc15' : '#f1f5f9';

    waterValue.textContent = Math.round(waterOut) + ' mL';
    transitValue.textContent = (simMin / 60).toFixed(1) + ' h';

    footerPct.textContent = pctText;
    footerPct.style.color = pctColour;
    let barAt = 0;
    for (const n of NUTRIENTS) {
      const el = footerSegments[n.key];
      if (!el) continue;
      const width = mealG > 0 ? Math.min(dig[n.key], n.grams) / mealG * 100 : 0;
      el.style.left = barAt + '%';
      el.style.width = width + '%';
      barAt += width;
    }
    footerSurface.textContent = '×' + chewFactor.toFixed(2);
    footerAbsorbed.carb.textContent = absorbed.carb.toFixed(1) + ' g';
    footerAbsorbed.protein.textContent = absorbed.protein.toFixed(1) + ' g';
    footerAbsorbed.fat.textContent = absorbed.fat.toFixed(1) + ' g';
    footerWater.textContent = Math.round(waterOut) + ' / ' + Math.round(waterIn) + ' mL';
    footerInsulin.textContent = insulin.toFixed(1) + ' mU/L';
    footerInsulin.style.color = insulin > 0.4 ? '#facc15' : '#64748b';
    footerLeftover.textContent = passed.length ? leftover().toFixed(0) + ' g' : '—';

    if (interactions >= 8) EV.revealInsight();
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;
    if (!paused && dt > 0) step(dt);
    render(EV.visualTime(now));
    syncReadout();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Reset ──────────────────────────────────────────── */

  function applySliders() {
    peristalsis = Number(periEl.value) / 100;
    stomachPH = Number(acidEl.value) / 10;
    bileFlow = Number(bileEl.value) / 100;
    fibreGrams = Number(fibreEl.value);
  }

  /* Nothing is fed on load or on reset: the page opens on an empty
     body so the "Feed a meal" button and the chew window are both
     reachable. */
  function resetRun() {
    applySliders();
    particles = [];
    dots = [];
    passed = [];
    headS = null;
    headOrgan = 'mouth';
    phase = { entered: false, colon: false, done: false };
    absorbed = { carb: 0, protein: 0, fat: 0 };
    dig = { carb: 0, protein: 0, fat: 0, fibre: 0 };
    waterIn = 0; waterOut = 0; colonWater = 0;
    secreted = {};
    glucose = 90; insulin = 0; carbFlux = 0;
    simMin = 0; simSec = 0;
    chewFactor = 1;
    mouthHold = 0;
    interactions = 0;
    seed = 20260101;
    EV.resetInsight();
    syncReadout();
  }

  /* ── Events ─────────────────────────────────────────── */

  periEl.addEventListener('input', () => {
    periValue.textContent = (Number(periEl.value) / 100).toFixed(2) + '×';
    peristalsis = Number(periEl.value) / 100;
    interactions++;
  });
  acidEl.addEventListener('input', () => {
    acidValue.textContent = (Number(acidEl.value) / 10).toFixed(1);
    stomachPH = Number(acidEl.value) / 10;
    interactions++;
  });
  bileEl.addEventListener('input', () => {
    bileValue.textContent = Number(bileEl.value) + '%';
    bileFlow = Number(bileEl.value) / 100;
    interactions++;
  });
  fibreEl.addEventListener('input', () => {
    fibreValue.textContent = Number(fibreEl.value) + ' g';
    fibreGrams = Number(fibreEl.value);
    interactions++;
  });

  chewBtn.addEventListener('click', () => {
    if (chewFactor >= 3.4) {
      EV.say('Chewed as finely as it will go.');
      return;
    }
    chewFactor = Math.min(3.4, chewFactor + 0.24);
    interactions++;
    EV.say('Surface area is now ' + chewFactor.toFixed(2) + ' times.');
    syncReadout();
    render(EV.visualTime(performance.now()));
  });

  feedBtn.addEventListener('click', () => {
    if (feed()) interactions++;
    else EV.say('Wait for this meal to leave before feeding another.');
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    EV.label(pauseBtn, paused ? 'play' : 'pause', paused ? 'Play' : 'Pause');
  });

  EV.onReset(() => {
    periEl.value = 100;
    acidEl.value = 20;
    bileEl.value = 60;
    fibreEl.value = 10;
    periValue.textContent = '1.00×';
    acidValue.textContent = '2.0';
    bileValue.textContent = '60%';
    fibreValue.textContent = '10 g';
    paused = false;
    pauseBtn.setAttribute('aria-pressed', 'false');
    EV.label(pauseBtn, 'pause', 'Pause');
    resetRun();
  });

  /* Phase 1 overlay parity check */
  const _c = document.getElementById('stage');
  if (_c.width !== W || _c.height !== H) console.warn('Canvas size mismatch', _c.width, _c.height, 'expected', W, H);

  periValue.textContent = '1.00×';
  acidValue.textContent = '2.0';
  bileValue.textContent = '60%';
  fibreValue.textContent = '10 g';
  EV.onToggle(labelsBtn, () => {
    labels = !labels;
    render(EV.visualTime(performance.now()));
    return labels;
  });

  stage.onPaint = () => {
    ensureStaticCache();
    ensureSvgCache();
    render(EV.visualTime(performance.now()));
    syncReadout();
  };

  if (USE_WEBGL) {
    (async () => {
      try {
        const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
        const canvas = document.getElementById('stage');
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(W, H, false);
        scene.fog = new THREE.Fog(0x0f172a, 300, 900);
        window.__scene = scene; window.__THREE = THREE; window.__camera = camera; window.__renderer = renderer;
        const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
        camera.position.set(0, 0, 600);
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(200, 300, 400);
        const sh = { cx: 560, cy: 244, rx: 68, ry: 48, rot: -0.42 };
        const geo = new THREE.SphereGeometry(1, 32, 16);
        geo.scale(sh.rx, sh.ry, (sh.rx + sh.ry) / 2);
        const mat = new THREE.MeshPhysicalMaterial({ color: 0xf472b6, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, transmission: 0.15, thickness: 2 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(sh.cx - 450, -(sh.cy - 270), 0);
        mesh.rotation.z = sh.rot;
        const liver = { x: 262, y: 118, rx: 92, ry: 44 };
        const lgeo = new THREE.SphereGeometry(1, 32, 16);
        lgeo.scale(liver.rx, liver.ry, (liver.rx + liver.ry) / 2);
        const lmat = new THREE.MeshPhysicalMaterial({ color: 0x9f1239, roughness: 0.4, clearcoat: 0.3 });
        const lmesh = new THREE.Mesh(lgeo, lmat);
        lmesh.position.set(liver.x - 450, -(liver.y - 270), 0);
        const gb = { x: 212, y: 174, rx: 12, ry: 9 };
        const ggeo = new THREE.SphereGeometry(1, 16, 12);
        ggeo.scale(gb.rx, gb.ry, (gb.rx + gb.ry) / 2);
        const gmat = new THREE.MeshPhysicalMaterial({ color: 0x84cc16, roughness: 0.35, clearcoat: 0.5 });
        const gmesh = new THREE.Mesh(ggeo, gmat);
        gmesh.position.set(gb.x - 450, -(gb.y - 270), 0);
        const pz = { x: 470, y: 318, rx: 82, ry: 13, rot: -0.12 };
        const pgeo = new THREE.SphereGeometry(1, 24, 12);
        pgeo.scale(pz.rx, pz.ry, (pz.rx + pz.ry) / 2);
        const pmat = new THREE.MeshPhysicalMaterial({ color: 0xfbbf24, roughness: 0.4, clearcoat: 0.3 });
        const pmesh = new THREE.Mesh(pgeo, pmat);
        pmesh.position.set(pz.x - 450, -(pz.y - 270), 0);
        pmesh.rotation.z = pz.rot;
        const pts = [
          [462,74],[460,98],[544,196],[622,250],[566,300],[414,372],[432,410],[480,466],[430,518],[232,518],[150,452],[366,361],[730,334],[800,428],[604,514]
        ].map(p => new THREE.Vector3(p[0]-450, -(p[1]-270), 0));
        const curve = new THREE.CatmullRomCurve3(pts);
        const tgeo = new THREE.TubeGeometry(curve, 120, 6, 8, false);
        const tmat = new THREE.MeshPhysicalMaterial({ color: 0xf472b6, roughness: 0.55, clearcoat: 0.4 });
        const tmesh = new THREE.Mesh(tgeo, tmat);
        scene.add(tmesh);
        const bolusGeo = new THREE.SphereGeometry(8, 16, 12);
        const bolusMat = new THREE.MeshPhysicalMaterial({ color: 0xec4899, roughness: 0.3, clearcoat: 0.8 });
        const bolus = new THREE.Mesh(bolusGeo, bolusMat);
        scene.add(bolus);
        let bt = 0;
        const origLoop = loop;
        function loop2() {
          bt = (bt + 0.002) % 1;
          const p = curve.getPoint(bt);
          bolus.position.copy(p);
          renderer.render(scene, camera);
          requestAnimationFrame(loop2);
        }
        loop2();
      } catch (e) { console.warn('WebGL init failed, falling back to Canvas2D', e); resetRun(); start(); }
    })();
  } else {
    resetRun();
    start();
  }
})();