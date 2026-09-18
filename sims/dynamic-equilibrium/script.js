(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const BOX   = { x: 40,  y: 60, w: 440, h: 420 };
  const GRAPH = { x: 540, y: 90, w: 320, h: 380 };

  const PARTICLE_R = 8;
  const FLASH_MS   = 400;

  const INITIAL = { temperature: 40, countA: 60, countB: 60 };

  const COLORS = {
    A:        '#60a5fa',
    B:        '#34d399',
    Aflash:   '#93c5fd',
    Bflash:   '#6ee7b7'
  };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas     = document.getElementById('stage');
  const ctx        = canvas.getContext('2d');
  const tempSlider = document.getElementById('temp');
  const tempValue  = document.getElementById('tempValue');
  const aValue     = document.getElementById('aValue');
  const bValue     = document.getElementById('bValue');
  const kValue     = document.getElementById('kValue');
  const addABtn    = document.getElementById('addABtn');
  const addBBtn    = document.getElementById('addBBtn');
  const pauseBtn   = document.getElementById('pauseBtn');
  const helpEl     = document.getElementById('help');
  const insightEl  = document.getElementById('insight');

  /* ── Sim state ──────────────────────────────────────── */

  let particles = [];
  let history = [];               // [{t, aFrac, bFrac}]
  let elapsed = 0;
  let lastSample = 0;
  let rafId = null;
  let lastTime = 0;
  let paused = false;
  let changeCount = 0;

  /* ── Rate laws ──────────────────────────────────────── */

  function kf() {
    // Forward rate constant — increases strongly with T (endothermic forward)
    const t = tempSlider.valueAsNumber;
    return 0.30 + ((t - 20) / 60) * 1.20;
  }

  function kr() {
    // Reverse rate constant — barely changes with T
    const t = tempSlider.valueAsNumber;
    return 1.00 + ((t - 20) / 60) * 0.20;
  }

  function expectedK() {
    return kf() / kr();
  }

  /* ── Particle setup ─────────────────────────────────── */

  function spawnParticle(type) {
    const vx = (Math.random() - 0.5) * 60;
    const vy = (Math.random() - 0.5) * 60;
    return {
      type,
      x: BOX.x + 20 + Math.random() * (BOX.w - 40),
      y: BOX.y + 20 + Math.random() * (BOX.h - 40),
      vx, vy,
      flashUntil: 0
    };
  }

  function resetParticles() {
    particles = [];
    for (let i = 0; i < INITIAL.countA; i++) particles.push(spawnParticle('A'));
    for (let i = 0; i < INITIAL.countB; i++) particles.push(spawnParticle('B'));
  }

  function countOf(type) {
    let n = 0;
    for (const p of particles) if (p.type === type) n++;
    return n;
  }

  /* ── Physics update ─────────────────────────────────── */

  function step(dt, now) {
    // Move particles
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const pad = PARTICLE_R;
      if (p.x < BOX.x + pad)              { p.x = BOX.x + pad;              p.vx = Math.abs(p.vx); }
      if (p.x > BOX.x + BOX.w - pad)      { p.x = BOX.x + BOX.w - pad;      p.vx = -Math.abs(p.vx); }
      if (p.y < BOX.y + pad)              { p.y = BOX.y + pad;              p.vy = Math.abs(p.vy); }
      if (p.y > BOX.y + BOX.h - pad)      { p.y = BOX.y + BOX.h - pad;      p.vy = -Math.abs(p.vy); }
    }

    // Random gentle re-energising so they don't all settle
    for (const p of particles) {
      p.vx += (Math.random() - 0.5) * 30 * dt;
      p.vy += (Math.random() - 0.5) * 30 * dt;
      p.vx *= 0.99;
      p.vy *= 0.99;
    }

    // Reaction events — expected counts based on rates × population × dt
    const nA = countOf('A');
    const nB = countOf('B');

    const forwardExpected  = kf() * nA * 0.35 * dt;
    const reverseExpected  = kr() * nB * 0.35 * dt;

    let forwardEvents = Math.floor(forwardExpected);
    if (Math.random() < (forwardExpected - forwardEvents)) forwardEvents++;
    let reverseEvents = Math.floor(reverseExpected);
    if (Math.random() < (reverseExpected - reverseEvents)) reverseEvents++;

    for (let i = 0; i < forwardEvents; i++)  convertOne('A', 'B', now);
    for (let i = 0; i < reverseEvents; i++)  convertOne('B', 'A', now);

    // Sample graph
    if (elapsed - lastSample >= 0.05) {
      const total = nA + nB;
      history.push({
        t: elapsed,
        aFrac: total ? countOf('A') / total : 0,
        bFrac: total ? countOf('B') / total : 0
      });
      // Keep history bounded
      if (history.length > 3000) history.shift();
      lastSample = elapsed;
    }
  }

  function convertOne(fromType, toType, now) {
    // Pick a random particle of the source type
    const candidates = [];
    for (let i = 0; i < particles.length; i++) {
      if (particles[i].type === fromType) candidates.push(i);
    }
    if (candidates.length === 0) return;

    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    particles[idx].type = toType;
    particles[idx].flashUntil = now + FLASH_MS;
  }

  /* ── Render ─────────────────────────────────────────── */

  function render(now) {
    ctx.clearRect(0, 0, W, H);
    drawBox();
    drawParticles(now);
    drawLegend();
    drawGraph();
  }

  function drawBox() {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);

    // Corner accents
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    const c = 20;
    ctx.beginPath(); ctx.moveTo(BOX.x, BOX.y + c); ctx.lineTo(BOX.x, BOX.y); ctx.lineTo(BOX.x + c, BOX.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(BOX.x + BOX.w - c, BOX.y); ctx.lineTo(BOX.x + BOX.w, BOX.y); ctx.lineTo(BOX.x + BOX.w, BOX.y + c); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(BOX.x, BOX.y + BOX.h - c); ctx.lineTo(BOX.x, BOX.y + BOX.h); ctx.lineTo(BOX.x + c, BOX.y + BOX.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(BOX.x + BOX.w - c, BOX.y + BOX.h); ctx.lineTo(BOX.x + BOX.w, BOX.y + BOX.h); ctx.lineTo(BOX.x + BOX.w, BOX.y + BOX.h - c); ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('REACTION VESSEL', BOX.x + BOX.w / 2, BOX.y - 10);
  }

  function drawParticles(now) {
    for (const p of particles) {
      const flashing = now < p.flashUntil;
      const age = flashing ? 1 - (p.flashUntil - now) / FLASH_MS : 1;

      // Glow for just-converted particles
      if (flashing) {
        const glowR = PARTICLE_R + 6 + age * 6;
        const alpha = (1 - age) * 0.6;
        ctx.fillStyle = p.type === 'A'
          ? `rgba(96,165,250,${alpha})`
          : `rgba(52,211,153,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      const fill = p.type === 'A' ? COLORS.A : COLORS.B;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PARTICLE_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(11,18,32,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Letter
      ctx.fillStyle = 'rgba(11,18,32,0.85)';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type, p.x, p.y + 0.5);
    }
  }

  function drawLegend() {
    const y = BOX.y + BOX.h + 22;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = COLORS.A;
    ctx.beginPath(); ctx.arc(BOX.x + 14, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('A (reactant)', BOX.x + 26, y);

    ctx.fillStyle = COLORS.B;
    ctx.beginPath(); ctx.arc(BOX.x + 160, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('B (product)', BOX.x + 172, y);
  }

  /* ── Graph ──────────────────────────────────────────── */

  function drawGraph() {
    const g = GRAPH;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    // Grid
    ctx.strokeStyle = 'rgba(100,116,139,0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = g.x + (i / 5) * g.w;
      ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); ctx.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const y = g.y + (i / 5) * g.h;
      ctx.beginPath(); ctx.moveTo(g.x, y); ctx.lineTo(g.x + g.w, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x, g.y + g.h);
    ctx.lineTo(g.x + g.w, g.y + g.h);
    ctx.stroke();

    // Y-axis labels (0, 50, 100 %)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('100%', g.x - 6, g.y);
    ctx.fillText(' 50%', g.x - 6, g.y + g.h / 2);
    ctx.fillText('  0%', g.x - 6, g.y + g.h);

    // Axis titles
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TIME', g.x + g.w / 2, g.y + g.h + 26);

    ctx.save();
    ctx.translate(g.x - 46, g.y + g.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COMPOSITION', 0, 0);
    ctx.restore();

    // Time range — rolling window
    const windowSec = 12;
    const tEnd = Math.max(elapsed, windowSec);
    const tStart = tEnd - windowSec;

    function toX(t) { return g.x + ((t - tStart) / windowSec) * g.w; }
    function toY(frac) { return g.y + g.h - frac * g.h; }

    // A curve (blue)
    drawCurve(history, 'aFrac', toX, toY, COLORS.A);
    // B curve (green)
    drawCurve(history, 'bFrac', toX, toY, COLORS.B);

    // Expected equilibrium reference (dashed)
    const K = expectedK();
    // For A + B total constant, eqB/eqA = K → eqB/(total) = K/(1+K)
    const eqB = K / (1 + K);
    const eqY = toY(eqB);
    ctx.strokeStyle = 'rgba(250,204,21,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(g.x, eqY);
    ctx.lineTo(g.x + g.w, eqY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(250,204,21,0.75)';
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('current equilibrium', g.x + g.w - 6, eqY - 4);

    // Current point markers
    const latest = history[history.length - 1];
    if (latest) {
      ctx.fillStyle = COLORS.A;
      ctx.beginPath();
      ctx.arc(toX(latest.t), toY(latest.aFrac), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.B;
      ctx.beginPath();
      ctx.arc(toX(latest.t), toY(latest.bFrac), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCurve(data, key, toX, toY, color) {
    if (data.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    for (const pt of data) {
      const x = toX(pt.t);
      if (x < GRAPH.x - 2) { started = false; continue; }
      const y = toY(pt[key]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const a = countOf('A');
    const b = countOf('B');
    aValue.textContent = a;
    bValue.textContent = b;
    kValue.textContent = a > 0 ? (b / a).toFixed(2) : '—';
    tempValue.textContent = tempSlider.valueAsNumber + ' °C';
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!paused) {
      elapsed += dt;
      step(dt, now);
    }
    render(now);
    syncReadout();

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Buttons ────────────────────────────────────────── */

  addABtn.addEventListener('click', () => {
    for (let i = 0; i < 10; i++) particles.push(spawnParticle('A'));
    changeCount++;
    if (changeCount >= 4) insightEl.hidden = false;
  });

  addBBtn.addEventListener('click', () => {
    for (let i = 0; i < 10; i++) particles.push(spawnParticle('B'));
    changeCount++;
    if (changeCount >= 4) insightEl.hidden = false;
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Play' : '⏸ Pause';
  });

  tempSlider.addEventListener('input', () => {
    syncReadout();
    changeCount++;
    if (changeCount >= 4) insightEl.hidden = false;
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    particles = [];
    history = [];
    elapsed = 0;
    lastSample = 0;
    paused = false;
    changeCount = 0;
    pauseBtn.textContent = '⏸ Pause';
    tempSlider.value = INITIAL.temperature;
    resetParticles();
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  tempSlider.value = INITIAL.temperature;
  resetParticles();
  syncReadout();
  start();

})();
