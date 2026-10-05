(() => {
  'use strict';

  /* ══ Layout ═══════════════════════════════════════════════
     The canvas is 1000×600 so that the header and the whole canvas
     still fit inside the 1080×675 card crop the README requires —
     a taller canvas would slice the traces off the bottom.        */

  const W = 1000, H = 600;

  // The anatomy is authored in a taller space than the finished frame
  // has room for, so it is drawn once at that size and scaled down into
  // its panel. Keeping the authored size means the shapes do not have to
  // be re-tuned every time the frame changes. SRC bounds the authored
  // drawing: x from the systemic particle track coming back down the
  // pulmonary side to the far end of the aortic particle track, y from
  // the arch branches to the deepest hypertrophic myocardium.
  const ANAT = { x: 20, y: 28, w: 584, h: 378 };
  // Measured from anatomy-only renders (getImageData, canvas-relative so the
  // canvas offset inside the page cannot skew it), unioned over 14 animation
  // phases because the heart bobs: authored x 151..624, y 7..550. The old box claimed x 112..690, which is both too wide and
  // shifted left, so the fit was height-limited while the heart ran off the
  // right edge and left a bare strip on the left. Correcting it only changes
  // K and the centring translate -- no authored path data is touched.
  const SRC = { x: 150, y: 6, w: 475, h: 545 };
  // The fit is height-limited (378/481), so at 1.0 the heart fills the panel
  // top to bottom and leaves no routing room. Backing it off is uniform: no
  // proportions or stroke weights change. It buys the margins either side
  // that the lungs and the systemic bed need.
  const ANAT_FIT = 0.86;
  const ANAT_K = Math.min(ANAT.w / SRC.w, ANAT.h / SRC.h) * ANAT_FIT;
  const ANAT_TX = ANAT.x + (ANAT.w - SRC.w * ANAT_K) / 2 - SRC.x * ANAT_K;
  const ANAT_TY = ANAT.y + (ANAT.h - SRC.h * ANAT_K) / 2 - SRC.y * ANAT_K;

  // Pressure-volume loop, top right, level with the anatomy.
  const PV_BOX = { x: 612, y: ANAT.y, w: 368, h: ANAT.h };
  const PV_PLOT = { x: PV_BOX.x + 34, y: PV_BOX.y + 30, w: PV_BOX.w - 56, h: PV_BOX.h - 74 };
  // Volume tops out at 168 mL, which is 120 x the highest preload the slider
  // offers, so 180 leaves the loop clear of the right-hand wall. Pressure has
  // to rescale instead: the model reaches 440 mmHg of LV pressure with every
  // slider at its limit, and a loop flattened against a fixed ceiling says
  // something quite different from the peak printed beside it.
  const PV_VMAX = 180;    // mL
  const PV_PMAX = 220;    // mmHg, the starting rung; see makeScale()

  // Bedside-monitor strip across the bottom.
  const ECG_BOX = { x: 20, y: 414, w: 960, h: 86 };
  const ART_BOX = { x: 20, y: 506, w: 960, h: 86 };

  const PX_PER_SEC = 100; // one ECG large box (0.2 s) is 20 px

  const COL = {
    muscle: '#8e3b46',
    muscleLit: '#c26570',
    muscleDark: '#5d2730',
    septum: '#a04a52',
    deox: '#3b82f6',
    deoxLit: '#93c5fd',
    oxy: '#ef4444',
    oxyLit: '#fca5a5',
    ecg: '#4ade80',
    art: '#f472b6',
    loop: '#38bdf8',
    text: '#cbd5e1',
    dim: '#94a3b8',
    faint: '#475569',
    grid: '#1e3a5f'
  };

  /* ══ Physiology ══════════════════════════════════════════
     Every number on screen comes out of this model, so nothing
     here can drift from the waveforms. Three ideas:

       • Timing. Atrial systole and ventricular ejection are
         near-constant in seconds, so a faster heart is paid
         for out of the filling time.

       • Elastance. LV pressure is E(a)·(V − V0) with E ramping
         through systole. Because the top of that ramp is what
         fixes end-systolic volume, pump strength and afterload
         move stroke volume on their own.

       • Windkessel. Stroke volume entering a compliant aorta is
         what makes the pulse pressure, so the arterial trace is
         downstream of the beat rather than drawn separately.   */

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smoothstep = (x) => x * x * (3 - 2 * x);
  const lerp = (a, b, t) => a + (b - a) * t;

  function timing(hr) {
    const T = 60 / hr;
    const Ta = 0.08;
    const Ts = clamp(0.34 - 0.16 * (hr - 60) / 120, 0.18, 0.34);
    const Tf = Math.max(0.02, T - Ta - Ts);
    const ivc = 0.25 * Ts, ivr = 0.12 * Tf, rf = 0.35 * Tf;
    return {
      T, Ta, Ts, Tf, ivc, ivr, rf,
      tIVCEnd: Ta + ivc, tEjEnd: Ta + Ts,
      tIVREnd: Ta + Ts + ivr, tRFEnd: Ta + Ts + ivr + rf
    };
  }

  const V0 = 0;        // the pressure-volume line extrapolates to ~zero volume
  const E_DIA = 0.08;
  const E_SYS = 2.45;
  const K_OUT = 15.5;  // mL/s per mmHg^1.5 through a normal aortic valve
  const C_AORTA = 0.85;    // mL/mmHg
  const R_AORTA = 1.25;    // mmHg.s/mL, whole-body resistance at 1.0
  const P_VEN = 4;
  const MMHG_ML_TO_J = 1.33322e-4;   // mmHg.mL -> joules
  const Q_FILL_REF = 430;  // peak transmitral flow at rest, mL/s
  const TAU_FILL = 0.20;
  // Passive filling gets four fifths of end-diastolic volume and atrial
  // systole the remainder, so the two always add up to exactly one EDV
  // whatever the preload slider says. That split is the whole reason
  // fibrillation costs real stroke volume instead of nothing at all.
  const PASSIVE_SHARE = 0.78;

  function elastance(a, contract) {
    if (a <= 0 || a >= 1) return E_DIA * contract;
    return contract * (E_DIA + E_SYS * Math.pow(a, 1.15));
  }

  /* Below 100 % the valve narrows and the LV has to build more
     pressure to push the same blood through it. */
  function outflow(valve) {
    const narrow = 1 - valve;
    return { narrow, k: K_OUT * valve, grad: 3 + 110 * Math.pow(narrow, 1.6) };
  }

  /* Once the valve shuts, pressure falls fast, flattens at the
     dicrotic notch (a reflected wave), rises a little, then leaks
     away slowly. One exponential cannot do that. Normalised over the
     diastolic period so it lands exactly on the diastolic pressure the
     circuit is predicted to reach by then (see the runoff in step()). */
  const RUNOFF = [[0, 0], [0.32, 0.46], [0.52, 0.39], [0.75, 0.70], [1.00, 1.00]];

  function runoffShape(u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    for (let i = 1; i < RUNOFF.length; i++) {
      const [x1, y1] = RUNOFF[i], [x0, y0] = RUNOFF[i - 1];
      if (u <= x1) return y0 + (y1 - y0) * smoothstep((u - x0) / (x1 - x0));
    }
    return 1;
  }

  function ecgAt(tc, t, afib, jitter) {
    const g = (x, mu, s) => Math.exp(-0.5 * Math.pow((x - mu) / s, 2));
    let v = 0;
    // In fibrillation the QRS complexes are still there. What is lost
    // is the organised P wave, and the rhythm goes irregularly irregular.
    if (!afib) v += 0.13 * g(tc, 0.020, 0.024);                    // P
    v += 1.00 * g(tc, t.tIVCEnd, 0.011)                            // R
       - 0.10 * g(tc, t.tIVCEnd - 0.030, 0.009)                     // Q
       - 0.28 * g(tc, t.tIVCEnd + 0.033, 0.013)                     // S
       + 0.27 * g(tc, t.tEjEnd + 0.055, 0.042);                     // T
    return v + (afib ? 0.045 : 0.006) * jitter;
  }

  /* ── State ──────────────────────────────────────────────── */

  function makeState() {
    return {
      tc: 0, cycleLen: 60 / 70, aoAtEj: null, jitter: 0, seed: 12345,
      V: 106, P: 8, ao: 80, sbp: 120, dbp: 80, sbpLive: 120, dbpLive: 80, pao: 8, pLa: 6,
      rvV: 118, rvP: 6,
      mitral: false, aortic: false, tricuspid: false, pulm: false,
      sysC: 0, isoC: 0, fillC: 0, ejectC: 0,
      q: 0, qFill: 0,
      edv: 120, esv: 52, beatMax: 0, beatMin: 1e9,
      lvPeak: 0, aoPeak: 0, mapSum: 0, mapT: 0, map: 96,
      workAcc: 0, work: 1.0,
      phase: 'Filling', phaseKey: 'rf'
    };
  }

  function phaseAt(tc, t, afib) {
    if (!afib && tc < t.Ta) return ['Atrial systole', 'atrial'];
    if (tc < t.tIVCEnd) return ['Contracting', 'ivc'];
    if (tc < t.tEjEnd) return ['Ejecting', 'ej'];
    if (tc < t.tIVREnd) return ['Relaxing', 'ivr'];
    if (tc < t.tRFEnd) return ['Filling', 'rf'];
    return ['Filling slowly', 'dia'];
  }

  function rnd(s) {
    s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
    return s.seed / 4294967296 - 0.5;
  }

  function step(s, dt, p) {
    const t = timing(p.hr);
    const al = outflow(p.valve);
    const rArt = R_AORTA * p.resistance;
    const edv = 120 * p.preload;

    s.tc += dt;
    // Latch each completed beat. A `while` rather than an `if`: a preset
    // change or a long frame can push `tc` past more than one cycle, and
    // dropping the extra cycles would leave `tc` negative and skip phases.
    while (s.tc >= s.cycleLen) {
      s.edv = s.beatMax || edv;
      s.esv = s.beatMin < 1e8 ? s.beatMin : edv * 0.45;
      s.beatMax = 0; s.beatMin = 1e9;
      s.tc -= s.cycleLen;
      s.cycleLen = p.afib ? t.T * (1 + 0.24 * rnd(s)) : t.T;
      // The live pair tracks the beat in progress; the reported pair holds
      // the last completed beat, so the readout shows one settled BP per
      // beat instead of dropping back to diastolic every time a beat starts.
      s.dbp = s.dbpLive;
      s.sbp = s.sbpLive;
      s.dbpLive = s.ao;
      s.sbpLive = s.ao;
      s.lvPeak = 0;
      s.aoPeak = 0;
      s.work = s.workAcc * MMHG_ML_TO_J;
      s.workAcc = 0;
    }
    const tc = s.tc;
    const a = (tc - t.Ta) / t.Ts;
    const f = (tc - t.tEjEnd) / t.Tf;
    s.jitter += (rnd(s) - s.jitter) * Math.min(1, dt * 30);

    /* ── volume: flow-limited filling ─────────────────────── */
    const qFill0 = clamp(Q_FILL_REF * Math.pow(0.58 / t.Tf, 0.7), 300, 1100);
    let qAo = 0;
    const inSys = tc >= t.Ta && tc < t.tEjEnd;
    s.qFill = 0;

    /* Filling is split in two the way it actually is. Passive inflow on
       its own tops the ventricle up to roughly four fifths of end-diastolic
       volume, and the atrial kick supplies the rest. Giving the whole of
       end-diastolic volume to passive filling would make the kick
       invisible and, worse, would make losing atrial contraction — the
       defining feature of fibrillation — cost no stroke volume at all. */
    const vPassive = edv * PASSIVE_SHARE;

    if (tc < t.Ta) {
      // Atrial systole: one smooth half-sine pulse across Ta. Its peak is
      // scaled so the pulse delivers exactly (1 - PASSIVE_SHARE) x EDV —
      // integral of a half-sine is 2/pi times peak times Ta — which is what
      // tops the ventricle up from its passive volume to end-diastolic.
      // A fibrillating atrium only quivers, so what arrives is a small
      // irregular dribble instead of the pulse.
      const kick = p.afib ? 0.16 * (1 + 0.6 * rnd(s)) : 1;
      const peak = kick * (1 - PASSIVE_SHARE) * edv * Math.PI / (2 * t.Ta);
      s.qFill = peak * Math.sin(Math.PI * tc / t.Ta);
      s.V = Math.min(edv, s.V + s.qFill * dt);
    } else if (f >= 0) {
      const tau = tc - t.tEjEnd;
      if (tau >= t.ivr) {
        // Rapid filling is quick and front-loaded; diastasis is the slow
        // creep after it. Neither gets the ventricle all the way to
        // end-diastolic volume on its own — the atrial kick is what
        // completes it.
        s.qFill = qFill0 * Math.exp(-(tau - t.ivr) / TAU_FILL) + 4;
        s.V = Math.min(vPassive, s.V + s.qFill * dt);
      }
    }

    /* ── LV pressure from the current elastance ───────────── */
    s.P = Math.max(0, elastance(inSys ? clamp(a, 0, 1) : 0, p.contract) * (s.V - V0));
    if (s.P > s.lvPeak) s.lvPeak = s.P;

    /* ── trans-valve flow into the aorta ──────────────────── */
    s.aortic = false;
    if (inSys) {
      const dP = s.P - s.ao - al.grad;
      if (dP > 0) {
        qAo = Math.min(al.k * Math.pow(dP, 1.5), Math.max(0, s.V - 15) / Math.max(dt, 1e-6));
        s.V -= qAo * dt;
        s.aortic = true;
      }
    }
    s.q = qAo;

    if (s.aortic) {
      s.workAcc += s.P * qAo * dt;      // mmHg.mL of stroke work
      s.ao += ((qAo - (s.ao - P_VEN) / rArt) / C_AORTA) * dt;
      s.aoAtEj = null;
    } else if (tc >= t.tEjEnd) {
      if (s.aoAtEj === null) s.aoAtEj = s.ao;
      const tDia = Math.max(1e-3, s.cycleLen - t.tEjEnd);
      const u = (tc - t.tEjEnd) / tDia;
      /* Where the hand-drawn runoff has to land. Once the aortic valve
         shuts, the aorta can only bleed through the systemic resistance, so
         a diastolic period later the pressure is exp(-tDia/RC) of the way
         back toward venous pressure. Feeding that in is what makes arterial
         resistance — and heart rate, through tDia — actually move the
         diastolic pressure.

         It used to aim at `s.dbpLive`, which is itself assigned from `s.ao`
         at the end of every cycle, and which the runoff had just driven
         exactly to `s.dbpLive`. That made the diastolic pressure a fixed
         point pinned near its initial 80 mmHg: sliding arterial resistance
         from 0.3 to 1.8 moved it by 3 mmHg, and the High blood pressure
         preset was no more than a raised systolic. */
      const tau = Math.max(0.05, rArt * C_AORTA);
      const pd = P_VEN + (s.aoAtEj - P_VEN) * Math.exp(-tDia / tau);
      s.ao = s.aoAtEj - (s.aoAtEj - pd) * runoffShape(u);
    } else {
      s.aoAtEj = null;
      s.ao += ((qAo - (s.ao - P_VEN) / rArt) / C_AORTA) * dt;
    }
    if (s.ao > s.sbpLive) s.sbpLive = s.ao;
    if (s.aortic && s.ao > s.aoPeak) s.aoPeak = s.ao;

    /* ── valves and filling fractions ─────────────────────── */
    /* The atrioventricular valves stand open through the whole of diastole,
       atrial systole included — that is precisely the window the atrial kick
       uses to push its share of the volume through them. They used to be
       drawn shut for `tc < Ta`, which had the leaflets closed over a gap
       carrying up to 500 mL/s, so the one moment the help text points a
       learner at ("watch the valves") was showing them backwards. */
    const fillT = tc - t.tEjEnd;
    s.mitral = fillT >= t.ivr || tc < t.Ta;
    s.tricuspid = s.mitral;
    s.pulm = s.aortic;
    s.pLa = p.afib ? 6 + 0.9 * rnd(s)
      : 5 + 11 * Math.exp(-Math.pow((tc - t.Ta * 0.45) / (t.Ta * 0.42), 2));

    const ivcSpan = t.tIVCEnd - t.Ta;
    const ejSpan = t.tEjEnd - t.tIVCEnd;
    s.isoC = tc >= t.Ta && tc < t.tIVCEnd ? smoothstep(clamp((tc - t.Ta) / ivcSpan, 0, 1)) : 0;
    s.sysC = tc < t.Ta ? 0
      : clamp((tc - t.Ta) / (ivcSpan + 0.45 * ejSpan), 0, 1);
    if (tc > t.tEjEnd) s.sysC *= 1 - smoothstep(clamp((tc - t.tEjEnd) / (0.6 * t.ivr + 0.001), 0, 1));
    s.fillC = fillT >= t.ivr ? clamp(s.qFill / 420, 0, 1.4) : 0;
    s.ejectC = clamp(qAo / 420, 0, 1.6);

    /* ── right heart ───────────────────────────────────────
       The two sides sit in series so they must move the same
       stroke volume; the RV therefore tracks the LV's volume
       excursion and its pressures are a scaled copy. */
    s.rvV = (edv + 12) - (edv - s.V);
    s.rvP = s.P * 0.21;
    if (s.aortic) s.pao = Math.max(2, s.rvP);
    else s.pao += (-(s.pao - 4) / (rArt * 2.2)) / 0.62 * dt;

    /* ── beat volume tracking, phase, mean pressure ───────── */
    if (s.V > s.beatMax) s.beatMax = s.V;
    if (inSys && s.V < s.beatMin) s.beatMin = s.V;
    const [name, key] = phaseAt(tc, t, p.afib);
    s.phase = name; s.phaseKey = key;
    s.mapSum += s.ao * dt; s.mapT += dt;
    if (s.mapT >= 1.0) { s.map = s.mapSum / s.mapT; s.mapSum = 0; s.mapT = 0; }

    return t;
  }

  /* ══ Geometry helpers ═════════════════════════════════════ */

  /* A polyline sampled by arc length, with each vertex tagged with
     which flow drives it — that is what lets blood particles stop
     dead when the valves shut. */
  class Track {
    constructor(segs) {
      this.pts = [];
      let total = 0;
      for (const [src, list] of segs) {
        for (let i = 0; i < list.length; i++) {
          if (this.pts.length) {
            const prev = this.pts[this.pts.length - 1];
            total += Math.hypot(list[i].x - prev.x, list[i].y - prev.y);
          }
          this.pts.push({ x: list[i].x, y: list[i].y, s: total, src });
        }
      }
      // A malformed point makes the running length NaN, and a NaN length
      // used to be swallowed by `total || 1`, which silently collapsed the
      // whole track to length 1 and scattered its particles as NaN. Fail
      // loudly instead -- a broken path is a bug, not a cosmetic glitch.
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error('Track: points do not form a usable path (total=' + total + ')');
      }
      this.total = total;
    }

    at(s) {
      const p = this.pts;
      const d = ((s % this.total) + this.total) % this.total;
      let lo = 0, hi = p.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (p[mid].s <= d) lo = mid; else hi = mid;
      }
      const a = p[lo], b = p[hi];
      const seg = b.s - a.s || 1;
      const u = clamp((d - a.s) / seg, 0, 1);
      return {
        x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), src: a.src,
        dx: (b.x - a.x) / seg, dy: (b.y - a.y) / seg
      };
    }
  }

  /* Heart landmarks. LVY is the atrioventricular groove — the line where the
    atria meet the ventricles — and everything below it belongs to the
    ventricular mass. LVX is that line's midpoint. Because the whole
    ventricular mass moves toward the apex as it contracts, placing every
    ventricle-relative landmark as a fraction of VENT_H keeps the drawing
    in proportion. */
  const LVX = 430, LVY = 250;
  const VENT_H = 262;   // groove to apex: tall enough that the mass tapers

  const G = {
    // One apex, shared. The two ventricles are one muscle mass with a
    // septum inside it, so both outlines have to land on the same point --
    // when they each picked their own, the silhouette ended in two feet.
    apex: { x: LVX + 4, y: LVY + VENT_H },
    lvTopL: { x: LVX - 50, y: LVY },
    lvTopR: { x: LVX + 50, y: LVY },
    rvBase: { x: LVX - 156, y: LVY + 8 },
    // The atria sit down on the groove rather than hovering above it, so
    // the four chambers read as one continuous mass.
    raC: { x: LVX - 152, y: LVY - 64, rx: 74, ry: 56 },
    laC: { x: LVX + 80, y: LVY - 50, rx: 70, ry: 54 },
    aortic: { x: LVX + 4, y: LVY - 86 },
    pulmonary: { x: LVX - 94, y: LVY - 66 },
    tricuspid: { x: LVX - 152, y: LVY - 22 },
    mitral: { x: LVX + 26, y: LVY - 20 }
  };

  function lvPath(ctx) {
    const A = G.apex;
    ctx.beginPath();
    ctx.moveTo(G.lvTopL.x, G.lvTopL.y);
    ctx.bezierCurveTo(G.lvTopL.x - 5, LVY + 0.35 * VENT_H, A.x - 62, LVY + 0.78 * VENT_H, A.x, A.y);
    ctx.bezierCurveTo(A.x + 40, LVY + 0.71 * VENT_H, G.lvTopR.x + 7, LVY + 0.27 * VENT_H, G.lvTopR.x, G.lvTopR.y);
    ctx.bezierCurveTo(G.lvTopR.x - 23, LVY - 24, G.lvTopL.x + 23, LVY - 24, G.lvTopL.x, G.lvTopL.y);
    ctx.closePath();
  }

  /* The right ventricle is a crescent wrapping the left, so it reaches
     almost to the apex and its free wall is the long convex sweep on the
     outside. That sweep is most of what makes the silhouette read as a
     heart rather than a box. */
  function rvPath(ctx) {
    const b = G.rvBase, A = G.apex;
    ctx.beginPath();
    ctx.moveTo(b.x - 76, b.y - 9);
    ctx.bezierCurveTo(b.x - 96, b.y + 0.31 * VENT_H, A.x - 92, LVY + 0.86 * VENT_H, A.x - 6, A.y - 4);
    ctx.bezierCurveTo(A.x + 4, LVY + 0.80 * VENT_H, b.x + 84, b.y + 0.27 * VENT_H, b.x + 72, b.y - 3);
    ctx.bezierCurveTo(b.x + 24, b.y - 32, b.x - 34, b.y - 35, b.x - 76, b.y - 9);
    ctx.closePath();
  }

  function ellipsePath(ctx, c) {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
  }

