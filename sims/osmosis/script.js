(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const BOX = { x: 40, y: 60, w: 440, h: 420 };
  const MEMBRANE_X = BOX.x + BOX.w / 2;
  const MEMBRANE_W = 8;

  const GRAPH = { x: 540, y: 90, w: 320, h: 380 };

  const WATER_R = 6;
  const SOLUTE_R = 10;
  const TOTAL_WATER = 60;
  const MAX_SPEED = 130;

  const INITIAL = { soluteLeft: 4, soluteRight: 16 };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas = document.getElementById('stage');
  const ctx    = canvas.getContext('2d');

  const soluteLeftSlider  = document.getElementById('soluteLeft');
  const soluteRightSlider = document.getElementById('soluteRight');
  const soluteLeftValue   = document.getElementById('soluteLeftValue');
  const soluteRightValue  = document.getElementById('soluteRightValue');
  const waterLeftValue    = document.getElementById('waterLeftValue');
  const waterRightValue   = document.getElementById('waterRightValue');
  const directionValue    = document.getElementById('directionValue');
  const pauseBtn          = document.getElementById('pauseBtn');
  const helpEl            = document.getElementById('help');
  const insightEl         = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let water = [];
  let solutes = [];
  let elapsed = 0;
  let lastSample = 0;
  let history = [];
  let paused = false;
  let rafId = null;
  let lastTime = 0;
  let changeCount = 0;

  /* ── Particle factories ─────────────────────────────── */

  function randomPositionOnSide(side) {
    const pad = 20;
    const xMin = side === 'left' ? BOX.x + pad : MEMBRANE_X + MEMBRANE_W / 2 + pad;
    const xMax = side === 'left' ? MEMBRANE_X - MEMBRANE_W / 2 - pad : BOX.x + BOX.w - pad;
    return {
      x: xMin + Math.random() * (xMax - xMin),
      y: BOX.y + pad + Math.random() * (BOX.h - pad * 2)
    };
  }

  function makeWater() {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const pos = randomPositionOnSide(side);
    const a = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 60;
    return {
      x: pos.x,
      y: pos.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed
    };
  }

  function makeSolute(side) {
    const pos = randomPositionOnSide(side);
    const a = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 40;
    return {
      side,
      x: pos.x,
      y: pos.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed
    };
  }

  function resetParticles() {
    water = [];
    for (let i = 0; i < TOTAL_WATER; i++) water.push(makeWater());

    solutes = [];
    const nL = soluteLeftSlider.valueAsNumber;
    const nR = soluteRightSlider.valueAsNumber;
    for (let i = 0; i < nL; i++) solutes.push(makeSolute('left'));
    for (let i = 0; i < nR; i++) solutes.push(makeSolute('right'));
  }

  /* ── Concentration ──────────────────────────────────── */

  function waterCounts() {
    let left = 0, right = 0;
    for (const w of water) {
      if (w.x < MEMBRANE_X) left++;
      else right++;
    }
    return { left, right };
  }

  function soluteCounts() {
    let left = 0, right = 0;
    for (const s of solutes) {
      if (s.side === 'left') left++;
      else right++;
    }
    return { left, right };
  }

  function concentrations() {
    const w = waterCounts();
    const s = soluteCounts();
    return {
      left:  (s.left  + 1) / (w.left  + 1),
      right: (s.right + 1) / (w.right + 1)
    };
  }

  /* ── Physics ────────────────────────────────────────── */

  function stepWater(dt) {
    const c = concentrations();
    const gradient = c.right - c.left;   // > 0 → push water right

    for (const w of water) {
      // Osmotic bias — water drifts toward the more concentrated side
      w.vx += gradient * 220 * dt;

      // Thermal jiggle
      w.vx += (Math.random() - 0.5) * 200 * dt;
      w.vy += (Math.random() - 0.5) * 200 * dt;

      // Speed cap
      const sp = Math.hypot(w.vx, w.vy);
      if (sp > MAX_SPEED) {
        w.vx *= MAX_SPEED / sp;
        w.vy *= MAX_SPEED / sp;
      }

      // Move
      w.x += w.vx * dt;
      w.y += w.vy * dt;

      // Bounce top/bottom of container
      if (w.y < BOX.y + WATER_R + 2) {
        w.y = BOX.y + WATER_R + 2;
        w.vy = Math.abs(w.vy);
      }
      if (w.y > BOX.y + BOX.h - WATER_R - 2) {
        w.y = BOX.y + BOX.h - WATER_R - 2;
        w.vy = -Math.abs(w.vy);
      }
      // Bounce outer left / right walls
      if (w.x < BOX.x + WATER_R + 2) {
        w.x = BOX.x + WATER_R + 2;
        w.vx = Math.abs(w.vx);
      }
      if (w.x > BOX.x + BOX.w - WATER_R - 2) {
        w.x = BOX.x + BOX.w - WATER_R - 2;
        w.vx = -Math.abs(w.vx);
      }

      // If a water molecule tries to sit *inside* the membrane, nudge it out.
      // Water is allowed through — no bounce — but we don't want it stuck.
      if (Math.abs(w.x - MEMBRANE_X) < MEMBRANE_W / 2) {
        // Nudge to one side based on velocity direction
        if (w.vx >= 0) w.x = MEMBRANE_X + MEMBRANE_W / 2 + 1;
        else            w.x = MEMBRANE_X - MEMBRANE_W / 2 - 1;
      }
    }
  }

  function stepSolutes(dt) {
    for (const s of solutes) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Thermal jiggle
      s.vx += (Math.random() - 0.5) * 120 * dt;
      s.vy += (Math.random() - 0.5) * 120 * dt;
      s.vx *= 0.98;
      s.vy *= 0.98;

      // Bounce top / bottom
      if (s.y < BOX.y + SOLUTE_R + 2) {
        s.y = BOX.y + SOLUTE_R + 2;
        s.vy = Math.abs(s.vy);
      }
      if (s.y > BOX.y + BOX.h - SOLUTE_R - 2) {
        s.y = BOX.y + BOX.h - SOLUTE_R - 2;
        s.vy = -Math.abs(s.vy);
      }
      // Bounce outer walls
      if (s.x < BOX.x + SOLUTE_R + 2) {
        s.x = BOX.x + SOLUTE_R + 2;
        s.vx = Math.abs(s.vx);
      }
      if (s.x > BOX.x + BOX.w - SOLUTE_R - 2) {
        s.x = BOX.x + BOX.w - SOLUTE_R - 2;
        s.vx = -Math.abs(s.vx);
      }

      // Bounce off the membrane — solutes CANNOT cross it
      const leftMin  = BOX.x + SOLUTE_R + 2;
      const leftMax  = MEMBRANE_X - MEMBRANE_W / 2 - SOLUTE_R - 2;
      const rightMin = MEMBRANE_X + MEMBRANE_W / 2 + SOLUTE_R + 2;
      const rightMax = BOX.x + BOX.w - SOLUTE_R - 2;

      if (s.side === 'left') {
        if (s.x > leftMax) { s.x = leftMax; s.vx = -Math.abs(s.vx); }
        if (s.x < leftMin) { s.x = leftMin; s.vx =  Math.abs(s.vx); }
      } else {
        if (s.x < rightMin) { s.x = rightMin; s.vx =  Math.abs(s.vx); }
        if (s.x > rightMax) { s.x = rightMax; s.vx = -Math.abs(s.vx); }
      }
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBox();
    drawMembrane();
    drawSolutes();
    drawWater();
    drawLegend();
    drawGraph();
  }

  function drawBox() {
    // Container background
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);

    // Rim
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

    // Side labels
    ctx.fillStyle = '#64748b';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('SIDE A', BOX.x + BOX.w * 0.25, BOX.y - 10);
    ctx.fillText('SIDE B', BOX.x + BOX.w * 0.75, BOX.y - 10);
  }

  function drawMembrane() {
    // Dashed vertical line for the partially-permeable membrane
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = MEMBRANE_W;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(MEMBRANE_X, BOX.y + 4);
    ctx.lineTo(MEMBRANE_X, BOX.y + BOX.h - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = '#f59e0b';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Small rotated text
    ctx.save();
    ctx.translate(MEMBRANE_X, BOX.y + 30);
    ctx.fillText('partially', 0, -8);
    ctx.fillText('permeable', 0, 6);
    ctx.fillText('membrane', 0, 20);
    ctx.restore();
  }

  function drawWater() {
    for (const w of water) {
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(w.x, w.y, WATER_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(11,18,32,0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Tiny highlight
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(w.x - WATER_R * 0.35, w.y - WATER_R * 0.35, WATER_R * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSolutes() {
    for (const s of solutes) {
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.arc(s.x, s.y, SOLUTE_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(11,18,32,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(s.x - SOLUTE_R * 0.3, s.y - SOLUTE_R * 0.3, SOLUTE_R * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLegend() {
    const y = BOX.y + BOX.h + 22;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath(); ctx.arc(BOX.x + 14, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('water (can cross)', BOX.x + 26, y);

    ctx.fillStyle = '#a78bfa';
    ctx.beginPath(); ctx.arc(BOX.x + 180, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('solute (stays put)', BOX.x + 194, y);
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

    // Y-axis labels: 0 and TOTAL_WATER
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(TOTAL_WATER.toString(), g.x - 6, g.y);
    ctx.fillText('0', g.x - 6, g.y + g.h);

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
    ctx.fillText('WATER MOLECULES', 0, 0);
    ctx.restore();

    // Time window: rolling
    const windowSec = 15;
    const tEnd = Math.max(elapsed, windowSec);
    const tStart = tEnd - windowSec;
    const toX = (t) => g.x + ((t - tStart) / windowSec) * g.w;
    const toY = (n) => g.y + g.h - (n / TOTAL_WATER) * g.h;

    // 50% reference (dashed)
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(g.x, toY(TOTAL_WATER / 2));
    ctx.lineTo(g.x + g.w, toY(TOTAL_WATER / 2));
    ctx.stroke();
    ctx.setLineDash([]);

    // Left water count curve (blue)
    drawCurve(history, 'left', toX, toY, '#60a5fa');
    // Right water count curve (green)
    drawCurve(history, 'right', toX, toY, '#34d399');
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
    const w = waterCounts();
    waterLeftValue.textContent = w.left;
    waterRightValue.textContent = w.right;

    // Direction
    const recent = history.slice(-30);  // ~last 3s
    if (recent.length < 2) {
      directionValue.textContent = '—';
      directionValue.style.color = '#94a3b8';
      return;
    }
    const first = recent[0];
    const last  = recent[recent.length - 1];
    const deltaRight = last.right - first.right;
    const deltaLeft  = last.left  - first.left;

    if (Math.abs(deltaRight) < 2 && Math.abs(deltaLeft) < 2) {
      directionValue.textContent = 'Balanced';
      directionValue.style.color = '#10b981';
    } else if (deltaRight > 0) {
      directionValue.textContent = '→ moving right';
      directionValue.style.color = '#60a5fa';
    } else {
      directionValue.textContent = '← moving left';
      directionValue.style.color = '#60a5fa';
    }
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!paused) {
      elapsed += dt;
      stepWater(dt);
      stepSolutes(dt);

      if (elapsed - lastSample >= 0.05) {
        const w = waterCounts();
        history.push({ t: elapsed, left: w.left, right: w.right });
        if (history.length > 3000) history.shift();
        lastSample = elapsed;
      }
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

  /* ── Sliders — adjust solute counts ─────────────────── */

  function adjustSolute(side, target) {
    const current = solutes.filter(s => s.side === side).length;
    const diff = target - current;

    if (diff > 0) {
      for (let i = 0; i < diff; i++) solutes.push(makeSolute(side));
    } else if (diff < 0) {
      let toRemove = -diff;
      for (let i = solutes.length - 1; i >= 0 && toRemove > 0; i--) {
        if (solutes[i].side === side) {
          solutes.splice(i, 1);
          toRemove--;
        }
      }
    }
  }

  soluteLeftSlider.addEventListener('input', () => {
    soluteLeftValue.textContent = soluteLeftSlider.value;
    adjustSolute('left', soluteLeftSlider.valueAsNumber);
    changeCount++;
    if (changeCount >= 3) insightEl.hidden = false;
  });

  soluteRightSlider.addEventListener('input', () => {
    soluteRightValue.textContent = soluteRightSlider.value;
    adjustSolute('right', soluteRightSlider.valueAsNumber);
    changeCount++;
    if (changeCount >= 3) insightEl.hidden = false;
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Play' : '⏸ Pause';
  });

  /* ── Reset / Help ───────────────────────────────────── */

  function reset() {
    soluteLeftSlider.value = INITIAL.soluteLeft;
    soluteRightSlider.value = INITIAL.soluteRight;
    soluteLeftValue.textContent = INITIAL.soluteLeft;
    soluteRightValue.textContent = INITIAL.soluteRight;

    elapsed = 0;
    lastSample = 0;
    history = [];
    paused = false;
    changeCount = 0;
    pauseBtn.textContent = '⏸ Pause';
    helpEl.hidden = true;
    insightEl.hidden = true;

    resetParticles();
    syncReadout();
  }

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);
  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  soluteLeftSlider.value = INITIAL.soluteLeft;
  soluteRightSlider.value = INITIAL.soluteRight;
  soluteLeftValue.textContent = INITIAL.soluteLeft;
  soluteRightValue.textContent = INITIAL.soluteRight;

  resetParticles();
  syncReadout();
  start();

})();
