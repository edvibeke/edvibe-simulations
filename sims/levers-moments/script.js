(() => {
  'use strict';

  /* ── Layout ──────────────────────────────────────────
     A left scene (beam, fulcrum, weights) and a right panel
     that does the arithmetic the diagram implies. */

  const SCENE  = { x: 16,   y: 16,  w: 584, h: 508 };
  const PANEL  = { x: 612,  y: 16,  w: 272, h: 508 };
  const PAD    = 16;
  const PIVOT  = { x: 300,  y: 330 };
  const PX_PER_M = 150;
  const MIN_ARM = 0.15, MAX_ARM = 1.5;
  const BEAM_Y = 0;                 /* beam-local, i.e. through the pivot */
  const BEAM_T = 12;                /* beam thickness */
  /* Long enough that the load block still sits on the plank at full
     extension: 1.5 m of arm is 225 px, and the block is 20 px half-width. */
  const BEAM_X0 = PIVOT.x - 252, BEAM_X1 = PIVOT.x + 252;
  const GROUND_Y = 430;
  const FULCRUM_HALF = 62;
  const LOAD_W = 40, LOAD_H = 56;
  const ARROW_HALF = 9, ARROW_TOP = -110;

  const MAX_TILT = 0.16;            /* rad, ~9 degrees */
  const TILT_PER_NM = 0.0022;       /* rad per newton-metre of imbalance */
  const BALANCED_TOL = 0.5;         /* N·m */

  const COL = {
    beam: '#64748b', beamEdge: '#94a3b8', fulcrum: '#475569',
    load: '#f59e0b', loadEdge: '#fbbf24',
    effort: '#818cf8', effortEdge: '#a5b4fc',
    ink: '#e2e8f0', dim: '#94a3b8', faint: '#475569',
    ok: '#10b981'
  };

  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const SANS = 'system-ui, -apple-system, sans-serif';

  /* ── Presets: every one starts exactly balanced ──────── */

  const PRESETS = {
    seesaw: {
      label: 'Seesaw',
      loadForce: 400, loadArm: 1.5, effortForce: 400, effortArm: 1.5,
      caption: 'Equal weights at equal distances. The plank is level, but the lever has gained nothing: your effort arm is no longer than the load arm.'
    },
    wheelbarrow: {
      label: 'Wheelbarrow',
      loadForce: 500, loadArm: 0.6, effortForce: 200, effortArm: 1.5,
      caption: 'The load sits between the wheel and your hands, so you lift over a long distance and press over a longer one. 200 N of effort carries 500 N of rubble.'
    },
    elbow: {
      label: 'Elbow',
      loadForce: 100, loadArm: 0.3, effortForce: 200, effortArm: 0.15,
      caption: 'Your bicep attaches only a hand-span from the elbow joint, while the bag is a forearm away, so the muscle has to push harder than the load weighs.'
    },
    crowbar: {
      label: 'Crowbar',
      loadForce: 500, loadArm: 0.2, effortForce: 100, effortArm: 1.0,
      caption: 'A nail close to the fulcrum and your hands far along the bar. Small effort, huge mechanical advantage — which is exactly why it can snap.'
    }
  };
  const DEFAULT_PRESET = 'seesaw';

  /* Shown once the learner moves something and the scenario is no longer
     any of the presets. */
  const NEUTRAL_CAPTION = 'Your own lever now: a moment is a force times its '
    + 'distance from the pivot, so the same force counts for more further out.';

  /* ── DOM ───────────────────────────────────────────── */

  const canvas      = document.getElementById('stage');
  const stage       = EV.stage('stage');
  const ctx         = stage.ctx;

  const loadForceSlider = document.getElementById('loadForce');
  const effortForceSlider = document.getElementById('effortForce');
  const loadArmSlider = document.getElementById('loadArm');
  const effortArmSlider = document.getElementById('effortArm');

  const loadForceValue = document.getElementById('loadForceValue');
  const effortForceValue = document.getElementById('effortForceValue');
  const loadArmValue = document.getElementById('loadArmValue');
  const effortArmValue = document.getElementById('effortArmValue');

  const loadMomentValue = document.getElementById('loadMomentValue');
  const effortMomentValue = document.getElementById('effortMomentValue');
  const effortNeededValue = document.getElementById('effortNeededValue');
  const maValue = document.getElementById('maValue');
  const workValue = document.getElementById('workValue');
  const verdictValue = document.getElementById('verdictValue');

  const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));

  /* ── State ─────────────────────────────────────────── */

  let state;
  let rafId = null;
  let lastTime = 0;
  let interactions = 0;
  let lastInteraction = -1e9;
  let wasBalanced = true;
  let dragging = null;

  function makeInitialState() {
    const p = PRESETS[DEFAULT_PRESET];
    return {
      loadForce: p.loadForce, loadArm: p.loadArm,
      effortForce: p.effortForce, effortArm: p.effortArm,
      preset: DEFAULT_PRESET,
      tilt: 0
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  function loadMoment()  { return state.loadForce * state.loadArm; }
  function effortMoment(){ return state.effortForce * state.effortArm; }
  /* The force at the current effort arm that would exactly balance the load. */
  function effortNeeded(){ return loadMoment() / state.effortArm; }
  /* How many newtons of load each newton of effort lifts. Dividing the load
     by the effort actually needed makes this the arm ratio, so it stays the
     true advantage of the lever even when the moments do not match. */
  function advantage()   { return state.loadForce / effortNeeded(); }
  function workIn()      { return state.effortForce * state.effortArm; }
  function workOut()     { return state.loadForce * state.loadArm; }
  /* Positive means the effort side wins, so that side of the beam drops. */
  function imbalance()   { return effortMoment() - loadMoment(); }
  function isBalanced()  { return Math.abs(imbalance()) <= BALANCED_TOL; }

  function verdict() {
    if (isBalanced()) return 'Balanced';
    return imbalance() > 0 ? 'Effort side drops' : 'Load side drops';
  }

  /* The tilt is a pure function of the state, so it can never disagree with
     the readouts; the loop only eases towards it. */
  function targetTilt() {
    const t = imbalance() * TILT_PER_NM;
    return Math.max(-MAX_TILT, Math.min(MAX_TILT, t));
  }

  /* ── Geometry helpers ──────────────────────────────── */

  function caption() {
    const p = PRESETS[state.preset];
    return p ? p.caption : NEUTRAL_CAPTION;
  }

  function clampArm(m) { return Math.max(MIN_ARM, Math.min(MAX_ARM, m)); }

  function loadPoint() {
    return { x: PIVOT.x - state.loadArm * PX_PER_M, y: PIVOT.y + BEAM_Y };
  }
  /* Pointer position in the beam's own frame, so dragging still works when
     the beam is tilted. */
  function toBeamLocal(p) {
    const c = Math.cos(-state.tilt), s = Math.sin(-state.tilt);
    const dx = p.x - PIVOT.x, dy = p.y - PIVOT.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  function canvasCoords(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (stage.w / r.width),
      y: (e.clientY - r.top) * (stage.h / r.height)
    };
  }

  /* ── Render ────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, stage.w, stage.h);
    drawSceneHeading();
    drawGround();
    drawFulcrum();
    drawBeam();
    ctx.save();
    ctx.translate(PIVOT.x, PIVOT.y);
    ctx.rotate(state.tilt);
    drawRuler();
    drawArmDimension(-state.loadArm * PX_PER_M, 'load');
    drawArmDimension(state.effortArm * PX_PER_M, 'effort');
    drawLoad();
    drawEffort();
    ctx.restore();
    drawPanel();
  }

  /* Repaint on demand — the shared runtime needs this when
     prefers-reduced-motion stops the animation clock. */
  stage.onPaint = () => { syncReadout(); render(); };

  function drawSceneHeading() {
    ctx.fillStyle = COL.dim;
    ctx.font = '600 13px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Moment = force × distance', SCENE.x + PAD, SCENE.y + 24);
  }

  function drawGround() {
    ctx.strokeStyle = COL.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SCENE.x + PAD, GROUND_Y);
    ctx.lineTo(SCENE.x + SCENE.w - PAD, GROUND_Y);
    ctx.stroke();

    ctx.beginPath();
    for (let x = SCENE.x + PAD; x <= SCENE.x + SCENE.w - PAD; x += 26) {
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x - 11, GROUND_Y + 11);
    }
    ctx.stroke();
  }

  function drawFulcrum() {
    const apexY = PIVOT.y + BEAM_T / 2;
    ctx.fillStyle = COL.fulcrum;
    ctx.beginPath();
    ctx.moveTo(PIVOT.x, apexY);
    ctx.lineTo(PIVOT.x + FULCRUM_HALF, GROUND_Y);
    ctx.lineTo(PIVOT.x - FULCRUM_HALF, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = COL.beamEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawBeam() {
    ctx.save();
    ctx.translate(PIVOT.x, PIVOT.y);
    ctx.rotate(state.tilt);

    const y = -BEAM_T / 2;
    ctx.fillStyle = COL.beam;
    ctx.strokeStyle = COL.beamEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(BEAM_X0 - PIVOT.x, y, BEAM_X1 - BEAM_X0, BEAM_T, 4);
    ctx.fill();
    ctx.stroke();

    /* The pivot itself, drawn on the beam so it reads as a pin. */
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COL.beamEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /* Metre marks along the beam, so a distance can be read off the picture. */
  function drawRuler() {
    ctx.strokeStyle = COL.faint;
    ctx.fillStyle = COL.faint;
    ctx.lineWidth = 1;
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    for (let m = 0.5; m <= MAX_ARM + 1e-9; m += 0.5) {
      const px = m * PX_PER_M;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sign * px, -BEAM_T / 2);
        ctx.lineTo(sign * px, -BEAM_T / 2 - 6);
        ctx.stroke();
        ctx.fillText(m.toFixed(1), sign * px, -BEAM_T / 2 - 11);
      }
    }
    ctx.textAlign = 'left';
  }

  /* Dashed dimension line from the pivot to an attachment, with its distance. */
  function drawArmDimension(px, kind) {
    const y = BEAM_T / 2 + 20;
    const colour = kind === 'load' ? COL.loadEdge : COL.effortEdge;

    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(px, y);
    ctx.stroke();
    ctx.setLineDash([]);

    /* Ticks at both ends. */
    ctx.beginPath();
    ctx.moveTo(0, y - 5); ctx.lineTo(0, y + 5);
    ctx.moveTo(px, y - 5); ctx.lineTo(px, y + 5);
    ctx.stroke();

    const metres = Math.abs(px) / PX_PER_M;
    const label = metres.toFixed(2) + ' m';
    ctx.font = '600 11px ' + MONO;
    const w = ctx.measureText(label).width;

    /* Centring the label needs room either side of the arm's midpoint. A
       short arm would collide with the fulcrum or the beam end, so slide the
       label out past the attachment instead — the number stays on the
       dimension line it belongs to rather than being dropped. */
    const sign = px < 0 ? -1 : 1;
    const cx = Math.abs(px) < 64 ? sign * (Math.abs(px) + 7 + w / 2) : px / 2;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - w / 2 - 4, y - 16, w + 8, 13);
    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, cx, y - 5);
    ctx.textAlign = 'left';
  }

  function drawLoad() {
    const px = -state.loadArm * PX_PER_M;
    const top = BEAM_Y - BEAM_T / 2 - LOAD_H;

    ctx.fillStyle = COL.load;
    ctx.strokeStyle = COL.loadEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px - LOAD_W / 2, top, LOAD_W, LOAD_H, 5);
    ctx.fill();
    ctx.stroke();

    /* Hanger hook, so it reads as a weight on the beam. */
    ctx.beginPath();
    ctx.moveTo(px - 9, top);
    ctx.lineTo(px + 9, top);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 13px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.loadForce + ' N', px, top + LOAD_H / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = COL.loadEdge;
    ctx.font = '600 11px ' + SANS;
    ctx.textAlign = 'center';
    ctx.fillText('load', px, top - 9);
    ctx.textAlign = 'left';
  }

  function drawEffort() {
    const px = state.effortArm * PX_PER_M;
    const tipY = BEAM_Y - BEAM_T / 2;

    ctx.strokeStyle = COL.effort;
    ctx.fillStyle = COL.effort;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, ARROW_TOP);
    ctx.lineTo(px, tipY - 16);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(px, tipY);
    ctx.lineTo(px - ARROW_HALF, tipY - 15);
    ctx.lineTo(px + ARROW_HALF, tipY - 15);
    ctx.closePath();
    ctx.fill();

    ctx.lineCap = 'butt';
    ctx.font = '700 13px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText(state.effortForce + ' N', px, ARROW_TOP - 8);
    ctx.font = '600 11px ' + SANS;
    ctx.fillText('effort', px, ARROW_TOP - 25);
    ctx.textAlign = 'left';
  }

  /* ── The arithmetic panel ──────────────────────────── */

  function drawPanel() {
    const x = PANEL.x + PAD;
    const w = PANEL.w - PAD * 2;

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COL.ink;
    ctx.font = '600 14px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Balance check', x, PANEL.y + 30);

    const loadM = loadMoment(), effortM = effortMoment();
    const full = Math.max(loadM, effortM, 20);

    drawMomentRow(x, w, 84, 'Load', state.loadForce + ' N × ' + state.loadArm.toFixed(2) + ' m',
                  loadM, loadM / full, COL.load, COL.loadEdge);
    drawMomentRow(x, w, 168, 'Effort', state.effortForce + ' N × ' + state.effortArm.toFixed(2) + ' m',
                  effortM, effortM / full, COL.effort, COL.effortEdge);

    ctx.strokeStyle = COL.faint;
    ctx.beginPath();
    ctx.moveTo(x, 244);
    ctx.lineTo(x + w, 244);
    ctx.stroke();

    ctx.fillStyle = COL.dim;
    ctx.font = '600 12px ' + SANS;
    ctx.fillText('Balance', x, 270);

    const balanced = isBalanced();
    const pill = balanced ? COL.ok : (imbalance() > 0 ? COL.effort : COL.load);
    ctx.fillStyle = pill;
    ctx.beginPath();
    ctx.roundRect(x, 282, w, 38, 8);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 15px ' + SANS;
    ctx.textAlign = 'center';
    ctx.fillText(verdict(), x + w / 2, 306);
    ctx.textAlign = 'left';

    drawWrapped(caption(), x, 352, w, 16, '12px ' + SANS, COL.dim);
  }

  function drawMomentRow(x, w, top, label, working, moment, fraction, fill, edge) {
    ctx.fillStyle = COL.ink;
    ctx.font = '600 13px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, top);

    ctx.font = '700 13px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillText(moment.toFixed(0) + ' N·m', x + w, top);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(x, top + 10, w, 16, 8);
    ctx.fill();

    const barW = Math.max(0, Math.min(1, fraction)) * w;
    if (barW > 1) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, top + 10, barW, 16, 8);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = COL.dim;
    ctx.font = '11px ' + MONO;
    ctx.fillText(working, x, top + 46);
  }

  /* Greedy word wrap, so the caption never runs past the panel edge. */
  function drawWrapped(text, x, y, maxW, lineH, font, colour) {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const words = text.split(' ');
    let line = '';
    let row = 0;
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > maxW && line) {
        ctx.fillText(line, x, y + row * lineH);
        row++;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x, y + row * lineH);
    return row + 1;
  }

  /* ── Readout ───────────────────────────────────────── */

  function syncReadout() {
    loadForceValue.textContent   = state.loadForce + ' N';
    effortForceValue.textContent = state.effortForce + ' N';
    loadArmValue.textContent     = state.loadArm.toFixed(2) + ' m';
    effortArmValue.textContent   = state.effortArm.toFixed(2) + ' m';

    loadMomentValue.textContent   = loadMoment().toFixed(0) + ' N·m';
    effortMomentValue.textContent = effortMoment().toFixed(0) + ' N·m';
    effortNeededValue.textContent = effortNeeded().toFixed(0) + ' N';
    maValue.textContent           = '×' + advantage().toFixed(2);
    workValue.textContent         = workIn().toFixed(0) + ' J / ' + workOut().toFixed(0) + ' J';
    verdictValue.textContent      = verdict();
  }

  /* ── State mutation ────────────────────────────────── */

  function pushSliders() {
    loadForceSlider.value = state.loadForce;
    effortForceSlider.value = state.effortForce;
    loadArmSlider.value = state.loadArm;
    effortArmSlider.value = state.effortArm;
  }

  /* Counted per deliberate change, not per event: a single drag fires a
     pointermove per frame, which would otherwise reveal the insight before
     the learner has done anything. */
  const INTERACTION_WINDOW_MS = 900;

  function countInteraction() {
    const now = performance.now();
    if (now - lastInteraction < INTERACTION_WINDOW_MS) return;
    lastInteraction = now;
    interactions++;
    if (interactions >= 4) EV.revealInsight();
  }

  function announceBalance() {
    const balanced = isBalanced();
    if (balanced && !wasBalanced) EV.say('Balanced');
    wasBalanced = balanced;
  }

  function markPreset(key) {
    for (const btn of presetButtons) {
      btn.setAttribute('aria-pressed', String(!!key && btn.dataset.preset === key));
    }
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    state.loadForce = p.loadForce;
    state.loadArm = p.loadArm;
    state.effortForce = p.effortForce;
    state.effortArm = p.effortArm;
    state.preset = key;

    markPreset(key);

    pushSliders();
    countInteraction();
    wasBalanced = true;
    EV.say(p.label + ': ' + state.effortForce + ' newtons of effort holds a '
          + state.loadForce + ' newton load.');
    syncReadout();
    render();
    startLoop();
  }

  function setLoadArm(m) {
    state.loadArm = clampArm(m);
    markPreset('');
    loadArmSlider.value = state.loadArm;
    countInteraction();
    announceBalance();
    syncReadout();
    render();
    startLoop();
  }

  function setEffortArm(m) {
    state.effortArm = clampArm(m);
    markPreset('');
    effortArmSlider.value = state.effortArm;
    countInteraction();
    announceBalance();
    syncReadout();
    render();
    startLoop();
  }

  function setForce(which, n) {
    if (which === 'load') state.loadForce = n;
    else state.effortForce = n;
    markPreset('');
    (which === 'load' ? loadForceSlider : effortForceSlider).value = n;
    countInteraction();
    announceBalance();
    syncReadout();
    render();
    startLoop();
  }

  /* ── Dragging ──────────────────────────────────────── */

  canvas.addEventListener('pointerdown', (e) => {
    const p = canvasCoords(e);
    const local = toBeamLocal(p);
    const inLoad = Math.abs(local.x + state.loadArm * PX_PER_M) < LOAD_W / 2 + 14
      && local.y < 0 && local.y > ARROW_TOP - 30;
    const inEffort = Math.abs(local.x - state.effortArm * PX_PER_M) < ARROW_HALF + 16
      && local.y <= 0 && local.y > ARROW_TOP - 30;
    if (!inLoad && !inEffort) return;

    /* With both arms short the two targets overlap, and a fixed priority
       left part of the effort arrow dead. Take whichever is nearer. */
    const distLoad = Math.abs(local.x + state.loadArm * PX_PER_M);
    const distEffort = Math.abs(local.x - state.effortArm * PX_PER_M);
    const grabbed = inLoad && inEffort
      ? (distEffort < distLoad ? 'effort' : 'load')
      : (inLoad ? 'load' : 'effort');

    dragging = grabbed;
    canvas.setPointerCapture(e.pointerId);
    if (grabbed === 'load') setLoadArm(-local.x / PX_PER_M);
    else setEffortArm(local.x / PX_PER_M);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const local = toBeamLocal(canvasCoords(e));
    if (dragging === 'load') setLoadArm(-local.x / PX_PER_M);
    else setEffortArm(local.x / PX_PER_M);
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* Keyboard equivalent: focus the canvas and slide the load with the arrow
     keys, which is the drag learners reach for first. */
  EV.onDragKey(canvas, (x) => {
    setLoadArm(-toBeamLocal({ x, y: PIVOT.y }).x / PX_PER_M);
  }, { step: 10, bigStep: 40, start: () => ({ x: loadPoint().x, y: PIVOT.y }) });

  /* ── Input wiring ──────────────────────────────────── */

  loadForceSlider.addEventListener('input', () => setForce('load', parseFloat(loadForceSlider.value)));
  effortForceSlider.addEventListener('input', () => setForce('effort', parseFloat(effortForceSlider.value)));
  loadArmSlider.addEventListener('input', () => setLoadArm(parseFloat(loadArmSlider.value)));
  effortArmSlider.addEventListener('input', () => setEffortArm(parseFloat(effortArmSlider.value)));

  for (const btn of presetButtons) {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  }

  /* ── Animation loop ────────────────────────────────── */

  /* The beam only moves while it is easing towards a new angle, so the
     loop parks itself once the tilt has settled instead of redrawing the
     same picture sixty times a second forever. */
  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;

    const target = targetTilt();
    if (dt > 0) state.tilt += (target - state.tilt) * Math.min(1, dt * 10);
    /* Reduced motion: no easing, but the beam must still match the numbers. */
    else state.tilt = target;

    render();

    if (Math.abs(target - state.tilt) < 0.0004) {
      state.tilt = target;
      render();
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId === null) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  /* ── Reset ─────────────────────────────────────────── */

  function reset() {
    state = makeInitialState();
    interactions = 0;
    lastInteraction = -1e9;
    wasBalanced = true;
    dragging = null;
    markPreset(DEFAULT_PRESET);
    pushSliders();
    EV.resetInsight();
    syncReadout();
    render();
    startLoop();
  }

  EV.onReset(reset);

  /* ── Init ──────────────────────────────────────────── */

  state = makeInitialState();
  pushSliders();
  syncReadout();
  render();
  startLoop();

})();
