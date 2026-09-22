(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const FIELD = { x: 40, y: 60, w: 440, h: 420 };
  const GRAPH = { x: 540, y: 90, w: 320, h: 380 };

  const INITIAL_POP = 40;
  const BEETLE_R = 8;

  /* ── Beetle colour model ────────────────────────────── */

  // Colour value t ∈ [0, 1]:
  //   0 = very light green (almost yellow-green)
  //   1 = very dark green (almost black-green)
  // Background is drawn in the same hue family, using its own t.
  function colourFor(t) {
    // Hue stays around 130 (green). Lightness varies from ~85% to ~15%.
    const lightness = 85 - t * 70;
    return `hsl(130, 45%, ${lightness}%)`;
  }

  function colourForStroke(t) {
    const lightness = Math.max(0, 85 - t * 70 - 20);
    return `hsl(130, 45%, ${lightness}%)`;
  }

  /* ── DOM ────────────────────────────────────────────── */

  const canvas       = document.getElementById('stage');
  const ctx          = canvas.getContext('2d');
  const bgSlider     = document.getElementById('bg');
  const predatorSlider = document.getElementById('predator');
  const bgValue      = document.getElementById('bgValue');
  const predatorValue = document.getElementById('predatorValue');
  const genValue     = document.getElementById('genValue');
  const avgValue     = document.getElementById('avgValue');
  const matchValue   = document.getElementById('matchValue');
  const pauseBtn     = document.getElementById('pauseBtn');
  const resetPopBtn  = document.getElementById('resetPopBtn');
  const helpEl       = document.getElementById('help');
  const insightEl    = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let beetles = [];
  let generation = 1;
  let deathsThisGen = 0;
  let deathsPerGen = 20;              // every 20 deaths → next generation
  let elapsed = 0;
  let history = [];                    // {gen, avgT}
  let paused = false;
  let rafId = null;
  let lastTime = 0;
  let changeCount = 0;

  /* ── Beetle factory ─────────────────────────────────── */

  function makeBeetle(t, opts = {}) {
    return {
      t,                                // colour value
      x: FIELD.x + 20 + Math.random() * (FIELD.w - 40),
      y: FIELD.y + 20 + Math.random() * (FIELD.h - 40),
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      age: 0,
      lifetime: opts.lifetime ?? (8 + Math.random() * 6),   // seconds
      eatFlash: 0                        // seconds remaining on "eaten" glow
    };
  }

  function initPopulation() {
    beetles = [];
    for (let i = 0; i < INITIAL_POP; i++) {
      // Start with a broad spread around 0.5
      const t = Math.random();
      beetles.push(makeBeetle(t));
    }
    generation = 1;
    deathsThisGen = 0;
    history = [];
  }

  /* ── Survival logic ─────────────────────────────────── */

  function backgroundT() {
    return bgSlider.valueAsNumber / 100;
  }

  function predatorIntensity() {
    // 0 → no pressure, 1 → maximum
    return predatorSlider.valueAsNumber / 100;
  }

  function fitness(t) {
    // 1 = perfect match, 0 = worst possible match
    const d = Math.abs(t - backgroundT());
    // Closer to background → higher fitness. Range [0, 1].
    return Math.max(0, 1 - d * 1.4);
  }

  function beetleSpeed() {
    return 25;
  }

  /* ── Update ─────────────────────────────────────────── */

  function update(dt) {
    const speed = beetleSpeed();
    const pressure = predatorIntensity();

    for (let i = beetles.length - 1; i >= 0; i--) {
      const b = beetles[i];
      b.age += dt;
      if (b.eatFlash > 0) b.eatFlash -= dt;

      // Movement
      b.vx += (Math.random() - 0.5) * 120 * dt;
      b.vy += (Math.random() - 0.5) * 120 * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > speed) {
        b.vx *= speed / sp;
        b.vy *= speed / sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Walls
      if (b.x < FIELD.x + BEETLE_R)              { b.x = FIELD.x + BEETLE_R;              b.vx =  Math.abs(b.vx); }
      if (b.x > FIELD.x + FIELD.w - BEETLE_R)    { b.x = FIELD.x + FIELD.w - BEETLE_R;    b.vx = -Math.abs(b.vx); }
      if (b.y < FIELD.y + BEETLE_R)              { b.y = FIELD.y + BEETLE_R;              b.vy =  Math.abs(b.vy); }
      if (b.y > FIELD.y + FIELD.h - BEETLE_R)    { b.y = FIELD.y + FIELD.h - BEETLE_R;    b.vy = -Math.abs(b.vy); }

      // Death by predation: instantaneous probability per second
      // scales with predatorIntensity and inverse fitness
      if (pressure > 0) {
        const deathRate = pressure * 0.9 * (1 - fitness(b.t));
        if (Math.random() < deathRate * dt) {
          b.eatFlash = 0.25;
          // Not yet removed — flash first, then die next frame
        }
      }

      // Age-based death
      if (b.age > b.lifetime) {
        // Old age → reproduce with offspring
        reproduceOne(b);
        beetles.splice(i, 1);
        deathsThisGen++;
      } else if (b.eatFlash > 0 && b.eatFlash < 0.05) {
        // Flash about to end → beetle is eaten
        beetles.splice(i, 1);
        deathsThisGen++;
      }
    }

    // Advance generation
    if (deathsThisGen >= deathsPerGen) {
      generation++;
      deathsThisGen = 0;

      // Ensure population doesn't die out completely
      while (beetles.length < 15) {
        // Bottleneck — start from whatever survived
        beetles.push(makeBeetle(backgroundT() + (Math.random() - 0.5) * 0.4));
      }

      // Record for graph
      history.push({ gen: generation, avgT: averageT() });
      if (history.length > 400) history.shift();
    }
  }

  function reproduceOne(parent) {
    // Offspring: parent's t + small mutation
    const mutation = (Math.random() - 0.5) * 0.10;
    const t = Math.max(0, Math.min(1, parent.t + mutation));
    beetles.push(makeBeetle(t));
  }

  function averageT() {
    if (beetles.length === 0) return 0.5;
    let s = 0;
    for (const b of beetles) s += b.t;
    return s / beetles.length;
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawField();
    drawBeetles();
    drawFieldLegend();
    drawGraph();
  }

  function drawField() {
    // Field background = the current environment
    ctx.fillStyle = colourFor(backgroundT());
    ctx.fillRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    // Slight texture — grass-like speckle
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 180; i++) {
      const x = FIELD.x + ((i * 73) % FIELD.w);
      const y = FIELD.y + ((i * 41) % FIELD.h);
      ctx.fillRect(x, y, 2, 2);
    }

    // Border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('THE FIELD', FIELD.x + FIELD.w / 2, FIELD.y - 10);
  }

  function drawBeetles() {
    for (const b of beetles) {
      // "eaten" flash — bright red ring
      if (b.eatFlash > 0) {
        ctx.fillStyle = 'rgba(239,68,68,0.6)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, BEETLE_R + 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Body
      ctx.fillStyle = colourFor(b.t);
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, BEETLE_R, BEETLE_R * 0.75, Math.atan2(b.vy, b.vx), 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = colourForStroke(b.t);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tiny head dot so you can see orientation
      const headX = b.x + Math.cos(Math.atan2(b.vy, b.vx)) * BEETLE_R * 0.7;
      const headY = b.y + Math.sin(Math.atan2(b.vy, b.vx)) * BEETLE_R * 0.7;
      ctx.fillStyle = colourForStroke(b.t);
      ctx.beginPath();
      ctx.arc(headX, headY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFieldLegend() {
    const y = FIELD.y + FIELD.h + 22;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Population: ' + beetles.length + ' beetles', FIELD.x, y);
  }

  /* ── Graph: trait distribution ──────────────────────── */

  function drawGraph() {
    const g = GRAPH;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    // Split graph into two halves: histogram on top, mean-over-time on bottom
    const halfH = g.h * 0.55;
    const histTop = g.y;
    const histH = halfH;
    const lineTop = g.y + histH + 20;
    const lineH = g.h - histH - 20;

    drawHistogram(g.x, histTop, g.w, histH);
    drawMeanLine(g.x, lineTop, g.w, lineH);
  }

  function drawHistogram(x, y, w, h) {
    // Background
    ctx.fillStyle = 'rgba(11,18,32,0.5)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Axis lines
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('COLOUR DISTRIBUTION', x + 8, y + 6);

    // Bins
    const NBINS = 20;
    const bins = new Array(NBINS).fill(0);
    for (const b of beetles) {
      const idx = Math.min(NBINS - 1, Math.floor(b.t * NBINS));
      bins[idx]++;
    }
    const maxCount = Math.max(1, ...bins);

    const binW = w / NBINS;
    for (let i = 0; i < NBINS; i++) {
      const bh = (bins[i] / maxCount) * (h - 30);
      const bx = x + i * binW;
      const by = y + h - bh;
      const t = (i + 0.5) / NBINS;

      ctx.fillStyle = colourFor(t);
      ctx.fillRect(bx + 1, by, binW - 2, bh);
    }

    // Current background marker
    const bgT = backgroundT();
    const markerX = x + bgT * w;
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(markerX, y + 20);
    ctx.lineTo(markerX, y + h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#facc15';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('target', markerX, y + 8);
  }

  function drawMeanLine(x, y, w, h) {
    ctx.fillStyle = 'rgba(11,18,32,0.5)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Title
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('AVERAGE COLOUR OVER TIME', x + 8, y + 6);

    // Grid lines at 0, 0.5, 1
    ctx.strokeStyle = 'rgba(100,116,139,0.2)';
    ctx.lineWidth = 1;
    for (const frac of [0, 0.5, 1]) {
      const yy = y + h - frac * (h - 24) - 12;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }

    // Background target line
    const bgT = backgroundT();
    const targetY = y + h - bgT * (h - 24) - 12;
    ctx.strokeStyle = 'rgba(250,204,21,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, targetY);
    ctx.lineTo(x + w, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Line: mean colour over generations
    if (history.length > 1) {
      const genMax = Math.max(history[history.length - 1].gen, 5);
      const genMin = Math.max(1, history[history.length - 1].gen - 30);

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const pt of history) {
        if (pt.gen < genMin) continue;
        const px = x + ((pt.gen - genMin) / (genMax - genMin)) * (w - 20) + 10;
        const py = y + h - pt.avgT * (h - 24) - 12;
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  /* ── Readout ────────────────────────────────────────── */

  function labelForT(t) {
    if (t < 0.2) return 'Very light';
    if (t < 0.4) return 'Light';
    if (t < 0.6) return 'Medium';
    if (t < 0.8) return 'Dark';
    return 'Very dark';
  }

  function syncReadout() {
    const bgT = backgroundT();
    const p = predatorIntensity();

    bgValue.textContent = labelForT(bgT);
    predatorValue.textContent = p < 0.2 ? 'Low'
                              : p < 0.6 ? 'Medium'
                              : p < 0.85 ? 'High'
                              : 'Very high';

    genValue.textContent = generation;

    const avgT = averageT();
    avgValue.textContent = labelForT(avgT);
    avgValue.style.color = colourFor(Math.min(0.9, avgT + 0.3));

    const bestMatch = 1 - Math.abs(avgT - bgT);
    if (beetles.length === 0) {
      matchValue.textContent = '—';
      matchValue.style.color = '#94a3b8';
    } else if (bestMatch > 0.9) {
      matchValue.textContent = 'Excellent';
      matchValue.style.color = '#10b981';
    } else if (bestMatch > 0.75) {
      matchValue.textContent = 'Good';
      matchValue.style.color = '#22d3ee';
    } else if (bestMatch > 0.5) {
      matchValue.textContent = 'Poor';
      matchValue.style.color = '#f59e0b';
    } else {
      matchValue.textContent = 'Very poor';
      matchValue.style.color = '#ef4444';
    }
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!paused) {
      elapsed += dt;
      update(dt);
    }
    render();
    syncReadout();

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Events ─────────────────────────────────────────── */

  bgSlider.addEventListener('input', () => {
    changeCount++;
    if (changeCount >= 3) insightEl.hidden = false;
  });

  predatorSlider.addEventListener('input', () => {
    changeCount++;
    if (changeCount >= 3) insightEl.hidden = false;
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    evLabel(pauseBtn, paused ? 'play' : 'pause', paused ? 'Play' : 'Pause');
  });

  resetPopBtn.addEventListener('click', () => {
    initPopulation();
    insightEl.hidden = true;
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    bgSlider.value = 50;
    predatorSlider.value = 50;
    paused = false;
    evLabel(pauseBtn, 'pause', 'Pause');
    changeCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    initPopulation();
    syncReadout();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  bgSlider.value = 50;
  predatorSlider.value = 50;
  initPopulation();
  syncReadout();
  start();

})();
