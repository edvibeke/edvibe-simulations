(() => {
  'use strict';

  /* ── Layout constants ──────────────────────────────── */

  const CANVAS_W = 900;
  const CANVAS_H = 660;

  const FIELD_H     = 350;      // 2D ripple field height
  const TRACE_A_Y   = 365;
  const TRACE_A_H   = 60;
  const TRACE_B_Y   = 435;
  const TRACE_B_H   = 60;
  const TRACE_SUM_Y = 510;
  const TRACE_SUM_H = 145;

  const LABEL_W = 90;
  const TRACE_X = LABEL_W;
  const TRACE_W = CANVAS_W - LABEL_W;

  const TRACE_SECONDS = 3.0;
  const TRACE_SAMPLES = 300;
  const UNIT_A = 22;
  const UNIT_B = 22;
  const UNIT_SUM = 22;

  const RIPPLE_FREQ = 0.7;                   // Hz (visible, slow)
  const OMEGA = 2 * Math.PI * RIPPLE_FREQ;   // rad/s

  const SOURCE_RADIUS = 10;
  const PROBE_RADIUS = 9;

  const INITIAL = {
    wavelength: 100,
    separation: 280,
    probeX: 450,
    probeY: 175
  };

  /* ── Offscreen field buffer (§8 perf) ──────────────── */

  const OFF_W = 180;
  const OFF_H = 70;
  const off = document.createElement('canvas');
  off.width = OFF_W;
  off.height = OFF_H;
  const offCtx = off.getContext('2d');
  const imgData = offCtx.createImageData(OFF_W, OFF_H);
  const px = imgData.data;

  /* ── DOM ───────────────────────────────────────────── */

  const canvas           = document.getElementById('stage');
  const ctx              = canvas.getContext('2d');
  const wavelengthSlider = document.getElementById('wavelength');
  const separationSlider = document.getElementById('separation');
  const wavelengthValue  = document.getElementById('wavelengthValue');
  const separationValue  = document.getElementById('separationValue');
  const rAValue          = document.getElementById('rAValue');
  const rBValue          = document.getElementById('rBValue');
  const meetValue        = document.getElementById('meetValue');
  const pauseBtn         = document.getElementById('pauseBtn');
  const helpEl           = document.getElementById('help');
  const insightEl        = document.getElementById('insight');

  /* ── State ─────────────────────────────────────────── */

  let state;
  let rafId = null;
  let lastTime = 0;
  let dragging = false;
  let dragCount = 0;

  function makeInitialState() {
    return {
      wavelength: INITIAL.wavelength,
      separation: INITIAL.separation,
      probeX: INITIAL.probeX,
      probeY: INITIAL.probeY,
      time: 0,
      paused: false
    };
  }

  function sourcePositions() {
    const cx = CANVAS_W / 2;
    const cy = FIELD_H / 2;
    const half = state.separation / 2;
    return { ax: cx - half, ay: cy, bx: cx + half, by: cy };
  }

  function waveSpeed() {
    return state.wavelength * RIPPLE_FREQ;   // px/s
  }

  /* ── 2D field rendering ───────────────────────────── */

  function renderField() {
    const scaleX = CANVAS_W / OFF_W;
    const scaleY = FIELD_H / OFF_H;
    const { ax, ay, bx, by } = sourcePositions();
    const k = 2 * Math.PI / state.wavelength;
    const phase = OMEGA * state.time;

    for (let py = 0; py < OFF_H; py++) {
      const cy = (py + 0.5) * scaleY;
      for (let pxi = 0; pxi < OFF_W; pxi++) {
        const cx = (pxi + 0.5) * scaleX;
        const rA = Math.hypot(cx - ax, cy - ay);
        const rB = Math.hypot(cx - bx, cy - by);

        // instantaneous amplitude in [-2, 2]
        const y = Math.sin(phase - k * rA) + Math.sin(phase - k * rB);

        let r, g, b;
        if (y >= 0) {
          const t = y / 2;
          r = 30 + t * 99;
          g = 41 + t * 99;
          b = 59 + t * 189;
        } else {
          const t = -y / 2;
          r = 30 + t * 209;
          g = 41 + t * 27;
          b = 59 + t * 9;
        }

        const idx = (py * OFF_W + pxi) * 4;
        px[idx] = r;
        px[idx + 1] = g;
        px[idx + 2] = b;
        px[idx + 3] = 255;
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, CANVAS_W, FIELD_H);
  }

  /* ── Overlays on the field ────────────────────────── */

  function renderFieldOverlays() {
    const { ax, ay, bx, by } = sourcePositions();

    // Divider line between field and traces
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, FIELD_H);
    ctx.lineTo(CANVAS_W, FIELD_H);
    ctx.stroke();

    // Dashed lines from probe to sources
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;

    ctx.strokeStyle = 'rgba(129,140,248,0.9)';
    ctx.beginPath();
    ctx.moveTo(state.probeX, state.probeY);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(245,158,11,0.9)';
    ctx.beginPath();
    ctx.moveTo(state.probeX, state.probeY);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.setLineDash([]);

    // Source markers
    drawSource(ax, ay, '#818cf8', 'A');
    drawSource(bx, by, '#f59e0b', 'B');

    // Probe
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(state.probeX, state.probeY, PROBE_RADIUS + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(state.probeX, state.probeY, PROBE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Small "drag me" hint on the probe the first time
    if (dragCount === 0) {
      ctx.fillStyle = 'rgba(226,232,240,0.75)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('← drag me', state.probeX + PROBE_RADIUS + 8, state.probeY);
    }
  }

  function drawSource(x, y, color, label) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, SOURCE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }

  /* ── Trace panels ─────────────────────────────────── */

  function renderTraces() {
    const { ax, ay, bx, by } = sourcePositions();
    const rA = Math.hypot(state.probeX - ax, state.probeY - ay);
    const rB = Math.hypot(state.probeX - bx, state.probeY - by);

    const k = 2 * Math.PI / state.wavelength;
    const v = waveSpeed();

    // Helper to sample the wave from a source at a given past time
    const waveAt = (sourceR, dtBack) => {
      const t = state.time - dtBack;
      return Math.sin(OMEGA * (t - sourceR / v));
    };

    drawTracePanel({
      y: TRACE_A_Y, h: TRACE_A_H, unit: UNIT_A,
      label: 'Wave from A', color: '#818cf8',
      sample: (dtBack) => waveAt(rA, dtBack)
    });

    drawTracePanel({
      y: TRACE_B_Y, h: TRACE_B_H, unit: UNIT_B,
      label: 'Wave from B', color: '#f59e0b',
      sample: (dtBack) => waveAt(rB, dtBack)
    });

    // Combined — height doubles when in sync
    drawTracePanel({
      y: TRACE_SUM_Y, h: TRACE_SUM_H, unit: UNIT_SUM,
      label: 'Combined', color: '#10b981',
      sample: (dtBack) => waveAt(rA, dtBack) + waveAt(rB, dtBack),
      bold: true
    });
  }

  function drawTracePanel({ y, h, unit, label, color, sample, bold }) {
    const baseline = y + h / 2;

    // Panel background
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, y, CANVAS_W, h);

    // Grid baseline
    ctx.strokeStyle = 'rgba(100,116,139,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(TRACE_X, baseline);
    ctx.lineTo(CANVAS_W, baseline);
    ctx.stroke();

    // Left label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), 12, y + 16);

    ctx.fillStyle = '#64748b';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText('now →', 12, y + h - 12);

    // The wave itself
    ctx.strokeStyle = color;
    ctx.lineWidth = bold ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let i = 0; i <= TRACE_SAMPLES; i++) {
      const frac = i / TRACE_SAMPLES;
      const tx = TRACE_X + frac * TRACE_W;
      const dtBack = TRACE_SECONDS * (1 - frac);   // from oldest to newest
      const val = sample(dtBack);
      const ty = baseline - unit * val;
      if (i === 0) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
    }

    ctx.stroke();

    // Playhead dot at the "now" end
    const lastVal = sample(0);
    const lastTy = baseline - unit * lastVal;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(CANVAS_W - 6, lastTy, bold ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();

    // Divider
    ctx.strokeStyle = 'rgba(100,116,139,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + h);
    ctx.lineTo(CANVAS_W, y + h);
    ctx.stroke();
  }

  /* ── Readout + "meet" label ──────────────────────── */

  function meetInfo() {
    const { ax, ay, bx, by } = sourcePositions();
    const rA = Math.hypot(state.probeX - ax, state.probeY - ay);
    const rB = Math.hypot(state.probeX - bx, state.probeY - by);
    const diffLambda = Math.abs(rA - rB) / state.wavelength;
    const frac = diffLambda - Math.round(diffLambda);   // in [-0.5, 0.5]
    const a = Math.abs(frac);

    if (a < 0.12)  return { rA, rB, kind: 'In step',         color: '#10b981' };
    if (a > 0.38)  return { rA, rB, kind: 'Out of step',     color: '#ef4444' };
    return { rA, rB, kind: 'Partly in step',                 color: '#94a3b8' };
  }

  function syncReadout() {
    const info = meetInfo();
    wavelengthValue.textContent = state.wavelength + ' px';
    separationValue.textContent = state.separation + ' px';
    rAValue.textContent = info.rA.toFixed(0) + ' px';
    rBValue.textContent = info.rB.toFixed(0) + ' px';
    meetValue.textContent = info.kind;
    meetValue.style.color = info.color;
  }

  /* ── Render loop ──────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    renderField();
    renderFieldOverlays();
    renderTraces();
  }

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!state.paused) {
      state.time += dt;
      syncReadout();
    }
    render();

    if (!state.paused) rafId = requestAnimationFrame(tick);
    else rafId = null;
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

  /* ── Pointer ──────────────────────────────────────── */

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top)  * (CANVAS_H / rect.height)
    };
  }

  function inField(p) {
    return p.y >= 0 && p.y <= FIELD_H;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = canvasCoords(e);
    if (!inField(p)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    state.probeX = p.x;
    state.probeY = p.y;
    syncReadout();
    if (state.paused) render();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = canvasCoords(e);
    state.probeX = Math.max(0, Math.min(CANVAS_W, p.x));
    state.probeY = Math.max(0, Math.min(FIELD_H, p.y));
    syncReadout();
    if (state.paused) render();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    dragCount++;
    if (dragCount >= 3) insightEl.hidden = false;
  });

  /* ── Sliders, buttons ─────────────────────────────── */

  wavelengthSlider.addEventListener('input', () => {
    state.wavelength = parseFloat(wavelengthSlider.value);
    syncReadout();
    if (state.paused) render();
  });

  separationSlider.addEventListener('input', () => {
    state.separation = parseFloat(separationSlider.value);
    syncReadout();
    if (state.paused) render();
  });

  pauseBtn.addEventListener('click', togglePause);

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);
  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  function reset() {
    stop();
    state = makeInitialState();
    wavelengthSlider.value = state.wavelength;
    separationSlider.value = state.separation;
    pauseBtn.textContent = '⏸ Pause';
    dragCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
    start();
  }

  /* ── Init ─────────────────────────────────────────── */

  state = makeInitialState();
  wavelengthSlider.value = state.wavelength;
  separationSlider.value = state.separation;
  syncReadout();
  render();
  start();

})();
