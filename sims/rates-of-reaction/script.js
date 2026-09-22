(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const BOX   = { x: 40,  y: 60, w: 440, h: 420 };
  const GRAPH = { x: 540, y: 90, w: 320, h: 380 };

  const PARTICLE_R = 7;
  const FLASH_MS   = 400;

  /* ── Initial conditions ─────────────────────────────── */

  const INITIAL = {
    temperature: 40,
    count: 30,
    catalyst: false
  };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas       = document.getElementById('stage');
  const ctx          = canvas.getContext('2d');
  const tempSlider   = document.getElementById('temp');
  const countSlider  = document.getElementById('count');
  const tempValue    = document.getElementById('tempValue');
  const countValue   = document.getElementById('countValue');
  const reactionsValue = document.getElementById('reactionsValue');
  const rateValue    = document.getElementById('rateValue');
  const tempOutValue = document.getElementById('tempOutValue');
  const catalystBtn  = document.getElementById('catalystBtn');
  const helpEl       = document.getElementById('help');
  const insightEl    = document.getElementById('insight');

  /* ── Sim state ──────────────────────────────────────── */

  let particles = [];
  let totalReactions = 0;
  let reactionTimes = [];       // timestamps of recent reactions (for rate)
  let graphData = [];           // [{t, count}]
  let elapsed = 0;
  let lastSample = 0;
  let rafId = null;
  let lastTime = 0;
  let changeCount = 0;

  /* ── Physics parameters ─────────────────────────────── */

  function baseSpeed() {
    // Speed scales roughly with the square root of absolute temperature,
    // but for teaching we use a friendlier linear model.
    return 20 + tempSlider.valueAsNumber * 1.5;
  }

  function reactionProbability() {
    // Per successful A–B contact.
    const t = tempSlider.valueAsNumber;
    const cat = catalystBtn.getAttribute('aria-pressed') === 'true' ? 3 : 1;
    return 0.15 * (t / 40) * cat;
  }

  /* ── Particle helpers ───────────────────────────────── */

  function makeParticle(type) {
    const angle = Math.random() * Math.PI * 2;
    const speed = baseSpeed();
    return {
      x: BOX.x + PARTICLE_R + Math.random() * (BOX.w - 2 * PARTICLE_R),
      y: BOX.y + PARTICLE_R + Math.random() * (BOX.h - 2 * PARTICLE_R),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      type,                                 // 'A' or 'B'
      r: PARTICLE_R,
      flashUntil: 0
    };
  }

  function resetParticles() {
    particles = [];
    const n = countSlider.valueAsNumber;
    for (let i = 0; i < n; i++) {
      particles.push(makeParticle(i % 2 === 0 ? 'A' : 'B'));
    }
  }

  function adjustParticleCount() {
    const target = countSlider.valueAsNumber;
    while (particles.length < target) {
      particles.push(makeParticle(particles.length % 2 === 0 ? 'A' : 'B'));
    }
    while (particles.length > target) {
      particles.pop();
    }
  }

  /* ── Physics update ─────────────────────────────────── */

  function step(dt, now) {
    const targetSpeed = baseSpeed();

    // Move all particles, keep them at the current thermal speed
    for (const p of particles) {
      const v = Math.hypot(p.vx, p.vy);
      if (v > 0.01) {
        p.vx = (p.vx / v) * targetSpeed;
        p.vy = (p.vy / v) * targetSpeed;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wall bounce
      const pad = p.r;
      if (p.x < BOX.x + pad)              { p.x = BOX.x + pad;              p.vx = Math.abs(p.vx); }
      if (p.x > BOX.x + BOX.w - pad)      { p.x = BOX.x + BOX.w - pad;      p.vx = -Math.abs(p.vx); }
      if (p.y < BOX.y + pad)              { p.y = BOX.y + pad;              p.vy = Math.abs(p.vy); }
      if (p.y > BOX.y + BOX.h - pad)      { p.y = BOX.y + BOX.h - pad;      p.vy = -Math.abs(p.vy); }
    }

    // Pairwise collisions
    const pReact = reactionProbability();
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const minD = a.r + b.r;

        if (d2 < minD * minD && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;

          // Separate
          const overlap = (minD - d) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;

          // Elastic bounce (equal masses)
          const dvx = b.vx - a.vx;
          const dvy = b.vy - a.vy;
          const vn = dvx * nx + dvy * ny;
          if (vn < 0) {
            a.vx += vn * nx; a.vy += vn * ny;
            b.vx -= vn * nx; b.vy -= vn * ny;
          }

          // React only if different types and not already flashing
          if (a.type !== b.type &&
              now > a.flashUntil &&
              now > b.flashUntil) {
            if (Math.random() < pReact) {
              a.flashUntil = now + FLASH_MS;
              b.flashUntil = now + FLASH_MS;
              totalReactions++;
              reactionTimes.push(elapsed);
            }
          }
        }
      }
    }

    // Trim reaction time window to last 5s
    while (reactionTimes.length && reactionTimes[0] < elapsed - 5) {
      reactionTimes.shift();
    }

    // Sample the graph every 0.1s
    if (elapsed - lastSample >= 0.1) {
      graphData.push({ t: elapsed, count: totalReactions });
      lastSample = elapsed;
    }
  }

  /* ── Rendering ──────────────────────────────────────── */

  function render(now) {
    ctx.clearRect(0, 0, W, H);
    drawBox();
    drawParticles(now);
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

    // Title
    ctx.fillStyle = '#64748b';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('REACTION VESSEL', BOX.x + BOX.w / 2, BOX.y - 10);

    // Legend
    const ly = BOX.y + BOX.h + 22;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '700 12px system-ui, sans-serif';

    ctx.fillStyle = '#818cf8';
    ctx.beginPath(); ctx.arc(BOX.x + 14, ly, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Reactant A', BOX.x + 26, ly);

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(BOX.x + 130, ly, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Reactant B', BOX.x + 142, ly);

    ctx.fillStyle = '#10b981';
    ctx.beginPath(); ctx.arc(BOX.x + 246, ly, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Reacting!', BOX.x + 258, ly);
  }

  function drawParticles(now) {
    for (const p of particles) {
      const flashing = now < p.flashUntil;

      if (flashing) {
        // Glow ring
        const age = 1 - (p.flashUntil - now) / FLASH_MS;
        const glowR = p.r + 6 + age * 8;
        const alpha = (1 - age) * 0.7;
        ctx.fillStyle = `rgba(16,185,129,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = flashing
        ? '#10b981'
        : (p.type === 'A' ? '#818cf8' : '#f59e0b');

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(11,18,32,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /* ── Graph ──────────────────────────────────────────── */

  function niceMax(v, steps) {
    if (v <= steps[0]) return steps[0];
    for (let i = 0; i < steps.length; i++) {
      if (v <= steps[i]) return steps[i];
    }
    const last = steps[steps.length - 1];
    return Math.ceil(v / last) * last;
  }

  function drawGraph() {
    const g = GRAPH;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    const tMax = niceMax(Math.max(elapsed, 1), [10, 20, 30, 60, 120, 300]);
    const cMax = niceMax(Math.max(totalReactions, 5), [10, 25, 50, 100, 200, 500, 1000]);

    // Grid
    ctx.strokeStyle = 'rgba(100,116,139,0.14)';
    ctx.lineWidth = 1;

    const xStep = tMax / 5;
    for (let i = 0; i <= 5; i++) {
      const t = i * xStep;
      const x = g.x + (t / tMax) * g.w;
      ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); ctx.stroke();
    }

    const yStep = cMax / 5;
    for (let i = 0; i <= 5; i++) {
      const c = i * yStep;
      const y = g.y + g.h - (c / cMax) * g.h;
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
    for (let i = 0; i <= 5; i++) {
      const t = i * xStep;
      const x = g.x + (t / tMax) * g.w;
      ctx.fillText(t.toFixed(0), x, g.y + g.h + 6);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const c = i * yStep;
      const y = g.y + g.h - (c / cMax) * g.h;
      ctx.fillText(c.toFixed(0), g.x - 6, y);
    }

    // Axis titles
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TIME  (s)', g.x + g.w / 2, g.y + g.h + 26);

    ctx.save();
    ctx.translate(g.x - 46, g.y + g.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('REACTIONS', 0, 0);
    ctx.restore();

    // Curve
    if (graphData.length > 1) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const pt of graphData) {
        const x = g.x + (pt.t / tMax) * g.w;
        const y = g.y + g.h - (pt.count / cMax) * g.h;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Current point
    if (graphData.length > 0) {
      const cur = graphData[graphData.length - 1];
      const x = g.x + (cur.t / tMax) * g.w;
      const y = g.y + g.h - (cur.count / cMax) * g.h;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    tempValue.textContent    = tempSlider.valueAsNumber + ' °C';
    countValue.textContent   = countSlider.valueAsNumber + ' particles';
    tempOutValue.textContent = tempSlider.valueAsNumber + ' °C';
    reactionsValue.textContent = totalReactions.toString();

    const rate = reactionTimes.length / 5;
    rateValue.textContent = rate.toFixed(1) + ' /s';
    rateValue.style.color = rate > 5 ? '#10b981'
                          : rate > 1 ? '#f59e0b'
                          : '#e2e8f0';
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;

    step(dt, now);
    render(now);
    syncReadout();

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ── Reset ──────────────────────────────────────────── */

  function reset() {
    stop();
    particles = [];
    totalReactions = 0;
    reactionTimes = [];
    graphData = [];
    elapsed = 0;
    lastSample = 0;
    changeCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    resetParticles();
    syncReadout();
    start();
  }

  /* ── Events ─────────────────────────────────────────── */

  tempSlider.addEventListener('input', () => {
    syncReadout();
    changeCount++;
    if (changeCount >= 5) insightEl.hidden = false;
  });

  countSlider.addEventListener('input', () => {
    adjustParticleCount();
    syncReadout();
    changeCount++;
    if (changeCount >= 5) insightEl.hidden = false;
  });

  catalystBtn.addEventListener('click', () => {
    const on = catalystBtn.getAttribute('aria-pressed') === 'true';
    catalystBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
    evLabel(catalystBtn, on ? 'flask-conical' : 'check-circle', on ? 'Add catalyst' : 'Catalyst active');
    changeCount++;
    if (changeCount >= 5) insightEl.hidden = false;
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    tempSlider.value = INITIAL.temperature;
    countSlider.value = INITIAL.count;
    catalystBtn.setAttribute('aria-pressed', 'false');
    evLabel(catalystBtn, 'flask-conical', 'Add catalyst');
    reset();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  tempSlider.value = INITIAL.temperature;
  countSlider.value = INITIAL.count;
  catalystBtn.setAttribute('aria-pressed', 'false');
  resetParticles();
  syncReadout();
  start();

})();
