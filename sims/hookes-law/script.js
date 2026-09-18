(() => {
  'use strict';

  /* ── Constants ─────────────────────────────────────── */

  const W = 900, H = 540;
  const G = 9.81;

  // Spring visual (left panel)
  const CEILING_Y   = 50;
  const SPRING_X    = 240;         // x-coordinate of the spring axis
  const NATURAL_LEN = 0.15;        // metres, unstretched length
  const PX_PER_M    = 400;         // visual scale for the spring
  const SPRING_COILS = 12;

  // Graph (right panel)
  const GRAPH = { x: 540, y: 80, w: 320, h: 400 };
  const F_MAX = 22;                // N
  const X_MAX = 1.1;               // m

  const INITIAL = { mass: 0.5, k: 50 };

  /* ── DOM ───────────────────────────────────────────── */

  const canvas       = document.getElementById('stage');
  const ctx          = canvas.getContext('2d');
  const massSlider   = document.getElementById('mass');
  const kSlider      = document.getElementById('k');
  const massValue    = document.getElementById('massValue');
  const kValue       = document.getElementById('kValue');
  const forceValue   = document.getElementById('forceValue');
  const extensionValue = document.getElementById('extensionValue');
  const kOutValue    = document.getElementById('kOutValue');
  const helpEl       = document.getElementById('help');
  const insightEl    = document.getElementById('insight');

  /* ── State ─────────────────────────────────────────── */

  let state = makeInitialState();
  let massChangeCount = 0;

  function makeInitialState() {
    return {
      mass: INITIAL.mass,
      k: INITIAL.k,
      points: []           // [{F, x}]
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  function force()      { return state.mass * G; }
  function extension()  { return force() / state.k; }

  /* ── Rendering ─────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawDivider();
    drawSpringPanel();
    drawGraphPanel();
  }

  function drawDivider() {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(520, 30);
    ctx.lineTo(520, H - 30);
    ctx.stroke();
  }

  /* ── Spring panel ──────────────────────────────────── */

  function drawSpringPanel() {
    drawCeiling();
    drawNaturalLengthRef();

    const ext = extension();
    const bottomY = CEILING_Y + (NATURAL_LEN + ext) * PX_PER_M;

    drawSpringCoils(bottomY);
    drawMass(bottomY);
    drawExtensionArrow(ext);
  }

  function drawCeiling() {
    // Solid ceiling bar
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 500, 32);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(500, 32);
    ctx.stroke();

    // Hatching
    ctx.strokeStyle = '#475569';
    for (let x = 20; x < 500; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 15, 32);
      ctx.stroke();
    }

    // Small anchor point
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(SPRING_X, 32, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawNaturalLengthRef() {
    // Dashed line where the mass would hang with no load
    const y = CEILING_Y + NATURAL_LEN * PX_PER_M;
    ctx.strokeStyle = 'rgba(148,163,184,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(SPRING_X - 80, y);
    ctx.lineTo(SPRING_X + 80, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('natural length', SPRING_X + 90, y);
  }

  function drawSpringCoils(bottomY) {
    const topY = CEILING_Y;
    const length = bottomY - topY;
    const coilWidth = 42;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(SPRING_X, topY);

    const segments = SPRING_COILS * 2;
    for (let i = 1; i <= segments; i++) {
      const frac = i / segments;
      const y = topY + length * frac;
      const x = SPRING_X + (i % 2 === 0 ? -coilWidth / 2 : coilWidth / 2);
      // Last segment comes back to axis
      if (i === segments) {
        ctx.lineTo(SPRING_X, bottomY);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function drawMass(bottomY) {
    // Mass size scales slightly with value
    const w = 60 + state.mass * 20;
    const h = 30 + state.mass * 10;

    ctx.fillStyle = '#6366f1';
    ctx.fillRect(SPRING_X - w / 2, bottomY, w, h);

    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(SPRING_X - w / 2, bottomY, w, h);

    // Mass label
    ctx.fillStyle = '#fff';
    ctx.font = '700 14px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.mass.toFixed(2) + ' kg', SPRING_X, bottomY + h / 2);
  }

  function drawExtensionArrow(ext) {
    if (ext < 0.005) return;

    const y1 = CEILING_Y + NATURAL_LEN * PX_PER_M;
    const y2 = CEILING_Y + (NATURAL_LEN + ext) * PX_PER_M;
    const arrowX = SPRING_X - 110;

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(arrowX, y1);
    ctx.lineTo(arrowX, y2);
    ctx.stroke();

    // Arrowheads
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(arrowX, y1);
    ctx.lineTo(arrowX - 5, y1 + 8);
    ctx.lineTo(arrowX + 5, y1 + 8);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(arrowX, y2);
    ctx.lineTo(arrowX - 5, y2 - 8);
    ctx.lineTo(arrowX + 5, y2 - 8);
    ctx.closePath();
    ctx.fill();

    // Extension label
    ctx.fillStyle = '#10b981';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(ext.toFixed(3) + ' m', arrowX - 12, (y1 + y2) / 2);
  }

  /* ── Graph panel ───────────────────────────────────── */

  function drawGraphPanel() {
    const g = GRAPH;

    // Panel background
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    // Plot area border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(g.x, g.y, g.w, g.h);

    // Gridlines
    ctx.strokeStyle = 'rgba(100,116,139,0.14)';
    for (let f = 0; f <= F_MAX; f += 5) {
      const x = g.x + (f / F_MAX) * g.w;
      ctx.beginPath();
      ctx.moveTo(x, g.y);
      ctx.lineTo(x, g.y + g.h);
      ctx.stroke();
    }
    for (let xm = 0; xm <= X_MAX; xm += 0.2) {
      const y = g.y + g.h - (xm / X_MAX) * g.h;
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

    // Axis ticks + labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 10px ui-monospace, monospace';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let f = 0; f <= F_MAX; f += 5) {
      const x = g.x + (f / F_MAX) * g.w;
      ctx.fillText(f.toString(), x, g.y + g.h + 6);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let xm = 0; xm <= X_MAX; xm += 0.2) {
      const y = g.y + g.h - (xm / X_MAX) * g.h;
      const label = xm === 0 ? '0' : xm.toFixed(1);
      ctx.fillText(label, g.x - 8, y);
    }

    // Axis titles
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 11px system-ui, sans-serif';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('FORCE  F  (N)', g.x + g.w / 2, g.y + g.h + 26);

    ctx.save();
    ctx.translate(g.x - 42, g.y + g.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXTENSION  x  (m)', 0, 0);
    ctx.restore();

    // Data points
    const toPx = (F, xm) => ({
      x: g.x + (F / F_MAX) * g.w,
      y: g.y + g.h - (xm / X_MAX) * g.h
    });

    // Best-fit line through origin (only if ≥2 points)
    if (state.points.length >= 2) {
      const slope = 1 / state.k;             // x = F/k
      const endF = F_MAX;
      const endX = endF * slope;
      const p0 = toPx(0, 0);
      const p1 = toPx(endF, endX);
      ctx.strokeStyle = 'rgba(16,185,129,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      // Clip the line to the plot area
      const clipX = Math.min(endX, X_MAX);
      const clippedEnd = toPx(clipX * state.k, clipX);
      ctx.lineTo(clippedEnd.x, clippedEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Points
    state.points.forEach(p => {
      const c = toPx(p.F, p.x);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Current point (larger, primary-coloured)
    if (state.mass > 0) {
      const cur = toPx(force(), extension());
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* ── Readout ──────────────────────────────────────── */

  function syncReadout() {
    massValue.textContent = state.mass.toFixed(2) + ' kg';
    kValue.textContent = state.k + ' N/m';

    const F = force();
    const x = extension();

    forceValue.textContent = F.toFixed(2) + ' N';
    extensionValue.textContent = x.toFixed(3) + ' m';

    if (x > 0.001) {
      kOutValue.textContent = (F / x).toFixed(1) + ' N/m';
    } else {
      kOutValue.textContent = '—';
    }
  }

  /* ── Point accumulation ───────────────────────────── */

  function recordPoint() {
    if (state.mass <= 0) return;
    const F = force();
    const x = extension();

    // Only add if at least 1 N away from the previous point
    const last = state.points[state.points.length - 1];
    if (last && Math.abs(last.F - F) < 1) return;

    state.points.push({ F, x });
  }

  /* ── Input handlers ───────────────────────────────── */

  massSlider.addEventListener('input', () => {
    state.mass = parseFloat(massSlider.value);
    recordPoint();
    syncReadout();
    render();
    massChangeCount++;
    if (massChangeCount >= 8) insightEl.hidden = false;
  });

  kSlider.addEventListener('input', () => {
    state.k = parseFloat(kSlider.value);
    // Changing the spring = new experiment; clear the graph.
    state.points = [];
    recordPoint();          // seed with current mass
    syncReadout();
    render();
  });

  document.querySelector('[data-action="sweep"]').addEventListener('click', sweep);

  function sweep() {
    // Animate the mass slider from 0 to 2 over ~2.5 s, recording points
    const start = performance.now();
    const duration = 2500;
    const target = 2;

    state.points = [];

    function frame(now) {
      const frac = Math.min((now - start) / duration, 1);
      const m = frac * target;

      state.mass = m;
      massSlider.value = m;

      // Record on the fly
      recordPoint();
      syncReadout();
      render();

      if (frac < 1) requestAnimationFrame(frame);
      else {
        insightEl.hidden = false;
      }
    }

    requestAnimationFrame(frame);
  }

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    state = makeInitialState();
    massSlider.value = state.mass;
    kSlider.value = state.k;
    massChangeCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ─────────────────────────────────────────── */

  massSlider.value = state.mass;
  kSlider.value = state.k;
  recordPoint();               // seed with the initial point
  syncReadout();
  render();

})();
