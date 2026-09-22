(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const BOX = { x: 40, y: 60, w: 460, h: 400 };
  const GRAPH = { x: 560, y: 90, w: 300, h: 380 };

  const PARTICLE_R = 8;
  const SUBSTRATE_R = 10;

  const INITIAL = { temperature: 37, ph: 7.0 };

  const COLORS = {
    enzyme:     '#a78bfa',
    enzymeDen:  '#64748b',
    substrate:  '#60a5fa',
    product:    '#facc15',
    activeSite: '#f0abfc'
  };

  const OPT_TEMP = 37;
  const OPT_PH = 7;

  /* ── DOM ────────────────────────────────────────────── */

  const canvas      = document.getElementById('stage');
  const ctx         = canvas.getContext('2d');
  const tempSlider  = document.getElementById('temp');
  const phSlider    = document.getElementById('ph');
  const tempValue   = document.getElementById('tempValue');
  const phValue     = document.getElementById('phValue');
  const reactionsValue = document.getElementById('reactionsValue');
  const rateValue   = document.getElementById('rateValue');
  const shapeValue  = document.getElementById('shapeValue');
  const pauseBtn    = document.getElementById('pauseBtn');
  const helpEl      = document.getElementById('help');
  const insightEl   = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let substrates = [];
  let products = [];
  let reactions = 0;
  let reactionTimes = [];
  let graphData = [];
  let elapsed = 0;
  let lastSample = 0;
  let paused = false;
  let rafId = null;
  let lastTime = 0;
  let changeCount = 0;

  // Enzyme position (fixed centre of box)
  const ENZYME = { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2 + 30 };

  /* ── Model ──────────────────────────────────────────── */

  function denaturation() {
    // 0 = perfect, 1 = completely denatured
    const dT = Math.abs(tempSlider.valueAsNumber - OPT_TEMP);
    const dP = Math.abs(phSlider.valueAsNumber - OPT_PH);

    // Temperature denatures sharply past ~45°C
    const tempDamage = dT < 8 ? 0
                     : Math.min(1, (dT - 8) / 20);
    // pH denatures on either side
    const phDamage = dP < 1 ? 0
                   : Math.min(1, (dP - 1) / 4);

    return Math.min(1, Math.max(tempDamage, phDamage));
  }

  function activityFromConditions() {
    // Overall reaction probability per collision
    const dT = tempSlider.valueAsNumber - OPT_TEMP;
    const dP = phSlider.valueAsNumber - OPT_PH;
    const denat = denaturation();

    // Temperature factor: rises to optimum, then falls because of denaturation
    const tempFactor = Math.exp(-Math.pow(dT, 2) / 200) * (1 - denat * 0.95);
    // pH factor
    const phFactor = Math.exp(-Math.pow(dP, 2) / 6) * (1 - denat * 0.95);

    return Math.max(0, Math.min(1, tempFactor * phFactor));
  }

  /* ── Substrate spawn ────────────────────────────────── */

  function spawnSubstrate() {
    // Spawn at a random edge
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0)      { x = BOX.x + 20;                y = BOX.y + 20 + Math.random() * (BOX.h - 40); }
    else if (side === 1) { x = BOX.x + BOX.w - 20;        y = BOX.y + 20 + Math.random() * (BOX.h - 40); }
    else if (side === 2) { x = BOX.x + 20 + Math.random() * (BOX.w - 40); y = BOX.y + 20; }
    else                 { x = BOX.x + 20 + Math.random() * (BOX.w - 40); y = BOX.y + BOX.h - 20; }

    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 40;

    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      flashUntil: 0
    };
  }

  function ensureSubstrateCount() {
    const target = 18;
    while (substrates.length < target) substrates.push(spawnSubstrate());
  }

  function ensureProductCount() {
    const target = 8;
    while (products.length < target) {
      products.push({
        x: BOX.x + Math.random() * BOX.w,
        y: BOX.y + Math.random() * BOX.h,
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        life: 0
      });
    }
  }

  /* ── Update ─────────────────────────────────────────── */

  function step(dt, now) {
    const speedScale = 0.5 + (tempSlider.valueAsNumber / 40);

    // Move substrates
    for (let i = substrates.length - 1; i >= 0; i--) {
      const s = substrates[i];
      s.x += s.vx * speedScale * dt;
      s.y += s.vy * speedScale * dt;

      // Walls
      const pad = SUBSTRATE_R;
      if (s.x < BOX.x + pad)              { s.x = BOX.x + pad;              s.vx = Math.abs(s.vx); }
      if (s.x > BOX.x + BOX.w - pad)      { s.x = BOX.x + BOX.w - pad;      s.vx = -Math.abs(s.vx); }
      if (s.y < BOX.y + pad)              { s.y = BOX.y + pad;              s.vy = Math.abs(s.vy); }
      if (s.y > BOX.y + BOX.h - pad)      { s.y = BOX.y + BOX.h - pad;      s.vy = -Math.abs(s.vy); }

      // Small random jiggle
      s.vx += (Math.random() - 0.5) * 40 * dt;
      s.vy += (Math.random() - 0.5) * 40 * dt;
      s.vx *= 0.995;
      s.vy *= 0.995;

      // Check for reaching the active site
      const d = Math.hypot(s.x - ENZYME.x, s.y - ENZYME.y);
      if (d < 30) {
        // In the active site — try to react
        if (Math.random() < activityFromConditions() * 0.9) {
          // Reaction!
          reactions++;
          reactionTimes.push(elapsed);

          // Turn into two product particles heading outward
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2;
            products.push({
              x: ENZYME.x + Math.cos(a) * 20,
              y: ENZYME.y + Math.sin(a) * 20,
              vx: Math.cos(a) * 120,
              vy: Math.sin(a) * 120,
              life: 0
            });
          }

          substrates.splice(i, 1);
          ensureSubstrateCount();
          continue;
        }
      }
    }

    // Move products, fade them out
    for (let i = products.length - 1; i >= 0; i--) {
      const p = products[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      p.vx *= 0.97;
      p.vy *= 0.97;

      // Bounce
      const pad = PARTICLE_R;
      if (p.x < BOX.x + pad)              { p.x = BOX.x + pad;              p.vx = Math.abs(p.vx); }
      if (p.x > BOX.x + BOX.w - pad)      { p.x = BOX.x + BOX.w - pad;      p.vx = -Math.abs(p.vx); }
      if (p.y < BOX.y + pad)              { p.y = BOX.y + pad;              p.vy = Math.abs(p.vy); }
      if (p.y > BOX.y + BOX.h - pad)      { p.y = BOX.y + BOX.h - pad;      p.vy = -Math.abs(p.vy); }

      if (p.life > 3) products.splice(i, 1);
    }
    ensureProductCount();

    // Trim recent reaction window
    while (reactionTimes.length && reactionTimes[0] < elapsed - 5) reactionTimes.shift();

    // Sample graph
    if (elapsed - lastSample >= 0.1) {
      graphData.push({ t: elapsed, count: reactions });
      if (graphData.length > 2000) graphData.shift();
      lastSample = elapsed;
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render(now) {
    ctx.clearRect(0, 0, W, H);
    drawBox();
    drawEnzyme(now);
    drawSubstrates();
    drawProducts();
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
    ctx.fillText('ENZYME + SUBSTRATE', BOX.x + BOX.w / 2, BOX.y - 10);
  }

  function drawEnzyme(now) {
    const denat = denaturation();
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
    const baseColor = denat > 0.5 ? COLORS.enzymeDen : COLORS.enzyme;

    // Enzyme body — a big rounded blob with a notch (active site)
    const r = 60;
    ctx.fillStyle = baseColor + '33';
    ctx.beginPath();
    ctx.arc(ENZYME.x, ENZYME.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Active site — the notch shape. It narrows as the enzyme denatures.
    const siteWidth = 40 * (1 - denat * 0.8);
    const siteDepth = 24 * (1 - denat * 0.4);
    const noise = denat > 0.5 ? Math.sin(now * 0.02) * 3 : 0;

    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.moveTo(ENZYME.x - siteWidth / 2, ENZYME.y - r + 5);
    ctx.lineTo(ENZYME.x - siteWidth / 2 + noise, ENZYME.y - r + siteDepth);
    ctx.lineTo(ENZYME.x + siteWidth / 2 + noise, ENZYME.y - r + siteDepth);
    ctx.lineTo(ENZYME.x + siteWidth / 2, ENZYME.y - r + 5);
    ctx.closePath();
    ctx.fill();

    // Active site highlight
    ctx.strokeStyle = denat > 0.5 ? '#94a3b8' : COLORS.activeSite;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ENZYME.x - siteWidth / 2, ENZYME.y - r + 5);
    ctx.lineTo(ENZYME.x - siteWidth / 2 + noise, ENZYME.y - r + siteDepth);
    ctx.lineTo(ENZYME.x + siteWidth / 2 + noise, ENZYME.y - r + siteDepth);
    ctx.lineTo(ENZYME.x + siteWidth / 2, ENZYME.y - r + 5);
    ctx.stroke();

    // Label
    ctx.fillStyle = denat > 0.5 ? '#94a3b8' : '#e2e8f0';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(denat > 0.5 ? 'ENZYME (denatured)' : 'ENZYME', ENZYME.x, ENZYME.y + 20);

    // Small "active site" arrow label
    if (denat < 0.5) {
      ctx.fillStyle = COLORS.activeSite;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText('active site', ENZYME.x, ENZYME.y - r - 12);
    }
  }

  function drawSubstrates() {
    for (const s of substrates) {
      ctx.fillStyle = COLORS.substrate;
      ctx.beginPath();
      // Substrate is drawn as a slightly key-shaped blob
      ctx.arc(s.x, s.y, SUBSTRATE_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawProducts() {
    for (const p of products) {
      const alpha = Math.max(0, 1 - p.life / 3);
      ctx.fillStyle = `rgba(250,204,21,${alpha * 0.85})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(11,18,32,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /* ── Graph ──────────────────────────────────────────── */

  function niceMax(v, steps) {
    for (const s of steps) if (v <= s) return s;
    const last = steps[steps.length - 1];
    return Math.ceil(v / last) * last;
  }

  function drawGraph() {
    const g = GRAPH;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(g.x, g.y, g.w, g.h);

    const tMax = niceMax(Math.max(elapsed, 1), [10, 20, 30, 60, 120]);
    const cMax = niceMax(Math.max(reactions, 5), [10, 25, 50, 100, 200, 500]);

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

    // Tick labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 5; i++) {
      const t = (i / 5) * tMax;
      ctx.fillText(t.toFixed(0), g.x + (i / 5) * g.w, g.y + g.h + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const c = (i / 5) * cMax;
      ctx.fillText(c.toFixed(0), g.x - 6, g.y + g.h - (i / 5) * g.h);
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
    }
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    tempValue.textContent = tempSlider.valueAsNumber + ' °C';
    phValue.textContent = phSlider.valueAsNumber.toFixed(1);
    reactionsValue.textContent = reactions.toString();

    const rate = reactionTimes.length / 5;
    rateValue.textContent = rate.toFixed(1) + ' /s';
    rateValue.style.color = rate > 3 ? '#10b981'
                          : rate > 1 ? '#f59e0b'
                          : '#ef4444';

    const denat = denaturation();
    if (denat > 0.7) {
      shapeValue.textContent = 'Denatured';
      shapeValue.style.color = '#ef4444';
    } else if (denat > 0.3) {
      shapeValue.textContent = 'Partly damaged';
      shapeValue.style.color = '#f59e0b';
    } else {
      shapeValue.textContent = 'Working';
      shapeValue.style.color = '#10b981';
    }
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

  /* ── Events ─────────────────────────────────────────── */

  tempSlider.addEventListener('input', () => {
    changeCount++;
    if (changeCount >= 5) insightEl.hidden = false;
  });

  phSlider.addEventListener('input', () => {
    changeCount++;
    if (changeCount >= 5) insightEl.hidden = false;
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    evLabel(pauseBtn, paused ? 'play' : 'pause', paused ? 'Play' : 'Pause');
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    tempSlider.value = INITIAL.temperature;
    phSlider.value = INITIAL.ph;
    substrates = [];
    products = [];
    reactions = 0;
    reactionTimes = [];
    graphData = [];
    elapsed = 0;
    lastSample = 0;
    paused = false;
    changeCount = 0;
    evLabel(pauseBtn, 'pause', 'Pause');
    helpEl.hidden = true;
    insightEl.hidden = true;
    ensureSubstrateCount();
    ensureProductCount();
    syncReadout();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  tempSlider.value = INITIAL.temperature;
  phSlider.value = INITIAL.ph;
  ensureSubstrateCount();
  ensureProductCount();
  syncReadout();
  start();

})();
