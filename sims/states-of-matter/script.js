(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const BOX = { x: 40, y: 60, w: 380, h: 420 };
  const GRAPH = { x: 500, y: 90, w: 360, h: 380 };
  const T_MIN = -20, T_MAX = 140;

  const N_PARTICLES = 48;
  const PARTICLES_PER_ROW = 8;

  const INITIAL = { energy: 15 };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas       = document.getElementById('stage');
  const ctx          = canvas.getContext('2d');
  const energySlider = document.getElementById('energy');
  const energyValue  = document.getElementById('energyValue');
  const tempValue    = document.getElementById('tempValue');
  const stateValue   = document.getElementById('stateValue');
  const energyOutValue = document.getElementById('energyOutValue');
  const autoBtn      = document.getElementById('autoBtn');
  const helpEl       = document.getElementById('help');
  const insightEl    = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let state = makeInitialState();
  let particles = [];
  let rafId = null;
  let lastTime = 0;
  let autoHeating = false;
  let maxEnergyReached = INITIAL.energy;

  function makeInitialState() {
    return { energy: INITIAL.energy };
  }

  /* ── Particle setup ─────────────────────────────────── */

  function makeParticles() {
    const list = [];
    const cols = PARTICLES_PER_ROW;
    const rows = Math.ceil(N_PARTICLES / cols);

    const cellW = BOX.w / (cols + 1);
    const cellH = (BOX.h * 0.55) / (rows + 1);
    const baseY = BOX.y + BOX.h * 0.35;

    for (let i = 0; i < N_PARTICLES; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const hx = BOX.x + cellW * (col + 1) + (Math.random() - 0.5) * 6;
      const hy = baseY + cellH * (row + 1) + (Math.random() - 0.5) * 6;
      list.push({
        homeX: hx,
        homeY: hy,
        x: hx,
        y: hy,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        seed: Math.random() * Math.PI * 2
      });
    }
    return list;
  }

  /* ── Physics model ──────────────────────────────────── */

  // Energy mapping:
  //   0–20   solid warming from -20 °C to 0 °C
  //   20–40  melting plateau (0 °C)
  //   40–60  liquid warming from 0 °C to 100 °C
  //   60–80  boiling plateau (100 °C)
  //   80–100 gas warming from 100 °C to 140 °C
  function model(e) {
    if (e < 20)  return { temp: -20 + (e / 20) * 20,       state: 'solid',   melt: 0,             boil: 0,             kinetic: 0.05 + (e / 20) * 0.10 };
    if (e < 40)  return { temp: 0,                         state: 'melting', melt: (e - 20) / 20, boil: 0,             kinetic: 0.15 + ((e - 20) / 20) * 0.15 };
    if (e < 60)  return { temp: ((e - 40) / 20) * 100,     state: 'liquid',  melt: 1,             boil: 0,             kinetic: 0.30 + ((e - 40) / 20) * 0.25 };
    if (e < 80)  return { temp: 100,                       state: 'boiling', melt: 1,             boil: (e - 60) / 20, kinetic: 0.55 + ((e - 60) / 20) * 0.30 };
    return { temp: 100 + ((e - 80) / 20) * 40,             state: 'gas',     melt: 1,             boil: 1,             kinetic: 0.85 + ((e - 80) / 20) * 0.40 };
  }

  /* ── Particle update ────────────────────────────────── */

  function updateParticles(dt) {
    const m = model(state.energy);

    // Per-particle freedom
    // Base freedom scales with kinetic. Lattice attraction decays as freedom rises.
    const baseFreedom = Math.min(1, m.kinetic * 1.15);

    particles.forEach((p, i) => {
      // Individual variation so particles don't move as a block
      const wave = 0.5 + 0.5 * Math.sin(p.seed + performance.now() * 0.0015 + i * 0.7);
      const freedom = Math.max(0, Math.min(1, baseFreedom * (0.7 + wave * 0.5)));

      // Attraction to home position (strong when freedom is low)
      const attraction = (1 - freedom) * 90;
      const dx = p.homeX - p.x;
      const dy = p.homeY - p.y;

      p.vx += dx * attraction * dt;
      p.vy += dy * attraction * dt;

      // Thermal jitter (higher with freedom)
      const jitter = 80 + freedom * 500;
      p.vx += (Math.random() - 0.5) * jitter * dt;
      p.vy += (Math.random() - 0.5) * jitter * dt;

      // Gas particles drift upward — bounce off the top of the box
      if (freedom > 0.85) {
        p.vy -= 40 * dt;    // gentle upward push
      }

      // Damping keeps things from exploding
      p.vx *= 0.94;
      p.vy *= 0.94;

      // Integrate
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Bounce off walls
      const pad = 8;
      if (p.x < BOX.x + pad)              { p.x = BOX.x + pad;              p.vx = Math.abs(p.vx); }
      if (p.x > BOX.x + BOX.w - pad)      { p.x = BOX.x + BOX.w - pad;      p.vx = -Math.abs(p.vx); }
      if (p.y < BOX.y + pad)              { p.y = BOX.y + pad;              p.vy = Math.abs(p.vy); }
      if (p.y > BOX.y + BOX.h - pad)      { p.y = BOX.y + BOX.h - pad;      p.vy = -Math.abs(p.vy); }

      // Update home for liquid/gas so they don't snap back to old lattice
      // (only relevant if we ever decrease energy — home stays put, which is fine)
    });
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBox();
    drawParticles();
    drawGraph();
  }

  function drawBox() {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);

    ctx.fillStyle = '#64748b';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('PARTICLE VIEW', BOX.x + BOX.w / 2, BOX.y - 10);
  }

  function drawParticles() {
    const m = model(state.energy);

    // Colour by state: blue → teal → amber
    let color;
    switch (m.state) {
      case 'solid':   color = '#60a5fa'; break;
      case 'melting': color = '#22d3ee'; break;
      case 'liquid':  color = '#22d3ee'; break;
      case 'boiling': color = '#f59e0b'; break;
      case 'gas':     color = '#f59e0b'; break;
    }

    particles.forEach(p => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  /* ── Graph ──────────────────────────────────────────── */

  function drawGraph() {
    const g = GRAPH;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    // Grid
    ctx.strokeStyle = 'rgba(100,116,139,0.14)';
    ctx.lineWidth = 1;
    for (let e = 0; e <= 100; e += 20) {
      const x = g.x + (e / 100) * g.w;
      ctx.beginPath();
      ctx.moveTo(x, g.y);
      ctx.lineTo(x, g.y + g.h);
      ctx.stroke();
    }
    for (let t = T_MIN; t <= T_MAX; t += 20) {
      const y = g.y + g.h - ((t - T_MIN) / (T_MAX - T_MIN)) * g.h;
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
    for (let e = 0; e <= 100; e += 20) {
      const x = g.x + (e / 100) * g.w;
      ctx.fillText(e + '%', x, g.y + g.h + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let t = T_MIN; t <= T_MAX; t += 20) {
      const y = g.y + g.h - ((t - T_MIN) / (T_MAX - T_MIN)) * g.h;
      ctx.fillText(t + '°', g.x - 6, y);
    }

    // Axis titles
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ENERGY ADDED', g.x + g.w / 2, g.y + g.h + 26);

    ctx.save();
    ctx.translate(g.x - 44, g.y + g.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TEMPERATURE  (°C)', 0, 0);
    ctx.restore();

    // Heating curve path
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const curvePoints = [
      [0, -20], [20, 0], [40, 0], [60, 100], [80, 100], [100, 140]
    ];
    curvePoints.forEach(([e, t], i) => {
      const x = g.x + (e / 100) * g.w;
      const y = g.y + g.h - ((t - T_MIN) / (T_MAX - T_MIN)) * g.h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dashed reference lines at 0 and 100 °C
    [0, 100].forEach(t => {
      const y = g.y + g.h - ((t - T_MIN) / (T_MAX - T_MIN)) * g.h;
      ctx.strokeStyle = 'rgba(250,204,21,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(g.x, y);
      ctx.lineTo(g.x + g.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Current position marker
    const m = model(state.energy);
    const mx = g.x + (state.energy / 100) * g.w;
    const my = g.y + g.h - ((m.temp - T_MIN) / (T_MAX - T_MIN)) * g.h;

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const m = model(state.energy);
    const stateName = { solid: 'Solid', melting: 'Melting', liquid: 'Liquid', boiling: 'Boiling', gas: 'Gas' }[m.state];

    energyValue.textContent    = state.energy + '%';
    energyOutValue.textContent = state.energy + '%';
    tempValue.textContent      = m.temp.toFixed(0) + ' °C';
    stateValue.textContent     = stateName;

    // Colour the temp by state
    tempValue.style.color = m.state === 'solid'   ? '#60a5fa'
                          : m.state === 'melting' ? '#22d3ee'
                          : m.state === 'liquid'  ? '#22d3ee'
                          : m.state === 'boiling' ? '#f59e0b'
                          : '#f59e0b';
  }

  /* ── Animation loop ────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (autoHeating) {
      state.energy = Math.min(100, state.energy + dt * 12);
      energySlider.value = state.energy;
      syncReadout();

      if (state.energy >= 100) {
        autoHeating = false;
        autoBtn.textContent = '▶ Auto-heat';
      }
    }

    updateParticles(dt);
    render();

    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ── Input ──────────────────────────────────────────── */

  energySlider.addEventListener('input', () => {
    state.energy = parseFloat(energySlider.value);
    syncReadout();
    if (state.energy > maxEnergyReached + 5) {
      maxEnergyReached = state.energy;
    }
    if (maxEnergyReached >= 95) insightEl.hidden = false;
  });

  autoBtn.addEventListener('click', () => {
    if (autoHeating) {
      autoHeating = false;
      autoBtn.textContent = '▶ Auto-heat';
    } else {
      autoHeating = true;
      autoBtn.textContent = '⏸ Pause';
    }
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    stopLoop();
    autoHeating = false;
    state = makeInitialState();
    energySlider.value = state.energy;
    autoBtn.textContent = '▶ Auto-heat';
    maxEnergyReached = INITIAL.energy;
    particles = makeParticles();
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
    startLoop();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  particles = makeParticles();
  energySlider.value = state.energy;
  syncReadout();
  render();
  startLoop();

})();
