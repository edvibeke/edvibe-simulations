(() => {
  'use strict';

  /* ── Constants ──────────────────────────────────────── */

  const W = 900, H = 540;

  const CYL = { x0: 120, xMax: 560, top: 120, bot: 420 };
  const VMIN = 10, VMAX = 90;
  const K = 5000;                  // kPa·mL constant (fixed T, fixed n)

  const PLOT = { x0: 600, x1: 870, y0: 40, y1: 460, vMax: 100, pMax: 500 };

  const N_PARTICLES = 28;

  /* ── DOM ────────────────────────────────────────────── */

  const canvas   = document.getElementById('stage');
  const stage     = EV.stage('stage');
  const ctx      = stage.ctx;
  const pistonEl = document.getElementById('piston');
  const volumeValue  = document.getElementById('volumeValue');
  const volOutValue  = document.getElementById('volOutValue');
  const pressureValue= document.getElementById('pressureValue');
  const productValue = document.getElementById('productValue');
  const tempOutValue = document.getElementById('tempOutValue');

  /* ── State ──────────────────────────────────────────── */

  let V = 40;                 // mL
  let rafId = null;
  let lastTime = 0;

  const particles = [];
  for (let i = 0; i < N_PARTICLES; i++) {
    particles.push({ u: Math.random(), y: Math.random(), ph: Math.random() * 7 });
  }

  function pressure() { return K / V; }

  function pistonX() {
    return CYL.x0 + 40 + ((V - VMIN) / (VMAX - VMIN)) * (CYL.xMax - CYL.x0 - 40);
  }

  /* ── Render: cylinder ───────────────────────────────── */

  function drawCylinder(t) {
    const px = pistonX();

    // outside (right of piston)
    ctx.fillStyle = 'rgba(148,163,184,0.08)';
    ctx.fillRect(px, CYL.top, CYL.xMax - px, CYL.bot - CYL.top);

    // cylinder frame (glass)
    ctx.fillStyle = 'rgba(226,232,240,0.06)';
    ctx.fillRect(CYL.x0, CYL.top, CYL.xMax - CYL.x0, CYL.bot - CYL.top);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.strokeRect(CYL.x0, CYL.top, CYL.xMax - CYL.x0, CYL.bot - CYL.top);

    // pressure label above the gas
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pressure().toFixed(0) + ' kPa', (CYL.x0 + px) / 2, CYL.top - 16);

    // volume label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('V = ' + V + ' mL', (CYL.x0 + px) / 2, CYL.bot + 18);

    // piston
    const grad = ctx.createLinearGradient(px - 12, 0, px + 12, 0);
    grad.addColorStop(0, '#475569');
    grad.addColorStop(0.5, '#94a3b8');
    grad.addColorStop(1, '#475569');
    ctx.fillStyle = grad;
    ctx.fillRect(px - 12, CYL.top - 6, 24, CYL.bot - CYL.top + 12);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 12, CYL.top - 6, 24, CYL.bot - CYL.top + 12);

    // piston handle
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(px, CYL.top - 6);
    ctx.lineTo(px, CYL.top - 46);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(px, CYL.top - 52, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, CYL.top);
    ctx.lineTo(px, CYL.bot);
    ctx.stroke();
    ctx.setLineDash([]);

    // gas particles (bump around, denser when compressed)
    const gx0 = CYL.x0 + 14, gx1 = px - 14;
    const gy0 = CYL.top + 14, gy1 = CYL.bot - 14;
    for (const p of particles) {
      const x = gx0 + p.u * (gx1 - gx0);
      const y = gy0 + p.y * (gy1 - gy0) + Math.sin(t * 1.4 + p.ph) * 2.2;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0ea5e9';
      ctx.stroke();
    }
  }

  /* ── Render: graph ──────────────────────────────────── */

  function pxOf(v) { return PLOT.x0 + ((PLOT.x1 - PLOT.x0) * v) / PLOT.vMax; }
  function pyOf(p) { return PLOT.y1 - ((PLOT.y1 - PLOT.y0) * p) / PLOT.pMax; }

  function drawGraph() {
    ctx.fillStyle = 'rgba(15,23,42,0.6)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(PLOT.x0 - 14, PLOT.y0 - 14, PLOT.x1 - PLOT.x0 + 28, PLOT.y1 - PLOT.y0 + 28, 12);
    ctx.fill();
    ctx.stroke();

    // grid + labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let p = 0; p <= PLOT.pMax; p += 100) {
      const y = pyOf(p);
      ctx.strokeStyle = 'rgba(148,163,184,0.14)';
      ctx.beginPath();
      ctx.moveTo(PLOT.x0, y); ctx.lineTo(PLOT.x1, y);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(String(p), PLOT.x0 - 6, y);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('pressure / kPa', PLOT.x0 - 6, PLOT.y0 - 8);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = 0; v <= PLOT.vMax; v += 20) {
      const x = pxOf(v);
      ctx.strokeStyle = 'rgba(148,163,184,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, PLOT.y0); ctx.lineTo(x, PLOT.y1);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(String(v), x, PLOT.y1 + 6);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('volume / mL', PLOT.x0 + (PLOT.x1 - PLOT.x0) / 2, PLOT.y1 + 24);

    // Boyle hyperbola (P = 5000 / V)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    for (let v = VMIN; v <= VMAX + 0.01; v += 0.5) {
      const p = K / v;
      const x = pxOf(v), y = pyOf(p);
      if (y < PLOT.y0 - 28) continue;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // start ghost point
    const sP = K / 40, sX = pxOf(40), sY = pyOf(sP);
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(sX, sY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('start', Math.min(PLOT.x1 - 40, sX + 30), sY + 2);

    // current point (pulsing)
    const cX = pxOf(V), cY = pyOf(pressure());
    const pulse = 3 + 2 * Math.sin(EV.visualTime(performance.now()) / 180);
    ctx.beginPath();
    ctx.arc(cX, cY, 6 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56,189,248,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cX, cY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#e0f2fe';
    ctx.fill();

    // annotation: P×V stays constant
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('P × V = ' + K + ' at every point', PLOT.x0 + (PLOT.x1 - PLOT.x0) / 2, PLOT.y0 + 4);
  }

  /* ── Render ─────────────────────────────────────────── */

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    drawCylinder(t);
    drawGraph();
  }
  /* Repaint on demand — used by the shared runtime when
     prefers-reduced-motion stops the animation clock. */
  stage.onPaint = () => { syncReadout(); render(EV.visualTime(performance.now()) / 1000); };

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    volOutValue.textContent   = V + ' mL';
    pressureValue.textContent = pressure().toFixed(0) + ' kPa';
    productValue.textContent  = K.toFixed(0) + ' kPa·mL';
    tempOutValue.textContent  = '300 K';

    if (V <= 20) EV.revealInsight();
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;
    // Particle wobble holds still under reduced motion.
    render(EV.visualTime(now) / 1000);
    syncReadout();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Events ─────────────────────────────────────────── */

  pistonEl.addEventListener('input', () => {
    V = Number(pistonEl.value);
    volumeValue.textContent = V + ' mL';
  });

  EV.onReset(() => {
    pistonEl.value = 40;
    volumeValue.textContent = '40 mL';
    V = 40;
    EV.resetInsight();
    syncReadout();
  });

  /* ── Init ───────────────────────────────────────────── */

  volumeValue.textContent = '40 mL';
  start();
})();