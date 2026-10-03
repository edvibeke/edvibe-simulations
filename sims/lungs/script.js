(() => {
  'use strict';

  /* ── Geometry ───────────────────────────────────────── */

  const W = 900, H = 540;

  const trachea = { x: 450, y0: 20, y1: 150 };
  const LUNG = [
    { cx: 300, cy: 315, rx: 120, ry: 150 },
    { cx: 600, cy: 315, rx: 120, ry: 150 }
  ];
  const CAP = [
    [{ x: 215, y: 245 }, { x: 235, y: 330 }],
    [{ x: 685, y: 245 }, { x: 665, y: 330 }]
  ];

  /* ── DOM ────────────────────────────────────────────── */

  const canvas     = document.getElementById('stage');
  const stage     = EV.stage('stage');
  const ctx        = stage.ctx;
  const rateEl     = document.getElementById('rate');
  const rateValue  = document.getElementById('rateValue');
  const depthEl    = document.getElementById('depth');
  const depthValue = document.getElementById('depthValue');
  const pauseBtn   = document.getElementById('pauseBtn');
  const rateOutValue = document.getElementById('rateOutValue');
  const tidalValue   = document.getElementById('tidalValue');
  const o2Value      = document.getElementById('o2Value');
  const co2Value     = document.getElementById('co2Value');

  /* ── State ──────────────────────────────────────────── */

  let rate = 14, depth = 55;
  let breathT = 0, paused = false;
  let completedBreaths = 0;
  let lastIn = 0, spawnO2Done = false, spawnCO2Done = false;
  const events = [];
  let rafId = null;
  let lastTime = 0;

  /* ── Alveoli (deterministic) ────────────────────────── */

  const alveoli = LUNG.map((lng, li) => {
    const out = [];
    let s = 17 + li * 101;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 13; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.52;
      out.push({ x: lng.cx + Math.cos(a) * r * lng.rx, y: lng.cy + Math.sin(a) * r * lng.ry, r: 10 + rnd() * 5 });
    }
    return out;
  });

  /* ── Breath ─────────────────────────────────────────── */

  function breathe() {
    const phase = (breathT * (rate / 60)) % 1;
    const in_ = (1 - Math.cos(2 * Math.PI * phase)) / 2;   // 0 .. 1 .. 0 per cycle
    return { phase, in: in_, inhaling: in_ >= lastIn };
  }

  function spawnExchange(kind, lung) {
    const i = (Math.random() * alveoli[lung].length) | 0;
    const alv = alveoli[lung][i];
    const cap = CAP[lung][(Math.random() * CAP[lung].length) | 0];
    events.push({
      type: kind,
      lung: lung,
      p: 0,
      from: kind === 'o2' ? alv : cap,
      to: kind === 'o2' ? cap : alv
    });
  }

  function updateEvents(dt) {
    for (let i = events.length - 1; i >= 0; i--) {
      events[i].p += dt / 0.9;
      if (events[i].p >= 1) events.splice(i, 1);
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render(dt, now) {
    ctx.clearRect(0, 0, W, H);

    const { in: in_, inhaling } = breathe();
    const infl = 1 + in_ * 0.16;

    // torso silhouette
    ctx.fillStyle = 'rgba(99,102,241,0.05)';
    ctx.beginPath();
    ctx.roundRect(130, 50, 640, 420, 40);
    ctx.fill();

    // lungs (outer lobes)
    for (const l of LUNG) {
      const sx = l.rx * (1 + in_ * 0.05);
      const sy = l.ry * (1 + in_ * 0.02);
      ctx.beginPath();
      ctx.ellipse(l.cx, l.cy, sx, sy, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(148,163,184,0.16)';
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // trachea + bronchi
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(trachea.x, trachea.y0);
    ctx.lineTo(trachea.x, trachea.y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(trachea.x, trachea.y1);
    ctx.quadraticCurveTo(400, 175, LUNG[0].cx - 40, 190);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(trachea.x, trachea.y1);
    ctx.quadraticCurveTo(500, 175, LUNG[1].cx + 40, 190);
    ctx.stroke();

    // cartilage rings on trachea
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.lineWidth = 2;
    for (let y = trachea.y0 + 12; y < trachea.y1; y += 14) {
      ctx.beginPath();
      ctx.moveTo(trachea.x - 9, y); ctx.lineTo(trachea.x + 9, y);
      ctx.stroke();
    }

    // air flow arrows
    ctx.fillStyle = inhaling ? 'rgba(125,211,252,0.85)' : 'rgba(94,234,212,0.7)';
    for (let i = 0; i < 3; i++) {
      const ax = trachea.x + ((i - 1) * 14);
      const cy = trachea.y0 + 26 + i * 28;
      const dir = inhaling ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(ax, cy - 5 * dir);
      ctx.lineTo(ax, cy + 5 * dir);
      ctx.lineTo(ax + 5 * dir, cy);
      ctx.lineTo(ax - 5 * dir, cy);
      ctx.closePath();
      ctx.fill();
    }

    // alveoli (inflate on inhale)
    for (let li = 0; li < 2; li++) {
      for (const a of alveoli[li]) {
        const r = a.r * infl;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96,165,250,${0.16 + in_ * 0.10})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(147,197,253,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // capillary beds
    for (let li = 0; li < 2; li++) {
      ctx.strokeStyle = 'rgba(248,113,113,0.75)';
      ctx.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        const c = CAP[li][0];
        ctx.moveTo(c.x, c.y);
        ctx.quadraticCurveTo(c.x + (li === 0 ? 40 : -40), c.y + 50, li === 0 ? 260 : 640, 420);
        ctx.stroke();
      }
    }

    // exchange dots
    for (const e of events) {
      const x = e.from.x + (e.to.x - e.from.x) * e.p;
      const y = e.from.y + (e.to.y - e.from.y) * e.p;
      ctx.beginPath();
      ctx.arc(x, y, e.type === 'o2' ? 4 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = e.type === 'o2' ? '#f87171' : '#5eead4';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
    }

    // heart
    const beat = Math.pow(Math.max(0, Math.sin(now / 220)), 12);
    const hs = 1 + beat * 0.08;
    ctx.save();
    ctx.translate(450, 262);
    ctx.scale(hs, hs);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.ellipse(-16, -10, 20, 26, -0.5, 0, Math.PI * 2);
    ctx.ellipse(16, -10, 20, 26, 0.5, 0, Math.PI * 2);
    ctx.arc(0, 6, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fca5a5';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('O₂-rich blood to body', 450, 262 - 46);

    // diaphragm
    const controlY = 500 - in_ * 58;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(160, 520);
    ctx.quadraticCurveTo(450, controlY, 740, 520);
    ctx.stroke();
    ctx.fillStyle = '#a855f7';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText('diaphragm', 470, 540);

    // labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText('trachea', 465, 40);
    ctx.fillText('alveoli', LUNG[0].cx - 28, LUNG[0].cy - 130);
    ctx.fillText('left lung', LUNG[0].cx - 24, LUNG[0].cy + 140);
    ctx.fillText('right lung', LUNG[1].cx - 28, LUNG[1].cy + 140);
  }
  /* Repaint on demand — used by the shared runtime when
     prefers-reduced-motion stops the animation clock. */
  stage.onPaint = () => { render(0, EV.visualTime(performance.now())); };

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    rateOutValue.textContent = rate + ' /min';
    tidalValue.textContent   = Math.round(depth * 1.5) + ' mL';
    o2Value.textContent      = (93.5 + depth * 0.04).toFixed(1) + '%';
    co2Value.textContent     = (6.4 - rate * 0.12).toFixed(1) + '%';

    if (completedBreaths >= 2) EV.revealInsight();
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;

    if (!paused) {
      const before = Math.floor((breathT * (rate / 60)) % 1 * 100) ;
      breathT += dt;
      const after = Math.floor((breathT * (rate / 60)) % 1 * 100);
      if (after < before) completedBreaths++;
    }

    const { in: in_, inhaling } = breathe();

    if (in_ > 0.55 && inhaling && !spawnO2Done) {
      spawnO2Done = true;
      spawnExchange('o2', 0);
      spawnExchange('o2', 1);
    }
    if (in_ < 0.45 && !inhaling && !spawnCO2Done) {
      spawnCO2Done = true;
      spawnExchange('co2', 0);
      spawnExchange('co2', 1);
      spawnExchange('co2', 1);
    }
    if (in_ <= 0.02) { spawnO2Done = false; spawnCO2Done = false; }

    lastIn = in_;

    updateEvents(dt);
    // dt is already frozen by EV.delta(); visualTime also stops the
    // heartbeat throb, which is drawn straight from the timestamp.
    render(dt, EV.visualTime(now));
    syncReadout();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Actions ────────────────────────────────────────── */

  function togglePause() {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    EV.label(pauseBtn, paused ? 'play' : 'pause', paused ? 'Play' : 'Pause');
  }

  function resetRun() {
    rate = Number(rateEl.value);
    depth = Number(depthEl.value);
    breathT = 0;
    completedBreaths = 0;
    events.length = 0;
    EV.resetInsight();
    spawnO2Done = false;
    spawnCO2Done = false;
    syncReadout();
  }

  /* ── Events ─────────────────────────────────────────── */

  pauseBtn.addEventListener('click', togglePause);

  rateEl.addEventListener('input', () => {
    rateValue.textContent = Number(rateEl.value) + ' /min';
    rate = Number(rateEl.value);
  });
  depthEl.addEventListener('input', () => {
    depthValue.textContent = Number(depthEl.value) + '%';
    depth = Number(depthEl.value);
  });

  EV.onReset(() => {
    rateEl.value = 14;
    depthEl.value = 55;
    rateValue.textContent = '14 /min';
    depthValue.textContent = '55%';
    paused = false;
    pauseBtn.setAttribute('aria-pressed', 'false');
    EV.label(pauseBtn, 'pause', 'Pause');
    resetRun();
  });

  /* ── Init ───────────────────────────────────────────── */

  EV.label(pauseBtn, 'pause', 'Pause');
  rateValue.textContent = '14 /min';
  depthValue.textContent = '55%';
  resetRun();
  start();
})();