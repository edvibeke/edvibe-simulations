(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 520;

  // Atom centres in the "atomic" phase
  const NA_HOME = { x: 220, y: 260 };
  const CL_HOME = { x: 680, y: 260 };

  // Atom centres in the "bonded" phase (pulled together)
  const NA_BOND = { x: 340, y: 260 };
  const CL_BOND = { x: 560, y: 260 };

  // Shell radii
  const R_SHELL_1 = 42;
  const R_SHELL_2 = 78;
  const R_SHELL_3 = 114;
  const NUCLEUS_R = 24;
  const ELECTRON_R = 7;

  // Where the gap is on Cl's outer shell (angle π = left side)
  const CL_GAP_ANGLE = Math.PI;

  const DROP_RADIUS = 55;

  /* ── Colours ────────────────────────────────────────── */

  const COLORS = {
    metal:      '#60a5fa',
    metalDim:   '#3b82f6',
    nonMetal:   '#34d399',
    nonMetalDim:'#10b981',
    electron:   '#facc15',
    nucleus:    '#1e293b',
    shell:      '#334155',
    targetZone: 'rgba(250,204,21,0.35)'
  };

  /* ── DOM ────────────────────────────────────────────── */

  const canvas      = document.getElementById('stage');
  const ctx         = canvas.getContext('2d');
  const naValue     = document.getElementById('naValue');
  const clValue     = document.getElementById('clValue');
  const statusValue = document.getElementById('statusValue');
  const stepBtn     = document.getElementById('stepBtn');
  const helpEl      = document.getElementById('help');
  const insightEl   = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  // phase: 'atomic' | 'ionic' | 'bonded'
  let phase = 'atomic';

  // Draggable electron. When phase === 'atomic' it lives outside Na's outer shell.
  let electron = {
    x: NA_HOME.x + R_SHELL_3 + 18,
    y: NA_HOME.y,
    homeX: NA_HOME.x + R_SHELL_3 + 18,
    homeY: NA_HOME.y,
    dragging: false,
    offsetX: 0,
    offsetY: 0
  };

  let dragging = false;

  // Animation easing for the bonding phase
  let bondProgress = 0;        // 0 → 1
  let bonding = false;
  let rafId = null;
  let lastTime = 0;

  /* ── Electron layout on each shell ──────────────────── */

  // Returns array of positions in local coordinates (relative to atom centre)
  function shellPositions(count, radius, startAngle = -Math.PI / 2) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = startAngle + (i / count) * Math.PI * 2;
      out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius, angle: a });
    }
    return out;
  }

  // Positions on Cl's outer shell with one gap at CL_GAP_ANGLE
  function clOuterPositions() {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
      // Skip the slot nearest the gap angle
      const diff = Math.abs(((a - CL_GAP_ANGLE + Math.PI) % (2 * Math.PI)) - Math.PI);
      if (diff < 0.2) continue;
      out.push({ x: Math.cos(a) * R_SHELL_3, y: Math.sin(a) * R_SHELL_3 });
    }
    return out;
  }

  function clGapPosition() {
    const cx = phase === 'bonded' ? CL_BOND.x : CL_HOME.x;
    const cy = phase === 'bonded' ? CL_BOND.y : CL_HOME.y;
    return {
      x: cx + Math.cos(CL_GAP_ANGLE) * R_SHELL_3,
      y: cy + Math.sin(CL_GAP_ANGLE) * R_SHELL_3
    };
  }

  /* ── Phase transitions ──────────────────────────────── */

  function transferElectron() {
    phase = 'ionic';
    // Electron is now part of Cl — we no longer draw it as draggable.
    updateReadout();
    stepBtn.disabled = false;
    stepBtn.textContent = '▶ Bring ions together';
  }

  function startBonding() {
    if (phase !== 'ionic') return;
    phase = 'bonded';
    bonding = true;
    bondProgress = 0;
    stepBtn.disabled = true;
    stepBtn.textContent = '✓ Bond formed';
    updateReadout();
    insightEl.hidden = false;
    lastTime = performance.now();
    rafId = requestAnimationFrame(bondTick);
  }

  function bondTick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    bondProgress = Math.min(1, bondProgress + dt * 0.9);   // ~1.1 s

    if (bondProgress >= 1) {
      bonding = false;
      rafId = null;
      render();
      return;
    }

    render();
    rafId = requestAnimationFrame(bondTick);
  }

  /* ── Current positions ──────────────────────────────── */

  function currentPositions() {
    if (phase === 'bonded' || bonding) {
      const e = easeInOut(bondProgress);
      return {
        na: {
          x: NA_HOME.x + (NA_BOND.x - NA_HOME.x) * e,
          y: NA_HOME.y + (NA_BOND.y - NA_HOME.y) * e
        },
        cl: {
          x: CL_HOME.x + (CL_BOND.x - CL_HOME.x) * e,
          y: CL_HOME.y + (CL_BOND.y - CL_HOME.y) * e
        }
      };
    }
    return { na: { ...NA_HOME }, cl: { ...CL_HOME } };
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);

    const pos = currentPositions();

    // Draw each atom
    drawSodium(pos.na);
    drawChlorine(pos.cl, pos.na);

    // Draw bond label between them when bonded
    if (phase === 'bonded' && bondProgress > 0.85) {
      const midX = (pos.na.x + pos.cl.x) / 2;
      const midY = (pos.na.y + pos.cl.y) / 2;
      drawBondLabel(midX, midY);
    }

    // Draw the electron
    if (phase === 'atomic') {
      drawElectron();
    }

    // Labels above each atom
    drawAtomLabels(pos.na, pos.cl);
  }

  function drawSodium(pos) {
    drawAtomSkeleton(pos, COLORS.metal, isIon('na'));
    drawShell(pos, R_SHELL_1, 2);
    drawShell(pos, R_SHELL_2, 8);
    if (phase === 'atomic') {
      // The outer electron is drawn separately (draggable).
      // Draw nothing on shell 3 — it's the one being removed.
    } else {
      // Sodium has lost its outer electron — shell 3 is empty and hidden.
    }

    drawNucleus(pos, isIon('na') ? 'Na⁺' : 'Na', COLORS.metalDim);
  }

  function drawChlorine(pos, naPos) {
    drawAtomSkeleton(pos, COLORS.nonMetal, isIon('cl'));
    drawShell(pos, R_SHELL_1, 2);
    drawShell(pos, R_SHELL_2, 8);
    if (phase === 'atomic') {
      // 7 electrons + visible gap
      const positions = clOuterPositions();
      drawElectronsAt(pos, positions, COLORS.electron);
      drawTargetZone();
    } else {
      // Full shell of 8 electrons
      drawElectronsAt(pos, shellPositions(8, R_SHELL_3), COLORS.electron);
    }

    drawNucleus(pos, isIon('cl') ? 'Cl⁻' : 'Cl', COLORS.nonMetalDim);
  }

  function drawAtomSkeleton(pos, color, ion) {
    // Subtle glow for ions
    if (ion) {
      ctx.fillStyle = color + '22';   // ~13% alpha
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R_SHELL_3 + 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShell(center, radius, electronCount) {
    ctx.strokeStyle = COLORS.shell;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (electronCount > 0) {
      const positions = shellPositions(electronCount, radius);
      drawElectronsAt(center, positions, COLORS.electron);
    }
  }

  function drawElectronsAt(center, positions, color) {
    ctx.fillStyle = color;
    for (const p of positions) {
      ctx.beginPath();
      ctx.arc(center.x + p.x, center.y + p.y, ELECTRON_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawNucleus(center, label, color) {
    ctx.fillStyle = COLORS.nucleus;
    ctx.beginPath();
    ctx.arc(center.x, center.y, NUCLEUS_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, center.x, center.y + 1);
  }

  function drawTargetZone() {
    const gap = clGapPosition();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);

    ctx.strokeStyle = `rgba(250,204,21,${0.35 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(gap.x, gap.y, ELECTRON_R + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawElectron() {
    // Trail / glow
    ctx.fillStyle = 'rgba(250,204,21,0.25)';
    ctx.beginPath();
    ctx.arc(electron.x, electron.y, ELECTRON_R + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.electron;
    ctx.beginPath();
    ctx.arc(electron.x, electron.y, ELECTRON_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(11,18,32,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // "drag me" hint before first drag
    if (!electron.everDragged) {
      ctx.fillStyle = 'rgba(226,232,240,0.7)';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('drag me →', electron.x, electron.y - 20);
    }
  }

  function drawBondLabel(x, y) {
    const text = 'IONIC BOND';
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

  function drawAtomLabels(naPos, clPos) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText('SODIUM', naPos.x, naPos.y - R_SHELL_3 - 24);
    ctx.fillText('CHLORINE', clPos.x, clPos.y - R_SHELL_3 - 24);
  }

  function isIon(which) {
    if (phase === 'atomic') return false;
    return true;
  }

  /* ── Readout ────────────────────────────────────────── */

  function updateReadout() {
    if (phase === 'atomic') {
      naValue.textContent = 'Na';
      clValue.textContent = 'Cl';
      statusValue.textContent = 'Atoms';
      statusValue.style.color = '#e2e8f0';
      naValue.style.color = '#60a5fa';
      clValue.style.color = '#34d399';
    } else if (phase === 'ionic') {
      naValue.textContent = 'Na⁺';
      clValue.textContent = 'Cl⁻';
      statusValue.textContent = 'Ions';
      statusValue.style.color = '#facc15';
      naValue.style.color = '#93c5fd';
      clValue.style.color = '#6ee7b7';
    } else {
      naValue.textContent = 'Na⁺';
      clValue.textContent = 'Cl⁻';
      statusValue.textContent = 'Bonded';
      statusValue.style.color = '#10b981';
      naValue.style.color = '#93c5fd';
      clValue.style.color = '#6ee7b7';
    }
  }

  /* ── Pointer handling ───────────────────────────────── */

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (H / rect.height)
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (phase !== 'atomic') return;
    const p = canvasCoords(e);
    const d = Math.hypot(p.x - electron.x, p.y - electron.y);
    if (d <= ELECTRON_R + 16) {
      dragging = true;
      electron.dragging = true;
      electron.everDragged = true;
      canvas.setPointerCapture(e.pointerId);
      electron.offsetX = electron.x - p.x;
      electron.offsetY = electron.y - p.y;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = canvasCoords(e);
    electron.x = p.x + electron.offsetX;
    electron.y = p.y + electron.offsetY;
    render();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    electron.dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

    // Did it land near the target?
    const gap = clGapPosition();
    const d = Math.hypot(electron.x - gap.x, electron.y - gap.y);
    if (d <= DROP_RADIUS) {
      transferElectron();
    } else {
      // Snap back
      electron.x = electron.homeX;
      electron.y = electron.homeY;
    }
    render();
  });

  /* ── Buttons ────────────────────────────────────────── */

  stepBtn.addEventListener('click', () => {
    if (phase === 'ionic') startBonding();
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    phase = 'atomic';
    bonding = false;
    bondProgress = 0;
    electron = {
      x: NA_HOME.x + R_SHELL_3 + 18,
      y: NA_HOME.y,
      homeX: NA_HOME.x + R_SHELL_3 + 18,
      homeY: NA_HOME.y,
      dragging: false,
      offsetX: 0,
      offsetY: 0,
      everDragged: false
    };
    stepBtn.disabled = true;
    stepBtn.textContent = '▶ Continue';
    insightEl.hidden = true;
    helpEl.hidden = true;
    updateReadout();
    render();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Animated hint pulse ───────────────────────────── */

  function idlePulse() {
    if (phase === 'atomic' && !dragging) {
      render();
    }
    requestAnimationFrame(idlePulse);
  }

  /* ── Init ───────────────────────────────────────────── */

  updateReadout();
  render();
  idlePulse();

})();
