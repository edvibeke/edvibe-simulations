(() => {
  'use strict';

  /* ── Constants ──────────────────────────────────────── */

  const W = 900, H = 540;

  const VA = 20;            // mL of acid in the flask
  const CB = 1.0;           // mol/L concentration of the base in the burette
  const MAX_VB = 60;        // mL capacity of the burette
  const STEP = 0.1;         // mL per drop

  // Geometry (left: apparatus, right: graph)
  const tube = { x: 230, w: 44, y0: 70, y1: 260 };   // burette
  const flask = { cx: 230, w: 200, top: 330, base: 480 };  // conical flask

  const PLOT = { x0: 520, x1: 870, y0: 40, y1: 460, pHMax: 14 };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas     = document.getElementById('stage');
  const ctx        = canvas.getContext('2d');
  const concEl     = document.getElementById('conc');
  const concValue  = document.getElementById('concValue');
  const dropBtn    = document.getElementById('dropBtn');
  const quickBtn   = document.getElementById('quickBtn');
  const baseValue  = document.getElementById('baseValue');
  const phValue    = document.getElementById('phValue');
  const dropsValue = document.getElementById('dropsValue');
  const eqValue    = document.getElementById('eqValue');
  const helpEl     = document.getElementById('help');
  const insightEl  = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let CA = 1.0;
  let VB = 0;              // mL base added
  let drops = 0;
  let hitEquiv = false;
  let droplets = [];
  let rafId = null;
  let lastTime = 0;

  /* ── Chemistry helpers ──────────────────────────────── */

  function equivalenceVolume() { return (CA * VA) / CB; }

  function pHAt(vb) {
    const na = (CA * VA) / 1000;
    const nb = (CB * vb) / 1000;
    const vt = (VA + vb) / 1000;
    if (nb <= 0) return Math.max(0, -Math.log10(CA));
    if (nb < na) return -Math.log10((na - nb) / vt);
    if (nb > na) return 14 + Math.log10((nb - na) / vt);
    return 7;
  }

  /* ── Rendering: apparatus ───────────────────────────── */

  function drawApparatus() {
    const level = 1 - VB / MAX_VB;               // remaining base 0..1

    // bench
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, flask.base + 6, 470, 14);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, flask.base + 20, 470, 8);

    // retort stand clamping the burette
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(120, 40); ctx.lineTo(120, 300); ctx.lineTo(230, 300);
    ctx.stroke();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(230, 250); ctx.lineTo(230, 295);
    ctx.stroke();

    // burette glass
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    ctx.fillRect(tube.x, tube.y0, tube.w, tube.y1 - tube.y0);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.strokeRect(tube.x, tube.y0, tube.w, tube.y1 - tube.y0);

    // graduations every 10 mL
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = tube.y0 + 5 + ((tube.y1 - tube.y0 - 10) * i) / 6;
      ctx.beginPath();
      ctx.moveTo(tube.x - 8, y);
      ctx.lineTo(tube.x + (i % 3 === 0 ? 28 : 16), y);
      ctx.stroke();
    }

    // base liquid inside (sky-blue, drain as base is added)
    const topY = tube.y0 + 8 + (tube.y1 - tube.y0 - 16) * level;
    ctx.fillStyle = 'rgba(56,189,248,0.30)';
    ctx.fillRect(tube.x + 4, topY, tube.w - 8, tube.y1 - topY - 4);
    ctx.beginPath();
    ctx.arc(tube.x + tube.w / 2, topY, (tube.w - 8) / 2, 0, Math.PI, true);
    ctx.fill();
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // nozzle
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tube.x + tube.w / 2, tube.y1);
    ctx.lineTo(tube.x + tube.w / 2, flask.top);
    ctx.stroke();

    // conical flask (Erlenmeyer)
    ctx.fillStyle = 'rgba(226,232,240,0.10)';
    ctx.beginPath();
    ctx.moveTo(flask.cx - 26, flask.top);
    ctx.lineTo(flask.cx + 26, flask.top);
    ctx.quadraticCurveTo(flask.cx, flask.top + 26, flask.cx, flask.top + 26);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(flask.cx + 26, flask.top + 24);
    ctx.lineTo(flask.cx + flask.w / 2 - 14, flask.base - 18);
    ctx.quadraticCurveTo(flask.cx, flask.base + 12, flask.cx - flask.w / 2 + 14, flask.base - 18);
    ctx.lineTo(flask.cx - 26, flask.top + 24);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 3;
    ctx.stroke();

    // colourless/low volume swirl on bench under flask
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    // liquid inside flask: rises with added volume, pink with phenolphthalein
    const pH = pHAt(VB);
    const liquidTop = flask.top + 70 - Math.min(26, VB * 0.8);
    const flaskPath = () => {
      ctx.beginPath();
      ctx.moveTo(flask.cx + 22, liquidTop);
      ctx.lineTo(flask.cx - 22, liquidTop);
      ctx.lineTo(flask.cx - flask.w / 2 + 20, flask.base - 16);
      ctx.quadraticCurveTo(flask.cx, flask.base + 14, flask.cx + flask.w / 2 - 20, flask.base - 16);
      ctx.closePath();
    };
    flaskPath();
    ctx.fillStyle = flaskColour(pH);
    ctx.fill();
    ctx.strokeStyle = flaskColourEdge(pH);
    ctx.lineWidth = 2;
    flaskPath();
    ctx.stroke();

    // phenolphthalein note
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const note = pH < 8.2 ? 'colourless (phenolphthalein)' : 'pink!';
    ctx.fillStyle = pH < 8.2 ? '#94a3b8' : '#ec4899';
    ctx.fillText(note, flask.cx, flask.base + 40);
  }

  function flaskColour(pH) {
    if (pH < 8.2) return 'rgba(253,230,214,0.10)';
    const t = Math.min(1, (pH - 8.2) / 2.8);
    return `rgba(236,72,153,${(0.12 + t * 0.6).toFixed(3)})`;
  }
  function flaskColourEdge(pH) {
    if (pH < 8.2) return 'rgba(253,230,214,0.22)';
    return 'rgba(244,114,182,0.9)';
  }

  /* ── Rendering: drops ───────────────────────────────── */

  function spawnDrop() {
    droplets.push({ t: 0 });
  }

  function updateDrops(dt) {
    droplets = droplets.filter(d => d.t < 1);
    for (const d of droplets) d.t += dt / 0.4;
  }

  function drawDrops() {
    for (const d of droplets) {
      const y = tube.y1 + (flask.top + 20 - tube.y1) * d.t;
      ctx.fillStyle = 'rgba(125,211,252,0.85)';
      ctx.beginPath();
      ctx.ellipse(tube.x + tube.w / 2, y, 3.2, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Rendering: pH graph ────────────────────────────── */

  const X_SCALE = () => {
    const veq = equivalenceVolume();
    return Math.min(MAX_VB, Math.max(2 * veq, 4));
  };

  function xPos(vb) {
    const xm = X_SCALE();
    return PLOT.x0 + ((PLOT.x1 - PLOT.x0) * vb) / xm;
  }
  function yPos(pH) {
    return PLOT.y1 - ((PLOT.y1 - PLOT.y0) * pH) / PLOT.pHMax;
  }

  function drawGraph() {
    const xm = X_SCALE();

    // panel
    ctx.fillStyle = 'rgba(15,23,42,0.6)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(PLOT.x0 - 14, PLOT.y0 - 14, PLOT.x1 - PLOT.x0 + 28, PLOT.y1 - PLOT.y0 + 28, 12);
    ctx.fill();
    ctx.stroke();

    // grid + axis labels (pH)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let p = 0; p <= 14; p += 2) {
      const y = yPos(p);
      ctx.strokeStyle = (p === 7) ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PLOT.x0, y); ctx.lineTo(PLOT.x1, y);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(String(p), PLOT.x0 - 6, y);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('pH', PLOT.x0 - 6, PLOT.y0 - 8);

    // x ticks every 1 mL
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = 0; v <= xm; v += 1) {
      const x = xPos(v);
      ctx.strokeStyle = 'rgba(148,163,184,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, PLOT.y0); ctx.lineTo(x, PLOT.y1);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(v + '', x, PLOT.y1 + 6);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('base added / mL', PLOT.x0 + (PLOT.x1 - PLOT.x0) / 2, PLOT.y1 + 24);

    // equivalence line
    const vEq = equivalenceVolume();
    const ex = xPos(vEq);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(ex, PLOT.y0); ctx.lineTo(ex, PLOT.y1 + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('equivalence', Math.min(ex + 6, PLOT.x1 - 70), PLOT.y0 - 2);

    // curve
    if (VB > 0) {
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;
      for (let v = 0; v <= VB + 1e-9; v += 0.02) {
        const x = xPos(v), y = yPos(pHAt(v));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // current point, pulsing
      const cx = xPos(VB), cy = yPos(pHAt(VB));
      const pulse = 3 + 2 * Math.sin(performance.now() / 180);
      ctx.beginPath();
      ctx.arc(cx, cy, 6 + pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99,102,241,0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#c7d2fe';
      ctx.fill();
    }
  }

  /* ── Render all ─────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawApparatus();
    drawDrops();
    drawGraph();
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const pH = pHAt(VB);
    baseValue.textContent = VB.toFixed(1) + ' mL';
    phValue.textContent   = pH.toFixed(1);
    dropsValue.textContent = String(drops);
    eqValue.textContent   = equivalenceVolume().toFixed(1) + ' mL (' + CA.toFixed(1) + ' M × 20 mL)';

    if (!hitEquiv && VB >= equivalenceVolume()) {
      hitEquiv = true;
      if (insightEl.hidden) insightEl.hidden = false;
    }
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    updateDrops(dt);
    render();
    syncReadout();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Actions ────────────────────────────────────────── */

  function addBase(amount) {
    if (VB >= MAX_VB) return;
    VB = Math.min(MAX_VB, VB + amount);
    drops += Math.round(amount / STEP);
    for (let i = 0; i < Math.max(1, Math.round(amount / STEP)); i++) spawnDrop();
  }

  function resetRun() {
    CA = Number(concEl.value);
    VB = 0;
    drops = 0;
    hitEquiv = false;
    droplets = [];
    insightEl.hidden = true;
    syncReadout();
  }

  /* ── Events ─────────────────────────────────────────── */

  dropBtn.addEventListener('click', () => addBase(STEP));
  quickBtn.addEventListener('click', () => addBase(1.0));

  concEl.addEventListener('input', () => {
    concValue.textContent = Number(concEl.value).toFixed(1) + ' M';
    resetRun();
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    concEl.value = 1;
    concValue.textContent = '1.0 M';
    resetRun();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  resetRun();
  start();
})();