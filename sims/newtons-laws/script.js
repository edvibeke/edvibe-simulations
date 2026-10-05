(() => {
  'use strict';

  /* ── Layout ──────────────────────────────────────────
     A scene on the left (crate, floor, force arrows) and a panel on the
     right that does the arithmetic the diagram implies. Every number below
     is in logical canvas pixels. */

  const SCENE = { x: 16,  y: 16, w: 584, h: 508 };
  const PANEL = { x: 612, y: 16, w: 272, h: 508 };
  const PAD   = 16;

  const G = 9.81;                 /* gravity, m/s² */
  const STATIC_FACTOR = 1.3;      /* static grip is a little larger than sliding friction */

  const FLOOR_Y   = 396;          /* canvas y of the floor surface */
  const CRATE_W   = 74;
  const CRATE_H   = 62;
  const PX_PER_M  = 12;           /* world metres → canvas px */
  const TRACK_M   = 10;           /* half-width of the run, in metres */
  const START_X   = SCENE.x + SCENE.w / 2;

  const ARROW_SPAN = 110;         /* px an arrow reaches at 400 N */
  const ARROW_MIN  = 26;          /* shortest arrow we bother drawing, px */
  const LANE_GAP   = 26;          /* vertical gap between arrow lanes, px */
  const CRATE_GAP  = 22;          /* gap between the crate top and lane 0, px */

  const V_EPS = 0.02;             /* below this we call the crate stopped, m/s */
  const SAY_V = 0.5;              /* only announce motion once it has some pace, m/s */
  const TRAIL_STEP_M = 0.18;      /* spacing between tail dots, metres */
  const TRAIL_MAX = 16;           /* tail dots kept behind the crate */

  const COL = {
    crate: '#f59e0b', crateEdge: '#fbbf24',
    push: '#818cf8', pushEdge: '#a5b4fc',
    pull: '#f472b6', pullEdge: '#f9a8d4',
    friction: '#fb923c', frictionEdge: '#fdba74',
    net: '#10b981',
    ink: '#e2e8f0', dim: '#94a3b8', faint: '#475569', dark: '#0f172a'
  };

  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const SANS = 'system-ui, -apple-system, sans-serif';

  /* ── Presets ────────────────────────────────────────── */

  const PRESETS = {
    'push-cart': {
      label: 'Push the cart',
      push: 120, pull: 0, mu: 0.30, mass: 20,
      caption: 'A trolley on a supermarket floor. The grip can hold about 77 N, so 120 N of push gets it going — and once it rolls, 59 N of every push goes on friction.'
    },
    'pull-crate': {
      label: 'Pull the crate',
      push: 0, pull: 180, mu: 0.40, mass: 25,
      caption: 'Hauling a crate left by its rope. Friction is the same whichever way you go, so a hard pull is no easier than a hard push would have been.'
    },
    bookshelf: {
      label: 'Shift the bookshelf',
      push: 200, pull: 0, mu: 0.90, mass: 60,
      caption: 'A 60 kg bookcase on carpet. It can hold up about 690 N before it slips, and 200 N is nowhere near that — lean harder for ever and it still will not budge.'
    },
    'ice-rink': {
      label: 'Ice rink',
      push: 40, pull: 0, mu: 0.02, mass: 15,
      caption: 'A skate on ice. Friction is almost nothing, so nearly all of the 40 N becomes acceleration — a push that would not shift a crate sends this one flying.'
    }
  };
  const DEFAULT_PRESET = 'push-cart';
  const NEUTRAL_CAPTION = 'Your own setup. Net force is push and pull added '
    + 'together, minus the friction holding it back; divide that by the mass for the acceleration.';

  /* ── DOM ───────────────────────────────────────────── */

  const canvas = document.getElementById('stage');
  const stage  = EV.stage('stage');
  const ctx    = stage.ctx;

  const pushSlider     = document.getElementById('push');
  const pullSlider     = document.getElementById('pull');
  const frictionSlider = document.getElementById('friction');
  const massSlider     = document.getElementById('mass');

  const pushValue     = document.getElementById('pushValue');
  const pullValue     = document.getElementById('pullValue');
  const frictionValue = document.getElementById('frictionValue');
  const massValue     = document.getElementById('massValue');

  const netValue           = document.getElementById('netValue');
  const frictionForceValue = document.getElementById('frictionForceValue');
  const accelValue         = document.getElementById('accelValue');
  const speedValue         = document.getElementById('speedValue');
  const directionValue     = document.getElementById('directionValue');
  const verdictValue       = document.getElementById('verdictValue');

  const releaseBtn    = document.querySelector('[data-action="release"]');
  const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));

  /* ── State ─────────────────────────────────────────── */

  let state;
  let rafId = null;
  let lastTime = 0;
  let interactions = 0;
  let lastInteraction = -1e9;
  let wasMoving = false;
  let released = false;
  let dragging = false;
  let endAnnounced = false;

  /* The crate is held at the start until Release, so a huge net force cannot
     send it off the canvas before anyone is watching. */
  function makeInitialState() {
    const p = PRESETS[DEFAULT_PRESET];
    return {
      push: p.push, pull: p.pull, mu: p.mu, mass: p.mass,
      preset: DEFAULT_PRESET,
      x: 0,          /* metres from the start, signed */
      v: 0,          /* m/s, signed */
      trail: [],     /* recent positions, metres */
      lastTrailX: 0,
      atEnd: false,  /* parked against a wall of the track */
      endSign: 0
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  function appliedForce() { return state.push - state.pull; }

  function staticLimit() { return STATIC_FACTOR * state.mu * state.mass * G; }
  function kineticFriction() { return state.mu * state.mass * G; }

  /* A crate jammed against the end of the track is being held by the wall, so
     the wall cancels the push and the floor's friction drops out entirely. */
  function heldByWall() {
    return state.atEnd && Math.sign(appliedForce()) === state.endSign;
  }

  /* Friction opposes the motion; when the crate is not moving, it opposes
     the applied force instead, but only up to the grip limit. That is why a
     push too small to beat the grip does nothing at all. Signed: + is right. */
  function frictionForce() {
    if (heldByWall()) return 0;
    if (Math.abs(state.v) < V_EPS) {
      const a = appliedForce();
      return -Math.sign(a) * Math.min(Math.abs(a), staticLimit());
    }
    return -Math.sign(state.v) * kineticFriction();
  }

  function wallForce() { return heldByWall() ? -appliedForce() : 0; }

  function frictionMagnitude() { return Math.abs(frictionForce()); }
  function frictionDir() { return -Math.sign(frictionForce()); }

  function netForce() { return appliedForce() + frictionForce() + wallForce(); }
  function acceleration() { return netForce() / state.mass; }

  /* Whether letting go will start it moving at all, which depends on the
     applied force beating the grip rather than on any velocity it has not
     got yet. */
  function willMove() { return Math.abs(appliedForce()) > staticLimit(); }

  function direction() {
    if (state.v > V_EPS) return 'Right';
    if (state.v < -V_EPS) return 'Left';
    if (appliedForce() > 0) return 'Right';
    if (appliedForce() < 0) return 'Left';
    return 'Still';
  }

  function verdict() {
    if (!released) return 'Ready — press Release';
    if (heldByWall()) return 'Held by the wall';
    if (Math.abs(state.v) < V_EPS) {
      return Math.abs(appliedForce()) < 0.5 ? 'Balanced' : 'Held by friction';
    }
    if (Math.abs(netForce()) < 0.5) return 'Constant speed';
    return netForce() * state.v > 0 ? 'Speeding up' : 'Slowing down';
  }

  /* ── Geometry ──────────────────────────────────────── */

  function clampTrack(m) { return Math.max(-TRACK_M, Math.min(TRACK_M, m)); }

  function crateCentre() {
    return { x: START_X + state.x * PX_PER_M, y: FLOOR_Y - CRATE_H / 2 };
  }

  function caption() {
    const p = PRESETS[state.preset];
    return p ? p.caption : NEUTRAL_CAPTION;
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
    drawHeading();
    drawFloor();
    drawTrail();
    drawCrate();
    drawArrows();
    drawPanel();
  }

  stage.onPaint = () => { syncReadout(); render(); };

  function drawHeading() {
    ctx.fillStyle = COL.dim;
    ctx.font = '600 13px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Net force = push − pull − friction', SCENE.x + PAD, SCENE.y + 24);
  }

  function drawFloor() {
    ctx.strokeStyle = COL.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SCENE.x + PAD, FLOOR_Y);
    ctx.lineTo(SCENE.x + SCENE.w - PAD, FLOOR_Y);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = SCENE.x + PAD; x <= SCENE.x + SCENE.w - PAD; x += 26) {
      ctx.moveTo(x, FLOOR_Y);
      ctx.lineTo(x - 11, FLOOR_Y + 11);
    }
    ctx.stroke();

    /* Metre ticks, so a distance can be read off the picture. */
    ctx.fillStyle = COL.faint;
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    for (let m = -TRACK_M; m <= TRACK_M; m += 2) {
      const x = START_X + m * PX_PER_M;
      ctx.beginPath();
      ctx.moveTo(x, FLOOR_Y);
      ctx.lineTo(x, FLOOR_Y + 7);
      ctx.stroke();
      if (m % 5 === 0) ctx.fillText(String(Math.abs(m)), x, FLOOR_Y + 22);
    }
    ctx.textAlign = 'left';
  }

  /* A short tail behind a moving crate, so its direction is unmistakable. */
  function drawTrail() {
    if (state.trail.length < 2) return;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
    for (let i = 0; i < state.trail.length - 1; i++) {
      const a = i / (state.trail.length - 1);
      ctx.globalAlpha = 0.15 + 0.55 * a;
      const x = START_X + state.trail[i] * PX_PER_M;
      ctx.beginPath();
      ctx.arc(x, FLOOR_Y - CRATE_H / 2, 3 + 4 * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCrate() {
    const c = crateCentre();
    ctx.fillStyle = COL.crate;
    ctx.strokeStyle = COL.crateEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(c.x - CRATE_W / 2, c.y - CRATE_H / 2, CRATE_W, CRATE_H, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COL.dark;
    ctx.font = '700 14px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.mass + ' kg', c.x, c.y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /* One force arrow leaving the crate. dir is +1 right, -1 left. The label
     sits above the middle of the shaft rather than past the tip, so it can
     never run off the edge of the scene. */
  function forceArrow(dir, newtons, colour, edge, label, lane, baseline) {
    if (newtons <= 0) return;
    const c = crateCentre();
    const len = Math.max(ARROW_MIN, newtons / 400 * ARROW_SPAN);
    const y = baseline - lane * LANE_GAP;
    const x0 = c.x;
    const x1 = c.x + dir * len;

    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1 - dir * 12, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 - dir * 13, y - 8);
    ctx.lineTo(x1 - dir * 13, y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'butt';

    ctx.font = '600 11px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillStyle = edge;
    ctx.fillText(label, (x0 + x1) / 2, y - 10);
    ctx.textAlign = 'left';
  }

  function drawArrows() {
    const top = FLOOR_Y - CRATE_H - CRATE_GAP;
    forceArrow(frictionDir(), frictionMagnitude(), COL.friction, COL.frictionEdge,
               Math.round(frictionMagnitude()) + ' N friction', 2, top);
    forceArrow(-1, state.pull, COL.pull, COL.pullEdge, state.pull + ' N pull', 1, top);
    forceArrow(+1, state.push, COL.push, COL.pushEdge, state.push + ' N push', 0, top);
    drawNetArrow();
  }

  /* The resultant, drawn below the floor where it cannot be mistaken for one
     of the applied forces. */
  function drawNetArrow() {
    const net = netForce();
    if (Math.abs(net) < 0.5) return;
    const c = crateCentre();
    const dir = Math.sign(net);
    const len = Math.max(ARROW_MIN, Math.abs(net) / 400 * ARROW_SPAN);
    const y = FLOOR_Y + 56;

    ctx.strokeStyle = COL.net;
    ctx.fillStyle = COL.net;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x, y);
    ctx.lineTo(c.x + dir * len - dir * 13, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(c.x + dir * len, y);
    ctx.lineTo(c.x + dir * len - dir * 14, y - 9);
    ctx.lineTo(c.x + dir * len - dir * 14, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'butt';

    ctx.font = '700 12px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText('net ' + Math.round(net) + ' N', c.x + dir * len / 2, y - 11);
    ctx.textAlign = 'left';
  }

  /* ── The arithmetic panel ──────────────────────────── */

  function drawPanel() {
    const x = PANEL.x + PAD;
    const w = PANEL.w - PAD * 2;

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = COL.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COL.ink;
    ctx.font = '600 14px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Second law', x, PANEL.y + 30);

    const f = frictionMagnitude();
    const full = Math.max(state.push, state.pull, f, 20);

    drawBar(x, w, 84, 'Push', state.push + ' N', state.push, full, COL.push, COL.pushEdge);
    drawBar(x, w, 148, 'Pull', state.pull + ' N', state.pull, full, COL.pull, COL.pullEdge);
    drawBar(x, w, 212, 'Friction', Math.round(f) + ' N', f, full, COL.friction, COL.frictionEdge);

    ctx.strokeStyle = COL.faint;
    ctx.beginPath();
    ctx.moveTo(x, 276);
    ctx.lineTo(x + w, 276);
    ctx.stroke();

    ctx.fillStyle = COL.dim;
    ctx.font = '600 12px ' + SANS;
    ctx.fillText('Verdict', x, 300);

    ctx.fillStyle = released && !state.atEnd ? COL.net : COL.faint;
    ctx.beginPath();
    ctx.roundRect(x, 312, w, 38, 8);
    ctx.fill();

    ctx.fillStyle = COL.dark;
    ctx.font = '700 15px ' + SANS;
    ctx.textAlign = 'center';
    ctx.fillText(verdict(), x + w / 2, 336);
    ctx.textAlign = 'left';

    drawWrapped(caption(), x, 380, w, 16, '12px ' + SANS, COL.dim);
  }

  function drawBar(x, w, top, label, value, amount, full, fill, edge) {
    ctx.fillStyle = COL.ink;
    ctx.font = '600 13px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, top);

    ctx.font = '700 13px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w, top);
    ctx.textAlign = 'left';

    ctx.fillStyle = COL.dark;
    ctx.beginPath();
    ctx.roundRect(x, top + 10, w, 16, 8);
    ctx.fill();

    const barW = Math.max(0, Math.min(1, amount / full)) * w;
    if (barW <= 1) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, top + 10, barW, 16, 8);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* Greedy word wrap, so the caption never runs past the panel edge. */
  function drawWrapped(text, x, y, maxW, lineH, font, colour) {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let line = '';
    let row = 0;
    for (const word of text.split(' ')) {
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
    pushValue.textContent     = state.push + ' N';
    pullValue.textContent     = state.pull + ' N';
    frictionValue.textContent = state.mu.toFixed(2);
    massValue.textContent     = state.mass + ' kg';

    netValue.textContent           = Math.round(netForce()) + ' N';
    frictionForceValue.textContent = Math.round(frictionMagnitude()) + ' N';
    accelValue.textContent         = acceleration().toFixed(2) + ' m/s²';
    speedValue.textContent         = Math.abs(state.v).toFixed(2) + ' m/s';
    directionValue.textContent     = direction();
    verdictValue.textContent       = verdict();
  }

  /* ── State mutation ────────────────────────────────── */

  function pushSliders() {
    pushSlider.value = state.push;
    pullSlider.value = state.pull;
    frictionSlider.value = state.mu;
    massSlider.value = state.mass;
  }

  function clearMotion() {
    state.x = 0;
    state.v = 0;
    state.trail = [];
    state.lastTrailX = 0;
    state.atEnd = false;
    state.endSign = 0;
    endAnnounced = false;
    wasMoving = false;
  }

  /* Counted per deliberate change rather than per event, so one drag of the
     pointer cannot reveal the insight on its own. */
  const INTERACTION_WINDOW_MS = 900;

  function countInteraction() {
    const now = performance.now();
    if (now - lastInteraction < INTERACTION_WINDOW_MS) return;
    lastInteraction = now;
    interactions++;
    if (interactions >= 4) EV.revealInsight();
  }

  function markPreset(key) {
    for (const btn of presetButtons) {
      btn.setAttribute('aria-pressed', String(!!key && btn.dataset.preset === key));
    }
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    state.push = p.push;
    state.pull = p.pull;
    state.mu = p.mu;
    state.mass = p.mass;
    state.preset = key;

    markPreset(key);
    pushSliders();
    clearMotion();
    released = false;

    countInteraction();
    EV.say(p.label + ': ' + p.push + ' newtons of push, ' + p.pull
          + ' of pull, on ' + p.mass + ' kilograms.');
    syncReadout();
    render();
    startLoop();
  }

  /* Slider changes re-read the live physics, so the readouts stay truthful
     while the crate is still moving. */
  function setParam(which, value) {
    if (which === 'push') state.push = value;
    else if (which === 'pull') state.pull = value;
    else if (which === 'mu') state.mu = value;
    else state.mass = value;

    markPreset('');
    countInteraction();
    syncReadout();
    render();
    startLoop();
  }

  function release() {
    const again = released;
    released = true;
    clearMotion();
    countInteraction();

    if (again) {
      /* A second press is a replay: back to the start line, same forces. */
      EV.say('Back to the start line.');
      syncReadout();
      render();
      startLoop();
      return;
    }

    /* Judge from the forces, since at this instant the crate has not moved. */
    const a = acceleration();
    EV.say(!willMove()
      ? 'Released, but the friction holds it: the push never beats the grip.'
      : 'Released. Speeding up ' + (a > 0 ? 'to the right' : 'to the left') + '.');
    syncReadout();
    render();
    startLoop();
  }

  /* ── Dragging the crate by hand ────────────────────── */

  function pointerOnCrate(p) {
    const c = crateCentre();
    return Math.abs(p.x - c.x) < CRATE_W / 2 + 12
      && Math.abs(p.y - c.y) < CRATE_H / 2 + 12;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!pointerOnCrate(canvasCoords(e))) return;
    dragging = true;
    released = true;
    state.trail = [];
    state.lastTrailX = state.x;
    state.atEnd = false;
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(e.pointerId);
    countInteraction();
    EV.say('Pushing the crate by hand.');
    syncReadout();
    render();
    startLoop();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = canvasCoords(e);
    state.x = clampTrack((p.x - START_X) / PX_PER_M);
    state.lastTrailX = state.x;
    state.atEnd = false;
    countInteraction();
    syncReadout();
    render();
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('is-dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already gone */ }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* Keyboard equivalent: focus the canvas and nudge the crate along. */
  EV.onDragKey(canvas, (x) => {
    const m = clampTrack((x - START_X) / PX_PER_M);
    state.v = Math.sign(m - state.x) * Math.min(Math.abs(m - state.x) * 4, 6);
    released = true;
    countInteraction();
    syncReadout();
    render();
    startLoop();
  }, { step: 12, bigStep: 48, start: () => crateCentre() });

  /* ── Input wiring ──────────────────────────────────── */

  pushSlider.addEventListener('input', () => setParam('push', parseFloat(pushSlider.value)));
  pullSlider.addEventListener('input', () => setParam('pull', parseFloat(pullSlider.value)));
  frictionSlider.addEventListener('input', () => setParam('mu', parseFloat(frictionSlider.value)));
  massSlider.addEventListener('input', () => setParam('mass', parseFloat(massSlider.value)));

  releaseBtn.addEventListener('click', release);

  for (const btn of presetButtons) {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  }

  /* ── Animation loop ────────────────────────────────── */

  function update(dt) {
    if (!released || dragging || state.atEnd) return;

    const a = acceleration();
    state.v += a * dt;
    state.x = clampTrack(state.x + state.v * dt);

    /* The ends of the track are walls: stop there and park, rather than
       grinding against the wall forever or bouncing back unbidden. */
    if (state.x <= -TRACK_M || state.x >= TRACK_M) {
      state.x = clampTrack(state.x);
      state.v = 0;
      state.atEnd = true;
      state.endSign = Math.sign(state.x) || 1;
      if (!endAnnounced) {
        endAnnounced = true;
        EV.say('It has reached the end of the track, and the wall is now holding it. '
             + 'Reverse the force, or press Reset.');
      }
      return;
    }

    if (Math.abs(state.v) < V_EPS && Math.abs(a) < 0.02) state.v = 0;

    /* Space trail points by distance, not by frame, so the tail looks the
       same on a fast machine as on a slow one. */
    if (Math.abs(state.v) > 0.05 && Math.abs(state.x - state.lastTrailX) >= TRAIL_STEP_M) {
      state.trail.push(state.x);
      state.lastTrailX = state.x;
      if (state.trail.length > TRAIL_MAX) state.trail.shift();
    }

    announceMotion();
  }

  /* One announcement as the crate sets off, not one per frame, and only once
     it has enough pace for the speed to be worth reading out. */
  function announceMotion() {
    const moving = Math.abs(state.v) >= SAY_V;
    if (moving && !wasMoving) {
      EV.say(direction() + ' at ' + Math.abs(state.v).toFixed(1) + ' metres per second.');
    }
    wasMoving = moving;
  }

  /* A parked crate at a wall starts again once the force turns round. */
  function resumeIfReversed() {
    if (!state.atEnd) return false;
    if (Math.sign(appliedForce()) === state.endSign) return true;
    state.atEnd = false;
    state.trail = [];
    state.lastTrailX = state.x;
    endAnnounced = false;
    return false;
  }

  function stillBusy() {
    return released && !dragging
      && (Math.abs(state.v) >= V_EPS || Math.abs(acceleration()) >= 0.02);
  }

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;

    if (!resumeIfReversed()) update(dt);
    render();
    syncReadout();

    if (stillBusy()) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    rafId = null;
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
    endAnnounced = false;
    wasMoving = false;
    released = false;
    dragging = false;
    canvas.classList.remove('is-dragging');
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
  markPreset(DEFAULT_PRESET);
  pushSliders();
  syncReadout();
  render();
  startLoop();

})();
