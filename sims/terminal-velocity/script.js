(() => {
  'use strict';

  /* ── Constants ─────────────────────────────────────── */

  const W = 900, H = 540;
  const G = 9.81;

  const COL = {
    leftX: 80, rightX: 400,
    topY: 70, bottomY: 470,
    centerX: 240,
    worldHeight: 200            // metres
  };
  const PPM = (COL.bottomY - COL.topY) / COL.worldHeight;

  const GRAPH = { x: 540, y: 80, w: 320, h: 380, tMax: 15, vMax: 70 };

  const BALL_R = 18;
  const MAX_ARROW_PX = 90;
  const MAX_TIME = 15;

  const INITIAL = { mass: 5, k: 0.5 };

  /* ── DOM ───────────────────────────────────────────── */

  const canvas     = document.getElementById('stage');
  const ctx        = canvas.getContext('2d');
  const massSlider = document.getElementById('mass');
  const kSlider    = document.getElementById('k');
  const massValue  = document.getElementById('massValue');
  const kValue     = document.getElementById('kValue');
  const velValue   = document.getElementById('velValue');
  const dragValue  = document.getElementById('dragValue');
  const accelValue = document.getElementById('accelValue');
  const mainBtn    = document.getElementById('mainBtn');
  const helpEl     = document.getElementById('help');
  const insightEl  = document.getElementById('insight');

  /* ── State ─────────────────────────────────────────── */

  let state = makeInitialState();
  let rafId = null;
  let lastTime = 0;

  function makeInitialState() {
    return {
      mass: INITIAL.mass,
      k: INITIAL.k,
      v: 0,
      y: 0,
      t: 0,
      history: [{ t: 0, v: 0 }],
      running: false,
      paused: false,
      done: false
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  function weight()    { return state.mass * G; }
  function drag()      { return state.k * state.v * state.v; }
  function accel()     { return G - drag() / state.mass; }
  function terminalV() { return Math.sqrt(state.mass * G / state.k); }

  function step(dt) {
    // Sub-step for stability at stiff coefficients
    const sub = 4;
    const dtSub = dt / sub;
    for (let i = 0; i < sub; i++) {
      const a = accel();
      state.v += a * dtSub;
      if (state.v < 0) state.v = 0;
      state.y += state.v * dtSub;
      state.t += dtSub;
    }

    const last = state.history[state.history.length - 1];
    if (state.t - last.t > 0.06) {
      state.history.push({ t: state.t, v: state.v });
    }

    if (state.y >= COL.worldHeight || state.t >= MAX_TIME) {
      state.y = Math.min(state.y, COL.worldHeight);
      state.running = false;
      state.done = true;
      insightEl.hidden = false;
      mainBtn.textContent = '▶ Drop again';
    }
  }

  /* ── Render ────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawDivider();
    drawColumn();
    drawBallAndArrows();
    drawGraph();
  }

  function drawDivider() {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(470, 40);
    ctx.lineTo(470, H - 40);
    ctx.stroke();
  }

  function drawColumn() {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(COL.leftX, COL.topY, COL.rightX - COL.leftX, COL.bottomY - COL.topY);

    ctx.strokeStyle = 'rgba(100,116,139,0.35)';
    ctx.lineWidth = 1;
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    for (let m = 0; m <= COL.worldHeight; m += 20) {
      const y = COL.topY + m * PPM;
      ctx.beginPath();
      ctx.moveTo(COL.leftX, y);
      ctx.lineTo(COL.leftX + 12, y);
      ctx.stroke();

      if (m % 40 === 0) {
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.fillText(m + ' m', COL.leftX + 18, y);
      }
    }

    ctx.strokeStyle = '#334155';
    ctx.strokeRect(COL.leftX, COL.topY, COL.rightX - COL.leftX, COL.bottomY - COL.topY);

    // Small "start" label at top
    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('drop from rest', COL.centerX, COL.topY - 6);
  }

  function drawBallAndArrows() {
    const ballY = COL.topY + state.y * PPM;
    const bx = COL.centerX;
    const by = Math.min(ballY, COL.bottomY - BALL_R - 4);

    // Ball
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Weight arrow (down) — always visible
    const wLen = Math.min(state.mass * 4.5, MAX_ARROW_PX);
    drawArrow(bx, by + BALL_R, bx, by + BALL_R + wLen, '#ef4444', 'weight');

    // Drag arrow (up) — only if moving
    if (state.v > 0.1) {
      const dLen = Math.min((drag() / G) * 4.5, MAX_ARROW_PX);
      if (dLen > 3) {
        drawArrow(bx, by - BALL_R, bx, by - BALL_R - dLen, '#10b981', 'drag');
      }
    }
  }

  function drawArrow(x1, y1, x2, y2, color, label) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 12;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();

    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x2 + 10, y2);
  }

  function drawGraph() {
    const g = GRAPH;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    // Grid
    ctx.strokeStyle = 'rgba(100,116,139,0.14)';
    ctx.lineWidth = 1;
    for (let t = 0; t <= g.tMax; t += 3) {
      const x = g.x + (t / g.tMax) * g.w;
      ctx.beginPath();
      ctx.moveTo(x, g.y);
      ctx.lineTo(x, g.y + g.h);
      ctx.stroke();
    }
    for (let v = 0; v <= g.vMax; v += 10) {
      const y = g.y + g.h - (v / g.vMax) * g.h;
      ctx.beginPath();
      ctx.moveTo(g.x, y);
      ctx.lineTo(g.x + g.w, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x, g.y + g.h);
    ctx.lineTo(g.x + g.w, g.y + g.h);
    ctx.stroke();

    // Tick labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= g.tMax; t += 3) {
      const x = g.x + (t / g.tMax) * g.w;
      ctx.fillText(t.toString(), x, g.y + g.h + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= g.vMax; v += 10) {
      const y = g.y + g.h - (v / g.vMax) * g.h;
      ctx.fillText(v.toString(), g.x - 6, y);
    }

    // Axis titles
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TIME  t  (s)', g.x + g.w / 2, g.y + g.h + 26);

    ctx.save();
    ctx.translate(g.x - 46, g.y + g.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VELOCITY  v  (m/s)', 0, 0);
    ctx.restore();

    // Terminal velocity reference line
    const vt = terminalV();
    if (vt > 0 && vt < g.vMax) {
      const yT = g.y + g.h - (vt / g.vMax) * g.h;
      ctx.strokeStyle = 'rgba(250,204,21,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(g.x, yT);
      ctx.lineTo(g.x + g.w, yT);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(250,204,21,0.85)';
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('terminal ' + vt.toFixed(1) + ' m/s', g.x + g.w - 6, yT - 4);
    }

    // Curve
    if (state.history.length > 1) {
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      state.history.forEach(p => {
        if (p.v > g.vMax) return;
        const x = g.x + (p.t / g.tMax) * g.w;
        const y = g.y + g.h - (p.v / g.vMax) * g.h;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Current point
    if (state.history.length > 0) {
      const cur = state.history[state.history.length - 1];
      const x = g.x + (cur.t / g.tMax) * g.w;
      const y = g.y + g.h - (cur.v / g.vMax) * g.h;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* ── Readout ───────────────────────────────────────── */

  function syncReadout() {
    massValue.textContent  = state.mass.toFixed(1) + ' kg';
    kValue.textContent     = state.k.toFixed(2);
    velValue.textContent   = state.v.toFixed(1) + ' m/s';
    dragValue.textContent  = drag().toFixed(1) + ' N';
    accelValue.textContent = accel().toFixed(2) + ' m/s²';
  }

  /* ── Loop ──────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (state.running && !state.paused) {
      step(dt);
      syncReadout();
    }
    render();

    if (state.running && !state.paused) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function startLoop() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Actions ───────────────────────────────────────── */

  function drop() {
    stopLoop();
    const m = state.mass;
    const k = state.k;
    state = makeInitialState();
    state.mass = m;
    state.k = k;
    state.running = true;
    state.paused = false;
    mainBtn.textContent = '⏸ Pause';
    insightEl.hidden = true;
    syncReadout();
    render();
    startLoop();
  }

  function togglePause() {
    if (!state.running || state.done) return;
    state.paused = !state.paused;
    if (state.paused) {
      mainBtn.textContent = '▶ Resume';
      stopLoop();
    } else {
      mainBtn.textContent = '⏸ Pause';
      startLoop();
    }
  }

  /* ── Events ────────────────────────────────────────── */

  mainBtn.addEventListener('click', () => {
    if (state.running && !state.paused)      togglePause();
    else if (state.running && state.paused)  togglePause();
    else                                     drop();
  });

  massSlider.addEventListener('input', () => {
    state.mass = parseFloat(massSlider.value);
    syncReadout();
    if (!state.running) render();
  });

  kSlider.addEventListener('input', () => {
    state.k = parseFloat(kSlider.value);
    syncReadout();
    if (!state.running) render();
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    stopLoop();
    state = makeInitialState();
    massSlider.value = state.mass;
    kSlider.value = state.k;
    mainBtn.textContent = '▶ Drop';
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ──────────────────────────────────────────── */

  massSlider.value = state.mass;
  kSlider.value = state.k;
  syncReadout();
  render();

})();
