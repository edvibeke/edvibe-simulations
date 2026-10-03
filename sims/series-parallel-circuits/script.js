(() => {
  'use strict';

  /* ── Constants ──────────────────────────────────────── */

  const W = 900, H = 540;

  const B0 = { x: 170, y: 420 };   // battery negative terminal
  const B1 = { x: 170, y: 250 };   // battery positive terminal
  const TL = { x: 170, y: 150 };
  const TR = { x: 730, y: 150 };
  const BR = { x: 730, y: 420 };
  const BL = { x: 170, y: 420 };

  const BULB = {
    series:   [{ x: 340, y: 150 }, { x: 560, y: 150 }],
    parallel: [{ x: 340, y: 285 }, { x: 560, y: 285 }]
  };

  const PATHS = {
    series: [
      [B1, TL, { x: 340, y: 150 }, { x: 560, y: 150 }, TR, BR, BL]
    ],
    parallel: [
      [B1, TL, { x: 340, y: 150 }, { x: 340, y: 420 }, BL],
      [B1, TL, { x: 560, y: 150 }, { x: 560, y: 420 }, BL]
    ]
  };

  const DOTS_PER_LOOP = 16;

  /* ── DOM ────────────────────────────────────────────── */

  const canvas      = document.getElementById('stage');
  const stage     = EV.stage('stage');
  const ctx         = stage.ctx;
  const voltageEl   = document.getElementById('voltage');
  const voltageValue= document.getElementById('voltageValue');
  const resistanceEl= document.getElementById('resistance');
  const resistanceValue= document.getElementById('resistanceValue');
  const modeBtn     = document.getElementById('modeBtn');
  const modeValue   = document.getElementById('modeValue');
  const currentValue= document.getElementById('currentValue');
  const voltagePerBulbValue = document.getElementById('voltagePerBulbValue');
  const powerPerBulbValue   = document.getElementById('powerPerBulbValue');

  /* ── State ──────────────────────────────────────────── */

  let mode = 'series';
  let E = 6, R = 4;
  let toggles = 0;
  let rafId = null;
  let lastTime = 0;

  // dot traffic
  const loops = [];
  function rebuildLoops() {
    loops.length = 0;
    for (const path of PATHS[mode]) {
      const pts = path.slice();
      const lens = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        lens.push(d); total += d;
      }
      const dots = [];
      for (let i = 0; i < DOTS_PER_LOOP; i++) dots.push((total * i) / DOTS_PER_LOOP);
      loops.push({ pts, lens, total, dots });
    }
  }

  function pointAt(loop, dist) {
    let d = dist % loop.total;
    for (let i = 1; i < loop.pts.length; i++) {
      const seg = loop.lens[i - 1];
      if (d <= seg) {
        const a = loop.pts[i - 1], b = loop.pts[i];
        const t = seg === 0 ? 0 : d / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      d -= seg;
    }
    const back = loop.pts[loop.pts.length - 1];
    return { x: back.x, y: back.y };
  }

  /* ── Physics ────────────────────────────────────────── */

  function circuit() {
    if (mode === 'series') {
      const I = E / (2 * R);
      return { I: I, Vb: E / 2, Pb: R * I * I };
    }
    const Ie = E / R;
    return { I: 2 * Ie, Vb: E, Pb: R * Ie * Ie };
  }

  /* ── Render ─────────────────────────────────────────── */

  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    const c = circuit();
    const iAmp = Math.min(c.I, 3);

    // wires
    for (const loop of loops) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 5 + iAmp * 2.4;
      ctx.beginPath();
      ctx.moveTo(loop.pts[0].x, loop.pts[0].y);
      for (let i = 1; i < loop.pts.length; i++) ctx.lineTo(loop.pts[i].x, loop.pts[i].y);
      ctx.stroke();
    }

    // traffic dots (electrons)
    const speed = (0.35 + iAmp * 0.75) * 60;
    ctx.fillStyle = '#fbbf24';
    for (const loop of loops) {
      for (let i = 0; i < loop.dots.length; i++) {
        /* Dots advance on the shared clock, so they hold still under
           reduced motion instead of using a hardcoded frame time. */
        loop.dots[i] = (loop.dots[i] + speed * (dt || 0)) % loop.total;
        const p = pointAt(loop, loop.dots[i]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // battery
    const bW = 30;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 6;
    ctx.beginPath();                       // positive plate
    ctx.moveTo(B1.x, B1.y + 8); ctx.lineTo(B1.x, B1.y + 8 + bW);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();                       // negative plate
    ctx.moveTo(B1.x, B1.y + 8 + bW + 10); ctx.lineTo(B1.x, B1.y + 8 + bW + 10 + bW);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('+', B1.x - 12, B1.y + 14);
    ctx.fillText('−', B1.x - 6, B1.y + 14 + bW + 10 + bW + 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(E.toFixed(1) + ' V', B1.x + 12, B1.y + 14);

    // bulbs
    for (const b of BULB[mode]) drawBulb(b.x, b.y, c.Pb);

    // labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('each bulb R = ' + R.toFixed(1) + ' Ω', TR.x, TR.y - 30);
  }
  /* Repaint on demand — used by the shared runtime when
     prefers-reduced-motion stops the animation clock. */
  stage.onPaint = () => { syncReadout(); render(0); };

  function drawBulb(x, y, P) {
    const glow = Math.min(1, P / 6);
    const r = 26;

    // glow
    const grad = ctx.createRadialGradient(x, y, 4, x, y, r * (2 + glow * 3));
    grad.addColorStop(0, `rgba(254,240,138,${0.25 + glow * 0.6})`);
    grad.addColorStop(1, 'rgba(254,240,138,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * (2 + glow * 3), 0, Math.PI * 2);
    ctx.fill();

    // glass
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // filament
    ctx.strokeStyle = glow > 0.05 ? '#fde047' : '#64748b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 10);
    ctx.lineTo(x - 4, y - 2);
    ctx.lineTo(x, y + 6);
    ctx.lineTo(x + 4, y - 2);
    ctx.lineTo(x + 8, y + 10);
    ctx.stroke();

    if (glow > 0.05) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(254,249,195,${glow})`;
      ctx.fill();
    }
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const c = circuit();
    modeValue.textContent        = mode === 'series' ? 'Series' : 'Parallel';
    currentValue.textContent     = c.I.toFixed(2) + ' A';
    voltagePerBulbValue.textContent = c.Vb.toFixed(1) + ' V';
    powerPerBulbValue.textContent   = c.Pb.toFixed(2) + ' W';
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;
    render(dt);
    syncReadout();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Actions ────────────────────────────────────────── */

  function toggleMode() {
    mode = mode === 'series' ? 'parallel' : 'series';
    toggles++;
    EV.label(modeBtn, 'circuit-board', mode === 'series' ? 'Switch to parallel' : 'Switch to series');
    if (toggles >= 1) EV.revealInsight();
    rebuildLoops();
  }

  function resetRun() {
    E = Number(voltageEl.value);
    R = Number(resistanceEl.value);
    if (mode !== 'series') { mode = 'series'; EV.label(modeBtn, 'circuit-board', 'Switch to parallel'); }
    rebuildLoops();
    syncReadout();
  }

  /* ── Events ─────────────────────────────────────────── */

  modeBtn.addEventListener('click', toggleMode);

  voltageEl.addEventListener('input', () => {
    voltageValue.textContent = Number(voltageEl.value).toFixed(1) + ' V';
    E = Number(voltageEl.value);
  });
  resistanceEl.addEventListener('input', () => {
    resistanceValue.textContent = Number(resistanceEl.value).toFixed(1) + ' Ω';
    R = Number(resistanceEl.value);
  });

  EV.onReset(() => {
    voltageEl.value = 6;
    resistanceEl.value = 4;
    voltageValue.textContent = '6.0 V';
    resistanceValue.textContent = '4.0 Ω';
    toggles = 0;
    EV.resetInsight();
    resetRun();
  });

  /* ── Init ───────────────────────────────────────────── */

  EV.label(modeBtn, 'circuit-board', 'Switch to parallel');
  voltageValue.textContent = '6.0 V';
  resistanceValue.textContent = '4.0 Ω';
  resetRun();
  start();
})();