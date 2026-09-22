(() => {
  'use strict';

  /* ── Layout ────────────────────────────────────────── */

  const W = 900, H = 520;
  const BOUNDARY_Y = 280;           // where the two media meet
  const NORMAL_X   = 450;           // hit point x-coordinate
  const RAY_LEN    = 340;           // visual length of ray arms
  const HANDLE_R   = 12;            // drag handle radius

  const INITIAL = { n1: 1.00, n2: 1.33, theta1Deg: 40 };

  const PRESETS = {
    'air-water':   { n1: 1.00, n2: 1.33 },
    'air-glass':   { n1: 1.00, n2: 1.50 },
    'water-air':   { n1: 1.33, n2: 1.00 },
    'glass-air':   { n1: 1.50, n2: 1.00 }
  };

  /* ── DOM ───────────────────────────────────────────── */

  const canvas = document.getElementById('stage');
  const ctx    = canvas.getContext('2d');

  const n1Slider = document.getElementById('n1');
  const n2Slider = document.getElementById('n2');
  const n1Value  = document.getElementById('n1Value');
  const n2Value  = document.getElementById('n2Value');
  const theta1Value = document.getElementById('theta1Value');
  const theta2Value = document.getElementById('theta2Value');
  const ratioValue  = document.getElementById('ratioValue');
  const helpEl      = document.getElementById('help');
  const insightEl   = document.getElementById('insight');

  /* ── State ─────────────────────────────────────────── */

  let state = makeInitialState();
  let dragging = false;
  let dragCount = 0;

  function makeInitialState() {
    return {
      n1: INITIAL.n1,
      n2: INITIAL.n2,
      theta1: INITIAL.theta1Deg * Math.PI / 180
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  function refractAngle() {
    const s = (state.n1 / state.n2) * Math.sin(state.theta1);
    if (s > 1) return null;              // total internal reflection
    return Math.asin(s);
  }

  function criticalAngle() {
    if (state.n1 <= state.n2) return null;
    return Math.asin(state.n2 / state.n1);
  }

  /* ── Rendering ─────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawMedia();
    drawBoundary();
    drawNormal();
    drawReflectedRay();
    drawRefractedRay();
    drawIncidentRay();
    drawAngleArcs();
    drawHandle();
    drawTIRWarning();
    drawLabels();
  }

  function drawMedia() {
    ctx.fillStyle = '#1a2540';                    // top: darker
    ctx.fillRect(0, 0, W, BOUNDARY_Y);

    ctx.fillStyle = '#243056';                    // bottom: slightly lighter
    ctx.fillRect(0, BOUNDARY_Y, W, H - BOUNDARY_Y);
  }

  function drawBoundary() {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, BOUNDARY_Y);
    ctx.lineTo(W, BOUNDARY_Y);
    ctx.stroke();
  }

  function drawNormal() {
    ctx.strokeStyle = 'rgba(148,163,184,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(NORMAL_X, 20);
    ctx.lineTo(NORMAL_X, H - 20);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawIncidentRay() {
    // Ray comes from upper-left, ends at hit point.
    const x = NORMAL_X - RAY_LEN * Math.sin(state.theta1);
    const y = BOUNDARY_Y - RAY_LEN * Math.cos(state.theta1);

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(NORMAL_X, BOUNDARY_Y);
    ctx.stroke();

    // Arrow head at midpoint, pointing toward boundary
    drawArrowHead(x, y, NORMAL_X, BOUNDARY_Y, '#facc15');
  }

  function drawReflectedRay() {
    // Always shown, dim — the reflected ray leaves upper-right
    const x = NORMAL_X + RAY_LEN * Math.sin(state.theta1);
    const y = BOUNDARY_Y - RAY_LEN * Math.cos(state.theta1);

    ctx.strokeStyle = 'rgba(250,204,21,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(NORMAL_X, BOUNDARY_Y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function drawRefractedRay() {
    const theta2 = refractAngle();
    if (theta2 === null) return;

    const x = NORMAL_X + RAY_LEN * Math.sin(theta2);
    const y = BOUNDARY_Y + RAY_LEN * Math.cos(theta2);

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(NORMAL_X, BOUNDARY_Y);
    ctx.lineTo(x, y);
    ctx.stroke();

    drawArrowHead(NORMAL_X, BOUNDARY_Y, x, y, '#facc15');
  }

  function drawArrowHead(x1, y1, x2, y2, color) {
    // Small triangle at 60% along the line
    const t = 0.6;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 12;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(angle) * size, py + Math.sin(angle) * size);
    ctx.lineTo(px + Math.cos(angle + 2.6) * size, py + Math.sin(angle + 2.6) * size);
    ctx.lineTo(px + Math.cos(angle - 2.6) * size, py + Math.sin(angle - 2.6) * size);
    ctx.closePath();
    ctx.fill();
  }

  function drawAngleArcs() {
    const arcR = 60;

    // θ₁ arc — from normal (up) to incident ray
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(NORMAL_X, BOUNDARY_Y, arcR,
            -Math.PI / 2,
            -Math.PI / 2 - state.theta1,
            true);
    ctx.stroke();

    // θ₁ label
    const l1x = NORMAL_X - arcR * 0.7 * Math.sin(state.theta1 / 2);
    const l1y = BOUNDARY_Y - arcR * 0.7 * Math.cos(state.theta1 / 2);
    ctx.fillStyle = '#10b981';
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('θ₁', l1x, l1y);

    // θ₂ arc if refraction happens
    const theta2 = refractAngle();
    if (theta2 !== null) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(NORMAL_X, BOUNDARY_Y, arcR,
              Math.PI / 2,
              Math.PI / 2 - theta2,
              false);
      ctx.stroke();

      const l2x = NORMAL_X + arcR * 0.7 * Math.sin(theta2 / 2);
      const l2y = BOUNDARY_Y + arcR * 0.7 * Math.cos(theta2 / 2);
      ctx.fillStyle = '#10b981';
      ctx.fillText('θ₂', l2x, l2y);
    }
  }

  function drawHandle() {
    const x = NORMAL_X - RAY_LEN * Math.sin(state.theta1);
    const y = BOUNDARY_Y - RAY_LEN * Math.cos(state.theta1);

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hint text on first load
    if (dragCount === 0) {
      ctx.fillStyle = 'rgba(226,232,240,0.75)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('drag me', x - 100, y - 22);
    }
  }

  function drawTIRWarning() {
    if (refractAngle() !== null) return;
    const c = criticalAngle();
    if (c === null) return;

    const text = 'Total internal reflection \u2014 light cannot escape';
    ctx.font = '700 16px system-ui, sans-serif';
    const tw = ctx.measureText(text).width;

    const bx = (W - tw - 32) / 2;
    const by = H - 60;

    ctx.fillStyle = 'rgba(239,68,68,0.18)';
    ctx.fillRect(bx, by, tw + 32, 40);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, tw + 32, 40);

    // Warning triangle icon
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.moveTo(bx + 16, by + 7);
    ctx.lineTo(bx + 27, by + 32);
    ctx.lineTo(bx + 5, by + 32);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fca5a5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 34, by + 20);
  }

  function drawLabels() {
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // "Top material" label, top-left
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('Top material  n₁ = ' + state.n1.toFixed(2), 20, 24);

    // "Bottom material" label
    ctx.fillText('Bottom material  n₂ = ' + state.n2.toFixed(2), 20, BOUNDARY_Y + 22);

    // Critical angle indicator
    const c = criticalAngle();
    if (c !== null) {
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText('Critical angle: ' + (c * 180 / Math.PI).toFixed(1) + '°', W - 20, H - 24);
    }
  }

  /* ── Readout ──────────────────────────────────────── */

  function syncReadout() {
    const t1 = state.theta1 * 180 / Math.PI;
    const theta2 = refractAngle();

    n1Value.textContent = state.n1.toFixed(2);
    n2Value.textContent = state.n2.toFixed(2);
    theta1Value.textContent = t1.toFixed(1) + '°';

    if (theta2 === null) {
      theta2Value.textContent = '—';
      theta2Value.style.color = '#ef4444';
      ratioValue.textContent  = '—';
      ratioValue.style.color  = '#ef4444';
    } else {
      const t2 = theta2 * 180 / Math.PI;
      theta2Value.textContent = t2.toFixed(1) + '°';
      theta2Value.style.color = '#e2e8f0';

      if (Math.sin(theta2) < 1e-6) {
        ratioValue.textContent = '—';
      } else {
        const ratio = (state.n1 * Math.sin(state.theta1)) / Math.sin(theta2);
        ratioValue.textContent = ratio.toFixed(3);
      }
      ratioValue.style.color = '#e2e8f0';
    }
  }

  /* ── Drag interaction ─────────────────────────────── */

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (H / rect.height)
    };
  }

  function updateAngleFromDrag(p) {
    // Vector from hit point to cursor
    const dx = NORMAL_X - p.x;             // positive if left of hit
    const dy = BOUNDARY_Y - p.y;           // positive if above hit
    if (dy <= 0) return;                   // ignore drags below boundary

    // Angle from normal (which points up): tan θ = dx / dy
    let theta = Math.atan2(dx, dy);
    // Clamp to [0°, 89°]
    theta = Math.max(0, Math.min(89 * Math.PI / 180, theta));

    state.theta1 = theta;
    syncReadout();
    render();
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = canvasCoords(e);
    const hx = NORMAL_X - RAY_LEN * Math.sin(state.theta1);
    const hy = BOUNDARY_Y - RAY_LEN * Math.cos(state.theta1);
    const dist = Math.hypot(p.x - hx, p.y - hy);

    if (dist <= HANDLE_R + 12) {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
    } else if (p.y < BOUNDARY_Y) {
      // Also allow click anywhere in the upper half to jump the handle
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      updateAngleFromDrag(p);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    updateAngleFromDrag(canvasCoords(e));
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    dragCount++;
    if (dragCount >= 6) insightEl.hidden = false;
  });

  /* ── Presets & sliders ────────────────────────────── */

  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      const p = PRESETS[key];
      if (!p) return;
      state.n1 = p.n1;
      state.n2 = p.n2;
      n1Slider.value = p.n1;
      n2Slider.value = p.n2;
      syncReadout();
      render();
    });
  });

  n1Slider.addEventListener('input', () => {
    state.n1 = parseFloat(n1Slider.value);
    syncReadout();
    render();
  });

  n2Slider.addEventListener('input', () => {
    state.n2 = parseFloat(n2Slider.value);
    syncReadout();
    render();
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    state = makeInitialState();
    n1Slider.value = state.n1;
    n2Slider.value = state.n2;
    dragCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ─────────────────────────────────────────── */

  n1Slider.value = state.n1;
  n2Slider.value = state.n2;
  syncReadout();
  render();

})();
