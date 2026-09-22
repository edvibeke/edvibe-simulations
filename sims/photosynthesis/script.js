(() => {
  'use strict';

  /* ── Constants ──────────────────────────────────────── */

  const W = 900, H = 540;

  const beaker = { x0: 160, x1: 320, sx: 240, top: 190, bottom: 480 };
  const lamp = { bx: 240, by: 105, armX: 40, armY: 62 };

  const PLOT = { x0: 500, x1: 870, y0: 40, y1: 460 };
  const WINDOW = 150;       // s of history shown on the graph

  const RATE_FULL = 55;     // bubbles/min at max conditions

  /* ── DOM ────────────────────────────────────────────── */

  const canvas       = document.getElementById('stage');
  const ctx          = canvas.getContext('2d');
  const lightEl      = document.getElementById('light');
  const lightValue   = document.getElementById('lightValue');
  const tempEl       = document.getElementById('temp');
  const tempValue    = document.getElementById('tempValue');
  const co2El        = document.getElementById('co2');
  const co2Value     = document.getElementById('co2Value');
  const rateValue    = document.getElementById('rateValue');
  const bubblesValue = document.getElementById('bubblesValue');
  const tempOutValue = document.getElementById('tempOutValue');
  const co2OutValue  = document.getElementById('co2OutValue');
  const helpEl       = document.getElementById('help');
  const insightEl    = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  const bubbles = [];       // rising bubbles
  const pops = [];          // {t} timestamps of bubbles popping at the surface
  const samples = [];       // {t, s} cumulative bubble count history
  let L = 60, T = 25, C = 600;
  let total = 0;
  let simT = 0;
  let lastSampleT = -1;
  let rafId = null;
  let lastTime = 0;

  /* ── Rate model ─────────────────────────────────────── */

  function bubblePerMin() {
    const lightF = Math.pow(L / 100, 1.15);
    const tempF  = Math.exp(-Math.pow((T - 30) / 10, 2));
    const co2F   = C / (C + 350);
    return RATE_FULL * lightF * tempF * co2F;
  }

  /* ── Rendering: apparatus ───────────────────────────── */

  function drawApparatus() {
    // bench
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, beaker.bottom + 6, 480, 14);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, beaker.bottom + 20, 480, 8);

    // lamp arm
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(lamp.armX, lamp.armY);
    ctx.lineTo(lamp.bx, lamp.armY);
    ctx.lineTo(lamp.bx, lamp.by);
    ctx.stroke();

    // bulb glow by light intensity
    const li = L / 100;
    if (li > 0.02) {
      const grad = ctx.createRadialGradient(lamp.bx, lamp.by, 4, lamp.bx, lamp.by, 70 + 55 * li);
      grad.addColorStop(0, `rgba(253,224,71,${0.55 * li})`);
      grad.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lamp.bx, lamp.by, 70 + 55 * li, 0, Math.PI * 2);
      ctx.fill();
    }
    // bulb
    ctx.beginPath();
    ctx.arc(lamp.bx, lamp.by, 13, 0, Math.PI * 2);
    ctx.fillStyle = li > 0.02 ? '#fde047' : '#475569';
    ctx.fill();
    if (li > 0.02) {
      ctx.beginPath();
      ctx.arc(lamp.bx - 4, lamp.by - 4, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fffbeb';
      ctx.fill();
    }

    // beaker glass
    ctx.fillStyle = 'rgba(226,232,240,0.08)';
    ctx.fillRect(beaker.x0, beaker.top, beaker.x1 - beaker.x0, beaker.bottom - beaker.top);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.strokeRect(beaker.x0, beaker.top, beaker.x1 - beaker.x0, beaker.bottom - beaker.top);

    // water
    ctx.fillStyle = 'rgba(56,189,248,0.14)';
    ctx.fillRect(beaker.x0 + 2, beaker.top + 2, beaker.x1 - beaker.x0 - 4, beaker.bottom - beaker.top - 6);
    // surface line
    ctx.strokeStyle = 'rgba(125,211,252,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(beaker.x0 + 2, beaker.top + 2);
    ctx.lineTo(beaker.x1 - 2, beaker.top + 2);
    ctx.stroke();

    // elodea: wavy stem
    const stem = [
      [beaker.sx + 0,  475],
      [beaker.sx + 6,  420],
      [beaker.sx + 14, 360],
      [beaker.sx + 26, 300],
      [beaker.sx + 34, 250]
    ];
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(stem[0][0], stem[0][1]);
    for (let i = 1; i < stem.length; i++) {
      const mx = (stem[i - 1][0] + stem[i][0]) / 2;
      const my = (stem[i - 1][1] + stem[i][1]) / 2;
      ctx.quadraticCurveTo(stem[i - 1][0], stem[i - 1][1], mx, my);
    }
    ctx.stroke();

    // leaves
    for (let i = 1; i < stem.length; i++) {
      const [x, y] = stem[i];
      const side = i % 2 === 0 ? 1 : -1;
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.ellipse(x + 9 * side, y - 6, 13, 3.4, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // tip point (where bubbles emerge when photosynthesising)
    ctx.beginPath();
    ctx.arc(stem[stem.length - 1][0], stem[stem.length - 1][1], 4, 0, Math.PI * 2);
    ctx.fillStyle = '#4ade80';
    ctx.fill();

    // denaturation warning
    if (T > 40) {
      ctx.fillStyle = '#f87171';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('enzymes denatured — rate crashing', beaker.sx, beaker.top - 46);
    }
  }

  /* ── Bubbles ────────────────────────────────────────── */

  let bubbleAcc = 0;

  function spawn(dt) {
    if (L <= 0.02) return;
    const rate = bubblePerMin();
    bubbleAcc += (rate / 60) * dt * (0.9 + Math.random() * 0.2);
    while (bubbleAcc >= 1) {
      bubbleAcc -= 1;
      bubbles.push({
        x: 276 + Math.random() * 10,
        y: 240 + Math.random() * 30,
        speed: 60 + Math.random() * 40,
        r: 2.4 + Math.random() * 2.6
      });
    }
  }

  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.speed * dt;
      b.x += Math.sin(b.y / 9 + b.r * 3) * 0.15;
      if (b.y <= beaker.top + 4) {
        bubbles.splice(i, 1);
        total++;
        pops.push({ t: simT });
      }
    }
    while (pops.length && pops[0].t < simT - 30) pops.shift();
  }

  function drawBubbles() {
    ctx.fillStyle = 'rgba(165,180,252,0.75)';
    for (const b of bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Rendering: graph ───────────────────────────────── */

  function xPos(t) {
    return PLOT.x0 + ((PLOT.x1 - PLOT.x0) * (t - (simT - WINDOW))) / WINDOW;
  }
  function yPos(s, maxS) {
    return PLOT.y1 - ((PLOT.y1 - PLOT.y0) * s) / maxS;
  }

  function drawGraph() {
    ctx.fillStyle = 'rgba(15,23,42,0.6)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(PLOT.x0 - 14, PLOT.y0 - 14, PLOT.x1 - PLOT.x0 + 28, PLOT.y1 - PLOT.y0 + 28, 12);
    ctx.fill();
    ctx.stroke();

    let maxS = 10;
    const view = samples.filter(s => s.t >= simT - WINDOW);
    for (const s of view) maxS = Math.max(maxS, s.s);
    maxS = Math.ceil((maxS * 1.25) / 5) * 5;

    // grid
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= maxS; v += Math.max(1, Math.round(maxS / 5))) {
      const y = yPos(v, maxS);
      ctx.strokeStyle = 'rgba(148,163,184,0.14)';
      ctx.beginPath();
      ctx.moveTo(PLOT.x0, y); ctx.lineTo(PLOT.x1, y);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(String(v), PLOT.x0 - 6, y);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('O₂ bubbles', PLOT.x0 - 6, PLOT.y0 - 8);

    // x ticks (seconds back)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let dt = 0; dt <= WINDOW; dt += 30) {
      const t0 = simT - WINDOW + dt;
      const x = xPos(t0);
      ctx.strokeStyle = 'rgba(148,163,184,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, PLOT.y0); ctx.lineTo(x, PLOT.y1);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(String(Math.max(0, Math.round(t0))), x, PLOT.y1 + 6);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('time / s', PLOT.x0 + (PLOT.x1 - PLOT.x0) / 2, PLOT.y1 + 24);
    ctx.textAlign = 'right';

    // curve
    if (view.length > 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const s of view) {
        const x = xPos(s.t), y = yPos(s.s, maxS);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // current point
      const cx = Math.min(PLOT.x1 - 2, xPos(simT));
      const cy = yPos(view[view.length - 1].s, maxS);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawApparatus();
    drawBubbles();
    drawGraph();
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const rate = Math.max(0, pops.length * 2);   // per 30 s window → per min
    rateValue.textContent    = rate.toFixed(1) + ' bubbles/min';
    bubblesValue.textContent = String(total);
    tempOutValue.textContent = T + ' °C';
    tempOutValue.style.color = T > 40 ? '#f87171' : '';
    co2OutValue.textContent  = C + ' ppm';

    if (total >= 25 && insightEl.hidden) insightEl.hidden = false;
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    simT += dt;

    spawn(dt);
    updateBubbles(dt);

    if (simT - lastSampleT >= 0.25) {
      samples.push({ t: simT, s: total });
      lastSampleT = simT;
    }
    if (samples.length > 60 * 60 * 2) samples.shift();

    render();
    syncReadout();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Reset ──────────────────────────────────────────── */

  function applySliders() {
    L = Number(lightEl.value);
    T = Number(tempEl.value);
    C = Number(co2El.value);
  }

  function resetRun() {
    applySliders();
    bubbles.length = 0;
    pops.length = 0;
    samples.length = 0;
    total = 0;
    simT = 0;
    lastSampleT = -1;
    insightEl.hidden = true;
    syncReadout();
  }

  /* ── Events ─────────────────────────────────────────── */

  lightEl.addEventListener('input', () => {
    lightValue.textContent = Number(lightEl.value) + '%';
    applySliders();
  });
  tempEl.addEventListener('input', () => {
    tempValue.textContent = Number(tempEl.value) + ' °C';
    applySliders();
  });
  co2El.addEventListener('input', () => {
    co2Value.textContent = Number(co2El.value) + ' ppm';
    applySliders();
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    lightEl.value = 60;
    tempEl.value = 25;
    co2El.value = 600;
    lightValue.textContent = '60%';
    tempValue.textContent = '25 °C';
    co2Value.textContent = '600 ppm';
    resetRun();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  lightValue.textContent = '60%';
  tempValue.textContent = '25 °C';
  co2Value.textContent = '600 ppm';
  resetRun();
  start();
})();