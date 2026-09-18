(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const BOX   = { x: 40,  y: 60, w: 380, h: 420 };
  const GRAPH = { x: 500, y: 90, w: 360, h: 380 };
  const T_MIN = -20, T_MAX = 140;

  const N_PARTICLES = 48;
  const PARTICLE_R  = 7;

  /* ── State definitions ──────────────────────────────── */

  const INITIAL_STATE = 'solid';

  // energy = where the marker sits on the heating curve (0-100%)
  // temp   = the temperature shown in the readout
  // example= familiar word for students
  const STATES = {
    solid: {
      name: 'Solid',
      energy: 15,
      temp: -10,
      example: 'Ice',
      color: '#60a5fa',
      particleColor: '#60a5fa',
      springK: 140,       // strong pull to home — locked lattice
      jitter: 30,         // small vibration
      damping: 0.82,
      caption: 'Locked in a lattice — they only vibrate in place'
    },
    liquid: {
      name: 'Liquid',
      energy: 50,
      temp: 50,
      example: 'Water',
      color: '#22d3ee',
      particleColor: '#22d3ee',
      springK: 14,        // weak pull — they can slide
      jitter: 420,
      damping: 0.9,
      caption: 'Touching but sliding — they flow to the bottom'
    },
    gas: {
      name: 'Gas',
      energy: 90,
      temp: 120,
      example: 'Steam',
      color: '#f59e0b',
      particleColor: '#f59e0b',
      springK: 0,         // no pull — free flight
      jitter: 1700,
      damping: 0.985,
      caption: 'Far apart, moving fast — they fill the container'
    }
  };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas       = document.getElementById('stage');
  const ctx          = canvas.getContext('2d');
  const tempValue    = document.getElementById('tempValue');
  const stateValue   = document.getElementById('stateValue');
  const exampleValue = document.getElementById('exampleValue');
  const helpEl       = document.getElementById('help');
  const insightEl    = document.getElementById('insight');
  const stateBtns    = document.querySelectorAll('[data-state]');

  /* ── Sim state ──────────────────────────────────────── */

  let current = INITIAL_STATE;
  let particles = [];
  let rafId = null;
  let lastTime = 0;
  let switches = 0;

  /* ── Home positions ─────────────────────────────────── */

  function latticeHome(i) {
    const cols = 8;
    const rows = Math.ceil(N_PARTICLES / cols);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellW = BOX.w / (cols + 1);
    const cellH = (BOX.h * 0.5) / (rows + 1);
    return {
      hx: BOX.x + cellW * (col + 1),
      hy: BOX.y + BOX.h * 0.32 + cellH * row
    };
  }

  function liquidHome() {
    return {
      hx: BOX.x + 25 + Math.random() * (BOX.w - 50),
      hy: BOX.y + BOX.h * 0.50 + Math.random() * (BOX.h * 0.42)
    };
  }

  function makeParticles() {
    const list = [];
    for (let i = 0; i < N_PARTICLES; i++) {
      const h = current === 'solid' ? latticeHome(i) : liquidHome();
      list.push({
        x: BOX.x + BOX.w / 2 + (Math.random() - 0.5) * 60,
        y: BOX.y + BOX.h * 0.55 + (Math.random() - 0.5) * 60,
        vx: 0, vy: 0,
        hx: h.hx, hy: h.hy
      });
    }
    return list;
  }

  function reassignHomes() {
    if (current === 'solid') {
      particles.forEach((p, i) => {
        const h = latticeHome(i);
        p.hx = h.hx; p.hy = h.hy;
      });
    } else if (current === 'liquid') {
      particles.forEach(p => {
        const h = liquidHome();
        p.hx = h.hx; p.hy = h.hy;
      });
    }
  }

  /* ── Physics ────────────────────────────────────────── */

  function updateParticles(dt) {
    const cfg = STATES[current];

    for (const p of particles) {
      if (cfg.springK > 0) {
        p.vx += (p.hx - p.x) * cfg.springK * dt;
        p.vy += (p.hy - p.y) * cfg.springK * dt;
      }
      p.vx += (Math.random() - 0.5) * cfg.jitter * dt;
      p.vy += (Math.random() - 0.5) * cfg.jitter * dt;

      p.vx *= cfg.damping;
      p.vy *= cfg.damping;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const pad = PARTICLE_R + 2;
      if (p.x < BOX.x + pad)         { p.x = BOX.x + pad;         p.vx =  Math.abs(p.vx) * 0.8; }
      if (p.x > BOX.x + BOX.w - pad) { p.x = BOX.x + BOX.w - pad; p.vx = -Math.abs(p.vx) * 0.8; }
      if (p.y < BOX.y + pad)         { p.y = BOX.y + pad;         p.vy =  Math.abs(p.vy) * 0.8; }
      if (p.y > BOX.y + BOX.h - pad) { p.y = BOX.y + BOX.h - pad; p.vy = -Math.abs(p.vy) * 0.8; }
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBox();
    drawParticles();
    drawCaption();
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
    const cfg = STATES[current];
    ctx.fillStyle = cfg.particleColor;

    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, PARTICLE_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(11,18,32,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawCaption() {
    const cfg = STATES[current];
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.caption, BOX.x + BOX.w / 2, BOX.y + BOX.h + 30);
  }

  /* ── Heating-curve graph ───────────────────────────── */

  function drawGraph() {
    const g = GRAPH;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    // Grid
    ctx.strokeStyle = 'rgba(100,116,139,0.14)';
    ctx.lineWidth = 1;
    for (let e = 0; e <= 100; e += 20) {
      const x = g.x + (e / 100) * g.w;
      ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); ctx.stroke();
    }
    for (let t = T_MIN; t <= T_MAX; t += 20) {
      const y = g.y + g.h - ((t - T_MIN) / (T_MAX - T_MIN)) * g.h;
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

    // Ticks
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
    ctx.fillText('ENERGY', g.x + g.w / 2, g.y + g.h + 26);

    ctx.save();
    ctx.translate(g.x - 44, g.y + g.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TEMPERATURE  (°C)', 0, 0);
    ctx.restore();

    // Heating curve
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const pts = [[0, -20], [20, 0], [40, 0], [60, 100], [80, 100], [100, 140]];
    pts.forEach(([e, t], i) => {
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

    // Zone labels
    const zoneLabels = [
      { e: 15, label: 'solid' },
      { e: 50, label: 'liquid' },
      { e: 90, label: 'gas' }
    ];
    ctx.fillStyle = 'rgba(148,163,184,0.75)';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    zoneLabels.forEach(({ e, label }) => {
      const x = g.x + (e / 100) * g.w;
      ctx.fillText(label, x, g.y + 12);
    });

    // Current marker
    const cfg = STATES[current];
    const mx = g.x + (cfg.energy / 100) * g.w;
    const my = g.y + g.h - ((cfg.temp - T_MIN) / (T_MAX - T_MIN)) * g.h;

    ctx.fillStyle = 'rgba(99,102,241,0.25)';
    ctx.beginPath();
    ctx.arc(mx, my, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const cfg = STATES[current];
    stateValue.textContent = cfg.name;
    stateValue.style.color = cfg.color;
    tempValue.textContent  = cfg.temp + ' °C';
    tempValue.style.color  = cfg.color;
    exampleValue.textContent = cfg.example;
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    updateParticles(dt);
    render();
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── State switching ────────────────────────────────── */

  function setState(next) {
    if (next === current) return;
    current = next;

    stateBtns.forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.state === next ? 'true' : 'false');
    });

    reassignHomes();

    if (current === 'gas') {
      particles.forEach(p => {
        p.vx = (Math.random() - 0.5) * 420;
        p.vy = (Math.random() - 0.5) * 420;
      });
    }

    syncReadout();
    switches++;
    if (switches >= 4) insightEl.hidden = false;
  }

  /* ── Events ─────────────────────────────────────────── */

  stateBtns.forEach(btn => {
    btn.addEventListener('click', () => setState(btn.dataset.state));
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  stateBtns.forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.state === INITIAL_STATE ? 'true' : 'false');
  });

  particles = makeParticles();
  syncReadout();
  render();
  startLoop();

})();
