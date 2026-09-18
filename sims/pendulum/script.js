(() => {
  'use strict';

  /* ── Constants ─────────────────────────────────────── */

  const G = 9.81;
  const PIXELS_PER_METER = 120;
  const PIVOT = { x: 450, y: 80 };
  const INITIAL = { length: 1.0, mass: 3, angleDeg: 30 };

  /* ── DOM ───────────────────────────────────────────── */

  const canvas        = document.getElementById('stage');
  const ctx           = canvas.getContext('2d');
  const lengthSlider  = document.getElementById('length');
  const massSlider    = document.getElementById('mass');
  const lengthValue   = document.getElementById('lengthValue');
  const massValue     = document.getElementById('massValue');
  const periodValue   = document.getElementById('periodValue');
  const angleValue    = document.getElementById('angleValue');
  const speedValue    = document.getElementById('speedValue');
  const pauseBtn      = document.getElementById('pauseBtn');
  const helpEl        = document.getElementById('help');
  const insightEl     = document.getElementById('insight');

  /* ── State (§5, §15) ───────────────────────────────── */

  let state;
  let rafId = null;
  let lastTime = 0;
  let massChanges = 0;

  function makeInitialState() {
    return {
      length: INITIAL.length,
      mass: INITIAL.mass,
      // θ = angle from vertical (radians). Positive = right.
      theta: INITIAL.angleDeg * Math.PI / 180,
      omega: 0,                // angular velocity, rad/s
      paused: false,
      trail: []                // recent {x,y} of bob position, canvas coords
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  function period() {
    // T = 2π √(L/g) — independent of mass.
    return 2 * Math.PI * Math.sqrt(state.length / G);
  }

  function step(dt) {
    // θ'' = -(g/L) sin θ     (mass cancels out)
    const alpha = -(G / state.length) * Math.sin(state.theta);
    state.omega += alpha * dt;
    state.theta += state.omega * dt;

    // Bob position in canvas coords
    const r = state.length * PIXELS_PER_METER;
    const bx = PIVOT.x + r * Math.sin(state.theta);
    const by = PIVOT.y + r * Math.cos(state.theta);

    state.trail.push({ x: bx, y: by });
    if (state.trail.length > 60) state.trail.shift();
  }

  function bobPosition() {
    const r = state.length * PIXELS_PER_METER;
    return {
      x: PIVOT.x + r * Math.sin(state.theta),
      y: PIVOT.y + r * Math.cos(state.theta)
    };
  }

  function bobSpeed() {
    // linear speed v = ω · L
    return Math.abs(state.omega) * state.length;
  }

  /* ── Render ────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCeiling();
    drawArc();
    drawTrail();
    drawRod();
    drawBob();
  }

  function drawCeiling() {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, canvas.width, 30);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(canvas.width, 30);
    ctx.stroke();

    // Hatch marks
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    for (let x = 20; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 15, 30);
      ctx.stroke();
    }
  }

  function drawArc() {
    // Faint arc showing the swing range at maximum angle
    const maxAngle = INITIAL.angleDeg * Math.PI / 180;
    const r = state.length * PIXELS_PER_METER;

    ctx.strokeStyle = 'rgba(100,116,139,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(PIVOT.x, PIVOT.y, r,
            Math.PI / 2 - maxAngle,
            Math.PI / 2 + maxAngle);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTrail() {
    if (state.trail.length < 2) return;
    for (let i = 1; i < state.trail.length; i++) {
      const alpha = i / state.trail.length;    // fades out older dots
      ctx.fillStyle = `rgba(129,140,248,${alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(state.trail[i].x, state.trail[i].y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRod() {
    const bob = bobPosition();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PIVOT.x, PIVOT.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.stroke();

    // Pivot dot
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(PIVOT.x, PIVOT.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBob() {
    const bob = bobPosition();
    // Radius scales with mass but capped so it stays on-screen
    const radius = 14 + Math.min(state.mass, 10) * 1.6;

    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.arc(bob.x, bob.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* ── Readout ───────────────────────────────────────── */

  function syncReadout() {
    lengthValue.textContent = state.length.toFixed(2) + ' m';
    massValue.textContent   = state.mass.toFixed(0) + ' kg';
    periodValue.textContent = period().toFixed(2) + ' s';
    angleValue.textContent  = (state.theta * 180 / Math.PI).toFixed(0) + '°';
    speedValue.textContent  = bobSpeed().toFixed(2) + ' m/s';
  }

  /* ── Animation loop (§6) ───────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!state.paused) {
      step(dt);
      syncReadout();
    }
    render();

    if (!state.paused) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function togglePause() {
    state.paused = !state.paused;
    if (state.paused) {
      stop();
      pauseBtn.textContent = '▶ Play';
    } else {
      pauseBtn.textContent = '⏸ Pause';
      start();
    }
  }

  /* ── Reset ─────────────────────────────────────────── */

  function reset() {
    stop();
    state = makeInitialState();
    lengthSlider.value = state.length;
    massSlider.value = state.mass;
    pauseBtn.textContent = '⏸ Pause';
    massChanges = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
    start();
  }

  /* ── Input handlers ────────────────────────────────── */

  lengthSlider.addEventListener('input', () => {
    state.length = parseFloat(lengthSlider.value);
    syncReadout();
    if (state.paused) render();
  });

  massSlider.addEventListener('input', () => {
    state.mass = parseFloat(massSlider.value);
    massChanges++;
    syncReadout();
    if (state.paused) render();
    if (massChanges >= 3) insightEl.hidden = false;
  });

  pauseBtn.addEventListener('click', togglePause);

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ──────────────────────────────────────────── */

  state = makeInitialState();
  lengthSlider.value = state.length;
  massSlider.value = state.mass;
  syncReadout();
  render();
  start();

})();
