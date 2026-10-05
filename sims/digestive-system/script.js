(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────────
     Two coordinate spaces, on purpose.

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
  const FOOT = { x: 40, y: 400, w: 844, h: 128 };

  const MARGIN = 14;
  const AREA = {
    x: MARGIN, y: MARGIN,
    w: RAIL.x - MARGIN * 2,
    h: FOOT.y - MARGIN * 2
  };
  const FIGURE = { x: 60, y: 44, w: 750, h: 516 };

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
    /* mouth and pharynx, then down to the cardia */
    upper: [
      [ 462,  74], [ 460,  98], [ 464, 124], [ 472, 152], [ 492, 178],
      /* stomach: fundus high on the patient's left, body, then the antrum */
      [ 544, 196], [ 594, 214], [ 622, 250], [ 610, 282],
      /* pylorus, then the duodenum across to the patient's right, level with
         the pylorus the way the first part really runs */
      [ 566, 300], [ 532, 310], [ 498, 312], [ 466, 310],
      /* then the descending part: a steep dive down the patient's right,
         behind the sagging transverse colon, and on to the flexure. Steep on
         purpose — a shallow descent would run alongside the transverse colon
         instead of crossing it, and the pair would read as one fat tube. */
      [ 446, 312], [ 430, 330], [ 420, 350], [ 414, 372],
      [ 418, 396], [ 432, 410], [ 452, 416], [ 478, 416]
    ],
    /* jejunum and ileum: three sweeps, each one further to the patient's
       right, which is where they sit in the abdomen. The rows are 54 apart
       so that a villus on one row cannot reach the row below it. */
    small: [
      [ 520, 412], [ 600, 412], [ 690, 412], [ 736, 418],
      [ 740, 440],
      [ 734, 466], [ 660, 466], [ 570, 466], [ 480, 466],
      [ 428, 470], [ 412, 486],
      /* terminal ileum, across to the caecum in the right iliac fossa */
      [ 430, 518], [ 380, 520], [ 300, 520], [ 232, 518]
    ],
    /* caecum, colon frame, sigmoid and rectum */
    colon: [
      [ 198, 518], [ 168, 510], [ 152, 484], [ 150, 452],
      [ 154, 418], [ 170, 374], [ 206, 342],
      /* transverse colon, sagging under the pancreas, lowest just right of
         centre — which is also what keeps it clear of the descending
         duodenum, which has to dive behind it */
      [ 288, 353], [ 366, 361], [ 446, 363], [ 540, 358], [ 662, 347], [ 730, 334],
      /* splenic flexure, the high point, then down the patient's left */
      [ 768, 328], [ 792, 352], [ 800, 390], [ 800, 428],
      /* sigmoid and rectum, finishing near the midline */
      [ 800, 462], [ 792, 486], [ 762, 502], [ 716, 510], [ 662, 514],
      [ 604, 514], [ 548, 512]
    ]
  };

  const ANCHORS = TRACK.upper.concat(TRACK.small, TRACK.colon);

  const path = [];
  const cum = [];

  (function buildPath() {
    const a = ANCHORS;
    let total = 0;
    const push = (dx, dy) => {
      const x = gx(dx), y = gy(dy);
      if (path.length) {
        const prev = path[path.length - 1];
        total += Math.hypot(x - prev.x, y - prev.y);
      }
      path.push({ x: x, y: y });
      cum.push(total);
    };
    for (let i = 0; i < a.length - 1; i++) {
      const p0 = a[Math.max(0, i - 1)];
      const p1 = a[i];
      const p2 = a[i + 1];
      const p3 = a[Math.min(a.length - 1, i + 2)];
      for (let j = 0; j < 9; j++) {
        const t = j / 9, t2 = t * t, t3 = t2 * t;
        push(
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
                 (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                 (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
                 (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                 (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        );
      }
    }
    push(a[a.length - 1][0], a[a.length - 1][1]);
  })();

  const TUBE_END = cum[cum.length - 1];

  /* Arclength of the landmark nearest each design point. The names are
     what the rest of the file refers to, so the organ boundaries and
     the secretion trigger points cannot drift apart. */
  const ARC = {};

  (function findArcs() {
    const at = (key, dx, dy) => {
      const x = gx(dx), y = gy(dy);
      let best = 0, bd = 1e9;
      for (let i = 0; i < path.length; i++) {
        const d = Math.hypot(path[i].x - x, path[i].y - y);
        if (d < bd) { bd = d; best = i; }
      }
      ARC[key] = cum[best];
    };
    at('mouth', 460, 98);
    at('oesophagus', 472, 152);
    at('cardia', 492, 178);
    at('stomach', 594, 214);
    at('pylorus', 566, 302);
    at('duodenum', 452, 330);
    at('flexure', 478, 412);
    at('jejunum', 600, 412);
    at('ileum', 570, 466);
    at('caecum', 198, 518);
    at('hepatic', 206, 342);
    at('transverse', 540, 356);
    at('splenic', 768, 328);
    at('descending', 800, 428);
    at('rectum', 662, 514);
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
  const GALLBLADDER = { x: 212, y: 174, rx: 12, ry: 9 };
  const PANCREAS = { x: 470, y: 318, rx: 82, ry: 13, rot: -0.12 };
  const STOMACH_SHAPE = { cx: 560, cy: 244, rx: 68, ry: 48, rot: -0.42 };

  /* Where the visible upper part of the descending duodenum sits, so the
     bile and pancreatic ducts are drawn to it rather than to a coordinate
     typed in here. The rest of the duodenum passes behind the transverse
     colon, which is why the ducts stop at this point. */
  const DUODENUM = { x: 424, y: 336 };
  const PANCREATIC_HEAD = { x: 400, y: 322 };

  /* The portal vein leaves the small intestine at the pancreatic head and
     has to finish inside the liver, because that is the whole point of
     drawing it: sugars and amino acids go to the liver first. */
  const PORTAL = [[452, 336], [416, 300], [374, 266], [318, 228], [276, 192], [248, 152]];
  /* The lymph duct climbs out of the villi, behind the stomach, and up
     towards the left shoulder. */
  const LYMPH = [[690, 440], [738, 362], [762, 292], [770, 212], [752, 140], [724, 104]];

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
    { s: 0,               v: 60 },
    { s: ARC.oesophagus,  v: 34 },
    { s: ARC.stomach,     v: 2.8 },
    { s: ARC.pylorus,     v: 4.8 },
    { s: ARC.caecum,      v: 1.4 },
    { s: ARC.rectum,      v: 2.0 }
  ];

  function speedAt(s) {
    let v = SPEED[0].v;
    for (const step of SPEED) if (s >= step.s) v = step.v;
    return v;
  }

  const WAVE_STRIDE = 240;
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

  function routePoint(route, t) {
    const pts = route === 'lymph' ? LYMPH : PORTAL;
    const span = pts.length - 1;
    const seg = Math.min(span - 1, Math.floor(t * span));
    const f = clamp(t * span - seg, 0, 1);
    return {
      x: gx(pts[seg][0]) + (gx(pts[seg + 1][0]) - gx(pts[seg][0])) * f,
      y: gy(pts[seg][1]) + (gy(pts[seg + 1][1]) - gy(pts[seg][1])) * f
    };
  }

  function emitDot(type) {
    if (dots.length > 24) return;
    dots.push({
      t: 0,
      dur: 1.5 + rnd() * 0.5,
      route: type === 'fat' ? 'lymph' : 'portal',
      jx: (rnd() - 0.5) * gs(14),
      jy: (rnd() - 0.5) * gs(10)
    });
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
        ds = ds * 0.2 + churn * 1.3;
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
          while (p.emit >= 3) {
            p.emit -= 3;
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
  function traceLayer(L) {
    ctx.beginPath();
    const a = sampleAt(L.s0), b = sampleAt(L.s1);
    ctx.moveTo(a.x, a.y);
    for (let i = 0; i < path.length; i++) {
      if (cum[i] > L.s0 && cum[i] < L.s1) ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.lineTo(b.x, b.y);
  }

  function drawWall(L) {
    ctx.save();
    traceLayer(L);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = gs(TUBE_W);
    ctx.strokeStyle = COL.wallFull;
    ctx.stroke();
    ctx.lineWidth = gs(TUBE_W - 6);
    ctx.strokeStyle = COL.lumenFull;
    ctx.stroke();
    ctx.restore();
  }

  /* Villi, clipped to whichever layer is being drawn and to the stretch
     of tract that actually has them. */
  function drawVilli(L, t) {
    const inner = gs(VILLUS_INNER);
    const outer = gs(VILLUS_OUTER);
    const s0 = Math.max(L.s0, ARC.pylorus);
    const s1 = Math.min(L.s1, ARC.caecum);
    for (let s = s0; s < s1; s += 9) {
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

  function drawHaustra(L) {
    const s0 = Math.max(L.s0, ARC.caecum);
    const s1 = Math.min(L.s1, TUBE_END);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2.4;
    for (let s = s0; s < s1; s += 22) {
      const p = sampleAt(s);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(p.x + nx * side * gs(3), p.y + ny * side * gs(3));
        ctx.lineTo(p.x + nx * side * gs(10), p.y + ny * side * gs(10));
        ctx.stroke();
      }
    }
  }

  function drawStomach() {
    const sh = STOMACH_SHAPE;
    ctx.save();
    ctx.translate(gx(sh.cx), gy(sh.cy));
    ctx.rotate(sh.rot);
    ctx.fillStyle = COL.wallFull;
    ctx.beginPath();
    ctx.ellipse(0, 0, gs(sh.rx), gs(sh.ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.lumenFull;
    ctx.beginPath();
    ctx.ellipse(gs(4), gs(2), gs(sh.rx - 9), gs(sh.ry - 9), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(251,207,232,0.3)';
    ctx.lineWidth = 1.6;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-gs(sh.rx), gs(i * 10));
      ctx.quadraticCurveTo(0, gs(i * 10 + 6), gs(sh.rx), gs(i * 10));
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(gx(sh.cx), gy(sh.cy));
    ctx.rotate(sh.rot);
    ctx.strokeStyle = COL.wall;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, gs(sh.rx), gs(sh.ry), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawLiver() {
    ctx.beginPath();
    ctx.ellipse(gx(LIVER.x), gy(LIVER.y), gs(LIVER.rx), gs(LIVER.ry), 0, 0, Math.PI * 2);
    ctx.ellipse(gx(LIVER.lobe.x), gy(LIVER.lobe.y), gs(LIVER.lobe.rx), gs(LIVER.lobe.ry), 0.4, 0, Math.PI * 2);
    ctx.fillStyle = COL.liver;
    ctx.fill();
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  /* Bile and pancreatic juice both arrive at the duodenum, so the ducts
     are drawn to the duodenum's own coordinates rather than to numbers
     typed in here. */
  function drawGlands(t) {
    const gb = GALLBLADDER;
    const pa = PANCREAS;
    const du = DUODENUM;

    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.ellipse(gx(gb.x), gy(gb.y), gs(gb.rx), gs(gb.ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    /* bile duct: gallbladder -> behind the pancreas -> the duodenum */
    ctx.strokeStyle = COL.bile;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(gx(gb.x - 4), gy(gb.y + 8));
    ctx.quadraticCurveTo(gx(du.x + 30), gy(du.y - 40), gx(du.x + 6), gy(du.y - 2));
    ctx.stroke();

    const flow = 0.15 + 0.85 * bileFlow;
    ctx.fillStyle = 'rgba(163,230,53,0.85)';
    for (let i = 0; i < 6; i++) {
      const u = (t * 0.3 * flow + i / 6) % 1;
      ctx.beginPath();
      ctx.arc(gx(gb.x - 10 - u * 130), gy(gb.y + 14 + u * 156) + Math.sin(u * 7) * gs(4), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(gx(pa.x), gy(pa.y));
    ctx.rotate(pa.rot);
    ctx.fillStyle = COL.pancreas;
    ctx.beginPath();
    ctx.ellipse(0, 0, gs(pa.rx), gs(pa.ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    /* pancreatic duct: head -> the duodenum */
    ctx.strokeStyle = COL.pancreas;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(gx(PANCREATIC_HEAD.x), gy(PANCREATIC_HEAD.y));
    ctx.quadraticCurveTo(gx(du.x + 2), gy(du.y - 26), gx(du.x + 2), gy(du.y - 6));
    ctx.stroke();

    /* bicarbonate flushing the acid out of the duodenum */
    ctx.fillStyle = 'rgba(192,132,252,0.8)';
    for (let i = 0; i < 7; i++) {
      const u = (t * 0.26 + i / 7) % 1;
      ctx.beginPath();
      ctx.arc(gx(du.x - 16 + u * 60), gy(du.y - 2) + Math.sin(u * 6 + i) * gs(8), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawVessels() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = COL.portal;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    PORTAL.forEach((p, i) => (i ? ctx.lineTo(gx(p[0]), gy(p[1])) : ctx.moveTo(gx(p[0]), gy(p[1]))));
    ctx.stroke();
    ctx.strokeStyle = COL.lymph;
    ctx.lineWidth = 3;
    ctx.beginPath();
    LYMPH.forEach((p, i) => (i ? ctx.lineTo(gx(p[0]), gy(p[1])) : ctx.moveTo(gx(p[0]), gy(p[1]))));
    ctx.stroke();
    ctx.globalAlpha = 1;
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

  function drawParticles() {
    const shrink = 1 / Math.pow(chewFactor, 0.3);
    for (const p of particles) {
      const sp = sampleAt(p.s);
      const nx = -Math.sin(sp.a), ny = Math.cos(sp.a);
      const churn = p.s > ARC.stomach && p.s < ARC.pylorus
        ? Math.sin(simMin * 0.09 + p.phase) * gs(4)
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
  }

  function drawDots() {
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
  }

  /* ── Labels ──────────────────────────────────────────────
     Each label is placed in open space with a leader line back to the
     structure it names. The positions are all outside the tube's own
     corridor and outside both panels. */

  const LABELS = [
    { text: 'mouth',             at: [ 462,  74], to: [ 516,  70], colour: COL.legend },
    { text: 'oesophagus',        at: [ 472, 152], to: [ 548, 128], colour: COL.legend },
    { text: 'stomach',           at: [ 560, 220], to: [ 700, 196], colour: COL.legend },
    { text: 'liver',             at: [ 262,  92], to: [ 262,  64], colour: '#fb7185' },
    { text: 'gallbladder',       at: [ 212, 176], to: [ 148, 152], colour: '#a3e635' },
    { text: 'pancreas',          at: [ 500, 314], to: [ 700, 300], colour: '#e879f9' },
    { text: 'duodenum',          at: [ 428, 350], to: [ 340, 318], colour: COL.legend },
    { text: 'small intestine',   at: [ 428, 466], to: [ 300, 415], colour: COL.legend },
    { text: 'large intestine',   at: [ 168, 396], to: [ 120, 300], colour: COL.legend },
    { text: 'rectum',            at: [ 662, 514], to: [ 700, 560], colour: COL.legend }
  ];

  const VESSEL_LABELS = [
    { text: 'portal vein → liver', at: [ 180, 214], colour: 'rgba(147,197,253,0.9)' },
    { text: 'lymph duct',          at: [ 716, 258], colour: 'rgba(252,211,77,0.9)' }
  ];

  function label(text, x, y, colour) {
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colour || COL.labelDim;
    ctx.fillText(text, x, y);
  }

  function leader(text, dx, dy, lx, ly, colour) {
    const tx = gx(dx), ty = gy(dy);
    const ex = gx(lx), ey = gy(ly);
    ctx.strokeStyle = 'rgba(148,163,184,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    label(text, ex, ey - 9, colour);
  }

  function drawLabels() {
    if (!labels) return;
    for (const l of LABELS) leader(l.text, l.at[0], l.at[1], l.to[0], l.to[1], l.colour);
    for (const l of VESSEL_LABELS) label(l.text, gx(l.at[0]), gy(l.at[1]), l.colour);
  }

  function drawBadge() {
    const s = clamp(headS === null ? 0 : headS, TUBE_END);
    const spot = sampleAt(s);
    const text = mouthHold > 0
      ? (mouthHold > SWALLOW_SEC
        ? 'In the mouth — chewing, amylase at work'
        : 'Swallowing — the bolus is on its way down')
      : ORGAN_NAME[headOrgan] + ' · pH ' + phAt(s).toFixed(1);
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 20;
    const x = clamp(spot.x - w / 2, 6, RAIL.x - w - 10);
    const y = Math.max(26, spot.y - gs(46));
    ctx.fillStyle = 'rgba(2,6,23,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, y - 12, w, 24, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(text, x + w / 2, y);
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

  /* ── Render ─────────────────────────────────────────── */

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    for (const L of LAYERS) {
      drawWall(L);
      drawVilli(L, t * 1.3);
      drawCapillaries(L);
      drawHaustra(L);
      drawWaves(L, t);
    }
    drawStomach();
    drawLiver();
    drawVessels();
    drawGlands(t);
    drawParticles();
    drawDots();
    drawLabels();
    drawBadge();
    drawLegend();
    drawFooter();
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

    digestedValue.textContent = Math.round(pct * 100) + '%';
    digestedValue.style.color = pct > 0.8 ? '#10b981' : pct > 0.5 ? '#facc15' : '#f87171';

    energyValue.textContent = Math.round(
      absorbed.carb * KCAL.carb + absorbed.protein * KCAL.protein + absorbed.fat * KCAL.fat
    ) + ' kcal';

    glucoseValue.textContent = Math.round(glucose) + ' mg/dL';
    glucoseValue.style.color = glucose > 140 ? '#f59e0b'
                             : glucose > 110 ? '#facc15' : '#f1f5f9';

    waterValue.textContent = Math.round(waterOut) + ' mL';
    transitValue.textContent = (simMin / 60).toFixed(1) + ' h';

    if (interactions >= 8) EV.revealInsight();
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;
    if (!paused && dt > 0) step(dt);
    render(EV.visualTime(dt));
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

  /* ── Init ───────────────────────────────────────────── */

  periValue.textContent = '1.00×';
  acidValue.textContent = '2.0';
  bileValue.textContent = '60%';
  fibreValue.textContent = '10 g';
  EV.onToggle(labelsBtn, () => { labels = !labels; return labels; });
  resetRun();
  start();
})();