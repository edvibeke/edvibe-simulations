(() => {
  'use strict';

  /* ── Constants ─────────────────────────────────────── */

  const G = 9.81;               // gravity, m/s²
  const WORLD = {
    originX: 80,                // cannon position on canvas
    groundY: 450,               // ground line
    pxPerMeter: 3,              // canvas px per metre
    maxHeightM: 130
  };

  const INITIAL = { angle: 45, speed: 30 };

  /* ── DOM ───────────────────────────────────────────── */

  const canvas          = document.getElementById('stage');
  const stage     = EV.stage('stage');
  const ctx             = stage.ctx;
  const angleSlider     = document.getElementById('angle');
  const speedSlider     = document.getElementById('speed');
  const angleValue      = document.getElementById('angleValue');
  const speedValue      = document.getElementById('speedValue');
  const rangeValue      = document.getElementById('rangeValue');
  const heightValue     = document.getElementById('heightValue');
  const timeValue       = document.getElementById('timeValue');

  /* ── State (§5, §15: one state object) ─────────────── */

  let state;
  let rafId = null;
  let lastTime = 0;
  let fireCount = 0;

  function makeInitialState() {
    return {
      angle: INITIAL.angle,
      speed: INITIAL.speed,
      // Live animation state
      t: 0,
      flying: false,
      done: false,
      pos: null,               // {x, y} in world metres
      trail: [],               // [{x, y}] in world metres
      ghost: null,             // trail of the previous shot
      landed: null             // {range, height, time}
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  function v0x() { return state.speed * Math.cos(state.angle * Math.PI / 180); }
  function v0y() { return state.speed * Math.sin(state.angle * Math.PI / 180); }

  function posAt(t) {
    return {
      x: v0x() * t,
      y: v0y() * t - 0.5 * G * t * t
    };
  }

  function flightTime() { return 2 * v0y() / G; }
  function range()      { return v0x() * flightTime(); }
  function maxHeight()  { return (v0y() * v0y()) / (2 * G); }

  /* ── Coordinate conversion (world metres → canvas px) ── */

  function worldToCanvas(p) {
    return {
      x: WORLD.originX + p.x * WORLD.pxPerMeter,
      y: WORLD.groundY - p.y * WORLD.pxPerMeter
    };
  }

  /* ── Render ────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, stage.w, stage.h);
    drawGrid();
    drawGround();
    drawGhost();
    drawTrail();
    drawProjectile();
    drawCannon();
    drawAngleLabel();
  }
  /* Repaint on demand — used by the shared runtime when
     prefers-reduced-motion stops the animation clock. */
  stage.onPaint = () => { syncReadout(); render(); };

  function drawGrid() {
    ctx.strokeStyle = 'rgba(100,116,139,0.18)';
    ctx.lineWidth = 1;

    // Vertical lines every 20 m
    for (let m = 0; m <= 260; m += 20) {
      const x = WORLD.originX + m * WORLD.pxPerMeter;
      if (x > stage.w) break;
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, WORLD.groundY);
      ctx.stroke();
    }

    // Horizontal lines every 20 m
    for (let m = 20; m <= 140; m += 20) {
      const y = WORLD.groundY - m * WORLD.pxPerMeter;
      if (y < 20) break;
      ctx.beginPath();
      ctx.moveTo(WORLD.originX, y);
      ctx.lineTo(stage.w, y);
      ctx.stroke();
    }
  }

  function drawGround() {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, WORLD.groundY, stage.w, stage.h - WORLD.groundY);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, WORLD.groundY);
    ctx.lineTo(stage.w, WORLD.groundY);
    ctx.stroke();
  }

  function drawCannon() {
    const c = worldToCanvas({ x: 0, y: 0 });
    const angle = state.angle * Math.PI / 180;
    const len = 42;
    const tipX = c.x + Math.cos(angle) * len;
    const tipY = c.y - Math.sin(angle) * len;

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAngleLabel() {
    const c = worldToCanvas({ x: 0, y: 0 });
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(state.angle + '°  ·  ' + state.speed + ' m/s', c.x + 20, c.y - 20);
  }

  function drawTrail() {
    if (state.trail.length < 2) return;
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    state.trail.forEach((p, i) => {
      const c = worldToCanvas(p);
      i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
  }

  function drawGhost() {
    if (!state.ghost || state.ghost.length < 2) return;
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    state.ghost.forEach((p, i) => {
      const c = worldToCanvas(p);
      i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawProjectile() {
    if (!state.pos) return;
    const c = worldToCanvas(state.pos);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── Readout sync ──────────────────────────────────── */

  function syncReadout() {
    angleValue.textContent = state.angle + '°';
    speedValue.textContent = state.speed + ' m/s';

    if (state.landed) {
      rangeValue.textContent  = state.landed.range.toFixed(1) + ' m';
      heightValue.textContent = state.landed.height.toFixed(1) + ' m';
      timeValue.textContent   = state.landed.time.toFixed(2) + ' s';
    } else if (state.flying) {
      rangeValue.textContent  = '— m';
      heightValue.textContent = '— m';
      timeValue.textContent   = '— s';
    } else {
      // Pre-fire preview based on current sliders
      rangeValue.textContent  = range().toFixed(1) + ' m';
      heightValue.textContent = maxHeight().toFixed(1) + ' m';
      timeValue.textContent   = flightTime().toFixed(2) + ' s';
    }
  }

  /* ── Animation loop (§6) ───────────────────────────── */

  function update(dt) {
    state.t += dt;
    state.pos = posAt(state.t);
    state.trail.push({ ...state.pos });

    if (state.pos.y <= 0 || state.t > flightTime() + 1) {
      state.pos.y = 0;
      state.done = true;
      state.flying = false;
      state.landed = {
        range: range(),
        height: maxHeight(),
        time: flightTime()
      };
      syncReadout();

      if (fireCount >= 2) {
        EV.revealInsight();
      }
    }
  }

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;

    update(dt);
    render();

    if (state.flying) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;   // loop stops when done (§8: idle CPU near 0%)
    }
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ── Fire ──────────────────────────────────────────── */

  function fire() {
    stopLoop();

    // The previous trail becomes the ghost
    const previousTrail = state.trail.length > 1 ? state.trail : state.ghost;
    const nextState = makeInitialState();
    nextState.angle = state.angle;
    nextState.speed = state.speed;
    nextState.ghost = previousTrail;

    state = nextState;
    state.flying = true;
    state.pos = { x: 0, y: 0 };
    state.trail = [{ x: 0, y: 0 }];

    fireCount++;
    syncReadout();

    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Reset ─────────────────────────────────────────── */

  function reset() {
    stopLoop();
    state = makeInitialState();
    angleSlider.value = state.angle;
    speedSlider.value = state.speed;
    fireCount = 0;
    EV.resetInsight();
    syncReadout();
    render();
  }

  /* ── Preset ────────────────────────────────────────── */

  function applyPreset() {
    stopLoop();
    state = makeInitialState();
    state.angle = 45;
    state.speed = 40;
    angleSlider.value = 45;
    speedSlider.value = 40;
    syncReadout();
    fire();
  }

  /* ── Input handlers ────────────────────────────────── */

  angleSlider.addEventListener('input', () => {
    state.angle = parseFloat(angleSlider.value);
    syncReadout();
    if (!state.flying) render();
  });

  speedSlider.addEventListener('input', () => {
    state.speed = parseFloat(speedSlider.value);
    syncReadout();
    if (!state.flying) render();
  });

  document.querySelector('[data-action="fire"]').addEventListener('click', fire);
  EV.onReset(reset);
  document.querySelector('[data-action="preset"]').addEventListener('click', applyPreset);

  /* ── Init ──────────────────────────────────────────── */

  state = makeInitialState();
  angleSlider.value = state.angle;
  speedSlider.value = state.speed;
  syncReadout();
  render();

})();
