(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 520;

  const R_SHELL  = 50;
  const R_NUCLEUS = 24;
  const ELECTRON_R = 7;

  const MIN_DIST = 90;                 // closest allowed separation
  const MAX_DIST = 500;                // farthest allowed
  const BOND_START = 200;              // distance at which bonding starts
  const BOND_FULL  = 110;              // distance at which bond is fully formed

  /* ── Colours ────────────────────────────────────────── */

  const COLORS = {
    atom:     '#818cf8',
    atomDim:  '#4f46e5',
    electron: '#facc15',
    nucleus:  '#1e293b',
    shell:    '#475569',
    cloud:    'rgba(250,204,21,0.16)'
  };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas      = document.getElementById('stage');
  const ctx         = canvas.getContext('2d');
  const distValue   = document.getElementById('distValue');
  const leftValue   = document.getElementById('leftValue');
  const rightValue  = document.getElementById('rightValue');
  const statusValue = document.getElementById('statusValue');
  const helpEl      = document.getElementById('help');
  const insightEl   = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  // Left atom is fixed. Right atom is draggable.
  const LEFT = { x: 300, y: 260 };
  let right = { x: 620, y: 260 };

  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  let orbitAngle = 0;
  let lastTime = 0;
  let rafId = null;
  let everBonded = false;
  let bondFormed = false;         // current frame: is bond essentially complete?

  /* ── Geometry ───────────────────────────────────────── */

  function separation() {
    const dx = right.x - LEFT.x;
    const dy = right.y - LEFT.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function bondAmount() {
    const d = separation();
    if (d >= BOND_START) return 0;
    if (d <= BOND_FULL)  return 1;
    return (BOND_START - d) / (BOND_START - BOND_FULL);
  }

  function midpoint() {
    return { x: (LEFT.x + right.x) / 2, y: (LEFT.y + right.y) / 2 };
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    const b = bondAmount();
    const mid = midpoint();

    // Shared electron cloud — drawn behind the atoms
    if (b > 0.2) {
      drawSharedCloud(mid, b);
    }

    drawAtom(LEFT, 'H', b, false);
    drawAtom(right, 'H₂'.startsWith('H') ? 'H' : 'H', b, true);

    drawElectrons(b);

    // Bond label above the pair when nearly bonded
    if (b > 0.85) {
      drawBondLabel(mid.x, mid.y - R_SHELL - 40);
    }

    // Instruction hint on the first load
    if (!everBonded && !dragging) {
      drawDragHint();
    }
  }

  function drawAtom(pos, label, b, isDraggable) {
    // Outer shell — a thin circle; grows slightly and fades when bonded
    const shellAlpha = 1 - b * 0.55;
    ctx.strokeStyle = `rgba(71,85,105,${shellAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, R_SHELL, 0, Math.PI * 2);
    ctx.stroke();

    // Soft glow for draggable atom
    if (isDraggable && !dragging) {
      ctx.fillStyle = 'rgba(129,140,248,0.10)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R_SHELL + 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nucleus
    ctx.fillStyle = COLORS.nucleus;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, R_NUCLEUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.atom;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = COLORS.atom;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pos.x, pos.y + 1);
  }

  function drawElectrons(b) {
    const mid = midpoint();

    // Orbital positions when not bonded
    const orbit1 = {
      x: LEFT.x  + Math.cos(orbitAngle)        * R_SHELL,
      y: LEFT.y  + Math.sin(orbitAngle)        * R_SHELL
    };
    const orbit2 = {
      x: right.x + Math.cos(orbitAngle + Math.PI) * R_SHELL,
      y: right.y + Math.sin(orbitAngle + Math.PI) * R_SHELL
    };

    // Shared positions when bonded — sitting in the overlap region
    const bonded1 = { x: mid.x - 14, y: mid.y - 2 };
    const bonded2 = { x: mid.x + 14, y: mid.y - 2 };

    const e1 = {
      x: orbit1.x * (1 - b) + bonded1.x * b,
      y: orbit1.y * (1 - b) + bonded1.y * b
    };
    const e2 = {
      x: orbit2.x * (1 - b) + bonded2.x * b,
      y: orbit2.y * (1 - b) + bonded2.y * b
    };

    drawElectron(e1.x, e1.y);
    drawElectron(e2.x, e2.y);
  }

  function drawElectron(x, y) {
    // Glow
    ctx.fillStyle = 'rgba(250,204,21,0.28)';
    ctx.beginPath();
    ctx.arc(x, y, ELECTRON_R + 6, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = COLORS.electron;
    ctx.beginPath();
    ctx.arc(x, y, ELECTRON_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(11,18,32,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawSharedCloud(mid, b) {
    ctx.fillStyle = `rgba(250,204,21,${0.10 + b * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(mid.x, mid.y, 44 + b * 12, 28 + b * 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBondLabel(x, y) {
    const text = 'COVALENT BOND  ·  shared pair';
    ctx.font = '700 12px system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    const pad = 12;

    ctx.fillStyle = 'rgba(16,185,129,0.18)';
    ctx.fillRect(x - tw / 2 - pad, y - 14, tw + pad * 2, 28);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - tw / 2 - pad, y - 14, tw + pad * 2, 28);

    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  function drawDragHint() {
    ctx.fillStyle = 'rgba(226,232,240,0.65)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('← drag me', right.x, right.y + R_SHELL + 14);
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const b = bondAmount();
    const d = separation();
    distValue.textContent = Math.round(d) + ' px apart';

    if (b < 0.15) {
      leftValue.textContent  = 'H';
      rightValue.textContent = 'H';
      statusValue.textContent = 'Separate atoms';
      statusValue.style.color = '#e2e8f0';
    } else if (b < 0.85) {
      leftValue.textContent  = 'H';
      rightValue.textContent = 'H';
      statusValue.textContent = 'Bond forming…';
      statusValue.style.color = '#f59e0b';
    } else {
      leftValue.textContent  = 'H';
      rightValue.textContent = 'H';
      statusValue.textContent = 'H₂ molecule';
      statusValue.style.color = '#10b981';
    }
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Advance electron orbit while unbonded. The orbit visually slows
    // as the atoms approach — they "notice" each other.
    const b = bondAmount();
    orbitAngle += dt * (1.6 - b * 1.2);

    render();
    syncReadout();

    // Remember once the bond first forms, so we can show the insight.
    if (b > 0.85 && !bondFormed) {
      bondFormed = true;
      everBonded = true;
      insightEl.hidden = false;
    } else if (b < 0.4 && bondFormed) {
      bondFormed = false;   // bond broke
    }

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

  /* ── Pointer ────────────────────────────────────────── */

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (H / rect.height)
    };
  }

  function clampRight(x, y) {
    // Keep the right atom inside the canvas and enforce min/max separation
    let nx = Math.max(R_SHELL + 8, Math.min(W - R_SHELL - 8, x));
    let ny = Math.max(R_SHELL + 8, Math.min(H - R_SHELL - 8, y));

    // Enforce minimum distance from LEFT
    const dx = nx - LEFT.x;
    const dy = ny - LEFT.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < MIN_DIST) {
      const scale = MIN_DIST / (d || 1);
      nx = LEFT.x + dx * scale;
      ny = LEFT.y + dy * scale;
    } else if (d > MAX_DIST) {
      const scale = MAX_DIST / d;
      nx = LEFT.x + dx * scale;
      ny = LEFT.y + dy * scale;
    }
    return { x: nx, y: ny };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = canvasCoords(e);
    const d = Math.hypot(p.x - right.x, p.y - right.y);
    if (d <= R_SHELL + 6) {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      dragOffset.x = right.x - p.x;
      dragOffset.y = right.y - p.y;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = canvasCoords(e);
    const target = {
      x: p.x + dragOffset.x,
      y: p.y + dragOffset.y
    };
    right = clampRight(target.x, target.y);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  /* ── Reset ──────────────────────────────────────────── */

  function reset() {
    right = { x: 620, y: 260 };
    orbitAngle = 0;
    everBonded = false;
    bondFormed = false;
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
  }

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);
  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  syncReadout();
  render();
  start();

})();
