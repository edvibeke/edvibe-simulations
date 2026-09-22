(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;

  const G = 9.81;            // m/s²
  const PX_PER_M = 40;       // scene pixels per metre of height

  // V-shaped track, frictionless
  const A = { x: 70,  y: 110 };   // top of the left arm (release point)
  const V = { x: 450, y: 440 };   // bottom of the valley
  const B = { x: 830, y: 170 };   // top of the right arm

  const mL = (V.y - A.y) / (V.x - A.x);   // gradient of the left arm
  const mR = (B.y - V.y) / (B.x - V.x);   // gradient of the right arm (negative)

  const BALL_R = 15;

  // Energy bar
  const BAR = { x0: 500, x1: 878, y: 468, h: 26 };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas         = document.getElementById('stage');
  const ctx            = canvas.getContext('2d');
  const massEl         = document.getElementById('mass');
  const massValue      = document.getElementById('massValue');
  const heightEl       = document.getElementById('height');
  const heightValue    = document.getElementById('heightValue');
  const pushEl         = document.getElementById('push');
  const pushValue      = document.getElementById('pushValue');
  const pauseBtn       = document.getElementById('pauseBtn');
  const peValue        = document.getElementById('peValue');
  const keValue        = document.getElementById('keValue');
  const speedValue     = document.getElementById('speedValue');
  const heightOutValue = document.getElementById('heightOutValue');
  const helpEl         = document.getElementById('help');
  const insightEl      = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let state = {
    x: A.x,
    dir: 1,
    paused: false,
    m: 1,
    eh: 0,          // specific energy E/m (m²/s²), conserved
    swings: 0
  };
  let rafId = null;
  let lastTime = 0;

  /* ── Track helpers ──────────────────────────────────── */

  function trackY(x) {
    if (x <= V.x) return A.y + mL * (x - A.x);
    return V.y + mR * (x - V.x);
  }

  function groundSlope(x) {
    return x <= V.x ? (1 + mL * mL) : (1 + mR * mR);
  }

  function heightMetres(y) {
    return (V.y - y) / PX_PER_M;
  }

  /* ── Energy model ───────────────────────────────────── */

  function applySliders() {
    state.m  = Number(massEl.value);
    const h0 = heightMetres(releasePosition().y);
    const v0 = Number(pushEl.value);
    state.eh = G * h0 + 0.5 * v0 * v0;      // specific energy, conserved
  }

  function releasePosition() {
    const frac = (100 - Number(heightEl.value)) / 100;
    return { x: A.x + (V.x - A.x) * frac, y: A.y + (V.y - A.y) * frac };
  }

  function energyAt(y) {
    const hm = heightMetres(y);
    const pe = state.m * G * hm;
    const ke = Math.max(0, state.m * state.eh - pe);
    const v  = Math.sqrt((2 * ke) / state.m);
    return { pe: pe, ke: ke, v: v, hm: hm };
  }

  /* ── Update ─────────────────────────────────────────── */

  function update(dt) {
    if (state.paused) return;

    const y = trackY(state.x);
    const { ke } = energyAt(y);
    const v = Math.sqrt((2 * ke) / state.m);

    // along-track speed → horizontal ground speed
    const dx = (v / Math.sqrt(groundSlope(state.x))) * dt * PX_PER_M;
    let nx = state.x + state.dir * (dx < 0.03 ? 0.03 : dx);

    // zero-KE height (px) on each arm: where all energy is potential
    const hTurnPx = V.y - (state.eh / G) * PX_PER_M;

    const reachedTurn = trackY(nx) <= hTurnPx;
    const hitEndL = nx <= A.x;
    const hitEndR = nx >= B.x;

    if (hitEndL || hitEndR) {
      nx = Math.max(A.x, Math.min(B.x, nx));
      state.dir *= -1;
    } else if (reachedTurn) {
      state.dir *= -1;
    }

    // count a "swing" each time the ball crosses the valley floor
    if ((state.dir === 1 && state.x < V.x && nx >= V.x) ||
        (state.dir === -1 && state.x > V.x && nx <= V.x)) {
      state.swings++;
      if (state.swings >= 4 && insightEl.hidden) insightEl.hidden = false;
    }

    state.x = nx;
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);

    drawTrack();
    drawBall();
    drawEnergyBar();
  }

  function drawTrack() {
    // ground hint
    ctx.fillStyle = 'rgba(99,102,241,0.08)';
    ctx.fillRect(0, V.y + 8, W, H - V.y - 8);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // shadow under the rails
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y + 4);
    ctx.lineTo(V.x, V.y + 4);
    ctx.lineTo(B.x, B.y + 4);
    ctx.stroke();

    // track
    const grad = ctx.createLinearGradient(0, A.y, 0, V.y);
    grad.addColorStop(0, '#475569');
    grad.addColorStop(1, '#64748b');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(V.x, V.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();

    // release peg
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.arc(A.x, A.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c7d2fe';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('release', A.x, A.y - 10);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('PE maximum', A.x, A.y + 22);
    ctx.fillText('PE maximum', B.x, B.y + 22);
    ctx.fillStyle = '#64748b';
    ctx.fillText('KE maximum', V.x - 40, V.y - 36);
  }

  function drawBall() {
    const y = trackY(state.x);
    const { ke } = energyAt(y);

    // soft motion trail
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps;
      const px = state.x - state.dir * t * 26;
      if (px < A.x || px > B.x) continue;
      const py = trackY(px);
      ctx.globalAlpha = (1 - t) * 0.12;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(px, py, BALL_R * (0.6 + t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ball
    ctx.beginPath();
    ctx.arc(state.x, y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#92400e';
    ctx.stroke();

    // highlight
    ctx.beginPath();
    ctx.arc(state.x - 5, y - 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
  }

  function drawEnergyBar() {
    const y = trackY(state.x);
    const { pe, ke } = energyAt(y);
    const total = Math.max(1e-9, pe + ke);

    ctx.fillStyle = 'rgba(11,18,32,0.55)';
    roundRect(BAR.x0 - 12, BAR.y - 26, BAR.x1 - BAR.x0 + 24, BAR.h + 40, 10);
    ctx.fill();

    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#facc15';
    ctx.fillText('KE', BAR.x0, BAR.y - 12);
    ctx.fillStyle = '#4ade80';
    ctx.fillText('PE', BAR.x0 + 44, BAR.y - 12);

    const L = BAR.x1 - BAR.x0;
    const keW = L * (ke / total);
    const peW = L * (pe / total);

    ctx.fillStyle = '#facc15';
    ctx.fillRect(BAR.x0, BAR.y, keW, BAR.h);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(BAR.x0 + keW, BAR.y, peW, BAR.h);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(BAR.x0, BAR.y, L, BAR.h);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(total.toFixed(0) + ' J total', BAR.x1, BAR.y + BAR.h + 16);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── Readout sync ───────────────────────────────────── */

  function syncReadout() {
    const y = trackY(state.x);
    const { pe, ke, v, hm } = energyAt(y);
    peValue.textContent        = pe.toFixed(1) + ' J';
    keValue.textContent        = ke.toFixed(1) + ' J';
    speedValue.textContent     = v.toFixed(2) + ' m/s';
    heightOutValue.textContent = hm.toFixed(1) + ' m';
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);
    render();
    syncReadout();

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ── Reset ──────────────────────────────────────────── */

  function resetRun() {
    applySliders();
    const pos = releasePosition();
    state.x    = pos.x;
    state.dir  = pos.x < V.x ? 1 : -1;
    state.swings = 0;
    syncReadout();
  }

  function togglePause() {
    state.paused = !state.paused;
    pauseBtn.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
    evLabel(pauseBtn, state.paused ? 'play' : 'pause', state.paused ? 'Play' : 'Pause');
  }

  /* ── Events ─────────────────────────────────────────── */

  pauseBtn.addEventListener('click', togglePause);

  massEl.addEventListener('input', () => {
    massValue.textContent = Number(massEl.value).toFixed(1) + ' kg';
    resetRun();
  });
  heightEl.addEventListener('input', () => {
    heightValue.textContent = Number(heightEl.value) + '%';
    resetRun();
  });
  pushEl.addEventListener('input', () => {
    pushValue.textContent = Number(pushEl.value).toFixed(1) + ' m/s';
    resetRun();
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    massEl.value = 1;
    heightEl.value = 80;
    pushEl.value = 0;
    massValue.textContent = '1.0 kg';
    heightValue.textContent = '80%';
    pushValue.textContent = '0 m/s';
    state.paused = false;
    pauseBtn.setAttribute('aria-pressed', 'false');
    evLabel(pauseBtn, 'pause', 'Pause');
    helpEl.hidden = true;
    insightEl.hidden = true;
    resetRun();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  evLabel(pauseBtn, 'pause', 'Pause');
  resetRun();
  start();
})();