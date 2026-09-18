(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 520;

  const CHAMBERS = {
    RA: { x: 180, y: 140, w: 200, h: 100, tint: '#60a5fa', label: 'Right atrium',    side: 'left'  },
    RV: { x: 180, y: 280, w: 200, h: 150, tint: '#60a5fa', label: 'Right ventricle', side: 'left',  thick: true },
    LA: { x: 520, y: 140, w: 200, h: 100, tint: '#ef4444', label: 'Left atrium',     side: 'right' },
    LV: { x: 520, y: 280, w: 200, h: 150, tint: '#ef4444', label: 'Left ventricle',  side: 'right', thick: true }
  };

  const SEPTUM = { x: 400, y: 130, w: 100, h: 320 };

  const VALVE_Y = 260;   // between atria and ventricles

  /* ── Path definitions ───────────────────────────────── */

  const PATH_BLUE = [
    { x: 280, y: 20 },
    { x: 280, y: 140 },
    { x: 280, y: 240 },
    { x: 280, y: 280 },
    { x: 280, y: 430 },
    { x: 280, y: 500 }
  ];

  const PATH_RED = [
    { x: 620, y: 20 },
    { x: 620, y: 140 },
    { x: 620, y: 240 },
    { x: 620, y: 280 },
    { x: 620, y: 430 },
    { x: 620, y: 500 }
  ];

  function pathLength(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return total;
  }

  function pointOnPath(path, progress) {
    // progress in [0, 1]. Returns {x, y} on the polyline.
    const total = pathLength(path);
    let target = progress * total;

    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      if (target <= seg) {
        const t = target / seg;
        return {
          x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
          y: path[i - 1].y + (path[i].y - path[i - 1].y) * t
        };
      }
      target -= seg;
    }
    return { x: path[path.length - 1].x, y: path[path.length - 1].y };
  }

  /* ── DOM ────────────────────────────────────────────── */

  const canvas      = document.getElementById('stage');
  const ctx         = canvas.getContext('2d');
  const bpmSlider   = document.getElementById('bpm');
  const bpmValue    = document.getElementById('bpmValue');
  const labelsBtn   = document.getElementById('labelsBtn');
  const pauseBtn    = document.getElementById('pauseBtn');
  const phaseValue  = document.getElementById('phaseValue');
  const beatValue   = document.getElementById('beatValue');
  const flowValue   = document.getElementById('flowValue');
  const helpEl      = document.getElementById('help');
  const insightEl   = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  const NUM_PARTICLES = 14;

  let blueParticles = [];
  let redParticles = [];
  let phase = 0;                 // 0-1, cycles with each beat
  let paused = false;
  let labelsOn = true;
  let rafId = null;
  let lastTime = 0;
  let changeCount = 0;

  function initParticles() {
    blueParticles = [];
    redParticles = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      blueParticles.push({ progress: i / NUM_PARTICLES });
      redParticles.push({ progress: i / NUM_PARTICLES });
    }
  }

  /* ── Update ─────────────────────────────────────────── */

  function update(dt) {
    const bpm = bpmSlider.valueAsNumber;
    const beatDuration = 60 / bpm;

    if (!paused) {
      phase += dt / beatDuration;
      phase %= 1;

      // Systole intensity: peak during first half of beat
      const systole = Math.max(0, Math.sin(phase * Math.PI * 2));

      // Speed: base + systolic surge
      const baseSpeed = (bpm / 70) * 0.20;   // progress per second at 70 BPM
      const surge = 1 + systole * 1.2;
      const speed = baseSpeed * surge;

      for (const p of blueParticles) {
        p.progress += speed * dt;
        if (p.progress > 1) p.progress -= 1;
      }
      for (const p of redParticles) {
        p.progress += speed * dt;
        if (p.progress > 1) p.progress -= 1;
      }
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);

    drawVessels();
    drawSeptum();
    drawChambers();
    drawValves();
    drawParticles();
    if (labelsOn) drawLabels();
    drawLegend();
  }

  function drawVessels() {
    // Vena cava (blue, top-left)
    drawVessel(280, 40, 280, 140, '#60a5fa', 'deoxygenated');

    // Pulmonary vein (red, top-right)
    drawVessel(620, 40, 620, 140, '#ef4444', 'oxygenated');

    // Pulmonary artery (blue, bottom-left)
    drawVessel(280, 430, 280, 500, '#60a5fa', 'deoxygenated');

    // Aorta (red, bottom-right)
    drawVessel(620, 430, 620, 500, '#ef4444', 'oxygenated');
  }

  function drawVessel(x1, y1, x2, y2, color, type) {
    // Outer grey pipe
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 26;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Coloured interior
    ctx.strokeStyle = hexAlpha(color, 0.35);
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Thin centre line for direction
    ctx.strokeStyle = hexAlpha(color, 0.5);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSeptum() {
    // Muscular wall between left and right sides
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(SEPTUM.x, SEPTUM.y, SEPTUM.w, SEPTUM.h);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(SEPTUM.x, SEPTUM.y, SEPTUM.w, SEPTUM.h);

    // Diagonal hatch to indicate muscle
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < SEPTUM.h + SEPTUM.w; i += 12) {
      ctx.beginPath();
      ctx.moveTo(SEPTUM.x + Math.max(0, i - SEPTUM.h), SEPTUM.y + Math.min(i, SEPTUM.h));
      ctx.lineTo(SEPTUM.x + Math.min(i, SEPTUM.w), SEPTUM.y + Math.max(0, i - SEPTUM.w));
      ctx.stroke();
    }
  }

  function drawChambers() {
    const systole = Math.max(0, Math.sin(phase * Math.PI * 2));
    const contraction = systole * 0.04;

    for (const key of Object.keys(CHAMBERS)) {
      const c = CHAMBERS[key];
      const shrinkW = c.w * contraction;
      const shrinkH = c.h * contraction;
      const x = c.x + shrinkW / 2;
      const y = c.y + shrinkH / 2;
      const w = c.w - shrinkW;
      const h = c.h - shrinkH;

      // Chamber fill — tinted by blood type
      ctx.fillStyle = hexAlpha(c.tint, 0.14);
      roundRect(x, y, w, h, 12);
      ctx.fill();

      // Outline
      ctx.strokeStyle = hexAlpha(c.tint, 0.75);
      ctx.lineWidth = 3;
      if (c.thick) ctx.lineWidth = 5;   // ventricles have thicker walls
      roundRect(x, y, w, h, 12);
      ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawValves() {
    const systole = Math.max(0, Math.sin(phase * Math.PI * 2));
    // Valves are more open during diastole, closed during systole
    const openness = 1 - systole;

    // Atrioventricular valves (between atria and ventricles) at y=260
    drawValve(280, VALVE_Y, openness, '#60a5fa');
    drawValve(620, VALVE_Y, openness, '#ef4444');

    // Semilunar valves (between ventricles and arteries) at y=425
    drawValve(280, 425, 1 - openness, '#60a5fa');
    drawValve(620, 425, 1 - openness, '#ef4444');
  }

  function drawValve(x, y, openAmount, color) {
    // Two small triangles forming a "leaflet"
    const halfWidth = 20;
    const angle = openAmount * 0.8;    // radians, 0 = closed (flat), 0.8 = open

    const flapSize = 14;
    const spread = Math.sin(angle) * flapSize;

    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = hexAlpha(color, 0.9);
    ctx.lineWidth = 1.5;

    // Left leaflet
    ctx.beginPath();
    ctx.moveTo(x - halfWidth, y);
    ctx.lineTo(x, y + spread * 0.4);
    ctx.lineTo(x, y - flapSize * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right leaflet
    ctx.beginPath();
    ctx.moveTo(x + halfWidth, y);
    ctx.lineTo(x, y + spread * 0.4);
    ctx.lineTo(x, y - flapSize * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawParticles() {
    const r = 5;

    for (const p of blueParticles) {
      const pt = pointOnPath(PATH_BLUE, p.progress);
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(11,18,32,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const p of redParticles) {
      const pt = pointOnPath(PATH_RED, p.progress);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(11,18,32,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawLabels() {
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Chamber labels
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('RIGHT ATRIUM', 280, 190);
    ctx.fillText('RIGHT VENTRICLE', 280, 355);

    ctx.fillStyle = '#ef4444';
    ctx.fillText('LEFT ATRIUM', 620, 190);
    ctx.fillText('LEFT VENTRICLE', 620, 355);

    // Septum label
    ctx.fillStyle = '#94a3b8';
    ctx.save();
    ctx.translate(450, 290);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('SEPTUM', 0, 0);
    ctx.restore();

    // Vessel labels
    ctx.fillStyle = '#60a5fa';
    ctx.textAlign = 'left';
    ctx.fillText('← Vena cava', 300, 90);
    ctx.fillText('→ to LUNGS', 300, 475);

    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'right';
    ctx.fillText('Pulmonary vein →', 600, 90);
    ctx.fillText('to BODY ←', 600, 475);
  }

  function drawLegend() {
    const y = 30;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath(); ctx.arc(40, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('deoxygenated (from body)', 54, y);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(280, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('oxygenated (from lungs)', 294, y);
  }

  function hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const bpm = bpmSlider.valueAsNumber;
    bpmValue.textContent = bpm + ' BPM';

    const beatDuration = 60 / bpm;
    beatValue.textContent = beatDuration.toFixed(2) + ' s';

    // Phase label: systole = first half of the beat
    const systole = Math.max(0, Math.sin(phase * Math.PI * 2));
    if (paused) {
      phaseValue.textContent = 'Paused';
      phaseValue.style.color = '#94a3b8';
    } else if (systole > 0.5) {
      phaseValue.textContent = 'Systole';
      phaseValue.style.color = '#ef4444';
    } else {
      phaseValue.textContent = 'Diastole';
      phaseValue.style.color = '#10b981';
    }

    // "Blood to body" — just a number that matches BPM as a "flow rate"
    flowValue.textContent = Math.round((bpm / 70) * 100) + '%';
    flowValue.style.color = bpm > 120 ? '#ef4444'
                          : bpm < 55 ? '#60a5fa'
                          : '#10b981';
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);
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

  bpmSlider.addEventListener('input', () => {
    changeCount++;
    if (changeCount >= 3) insightEl.hidden = false;
  });

  labelsBtn.addEventListener('click', () => {
    labelsOn = !labelsOn;
    labelsBtn.setAttribute('aria-pressed', labelsOn ? 'true' : 'false');
    labelsBtn.textContent = labelsOn ? '🏷 Labels on' : '🏷 Labels off';
  });

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.textContent = paused ? '▶ Play' : '⏸ Pause';
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    bpmSlider.value = 70;
    paused = false;
    labelsOn = true;
    pauseBtn.setAttribute('aria-pressed', 'false');
    pauseBtn.textContent = '⏸ Pause';
    labelsBtn.setAttribute('aria-pressed', 'true');
    labelsBtn.textContent = '🏷 Labels on';
    phase = 0;
    changeCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    initParticles();
    syncReadout();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  initParticles();
  syncReadout();
  start();

})();