/* Vessel centrelines, drawn as thick strokes. The particle tracks
     reuse the same lines so blood always runs where the vessel is.
     The aorta arches right and the cavae come down the left, which is what
     spreads the great vessels across the top and stops the whole drawing
     from reading as one narrow cone. */
  const AORTA = [
    { x: G.aortic.x, y: G.aortic.y },
    { x: G.aortic.x + 4, y: LVY - 164 },
    { x: G.aortic.x + 54, y: LVY - 202 },
    { x: G.aortic.x + 132, y: LVY - 190 },
    { x: G.aortic.x + 164, y: LVY - 124 },
    { x: G.aortic.x + 170, y: LVY + 4 }
  ];
  const PULM_TRUNK = [
    { x: G.pulmonary.x, y: G.pulmonary.y },
    { x: G.pulmonary.x - 14, y: LVY - 134 },
    { x: G.pulmonary.x - 60, y: LVY - 178 },
    { x: G.pulmonary.x - 140, y: LVY - 188 }
  ];
  const SVC = [
    { x: G.raC.x - 16, y: LVY - 210 },
    { x: G.raC.x - 14, y: LVY - 158 },
    { x: G.raC.x - 10, y: G.raC.y - 46 }
  ];
  const IVC = [
    { x: G.raC.x - 62, y: LVY + 134 },
    { x: G.raC.x - 58, y: LVY + 76 },
    { x: G.raC.x - 46, y: G.raC.y + 52 }
  ];
  const PV_A = [
    { x: G.laC.x + 116, y: LVY - 146 },
    { x: G.laC.x + 72, y: LVY - 104 },
    { x: G.laC.x + 26, y: G.laC.y - 14 }
  ];
  const PV_B = [
    { x: G.laC.x + 122, y: LVY - 82 },
    { x: G.laC.x + 82, y: LVY - 50 },
    { x: G.laC.x + 38, y: G.laC.y + 32 }
  ];

  /* ══ Lungs and the systemic capillary bed ══════════════════════
     A track that stops in blank space leaves its cells hanging in
     mid-air, so both circuits need somewhere drawn to arrive. Each
     flank of the heart carries a lung above and a capillary bed
     below, which closes the circuit without either track ever having
     to cross in front of the heart:

       lung, viewer left   <- pulmonary artery   blue in, oxygenates
       lung, viewer right  -> pulmonary veins    red out, oxygenated
       bed,  viewer left   -> vena cava          blue out, deoxygenated
       bed,  viewer right  <- aorta              red in, deoxygenates

     Authored in the same space as the heart. The flanks are only free
     because SRC and ANAT_FIT are set from the measured extent of the
     drawing -- with the old box the heart ran off the right edge and
     there was nothing here to draw into.

     Left/right below mean the viewer's, which is the reverse of the
     patient's; that is the convention the rest of the drawing uses. */
  const LUNG_L = { x: -8, y: 88, rx: 88, ry: 104 };   // viewer left
  const LUNG_R = { x: 726, y: 88, rx: 88, ry: 104 };  // viewer right
  const BED_L = { x: -8, y: 432, rx: 88, ry: 104 };
  const BED_R = { x: 726, y: 432, rx: 88, ry: 104 };

  // Each great vessel is carried on past the heart until it reaches the
  // bed it drains into, so the vessel and the cells on it stay the same
  // line all the way to drawn tissue.
  const IVC_X = [
    { x: BED_L.x + 70, y: BED_L.y + 16 },
    { x: 140, y: BED_L.y - 4 },
    ...IVC
  ];
  const PULM_TRUNK_X = [
    ...PULM_TRUNK,
    { x: 132, y: 66 },
    { x: LUNG_L.x + 56, y: LUNG_L.y - 14 },
    { x: LUNG_L.x, y: LUNG_L.y }            // lung centre: fully oxygenated
  ];
  const PV_A_X = [
    { x: LUNG_R.x, y: LUNG_R.y },           // lung centre: fully oxygenated
    ...PV_A
  ];
  const AORTA_X = [
    ...AORTA,
    { x: 662, y: 316 },
    { x: BED_R.x - 26, y: BED_R.y - 18 },
    { x: BED_R.x, y: BED_R.y }             // bed centre: fully deoxygenated
  ];

  const CIRC_BLUE = new Track([
    ['fill', [{ x: BED_L.x + 22, y: BED_L.y + 44 }, ...IVC_X]],
    ['fill', [IVC[2], { x: G.raC.x - 12, y: G.raC.y + 26 }, { x: G.tricuspid.x, y: G.tricuspid.y }]],
    ['fill', [{ x: G.tricuspid.x, y: G.tricuspid.y }, { x: G.rvBase.x - 4, y: G.rvBase.y + 0.40 * VENT_H }]],
    ['eject', [{ x: G.rvBase.x - 4, y: G.rvBase.y + 0.40 * VENT_H }, { x: G.pulmonary.x, y: G.pulmonary.y }]],
    ['eject', PULM_TRUNK_X]
  ]);

  const CIRC_RED = new Track([
    ['fill', PV_A_X],
    ['fill', [{ x: PV_A[2].x, y: G.laC.y + 2 }, { x: G.mitral.x, y: G.mitral.y }]],
    ['fill', [{ x: G.mitral.x, y: G.mitral.y }, { x: LVX + 4, y: LVY + 0.38 * VENT_H }]],
    ['eject', [{ x: LVX + 4, y: LVY + 0.38 * VENT_H }, { x: G.aortic.x, y: G.aortic.y }]],
    ['eject', AORTA_X]
  ]);

  /* ══ DOM ═══════════════════════════════════════════════════ */

  const stage = EV.stage('stage');
  const ctx = stage.ctx;


  const el = (id) => document.getElementById(id);
  const sliders = {
    hr: el('hr'), contract: el('contract'), preload: el('preload'),
    valve: el('valve'), resistance: el('resistance')
  };
  const valueLabels = {
    hr: el('hrValue'), contract: el('contractValue'), preload: el('preloadValue'),
    valve: el('valveValue'), resistance: el('resistanceValue')
  };
  const out = {
    hr: el('hrOut'), sv: el('svOut'), co: el('coOut'),
    ef: el('efOut'), bp: el('bpOut'), map: el('mapOut')
  };
  const pauseBtn = el('pauseBtn');
  const slowBtn = el('slowBtn');
  const labelsBtn = el('labelsBtn');
  const presetBtns = Array.from(document.querySelectorAll('[data-preset]'));

  /* ══ State ═════════════════════════════════════════════════ */

  const PRESETS = {
    rest: { hr: 70, contract: 1.0, preload: 1.0, valve: 1.0, resistance: 1.0, afib: false },
    exercise: { hr: 155, contract: 1.25, preload: 1.25, valve: 1.0, resistance: 0.32, afib: false },
    failure: { hr: 88, contract: 0.5, preload: 1.2, valve: 1.0, resistance: 1.15, afib: false },
    stenosis: { hr: 80, contract: 1.0, preload: 1.0, valve: 0.25, resistance: 1.0, afib: false },
    hypertension: { hr: 85, contract: 1.0, preload: 1.0, valve: 1.0, resistance: 1.4, afib: false },
    fibrillation: { hr: 105, contract: 1.0, preload: 1.0, valve: 1.0, resistance: 1.0, afib: true }
  };

  const s = makeState();
  let paused = false;
  let slowmo = false;
  let labelsOn = true;
  let clock = 0;            // simulation seconds since load
  let rafId = null;
  let lastTime = 0;
  let interactions = 0;
  let dirty = false;

  /* Travel speed in track units per second at full flow. Both circuits
     are normalised to their own length so the blood takes a similar
     time to circle each one. */
  const PARTICLE_SPEED = 34;
  const BLUE_SPAN = CIRC_BLUE.total / 1000;
  const RED_SPAN = CIRC_RED.total / 1000;

  const trace = [];         // {t, ecg, ao} for the monitor strip
  const loopTrail = [];     // {t, v, p} for the pressure-volume loop
  const particles = [];
  for (let i = 0; i < 26; i++) {
    particles.push({ track: CIRC_BLUE, s: (i / 26) * CIRC_BLUE.total, span: BLUE_SPAN });
    particles.push({ track: CIRC_RED, s: ((i + 0.5) / 26) * CIRC_RED.total, span: RED_SPAN });
  }

  function resetParticles() {
    for (const p of particles) {
      p.s = p.track.total * (((p.s / p.track.total) % 1 + 1) % 1);
    }
  }

  let svSmooth = 68;

  function params() {
    return {
      hr: +sliders.hr.value,
      contract: +sliders.contract.value,
      preload: +sliders.preload.value,
      valve: +sliders.valve.value / 100,
      resistance: +sliders.resistance.value,
      afib: currentPreset === 'fibrillation' && !presetTouched
    };
  }

  let currentPreset = 'rest';
  let presetTouched = false;

  /* ══ Draw: background ═════════════════════════════════════ */

  function panel(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPanel(x, y, w, h, title, accent) {
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    panel(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    panel(x, y, w, h, 10);
    ctx.stroke();
    if (title) {
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = accent || COL.dim;
      ctx.fillText(title.toUpperCase(), x + 12, y + 9);
    }
  }

  /* ══ Draw: anatomy ════════════════════════════════════════ */

  function wallScale(base, hypertrophy) {
    return base * hypertrophy;
  }

/* Apex crowding: the ventricles narrow and round as they squeeze. */
  function drawAnatomy() {
    const edvRef = 120 * params().preload;
    const vRatio = clamp(s.V / edvRef, 0.22, 1.2);

    // A heart working against a narrowed valve thickens its wall, so
    // the drawing carries the consequence of the pressure it had to beat.
    const hypertrophy = clamp(Math.sqrt(Math.max(0.4, s.lvPeak) / 120), 0.85, 1.75);

    // Cavity size is driven by the model's volume and nothing else —
    // the emptying you see is the stroke volume.
    const sx = Math.pow(vRatio, 0.35);
    const sy = Math.pow(vRatio, 0.65);
    // Same volume, shorter and rounder during isovolumetric contraction.
    const iso = s.isoC;
    const csx = sx * (1 + 0.06 * iso) * (1 + 0.03 * s.sysC);
    const csy = sy * (1 - 0.15 * iso) * (1 - 0.02 * s.sysC);
    const baseDrop = 9 * s.sysC;

    // Everything anatomical is authored in the roomier SRC space and
    // scaled into its frame here, so a shorter frame never forces the
    // shapes themselves to be re-tuned.
    ctx.save();
    ctx.translate(ANAT_TX, ANAT_TY + baseDrop);
    ctx.scale(ANAT_K, ANAT_K);

    drawBeds();
    drawVesselsBehind();

    // ── myocardium ──────────────────────────────────────────
    // Built by drawing each cavity's silhouette scaled up about its
    // own centre, so the wall thickness is real geometry.
    ctx.fillStyle = COL.muscle;
    ctx.strokeStyle = COL.muscleLit;
    ctx.lineWidth = 1.5;

    ctx.save();
    ctx.translate(LVX, LVY + 0.46 * VENT_H);
    ctx.scale(wallScale(1.17, hypertrophy), wallScale(1.15, hypertrophy));
    ctx.translate(-LVX, -(LVY + 0.46 * VENT_H));
    lvPath(ctx); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(LVX, LVY + 0.46 * VENT_H);
    ctx.scale(1.1, 1.09);
    ctx.translate(-LVX, -(LVY + 0.46 * VENT_H));
    rvPath(ctx); ctx.fill(); ctx.stroke();
    ctx.restore();

    ellipsePath(ctx, G.raC); ctx.fill(); ctx.stroke();
    ellipsePath(ctx, G.laC); ctx.fill(); ctx.stroke();

    // ── cavities ────────────────────────────────────────────
    ctx.save();
    ctx.translate(LVX + 4, LVY + 0.46 * VENT_H);
    ctx.rotate(-0.12 * s.sysC);          // the apex wrings anticlockwise
    ctx.scale(csx, csy);
    ctx.translate(-(LVX + 4), -(LVY + 0.46 * VENT_H));
    ctx.fillStyle = 'rgba(239,68,68,0.34)';
    ctx.strokeStyle = COL.oxyLit;
    ctx.lineWidth = 2.5;
    lvPath(ctx); ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(G.rvBase.x, G.rvBase.y + 0.46 * VENT_H);
    ctx.scale(1 + (csx - 1) * 0.8, 1 + (csy - 1) * 0.8);
    ctx.translate(-G.rvBase.x, -(G.rvBase.y + 0.46 * VENT_H));
    ctx.fillStyle = 'rgba(59,130,246,0.34)';
    ctx.strokeStyle = COL.deoxLit;
    ctx.lineWidth = 2;
    rvPath(ctx); ctx.fill(); ctx.stroke();
    ctx.restore();

    // The atria are tinted as strongly as the ventricles. They used to be
    // fainter, which made half the heart read as empty myocardium and left
    // the silhouette looking like one undivided mass.
    ctx.fillStyle = 'rgba(239,68,68,0.34)';
    ctx.strokeStyle = 'rgba(252,165,165,0.85)';
    ctx.lineWidth = 2;
    ellipsePath(ctx, G.laC); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(59,130,246,0.34)';
    ctx.strokeStyle = 'rgba(147,197,253,0.85)';
    ctx.lineWidth = 2;
    ellipsePath(ctx, G.raC); ctx.fill(); ctx.stroke();

    drawSeptum(hypertrophy);
    drawChordae();
    drawValves();

    // Particles are authored on the same tracks as the vessels, so they have
    // to be drawn before the anatomy transform is popped -- an extra restore
    // here used to drop them into panel space, where they landed at the raw
    // authored coordinates: wrong scale, wrong place, and visibly outside
    // the heart.
    drawParticles();
    ctx.restore();
    if (labelsOn) drawLabels(hypertrophy);
  }

  function drawSeptum(hypertrophy) {
    const x0 = LVX - 94, x1 = LVX - 32 + 5 * hypertrophy;
    const yTop = LVY - 10, yBot = LVY + VENT_H;
    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.bezierCurveTo(x0 - 18, LVY + 0.45 * VENT_H, x0 + 26, LVY + 0.84 * VENT_H, x1 + 6, yBot);
    ctx.lineTo(x1 + 40, yBot - 8);
    ctx.bezierCurveTo(x1 + 18, LVY + 0.69 * VENT_H, x1 + 8, LVY + 0.38 * VENT_H, x1, yTop);
    ctx.closePath();
    ctx.fillStyle = COL.septum;
    ctx.fill();
    ctx.strokeStyle = 'rgba(194,101,112,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // muscle hatching
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    ctx.save();
    ctx.clip();
    for (let i = -300; i < 300; i += 14) {
      ctx.beginPath();
      ctx.moveTo(x0 - 30 + i, yTop - 20);
      ctx.lineTo(x0 - 30 + i + 250, yTop - 20 + 250);
      ctx.stroke();
    }
    ctx.restore();
  }

  function papillae() {
    const lift = 18 * s.sysC;
    return {
      lv: [
        { x: LVX + 18, y: LVY + 0.61 * VENT_H - lift, r: 13 },
        { x: LVX + 44, y: LVY + 0.45 * VENT_H - lift, r: 11 }
      ],
      rv: [
        { x: G.rvBase.x - 30, y: LVY + 0.60 * VENT_H - lift, r: 10 },
        { x: G.rvBase.x + 14, y: LVY + 0.44 * VENT_H - lift, r: 9 }
      ]
    };
  }

  function drawChordae() {
    const pap = papillae();
    ctx.strokeStyle = 'rgba(226,232,240,0.5)';
    ctx.lineWidth = 1.2;
    const draw = (valve, tips) => {
      for (const tip of tips) {
        for (const pm of pap[valve]) {
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(pm.x, pm.y - 4);
          ctx.stroke();
        }
      }
    };
    const open = s.mitral ? 1 : 0;
    draw('lv', leafletTips(G.mitral, 46, open));
    draw('rv', leafletTips(G.tricuspid, 44, open));
  }

  function leafletTips(v, half, open) {
    const drop = open * 15;
    return [
      { x: v.x - half * 0.55, y: v.y + drop },
      { x: v.x + half * 0.55, y: v.y + drop }
    ];
  }

  function drawValves() {
    // Atrioventricular valves: shut through both isovolumetric
    // phases, which is the single most teachable moment here.
    avLeaflets(G.mitral, 52, s.mitral ? 1 : 0, COL.oxyLit);
    avLeaflets(G.tricuspid, 50, s.tricuspid ? 1 : 0, COL.deoxLit);

    // Papillary muscles hold the leaflets shut rather than letting
    // them blow out the wrong way.
    const pap = papillae();
    ctx.fillStyle = 'rgba(142,59,70,0.95)';
    for (const p of pap.lv) disc(p.x, p.y, p.r);
    for (const p of pap.rv) disc(p.x, p.y, p.r);

    // Semilunar valves: open only while blood is leaving.
    semi(G.aortic, 20, s.aortic ? 1 : 0, 1);
    semi(G.pulmonary, 20, s.pulm ? 1 : 0, -1);
  }

  function avLeaflets(v, half, open, color) {
    const drop = open * 17;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(v.x - half, v.y);
    ctx.quadraticCurveTo(v.x - half * 0.5, v.y + drop * 1.15, v.x, v.y + drop);
    ctx.moveTo(v.x + half, v.y);
    ctx.quadraticCurveTo(v.x + half * 0.5, v.y + drop * 1.15, v.x, v.y + drop);
    ctx.stroke();
    // annulus
    ctx.strokeStyle = 'rgba(226,232,240,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(v.x - half - 3, v.y);
    ctx.lineTo(v.x + half + 3, v.y);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function semi(v, r, open, dir) {
    ctx.strokeStyle = open ? 'rgba(252,232,200,0.95)' : 'rgba(253,186,116,0.95)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const spread = open ? r * 0.95 : 0;
      ctx.beginPath();
      ctx.moveTo(v.x + i * r * 0.9 - r * 0.45, v.y + dir * 2);
      ctx.quadraticCurveTo(
        v.x + i * r * 0.5, v.y + dir * (2 + spread * 1.25),
        v.x + i * (r * 0.9 + spread * 0.5) * 0.55, v.y + dir * (2 + spread * 1.15)
      );
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function disc(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function strokePath(pts, width, colour, cap) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = cap || 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function vessel(pts, width, kind) {
    const lit = kind === 'oxy' ? COL.oxyLit : COL.deoxLit;
    const base = kind === 'oxy' ? COL.oxy : COL.deox;
    strokePath(pts, width + 7, 'rgba(8,12,24,0.85)', 'butt');
    strokePath(pts, width, 'rgba(30,41,59,0.95)', 'butt');
    strokePath(pts, width - 8, hexA(base, 0.32), 'butt');
    ctx.save();
    strokePath(pts, width - 10, 'transparent', 'butt');
    ctx.restore();
    // inner highlight, offset for a tube feel
    ctx.globalAlpha = 0.5;
    strokePath(pts.map((p) => ({ x: p.x - 3, y: p.y - 3 })), Math.max(3, width - 16), hexA(lit, 0.3), 'butt');
    ctx.globalAlpha = 1;
  }

  /* Schematic on purpose: enough drawn tissue for a cell to be travelling
     over, quiet enough that the heart stays the subject. Both sit behind the
     vessels and the myocardium. */
  function drawBeds() {
    const shell = (c, fill) => {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = COL.faint;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    };

    // A bronchial fan entering at the hilum plus one oblique fissure is what
    // makes the shape read as a lung rather than a grey oval.
    for (const [c, dir] of [[LUNG_L, -1], [LUNG_R, 1]]) {
      shell(c, 'rgba(56,72,94,0.62)');
      const hx = c.x + dir * c.rx * 0.88, hy = c.y + 4;
      ctx.strokeStyle = hexA(COL.dim, 0.5);
      ctx.lineWidth = 1.8;
      for (const t of [-0.5, -0.18, 0.16, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(c.x + dir * c.rx * 0.26, hy + t * c.ry * 0.46,
          c.x + dir * c.rx * 0.7, c.y + t * c.ry * 0.84);
        ctx.stroke();
      }
      ctx.strokeStyle = hexA(COL.faint, 0.95);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(c.x - dir * c.rx * 0.84, c.y + c.ry * 0.22);
      ctx.quadraticCurveTo(c.x, c.y + c.ry * 0.36, c.x + dir * c.rx * 0.84, c.y + c.ry * 0.1);
      ctx.stroke();
    }

    // A capillary mesh, kept dim on purpose: the cells crossing it are what
    // carries the colour, so the mesh must not compete with them.
    for (const c of [BED_L, BED_R]) {
      shell(c, 'rgba(45,61,82,0.62)');
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.rx - 3, c.ry - 3, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = hexA(COL.dim, 0.5);
      ctx.lineWidth = 1.2;
      for (let i = -3; i <= 3; i++) {
        const y = c.y + i * 25;
        ctx.beginPath();
        ctx.moveTo(c.x - c.rx, y);
        for (let x = -c.rx; x <= c.rx; x += 24) {
          ctx.lineTo(c.x + x, y + (Math.round(x / 24) % 2 ? 6 : -6));
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* How oxygenated the blood is at an authored point: 0 fully deoxygenated,
     1 fully oxygenated. Gas exchange is drawn where it actually happens, so
     blood oxygenates crossing the lung and deoxygenates crossing the systemic
     bed.

     The bed is the one place a purely spatial rule is not enough, because two
     tracks cross it and they are running in opposite directions: the red
     track arrives with oxygenated blood and unloads it on the way in, while
     the blue track is already collecting blood that has given its oxygen up.
     Treating both the same way made a cell climbing out of the tissues go
     from blue to red — deoxygenated blood painted bright red on its way to the
     vena cava — and put a red flash in the middle of the capillary bed. So
     the bed hands the arriving track a ramp and hands the leaving track plain
     deoxygenated blood. */
  function depthIn(c, q) {
    const d = Math.hypot((q.x - c.x) / c.rx, (q.y - c.y) / c.ry);
    return d <= 1 ? 1 - d : -1;
  }

  function oxygenation(q, track) {
    const lung = Math.max(depthIn(LUNG_L, q), depthIn(LUNG_R, q));
    if (lung >= 0) return lung;
    const bed = Math.max(depthIn(BED_L, q), depthIn(BED_R, q));
    if (bed >= 0) return track === CIRC_RED ? 1 - bed : 0;
    return track === CIRC_BLUE ? 0 : 1;
  }

  function mixHex(a, b, t, alpha) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const mix = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
    return `rgba(${mix(16)},${mix(8)},${mix(0)},${alpha === undefined ? 1 : alpha})`;
  }

  function drawVesselsBehind() {
    vessel(IVC_X, 24, 'deox');
    vessel(SVC, 24, 'deox');
    vessel(AORTA_X, 28, 'oxy');
    vessel(PULM_TRUNK_X, 26, 'deox');
    vessel(PV_A_X, 16, 'oxy');
    vessel(PV_B, 16, 'oxy');

    // Aortic arch branches. The round cap adds half the stroke width past
    // the end point, so the branch has to stop 4 px short of the frame.
    ctx.strokeStyle = COL.oxy;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    for (const dx of [0, 28, 54]) {
      const bx = G.aortic.x + 60 + dx, by = LVY - 196;
      ctx.beginPath();
      ctx.moveTo(bx, by + 8);
      ctx.lineTo(bx - 5, by - 26);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /* Blood moves at the rate the model is actually moving it, so it
     stops dead whenever every valve is shut. Advancing here rather
     than inside the draw call keeps it frame-rate independent and
     means it freezes with the simulation. */
  function advanceParticles(dt) {
    for (const p of particles) {
      const flow = p.track.at(p.s).src === 'eject' ? s.ejectC : s.fillC;
      p.s += flow * PARTICLE_SPEED * p.span * dt;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const q = p.track.at(p.s);
      const o = oxygenation(q, p.track);
      const r = 3.4;
      ctx.beginPath();
      ctx.moveTo(q.x - q.dx * 9, q.y - q.dy * 9);
      ctx.lineTo(q.x, q.y);
      ctx.strokeStyle = mixHex(COL.deoxLit, COL.oxyLit, o, 0.75);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fillStyle = mixHex(COL.deoxLit, COL.oxyLit, o);
      ctx.fill();
      ctx.lineCap = 'butt';
    }
  }

  function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* Authored drawing point -> finished panel point. */
  function mapPt(x, y) {
    return { x: ANAT_TX + x * ANAT_K, y: ANAT_TY + y * ANAT_K };
  }

/* Captions belong to the panel, not to the scaled drawing, so they are
      drawn in the panel's own space: they keep a fixed legible size whatever
      the frame does. Every caption is clamped into the panel afterwards, so
      retuning the anatomy can never push a name off the frame or across
      into the pressure-volume loop. */
  function drawLabels(hypertrophy) {
    const pad = 6;
    const box = {
      x0: ANAT.x + pad, y0: ANAT.y + pad,
      x1: ANAT.x + ANAT.w - pad, y1: ANAT.y + ANAT.h - pad
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Chamber names ride just outside their own cavity, in a plate that is
    // nudged back inside the frame if it would overhang.
    const tag = (pt, text, colour) => {
      ctx.font = '700 10px system-ui, sans-serif';
      const w = Math.min(ctx.measureText(text).width + 12, ANAT.w - 2 * pad);
      const cx = clamp(pt.x, box.x0 + w / 2, box.x1 - w / 2);
      const cy = clamp(pt.y, box.y0 + 8, box.y1 - 8);
      ctx.fillStyle = 'rgba(8,12,24,0.72)';
      panel(cx - w / 2, cy - 8, w, 16, 4);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.fillText(text, cx, cy);
    };

    // Vessel names are set flush against the vessel they name, then pulled
    // back to whichever frame edge is nearer.
    const vesselTag = (pt, text, side) => {
      ctx.font = '600 9px system-ui, sans-serif';
      const w = ctx.measureText(text).width;
      const x = side < 0
        ? clamp(pt.x, box.x0 + w, box.x1)
        : clamp(pt.x, box.x0, box.x1 - w);
      const y = clamp(pt.y, box.y0 + 6, box.y1 - 6);
      ctx.fillStyle = COL.dim;
      ctx.textAlign = side < 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    };

    // The two ventricles share one apex, so their names sit at one height: a
    // pair of labels at different heights reads as a difference in the anatomy
    // rather than as the same muscle seen from two sides. The atria are left
    // following their own centres, because those really are offset.
    tag(mapPt(G.raC.x - 30, G.raC.y - 84), 'RIGHT ATRIUM', COL.deoxLit);
    tag(mapPt(G.rvBase.x - 34, LVY + VENT_H + 52), 'RIGHT VENTRICLE', COL.deoxLit);
    tag(mapPt(G.laC.x + 40, G.laC.y - 78), 'LEFT ATRIUM', COL.oxyLit);
    tag(mapPt(LVX + 30, LVY + VENT_H + 52), 'LEFT VENTRICLE', COL.oxyLit);
    tag(mapPt(LUNG_L.x, LUNG_L.y), 'LUNG', COL.dim);
    tag(mapPt(BED_R.x - 44, BED_R.y + 120), 'SYSTEMIC BED', COL.dim);

    // Superior vena cava and pulmonary artery both set out from the top of the
    // panel on near-identical x, and flush-set on opposite edges they ended a
    // single pixel apart. Separating them by height puts each name beside the
    // vessel it names instead of in one crowded band.
    vesselTag(mapPt(G.aortic.x + 118, LVY - 220), 'AORTA', 1);
    vesselTag(mapPt(G.raC.x - 40, LVY - 240), 'SUPERIOR VENA CAVA', 1);
    vesselTag(mapPt(G.pulmonary.x - 96, LVY - 190), 'PULMONARY ARTERY', -1);
    vesselTag(mapPt(G.raC.x - 100, LVY + 150), 'INFERIOR VENA CAVA', -1);
    vesselTag(mapPt(G.laC.x + 132, LVY - 178), 'PULMONARY VEINS', -1);

    // Pressure overload shows up as a wall the eye can measure.
    const wall = Math.round(10 * hypertrophy);
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillStyle = COL.muscleLit;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const wallPt = mapPt(LVX + 80, LVY + 0.52 * VENT_H);
    ctx.fillText('LV WALL ' + wall + ' mm',
      clamp(wallPt.x, box.x0, box.x1 - 74),
      clamp(wallPt.y, box.y0 + 6, box.y1 - 6));
  }

  /* Drawn outside the scaled anatomy: the readouts are about the model,
     not about the drawing, so they keep a stable size and their own band
     above the anatomy and the loop. */
  function drawHud() {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(s.phase.toUpperCase(), 22, 14);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = COL.dim;
    ctx.textAlign = 'right';
    ctx.fillText(s.aoPeak > 0 ? 'LV ' + Math.round(s.lvPeak) + ' / AORTIC ' + Math.round(s.aoPeak) + ' mmHg'
                              : 'LV ' + Math.round(s.P) + ' mmHg', W - 22, 14);
  }

  /* ══ Axis ceilings ══════════════════════════════════════════
     Both the artery trace and the pressure-volume loop have to keep
     telling the truth when a learner drives the sliders to their
     limits: the model reaches about 480 mmHg in the aorta and 440 mmHg
     in the left ventricle there, well past any fixed scale, and a
     clipped trace quietly disagrees with the blood-pressure readout
     printed beside it.

     So each scale steps up a rung the instant the signal would clip,
     and only relaxes once the signal has sat comfortably inside a
     lower rung for a few seconds. The delay is what stops the waveform
     from breathing up and down on every beat.                        */

  function makeScale(rungs, start) {
    return { rungs, ceil: start, base: start, since: 0 };
  }

  const artScale = makeScale([120, 180, 240, 320, 400, 480], 180);
  const pvScale = makeScale([220, 320, 400, 480], 220);

  function rescale(sc, signal, atTime) {
    if (signal > sc.ceil) {
      const rung = sc.rungs.find((r) => r >= signal * 1.08);
      sc.ceil = rung === undefined ? Math.ceil((signal * 1.08) / 20) * 20 : rung;
      sc.since = atTime;
      return;
    }
    if (atTime - sc.since > 4) {
      let lower = null;
      for (const r of sc.rungs) if (r < sc.ceil && r >= signal * 1.3) lower = r;
      if (lower !== null) { sc.ceil = lower; sc.since = atTime; }
    }
  }

  /* A 1-2-2.5-5-10 gridline step, so the labels stay round numbers at every
     rung and there are never fewer than three of them. */
  function axisStep(ceil) {
    const raw = ceil / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  /* ══ Draw: pressure-volume loop ════════════════════════════ */

  let pvCeil = PV_PMAX;

  function pvX(v) { return PV_PLOT.x + (clamp(v, 0, PV_VMAX) / PV_VMAX) * PV_PLOT.w; }
  function pvY(p) { return PV_PLOT.y + PV_PLOT.h - (clamp(p, 0, pvCeil) / pvCeil) * PV_PLOT.h; }

  function drawPVLoop() {
    drawPanel(PV_BOX.x, PV_BOX.y, PV_BOX.w, PV_BOX.h, 'Left ventricle — pressure vs volume', COL.loop);
    rescale(pvScale, s.lvPeak, clock);
    pvCeil = pvScale.ceil;
    const pStep = axisStep(pvCeil);

    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.13)';
    ctx.lineWidth = 1;
    for (let v = 40; v < PV_VMAX; v += 40) {
      ctx.beginPath();
      ctx.moveTo(pvX(v), pvY(0));
      ctx.lineTo(pvX(v), pvY(pvCeil));
      ctx.stroke();
    }
    for (let p = pStep; p < pvCeil; p += pStep) {
      ctx.beginPath();
      ctx.moveTo(pvX(0), pvY(p));
      ctx.lineTo(pvX(PV_VMAX), pvY(p));
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillStyle = COL.faint;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 40; v < PV_VMAX; v += 40) ctx.fillText(v, pvX(v) - 4, pvY(0) + 8);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let p = pStep; p < pvCeil; p += pStep) ctx.fillText(p, pvX(0) + 4, pvY(p));

    ctx.fillStyle = COL.dim;
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('mL', (pvX(0) + pvX(PV_VMAX)) / 2, pvY(0) + 16);
    ctx.save();
    ctx.translate(pvX(0) - 12, (pvY(0) + pvY(pvCeil)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('mmHg', 0, 0);
    ctx.restore();

    // Once the axis has been pushed past its starting rung, say so — a
    // rescaled loop that still looks like the 220 mmHg one reads as a
    // much smaller pressure than it is.
    if (pvCeil > pvScale.base) {
      ctx.fillStyle = COL.faint;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('0–' + pvCeil + ' full scale', pvX(0) + 4, PV_PLOT.y - 13);
    }

    // end-diastolic and end-systolic volumes
    const edv = s.edv, esv = s.esv;
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(56,189,248,0.4)';
    for (const v of [edv, esv]) {
      ctx.beginPath();
      ctx.moveTo(pvX(v), pvY(0));
      ctx.lineTo(pvX(v), pvY(pvCeil) - 10);
      ctx.stroke();
    }
    ctx.restore();
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(125,211,252,0.9)';
    ctx.fillText('EDV', pvX(edv), pvY(pvCeil) - 10);
    ctx.fillStyle = 'rgba(125,211,252,0.6)';
    ctx.fillText('ESV', pvX(esv), pvY(pvCeil) - 10);

    // the loop itself
    if (loopTrail.length > 2) {
      ctx.beginPath();
      for (let i = 0; i < loopTrail.length; i++) {
        const q = loopTrail[i];
        const x = pvX(q.v), y = pvY(q.p);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexA(COL.loop, 0.9);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      const head = loopTrail[loopTrail.length - 1];
      ctx.beginPath();
      ctx.arc(pvX(head.v), pvY(head.p), 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
    }

    // The narrowing-valve case is the whole point of the afterload
    // slider, so the gradient it creates gets called out.
    const grad = Math.round(s.lvPeak - s.aoPeak);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 10px system-ui, sans-serif';
    if (grad > 25) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('Across the valve: ' + grad + ' mmHg', PV_BOX.x + 12, PV_BOX.y + PV_BOX.h - 20);
    } else {
      ctx.fillStyle = COL.dim;
      ctx.fillText('Stroke work ' + workLabel(), PV_BOX.x + 12, PV_BOX.y + PV_BOX.h - 20);
    }
  }

  /* The work label is the area of exactly one loop, accumulated inside
     the model as P.dV while the aortic valve is open, so it stays
     correct whatever the trail length or heart rate is. */
  function workLabel() {
    return s.work.toFixed(1) + ' J per beat';
  }

  /* ══ Draw: monitor strip ═══════════════════════════════════ */

  function drawGrid(box) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();

    ctx.lineWidth = 1;
    for (let t = 0; t < box.w; t += 4) {
      ctx.strokeStyle = t % 20 === 0 ? 'rgba(56,189,248,0.16)' : 'rgba(56,189,248,0.05)';
      ctx.beginPath();
      ctx.moveTo(box.x + t, box.y);
      ctx.lineTo(box.x + t, box.y + box.h);
      ctx.stroke();
    }
    for (let y = box.y; y < box.y + box.h; y += 4) {
      ctx.strokeStyle = 'rgba(56,189,248,0.05)';
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStrip() {
    drawPanel(ECG_BOX.x, ECG_BOX.y, ECG_BOX.w, ECG_BOX.h, 'ECG — lead II', COL.ecg);
    drawGrid(ECG_BOX);
    drawPanel(ART_BOX.x, ART_BOX.y, ART_BOX.w, ART_BOX.h, 'Artery pressure — mmHg', COL.art);
    drawGrid(ART_BOX);

    if (trace.length < 2) return;

    const right = ECG_BOX.x + ECG_BOX.w - 14;

    /* ── ECG ──────────────────────────────────────────────── */
    // Gain is bounded as well as proportional, so a short panel still
    // shows a millimetre at a readable height instead of overflowing.
    const baseY = ECG_BOX.y + ECG_BOX.h * 0.70;
    const mV = Math.min(ECG_BOX.h * 0.33, 34);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ECG_BOX.x, ECG_BOX.y + 18, ECG_BOX.w, ECG_BOX.h - 24);
    ctx.clip();

    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(74,222,128,0.55)';
    ctx.fillText('1 mV', ECG_BOX.x + 8, baseY - mV);
    ctx.strokeStyle = 'rgba(74,222,128,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ECG_BOX.x + 36, baseY - mV);
    ctx.lineTo(ECG_BOX.x + 52, baseY - mV);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < trace.length; i++) {
      const q = trace[i];
      const x = right - (clock - q.t) * PX_PER_SEC;
      const y = baseY - q.ecg * mV;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = COL.ecg;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    /* ── artery pressure ──────────────────────────────────── */
    rescale(artScale, s.ao, clock);
    const pMax = artScale.ceil;
    const aTop = ART_BOX.y + 12, aH = ART_BOX.h - 30;
    const ap = (v) => aTop + aH - (clamp(v, 0, pMax) / pMax) * aH;

    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const gStep = axisStep(pMax);
    for (let g = gStep; g < pMax; g += gStep) {
      ctx.strokeStyle = 'rgba(244,114,182,0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ART_BOX.x + 26, ap(g));
      ctx.lineTo(ART_BOX.x + ART_BOX.w - 14, ap(g));
      ctx.stroke();
      ctx.fillStyle = 'rgba(244,114,182,0.5)';
      ctx.fillText(g, ART_BOX.x + 22, ap(g));
    }

    // mean pressure, the number that actually perfuses organs
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(244,114,182,0.5)';
    ctx.beginPath();
    ctx.moveTo(ART_BOX.x + 26, ap(s.map));
    ctx.lineTo(ART_BOX.x + ART_BOX.w - 14, ap(s.map));
    ctx.stroke();
    ctx.restore();
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244,114,182,0.75)';
    ctx.fillText('mean', ART_BOX.x + 30, ap(s.map) - 7);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ART_BOX.x + 26, ART_BOX.y, ART_BOX.w - 40, ART_BOX.h);
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < trace.length; i++) {
      const q = trace[i];
      const x = right - (clock - q.t) * PX_PER_SEC;
      const y = ap(q.ao);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = COL.art;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // live head, the way a monitor sweeps
    const last = trace[trace.length - 1];
    ctx.beginPath();
    ctx.arc(right, baseY - last.ecg * mV, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#bbf7d0';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(right, ap(last.ao), 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#fbcfe8';
    ctx.fill();
  }

  /* ══ Render ═══════════════════════════════════════════════ */

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    drawAnatomy();
    drawPVLoop();
    drawStrip();
    drawHud();
  }

  stage.onPaint = () => { dirty = true; syncReadout(); render(); };

  /* ══ Readouts ═════════════════════════════════════════════ */

  function syncReadout(dt) {
    const edv = s.edv || 1;
    const esv = clamp(s.esv, 0, edv);
    const sv = clamp(edv - esv, 0, edv);
    // Time-based smoothing, so the number settles in the same wall-clock
    // time whether the page is drawing at 30 or 144 frames a second.
    const k = dt ? 1 - Math.exp(-dt * 2.2) : 1;
    svSmooth += (sv - svSmooth) * k;
    const hr = params().hr;
    const co = hr * svSmooth / 1000;
    const ef = edv > 0 ? (svSmooth / edv) * 100 : 0;

    out.hr.textContent = params().afib ? hr + ' irregular' : String(hr);
    out.sv.textContent = Math.round(svSmooth) + ' mL';
    out.co.textContent = co.toFixed(1) + ' L/min';
    out.ef.textContent = Math.round(ef) + '%';
    out.bp.textContent = Math.round(s.sbp) + '/' + Math.round(s.dbp);
    out.map.textContent = Math.round(s.map) + ' mmHg';

    out.sv.style.color = svSmooth < 45 ? '#fbbf24' : '#e2e8f0';
    out.ef.style.color = ef < 40 ? '#ef4444' : ef > 65 ? '#4ade80' : '#e2e8f0';
    out.co.style.color = co < 3.2 ? '#ef4444' : co > 12 ? '#4ade80' : '#e2e8f0';
    out.bp.style.color = s.sbp > 150 || s.dbp > 95 ? '#ef4444' : '#e2e8f0';

    // The visible value and the accessible value are formatted once and
    // used twice: a bare "1" tells a screen-reader user nothing about pump
    // strength, but "1.00× normal" does.
    const showValue = (slider, label, text) => {
      label.textContent = text;
      slider.setAttribute('aria-valuetext', text);
    };
    showValue(sliders.hr, valueLabels.hr, hr + ' bpm');
    showValue(sliders.contract, valueLabels.contract, (+sliders.contract.value).toFixed(2) + '× normal');
    showValue(sliders.preload, valueLabels.preload, (+sliders.preload.value).toFixed(2) + '× normal');
    showValue(sliders.valve, valueLabels.valve, sliders.valve.value + '% open');
    showValue(sliders.resistance, valueLabels.resistance, (+sliders.resistance.value).toFixed(2) + '× normal');
  }

  /* ══ Loop ═════════════════════════════════════════════════ */

  /* The model is stiff: ejecting a whole beat inside one long frame
     overshoots the trans-valve gradient and the arterial pressure
     ratchets upward. So simulation time is integrated in fixed slices
     and a slow frame simply takes more of them. Volumes then come out
     the same to a fraction of a millilitre at 30, 60 and 144 fps; the
     arterial trace still carries a millimetre or two of Euler slop,
     which is far below anything visible on screen. */
  const MAX_STEP = 1 / 120;

  function update(dt) {
    if (paused || dt <= 0) return;
    const p = params();
    const total = dt * (slowmo ? 0.22 : 1);
    let left = total;
    let guard = 0;
    while (left > 1e-9 && guard++ < 64) {
      // Never let a slice run past the end of the current beat: the
      // diastolic runoff is normalised to reach the next beat's diastolic
      // pressure exactly at that boundary, so overshooting it would leave
      // the runoff unfinished and ratchet the arterial pressure upward.
      const toEdge = s.cycleLen - s.tc;
      const h = Math.min(MAX_STEP, left, toEdge > 1e-6 ? toEdge : MAX_STEP);
      left -= h;
      const t = step(s, h, p);
      clock += h;
      advanceParticles(h);
      trace.push({ t: clock, ecg: ecgAt(s.tc, t, p.afib, s.jitter), ao: s.ao });
      loopTrail.push({ t: clock, v: s.V, p: s.P });
    }
    while (trace.length && clock - trace[0].t > 11) trace.shift();
    while (loopTrail.length && clock - loopTrail[0].t > 2.6) loopTrail.shift();
  }

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;
    // Under reduced motion (or while paused) nothing advances, so there is
    // no reason to repaint a frame that would look identical. A control
    // interaction flips `dirty` and gets one fresh frame instead.
    if (dt > 0 && !paused) {
      update(dt);
      syncReadout(dt);
      render();
    } else if (dirty) {
      // Paused or reduced motion: nothing is advancing, but a control
      // still has to be able to refresh the numbers on screen.
      dirty = false;
      syncReadout();
      render();
    }
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ══ Controls ═════════════════════════════════════════════ */

  function noteInteraction() {
    interactions++;
    if (interactions >= 4) EV.revealInsight();
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    sliders.hr.value = preset.hr;
    sliders.contract.value = preset.contract;
    sliders.preload.value = preset.preload;
    sliders.valve.value = Math.round(preset.valve * 100);
    sliders.resistance.value = preset.resistance;
    currentPreset = name;
    presetTouched = false;
    for (const b of presetBtns) {
      b.setAttribute('aria-pressed', b.dataset.preset === name ? 'true' : 'false');
    }
    trace.length = 0;
    loopTrail.length = 0;
    s.edv = 120 * preset.preload;
    s.esv = s.edv * 0.45;
    s.mapSum = 0; s.mapT = 0;
    dirty = true;
    EV.say(presetBlurb(name));
  }

  const PRESET_BLURBS = {
    rest: 'At rest: heart rate 70, stroke volume 67 millilitres, cardiac output 4.7 litres a minute.',
    exercise: 'Exercise: the heart rate rises to 155 and each beat moves 105 millilitres instead of 67, so output climbs more than threefold.',
    failure: 'Heart failure: a weakened pump empties less each beat, so output drops even though the rate rises to compensate.',
    stenosis: 'Aortic stenosis: the narrowed valve forces the left ventricle to reach 190 millimetres of mercury to push blood through, so the wall thickens and output falls.',
    hypertension: 'High blood pressure: the arteries resist, so the ventricle works against a higher pressure throughout.',
    fibrillation: 'Atrial fibrillation: the P waves disappear, the rhythm goes irregular, and the ventricles lose the top-up from the atria — output falls by a fifth at the same heart rate.'
  };

  const presetBlurb = (n) => PRESET_BLURBS[n] || '';

  for (const btn of presetBtns) {
    btn.addEventListener('click', () => { applyPreset(btn.dataset.preset); noteInteraction(); });
  }

  for (const key of Object.keys(sliders)) {
    sliders[key].addEventListener('input', () => {
      if (currentPreset) {
        presetTouched = true;
        for (const b of presetBtns) b.setAttribute('aria-pressed', 'false');
      }
      dirty = true;
      noteInteraction();
    });
  }

  EV.onToggle(pauseBtn, () => {
    paused = !paused;
    EV.label(pauseBtn, 'pause', paused ? 'Resume' : 'Pause');
    if (!paused) EV.say('Running.');
    else EV.say('Paused. The heart is frozen mid-beat.');
    noteInteraction();
    return paused;
  });

  EV.onToggle(slowBtn, () => {
    slowmo = !slowmo;
    EV.say(slowmo ? 'Slow motion on.' : 'Normal speed.');
    noteInteraction();
    return slowmo;
  });

  EV.onToggle(labelsBtn, () => {
    labelsOn = !labelsOn;
    EV.label(labelsBtn, 'tag', labelsOn ? 'Labels on' : 'Labels off');
    return labelsOn;
  });

  /* Space pauses and S slows, but only when the keystroke is not already
     meaningful somewhere else: a focused button should activate itself,
     a slider should keep its arrow keys, and a modified keystroke is a
     shortcut belonging to the browser. */
  const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
  const ACTIVATABLE = new Set(['BUTTON', 'A', 'SUMMARY']);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    const tag = el && el.tagName;
    if (TYPING.has(tag) || el.isContentEditable) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      if (ACTIVATABLE.has(tag)) return;      // let the button handle it
      e.preventDefault();                     // otherwise the page scrolls
      pauseBtn.click();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      slowBtn.click();
    }
  });

  EV.onReset(() => {
    applyPreset('rest');
    paused = false;
    slowmo = false;
    labelsOn = true;
    pauseBtn.setAttribute('aria-pressed', 'false');
    EV.label(pauseBtn, 'pause', 'Pause');
    slowBtn.setAttribute('aria-pressed', 'false');
    labelsBtn.setAttribute('aria-pressed', 'true');
    EV.label(labelsBtn, 'tag', 'Labels on');
    interactions = 0;
    svSmooth = 68;

    // Rewind the model itself so the reset beat starts from the same
    // resting state every time, rather than from wherever the user
    // happened to leave the sliders.
    Object.assign(s, makeState());
    for (let i = 0; i < 240; i++) step(s, 1 / 120, params());
    s.workAcc = 0;

    clock = 0;
    trace.length = 0;
    loopTrail.length = 0;
    resetParticles();
    syncReadout();
    render();
  });

  /* ══ Init ══════════════════════════════════════════════════ */

  for (let i = 0; i < 240; i++) step(s, 1 / 120, params());   // settle to steady state
  s.workAcc = 0;
  s.work = 1.0;
    trace.length = 0;
    loopTrail.length = 0;
  clock = 0;
  syncReadout();
  start();

})();