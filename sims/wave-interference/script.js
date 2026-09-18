(() => {
  'use strict';

  /* ── Constants ─────────────────────────────────────── */

  const INITIAL = {
    wavelength: 100,      // px
    separation: 280,      // px
    probeX: 450,
    probeY: 100
  };

  const RIPPLE_SPEED = 100;    // px/s, controls animation speed
  const OFF_W = 180;            // offscreen render size (fast)
  const OFF_H = 100;
  const SOURCE_RADIUS = 10;
  const PROBE_RADIUS = 9;

  /* ── DOM ───────────────────────────────────────────── */

  const canvas          = document.getElementById('stage');
  const ctx             = canvas.getContext('2d');
  const wavelengthSlider = document.getElementById('wavelength');
  const separationSlider = document.getElementById('separation');
  const wavelengthValue = document.getElementById('wavelengthValue');
  const separationValue = document.getElementById('separationValue');
  const rAValue         = document.getElementById('rAValue');
  const rBValue         = document.getElementById('rBValue');
  const pathDiffValue   = document.getElementById('pathDiffValue');
  const modeBtn         = document.getElementById('modeBtn');
  const helpEl          = document.getElementById('help');
  const insightEl       = document.getElementById('insight');

  /* ── Offscreen buffer (§8 perf: render small, scale up) ── */

  const off = document.createElement('canvas');
  off.width = OFF_W;
  off.height = OFF_H;
  const offCtx = off.getContext('2d');
  const imgData = offCtx.createImageData(OFF_W, OFF_H);
  const px = imgData.data;

  /* ── State ─────────────────────────────────────────── */

  let state;
  let rafId = null;
  let lastTime = 0;
  let dragging = false;

  function makeInitialState() {
    return {
      wavelength: INITIAL.wavelength,
      separation: INITIAL.separation,
      probeX: INITIAL.probeX,
      probeY: INITIAL.probeY,
      time: 0,
      mode: 'ripple',     // 'ripple' | 'envelope'
      paused: false
    };
  }

  function sourcePositions() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const half = state.separation / 2;
    return {
      ax: cx - half, ay: cy,
      bx: cx + half, by: cy
    };
  }

  /* ── Field rendering ───────────────────────────────── */

  function renderField() {
    const W = canvas.width;
    const H = canvas.height;
    const scaleX = W / OFF_W;
    const scaleY = H / OFF_H;
    const { ax, ay, bx, by } = sourcePositions();

    const k = 2 * Math.PI / state.wavelength;
    const omega = 2 * Math.PI * (RIPPLE_SPEED / state.wavelength);
    const phase = omega * state.time;

    const isEnvelope = state.mode === 'envelope';

    for (let py = 0; py < OFF_H; py++) {
      const cy = (py + 0.5) * scaleY;
      for (let pxi = 0; pxi < OFF_W; pxi++) {
        const cx = (pxi + 0.5) * scaleX;

        const dxA = cx - ax, dyA = cy - ay;
        const dxB = cx - bx, dyB = cy - by;
        const rA = Math.sqrt(dxA * dxA + dyA * dyA);
        const rB = Math.sqrt(dxB * dxB + dyB * dyB);

        let r, g, b;

        if (isEnvelope) {
          // Amplitude envelope: 2·|cos(k·Δr/2)|, in [0, 2]
          const env = 2 * Math.abs(Math.cos(k * (rA - rB) / 2));
          const t = env / 2;
          r = 30 + t * 99;
          g = 41 + t * 99;
          b = 59 + t * 189;
        } else {
          // Instantaneous: sin(phase - k·rA) + sin(phase - k·rB), in [-2, 2]
          const y = Math.sin(phase - k * rA) + Math.sin(phase - k * rB);
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
    ctx.drawImage(off, 0, 0, W, H);
  }

  /* ── Overlays ──────────────────────────────────────── */

  function renderOverlays() {
    const { ax, ay, bx, by } = sourcePositions();
    const probe = { x: state.probeX, y: state.probeY };

    // Lines to sources
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.strokeStyle = 'rgba(129,140,248,0.9)';
    ctx.beginPath();
    ctx.moveTo(probe.x, probe.y);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(245,158,11,0.9)';
    ctx.beginPath();
    ctx.moveTo(probe.x, probe.y);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.setLineDash([]);

    // Source markers
    drawSource(ax, ay, '#818cf8');
    drawSource(bx, by, '#f59e0b');

    // Probe marker
    drawProbe(probe);
  }

  function drawSource(x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, SOURCE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawProbe(p) {
    // Outer ring with a subtle glow
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PROBE_RADIUS + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PROBE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /* ── Readout ───────────────────────────────────────── */

  function syncReadout() {
    const { ax, ay, bx, by } = sourcePositions();
    const dxA = state.probeX - ax, dyA = state.probeY - ay;
    const dxB = state.probeX - bx, dyB = state.probeY - by;
    const rA = Math.sqrt(dxA * dxA + dyA * dyA);
    const rB = Math.sqrt(dxB * dxB + dyB * dyB);
    const diffPx = Math.abs(rA - rB);
    const diffLambda = diffPx / state.wavelength;

    wavelengthValue.textContent = state.wavelength + ' px';
    separationValue.textContent = state.separation + ' px';
    rAValue.textContent = rA.toFixed(0) + ' px';
    rBValue.textContent = rB.toFixed(0) + ' px';
    pathDiffValue.textContent = diffLambda.toFixed(2) + ' λ';

    return { rA, rB, diffLambda };
  }

  /* ── Interference type (rendered near probe) ───────── */

  function renderInterferenceBadge() {
    const { ax, ay, bx, by } = sourcePositions();
    const rA = Math.hypot(state.probeX - ax, state.probeY - ay);
    const rB = Math.hypot(state.probeX - bx, state.probeY - by);
    const n = Math.abs(rA - rB) / state.wavelength;
    const frac = n - Math.round(n);          // in [-0.5, 0.5]
    const a = Math.abs(frac);

    let label, color;
    if (a < 0.12) {
      label = 'Constructive';
      color = '#10b981';
    } else if (a > 0.38) {
      label = 'Destructive';
      color = '#ef4444';
    } else {
      label = 'Partial';
      color = '#94a3b8';
    }

    // Place the badge to the right of the probe, kept inside the canvas
    const pad = 14;
    ctx.font = '700 16px system-ui, sans-serif';
    const textW = ctx.measureText(label).width;
    let bx0 = state.probeX + PROBE_RADIUS + 12;
    let by0 = state.probeY - 22;
    if (bx0 + textW + pad > canvas.width) bx0 = state.probeX - PROBE_RADIUS - 12 - textW - pad;
    if (by0 < 0) by0 = state.probeY + PROBE_RADIUS + 4;

    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(bx0, by0, textW + pad, 26);

    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, bx0 + pad / 2, by0 + 13);
  }

  /* ── Frame ─────────────────────────────────────────── */

  function render() {
    renderField();
    renderOverlays();
    renderInterferenceBadge();
  }

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (state.mode === 'ripple') {
      state.time += dt;
    }

    render();

    if (state.paused) {
      rafId = null;
    } else {
      rafId = requestAnimationFrame(tick);
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

  /* ── Input ─────────────────────────────────────────── */

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    const p = canvasCoords(e);
    state.probeX = p.x;
    state.probeY = p.y;
    syncReadout();
    if (state.paused) render();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = canvasCoords(e);
    state.probeX = p.x;
    state.probeY = p.y;
    syncReadout();
    if (state.paused) render();
    insightEl.hidden = false;
  });

  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });

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

  modeBtn.addEventListener('click', () => {
    state.mode = state.mode === 'ripple' ? 'envelope' : 'ripple';
    modeBtn.textContent = state.mode === 'ripple'
      ? 'Show amplitude (static)'
      : 'Show ripple (animated)';
    if (state.paused) render();
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);
  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  function reset() {
    stop();
    state = makeInitialState();
    wavelengthSlider.value = state.wavelength;
    separationSlider.value = state.separation;
    modeBtn.textContent = 'Show amplitude (static)';
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
    start();
  }

  /* ── Init ──────────────────────────────────────────── */

  state = makeInitialState();
  wavelengthSlider.value = state.wavelength;
  separationSlider.value = state.separation;
  syncReadout();
  render();
  start();

})();
