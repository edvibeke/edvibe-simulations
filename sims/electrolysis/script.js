(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 520;

  const BEAKER = { x: 140, y: 150, w: 620, h: 350, wall: 5 };
  const LIQUID_TOP = BEAKER.y + 30;
  const LIQUID_BOT = BEAKER.y + BEAKER.h - 8;

  const CATHODE = { x: 300, y: 100, w: 16, h: 360 };
  const ANODE   = { x: 584, y: 100, w: 16, h: 360 };

  const BATTERY = { x: 400, y: 36, w: 100, h: 44 };

  const ION_R = 8;
  const INITIAL_CU = 60;
  const INITIAL_SO4 = 40;

  /* ── Colours ────────────────────────────────────────── */

  const COLORS = {
    cuIon:    '#60a5fa',
    so4Ion:   '#f59e0b',
    electrode:'#1f2937',
    wire:     '#94a3b8',
    copper:   '#d97706',
    bubble:   'rgba(226,232,240,0.55)'
  };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas      = document.getElementById('stage');
  const ctx         = canvas.getContext('2d');
  const powerBtn    = document.getElementById('powerBtn');
  const concValue   = document.getElementById('concValue');
  const depositValue= document.getElementById('depositValue');
  const timeValue   = document.getElementById('timeValue');
  const helpEl      = document.getElementById('help');
  const insightEl   = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let ions = [];
  let bubbles = [];
  let depositLumps = [];           // {y, r, side}
  let cuRemaining = INITIAL_CU;
  let powered = false;
  let elapsed = 0;
  let depositMass = 0;             // grams (arbitrary scale)
  let wirePulse = 0;
  let rafId = null;
  let lastTime = 0;
  let everPowered = false;

  /* ── Helpers ────────────────────────────────────────── */

  function spawnIon(type) {
    const xMin = CATHODE.x + CATHODE.w + 30;
    const xMax = ANODE.x - 30;
    return {
      type,
      x: xMin + Math.random() * (xMax - xMin),
      y: LIQUID_TOP + 30 + Math.random() * (LIQUID_BOT - LIQUID_TOP - 40),
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30
    };
  }

  function spawnBubble() {
    const x = ANODE.x + ANODE.w - 6 + (Math.random() - 0.5) * 8;
    bubbles.push({
      x,
      y: LIQUID_BOT - 10 - Math.random() * 60,
      r: 2 + Math.random() * 4,
      vy: -(50 + Math.random() * 40),
      wobble: Math.random() * Math.PI * 2,
      life: 0
    });
  }

  function concentration() {
    return cuRemaining / INITIAL_CU;
  }

  /* ── Ion update ─────────────────────────────────────── */

  function updateIons(dt) {
    const drift = 55;                // px/s² acceleration toward electrode

    for (let i = ions.length - 1; i >= 0; i--) {
      const ion = ions[i];

      if (powered) {
        if (ion.type === 'Cu') {
          ion.vx -= drift * 4 * dt;
        } else {
          ion.vx += drift * 4 * dt;
        }
        // Small vertical mixing so they don't all sit at one height
        ion.vy += (Math.random() - 0.5) * 80 * dt;
      }

      // Thermal jitter
      ion.vx += (Math.random() - 0.5) * 120 * dt;
      ion.vy += (Math.random() - 0.5) * 120 * dt;

      ion.vx *= 0.94;
      ion.vy *= 0.94;

      ion.x += ion.vx * dt;
      ion.y += ion.vy * dt;

      // Walls
      const xMin = CATHODE.x + CATHODE.w + ION_R;
      const xMax = ANODE.x - ION_R;
      if (ion.x < xMin) { ion.x = xMin; ion.vx = Math.abs(ion.vx) * 0.5; }
      if (ion.x > xMax) { ion.x = xMax; ion.vx = -Math.abs(ion.vx) * 0.5; }
      if (ion.y < LIQUID_TOP + ION_R + 4) { ion.y = LIQUID_TOP + ION_R + 4; ion.vy = Math.abs(ion.vy) * 0.5; }
      if (ion.y > LIQUID_BOT - ION_R - 4) { ion.y = LIQUID_BOT - ION_R - 4; ion.vy = -Math.abs(ion.vy) * 0.5; }

      // Reaction at electrode
      if (powered && ion.type === 'Cu' && ion.x <= xMin + 2) {
        // Deposit copper
        depositMass += 0.015;
        cuRemaining = Math.max(0, cuRemaining - 1);
        addDepositLump();
        ions.splice(i, 1);
        continue;
      }

      if (powered && ion.type === 'SO4' && ion.x >= xMax - 2) {
        // Trigger bubble (the OH⁻ reaction, shown via bubble)
        if (Math.random() < 0.15) spawnBubble();
      }
    }
  }

  function addDepositLump() {
    depositLumps.push({
      y: LIQUID_TOP + 20 + Math.random() * (LIQUID_BOT - LIQUID_TOP - 40),
      r: 3 + Math.random() * 4
    });
  }

  /* ── Bubbles update ─────────────────────────────────── */

  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y += b.vy * dt;
      b.life += dt;
      b.x += Math.sin(b.life * 4 + b.wobble) * 15 * dt;

      if (b.y < LIQUID_TOP + 6) {
        bubbles.splice(i, 1);
      }
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawWires();
    drawBattery();
    drawBeaker();
    drawSolution();
    drawDeposit();
    drawElectrodes();
    drawIons();
    drawBubbles();
    drawLegend();
    drawPolarityLabels();
  }

  function drawWires() {
    ctx.strokeStyle = COLORS.wire;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Left wire: cathode top → up → right to battery left terminal
    ctx.beginPath();
    ctx.moveTo(CATHODE.x + CATHODE.w / 2, CATHODE.y);
    ctx.lineTo(CATHODE.x + CATHODE.w / 2, BATTERY.y + BATTERY.h);
    ctx.lineTo(BATTERY.x, BATTERY.y + BATTERY.h);
    ctx.stroke();

    // Right wire
    ctx.beginPath();
    ctx.moveTo(ANODE.x + ANODE.w / 2, ANODE.y);
    ctx.lineTo(ANODE.x + ANODE.w / 2, BATTERY.y + BATTERY.h);
    ctx.lineTo(BATTERY.x + BATTERY.w, BATTERY.y + BATTERY.h);
    ctx.stroke();

    // Current flow dots — only when powered
    if (powered) {
      const dotCount = 12;
      ctx.fillStyle = '#facc15';
      for (let i = 0; i < dotCount; i++) {
        const t = (i / dotCount + wirePulse) % 1;
        // Left side flows up
        const lx = CATHODE.x + CATHODE.w / 2 + (BATTERY.x - (CATHODE.x + CATHODE.w / 2)) * t;
        const ly = CATHODE.y + (BATTERY.y + BATTERY.h - CATHODE.y) * t;
        // Simpler: place dots on the horizontal bottom section
        if (t < 1) {
          const dotX = CATHODE.x + CATHODE.w / 2 + (BATTERY.x - (CATHODE.x + CATHODE.w / 2)) * t;
          const dotY = BATTERY.y + BATTERY.h;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Right side
      for (let i = 0; i < dotCount; i++) {
        const t = (i / dotCount + wirePulse) % 1;
        const dotX = BATTERY.x + BATTERY.w + (ANODE.x + ANODE.w / 2 - (BATTERY.x + BATTERY.w)) * t;
        const dotY = BATTERY.y + BATTERY.h;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBattery() {
    const b = BATTERY;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.strokeStyle = powered ? '#10b981' : '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    // "+" on the right terminal, "−" on the left
    ctx.fillStyle = powered ? '#10b981' : '#94a3b8';
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('−', b.x + 18, b.y + b.h / 2);
    ctx.fillText('+', b.x + b.w - 18, b.y + b.h / 2);

    ctx.fillStyle = '#64748b';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText('POWER', b.x + b.w / 2, b.y + b.h / 2 + 1);
  }

  function drawBeaker() {
    const b = BEAKER;

    // Empty glass background
    ctx.fillStyle = 'rgba(148,163,184,0.05)';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Glass outline (sides + bottom only, open top)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = b.wall;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.stroke();

    // Rim
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - 6, b.y);
    ctx.lineTo(b.x + b.w + 6, b.y);
    ctx.stroke();
  }

  function drawSolution() {
    const conc = concentration();
    // Interpolate: full blue at conc=1, dark at conc=0
    const r = Math.round(20 + 30 * conc);
    const g = Math.round(30 + 80 * conc);
    const bl = Math.round(55 + 140 * conc);

    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.fillRect(
      BEAKER.x + BEAKER.wall,
      LIQUID_TOP,
      BEAKER.w - BEAKER.wall * 2,
      LIQUID_BOT - LIQUID_TOP
    );

    // Meniscus
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(BEAKER.x + BEAKER.wall, LIQUID_TOP, BEAKER.w - BEAKER.wall * 2, 3);
  }

  function drawElectrodes() {
    // Electrode body — graphite (dark)
    ctx.fillStyle = COLORS.electrode;
    ctx.fillRect(CATHODE.x, CATHODE.y, CATHODE.w, CATHODE.h);
    ctx.fillRect(ANODE.x, ANODE.y, ANODE.w, ANODE.h);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(CATHODE.x, CATHODE.y, CATHODE.w, CATHODE.h);
    ctx.strokeRect(ANODE.x, ANODE.y, ANODE.w, ANODE.h);

    // Slight highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(CATHODE.x + 3, CATHODE.y + 10, 3, CATHODE.h - 20);
    ctx.fillRect(ANODE.x + 3, ANODE.y + 10, 3, ANODE.h - 20);
  }

  function drawDeposit() {
    // Copper lumps on the right side of the cathode (facing the solution)
    ctx.fillStyle = COLORS.copper;
    for (const lump of depositLumps) {
      ctx.beginPath();
      ctx.arc(CATHODE.x + CATHODE.w + lump.r * 0.5, lump.y, lump.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Slight highlight on each lump
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (const lump of depositLumps) {
      ctx.beginPath();
      ctx.arc(
        CATHODE.x + CATHODE.w + lump.r * 0.5 - lump.r * 0.3,
        lump.y - lump.r * 0.3,
        lump.r * 0.4, 0, Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawIons() {
    for (const ion of ions) {
      const isCu = ion.type === 'Cu';
      const color = isCu ? COLORS.cuIon : COLORS.so4Ion;

      // Glow
      ctx.fillStyle = color + '33';
      ctx.beginPath();
      ctx.arc(ion.x, ion.y, ION_R + 4, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ion.x, ion.y, ION_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Charge symbol
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isCu ? '2+' : '2−', ion.x, ion.y + 0.5);
    }
  }

  function drawBubbles() {
    for (const b of bubbles) {
      ctx.fillStyle = COLORS.bubble;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawPolarityLabels() {
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (powered) {
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('CATHODE (−)', CATHODE.x + CATHODE.w / 2, CATHODE.y - 14);

      ctx.fillStyle = '#ef4444';
      ctx.fillText('ANODE (+)', ANODE.x + ANODE.w / 2, ANODE.y - 14);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('electrode', CATHODE.x + CATHODE.w / 2, CATHODE.y - 14);
      ctx.fillText('electrode', ANODE.x + ANODE.w / 2, ANODE.y - 14);
    }
  }

  function drawLegend() {
    const y = BEAKER.y + BEAKER.h + 22;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Cu²⁺
    ctx.fillStyle = COLORS.cuIon;
    ctx.beginPath(); ctx.arc(BEAKER.x + 14, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Cu²⁺ (blue)', BEAKER.x + 26, y);

    // SO₄²⁻
    ctx.fillStyle = COLORS.so4Ion;
    ctx.beginPath(); ctx.arc(BEAKER.x + 160, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('SO₄²⁻ (orange)', BEAKER.x + 172, y);

    // Cu deposit
    ctx.fillStyle = COLORS.copper;
    ctx.beginPath(); ctx.arc(BEAKER.x + 320, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Cu metal', BEAKER.x + 332, y);

    // Bubble
    ctx.fillStyle = COLORS.bubble;
    ctx.beginPath(); ctx.arc(BEAKER.x + 440, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('O₂ gas', BEAKER.x + 452, y);
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    concValue.textContent = Math.round(concentration() * 100) + '%';
    concValue.style.color = concentration() > 0.5 ? '#60a5fa'
                          : concentration() > 0.1 ? '#94a3b8'
                          : '#64748b';
    depositValue.textContent = depositMass.toFixed(2) + ' g';
    timeValue.textContent = Math.round(elapsed) + ' s';
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (powered) {
      elapsed += dt;
      wirePulse = (wirePulse + dt * 0.9) % 1;
    }

    updateIons(dt);
    updateBubbles(dt);
    render();
    syncReadout();

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Power ──────────────────────────────────────────── */

  function setPower(on) {
    powered = on;
    powerBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    powerBtn.textContent = on ? '⏸ Switch off power' : '⚡ Switch on power';

    if (on) {
      if (!everPowered) everPowered = true;
      // When power comes on, nudge all ions gently in their drift direction
      for (const ion of ions) {
        if (ion.type === 'Cu') ion.vx -= 20;
        else ion.vx += 20;
      }
    }
  }

  powerBtn.addEventListener('click', () => setPower(!powered));

  /* ── Reset ──────────────────────────────────────────── */

  function reset() {
    ions = [];
    bubbles = [];
    depositLumps = [];
    cuRemaining = INITIAL_CU;
    depositMass = 0;
    elapsed = 0;
    wirePulse = 0;
    everPowered = false;
    powered = false;
    powerBtn.setAttribute('aria-pressed', 'false');
    powerBtn.textContent = '⚡ Switch on power';
    helpEl.hidden = true;
    insightEl.hidden = true;

    for (let i = 0; i < INITIAL_CU; i++) ions.push(spawnIon('Cu'));
    for (let i = 0; i < INITIAL_SO4; i++) ions.push(spawnIon('SO4'));

    render();
    syncReadout();
  }

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);
  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Insight trigger ───────────────────────────────── */

  function checkInsight() {
    // Show insight once enough copper has deposited
    if (depositMass >= 0.30 && insightEl.hidden) {
      insightEl.hidden = false;
    }
  }

  /* ── Init ───────────────────────────────────────────── */

  reset();
  start();

  // Attach insight check to loop
  const origTick = tick;
  window.addEventListener('load', () => {
    // Patch: call checkInsight each frame
    const wrappedTick = function(now) {
      origTick(now);
      checkInsight();
    };
    // We can't easily re-wrap; instead use an interval-ish approach in tick above.
    // Simpler: run checkInsight on a small setInterval that self-clears when done.
  });

  // Simple approach: run checkInsight every 500 ms
  setInterval(checkInsight, 500);

})();
