(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 520;
  const CELL_CX = W / 2;
  const CELL_CY = H / 2 + 10;
  const CELL_RX = 200;                 // horizontal radius at rest
  const CELL_RY = 200;                 // vertical radius

  /* ── Chromosome data ───────────────────────────────── */

  // 4 chromosomes: two large (blue), two small (green)
  const CHROMOSOMES = [
    { color: '#60a5fa', size: 1.15 },
    { color: '#60a5fa', size: 1.15 },
    { color: '#34d399', size: 0.85 },
    { color: '#34d399', size: 0.85 }
  ];

  /* ── Stage definitions ──────────────────────────────── */
  // Each stage describes:
  //   - name, description
  //   - envelopeOpacity: 0 → 1 (nuclear membrane)
  //   - spindleOpacity: 0 → 1 (spindle fibres from poles)
  //   - condensed: 0 → 1 (chromosomes visible & thick)
  //   - split: 0 → 1 (chromatids separated to opposite poles)
  //   - elongation: 0 → 1 (cell stretching vertically)
  //   - pinch: 0 → 1 (cell membrane pinching inward at middle)
  //   - chrom positions: for each of 4 chromosomes,
  //     `joined` (both chromatids in the X shape)
  //     `top` (upper chromatid position after split)
  //     `bottom` (lower chromatid position after split)
  //   - nucleusCentre: {x, y} where the nucleus is drawn

  const FRAMES = [
    {
      name: 'Interphase',
      description: 'Cell grows and copies its DNA',
      envelopeOpacity: 1,
      spindleOpacity: 0,
      condensed: 0.05,
      split: 0,
      elongation: 0,
      pinch: 0,
      nucleusCentre: { x: CELL_CX, y: CELL_CY },
      chromosomes: [
        { joined: { x: CELL_CX - 50, y: CELL_CY - 20 } },
        { joined: { x: CELL_CX + 40, y: CELL_CY + 10 } },
        { joined: { x: CELL_CX - 30, y: CELL_CY + 40 } },
        { joined: { x: CELL_CX + 60, y: CELL_CY - 30 } }
      ]
    },
    {
      name: 'Prophase',
      description: 'Chromosomes become visible; nuclear envelope breaks down',
      envelopeOpacity: 0.35,
      spindleOpacity: 0,
      condensed: 1,
      split: 0,
      elongation: 0,
      pinch: 0,
      nucleusCentre: { x: CELL_CX, y: CELL_CY },
      chromosomes: [
        { joined: { x: CELL_CX - 100, y: CELL_CY - 80 }, angle: -0.4 },
        { joined: { x: CELL_CX + 90,  y: CELL_CY - 70 }, angle: 0.3 },
        { joined: { x: CELL_CX - 80,  y: CELL_CY + 80 }, angle: 0.5 },
        { joined: { x: CELL_CX + 100, y: CELL_CY + 70 }, angle: -0.2 }
      ]
    },
    {
      name: 'Metaphase',
      description: 'Chromosomes line up along the equator',
      envelopeOpacity: 0,
      spindleOpacity: 1,
      condensed: 1,
      split: 0,
      elongation: 0,
      pinch: 0,
      nucleusCentre: null,
      chromosomes: [
        { joined: { x: CELL_CX - 120, y: CELL_CY }, angle: 0 },
        { joined: { x: CELL_CX - 40,  y: CELL_CY }, angle: 0 },
        { joined: { x: CELL_CX + 40,  y: CELL_CY }, angle: 0 },
        { joined: { x: CELL_CX + 120, y: CELL_CY }, angle: 0 }
      ]
    },
    {
      name: 'Anaphase',
      description: 'Chromatids pull apart to opposite poles',
      envelopeOpacity: 0,
      spindleOpacity: 1,
      condensed: 1,
      split: 1,
      elongation: 0.4,
      pinch: 0.15,
      nucleusCentre: null,
      chromosomes: [
        { joined: { x: CELL_CX - 120, y: CELL_CY }, top: { x: CELL_CX - 100, y: CELL_CY - 130 }, bottom: { x: CELL_CX - 100, y: CELL_CY + 130 } },
        { joined: { x: CELL_CX - 40,  y: CELL_CY }, top: { x: CELL_CX - 30,  y: CELL_CY - 140 }, bottom: { x: CELL_CX - 30,  y: CELL_CY + 140 } },
        { joined: { x: CELL_CX + 40,  y: CELL_CY }, top: { x: CELL_CX + 30,  y: CELL_CY - 140 }, bottom: { x: CELL_CX + 30,  y: CELL_CY + 140 } },
        { joined: { x: CELL_CX + 120, y: CELL_CY }, top: { x: CELL_CX + 100, y: CELL_CY - 130 }, bottom: { x: CELL_CX + 100, y: CELL_CY + 130 } }
      ]
    },
    {
      name: 'Telophase',
      description: 'Two new nuclei form around the two sets of chromosomes',
      envelopeOpacity: 1,
      spindleOpacity: 0.2,
      condensed: 0.7,
      split: 1,
      elongation: 0.6,
      pinch: 0.55,
      nucleusCentreTop: { x: CELL_CX, y: CELL_CY - 130 },
      nucleusCentreBottom: { x: CELL_CX, y: CELL_CY + 130 },
      chromosomes: [
        { joined: { x: CELL_CX - 120, y: CELL_CY }, top: { x: CELL_CX - 70, y: CELL_CY - 110 }, bottom: { x: CELL_CX - 70, y: CELL_CY + 110 } },
        { joined: { x: CELL_CX - 40,  y: CELL_CY }, top: { x: CELL_CX - 20, y: CELL_CY - 130 }, bottom: { x: CELL_CX - 20, y: CELL_CY + 130 } },
        { joined: { x: CELL_CX + 40,  y: CELL_CY }, top: { x: CELL_CX + 20, y: CELL_CY - 130 }, bottom: { x: CELL_CX + 20, y: CELL_CY + 130 } },
        { joined: { x: CELL_CX + 120, y: CELL_CY }, top: { x: CELL_CX + 70, y: CELL_CY - 110 }, bottom: { x: CELL_CX + 70, y: CELL_CY + 110 } }
      ]
    },
    {
      name: 'Cytokinesis',
      description: 'Two identical daughter cells — each with 4 chromosomes',
      envelopeOpacity: 1,
      spindleOpacity: 0,
      condensed: 0.15,
      split: 1,
      elongation: 0.8,
      pinch: 1,
      nucleusCentreTop: { x: CELL_CX, y: CELL_CY - 140 },
      nucleusCentreBottom: { x: CELL_CX, y: CELL_CY + 140 },
      chromosomes: [
        { joined: { x: CELL_CX - 120, y: CELL_CY }, top: { x: CELL_CX - 60, y: CELL_CY - 120 }, bottom: { x: CELL_CX - 60, y: CELL_CY + 120 } },
        { joined: { x: CELL_CX - 40,  y: CELL_CY }, top: { x: CELL_CX - 20, y: CELL_CY - 140 }, bottom: { x: CELL_CX - 20, y: CELL_CY + 140 } },
        { joined: { x: CELL_CX + 40,  y: CELL_CY }, top: { x: CELL_CX + 20, y: CELL_CY - 140 }, bottom: { x: CELL_CX + 20, y: CELL_CY + 140 } },
        { joined: { x: CELL_CX + 120, y: CELL_CY }, top: { x: CELL_CX + 60, y: CELL_CY - 120 }, bottom: { x: CELL_CX + 60, y: CELL_CY + 120 } }
      ]
    }
  ];

  /* ── DOM ────────────────────────────────────────────── */

  const canvas     = document.getElementById('stage');
  const ctx        = canvas.getContext('2d');
  const prevBtn    = document.getElementById('prevBtn');
  const playBtn    = document.getElementById('playBtn');
  const nextBtn    = document.getElementById('nextBtn');
  const stageDots  = document.getElementById('stageDots');
  const stageName  = document.getElementById('stageName');
  const stageDesc  = document.getElementById('stageDesc');
  const chromValue = document.getElementById('chromValue');
  const helpEl     = document.getElementById('help');
  const insightEl  = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let currentStage = 0;
  let displayedParams = snapshotOf(FRAMES[0]);
  let targetParams = snapshotOf(FRAMES[0]);

  let playing = false;
  let playTimer = 0;
  let rafId = null;
  let lastTime = 0;

  function snapshotOf(frame) {
    // Deep-ish copy of the numeric parameters we interpolate.
    return {
      envelopeOpacity: frame.envelopeOpacity,
      spindleOpacity: frame.spindleOpacity,
      condensed: frame.condensed,
      split: frame.split,
      elongation: frame.elongation,
      pinch: frame.pinch,
      chromosomes: frame.chromosomes.map(c => ({
        joined: { ...c.joined },
        top: c.top ? { ...c.top } : { ...c.joined },
        bottom: c.bottom ? { ...c.bottom } : { ...c.joined },
        angle: c.angle || 0
      })),
      nucleusTop: frame.nucleusCentreTop ? { ...frame.nucleusCentreTop } : null,
      nucleusBottom: frame.nucleusCentreBottom ? { ...frame.nucleusCentreBottom } : null,
      nucleusCentre: frame.nucleusCentre ? { ...frame.nucleusCentre } : null
    };
  }

  /* ── Stage dots ─────────────────────────────────────── */

  function buildDots() {
    stageDots.innerHTML = '';
    FRAMES.forEach((frame, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ev-dot';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', i === currentStage ? 'true' : 'false');
      btn.textContent = (i + 1) + '. ' + frame.name;
      btn.addEventListener('click', () => goToStage(i));
      stageDots.appendChild(btn);
    });
  }

  function updateDots() {
    Array.from(stageDots.children).forEach((dot, i) => {
      dot.setAttribute('aria-selected', i === currentStage ? 'true' : 'false');
    });
  }

  /* ── Navigation ─────────────────────────────────────── */

  function goToStage(i) {
    currentStage = Math.max(0, Math.min(FRAMES.length - 1, i));
    targetParams = snapshotOf(FRAMES[currentStage]);
    updateDots();
    syncReadout();

    if (currentStage === FRAMES.length - 1) insightEl.hidden = false;
  }

  prevBtn.addEventListener('click', () => {
    if (playing) stopPlay();
    goToStage(currentStage - 1);
  });

  nextBtn.addEventListener('click', () => {
    if (playing) stopPlay();
    goToStage(currentStage + 1);
  });

  /* ── Play ───────────────────────────────────────────── */

  function startPlay() {
    playing = true;
    playBtn.textContent = '⏸ Pause';
    playTimer = 0;
    if (currentStage >= FRAMES.length - 1) goToStage(0);
  }

  function stopPlay() {
    playing = false;
    playBtn.textContent = '▶ Play';
  }

  playBtn.addEventListener('click', () => {
    if (playing) stopPlay();
    else startPlay();
  });

  /* ── Interpolation ──────────────────────────────────── */

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpPt(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }

  function advanceToward(dt) {
    const k = Math.min(1, dt * 3.2);   // ~300 ms smoothing

    displayedParams.envelopeOpacity = lerp(displayedParams.envelopeOpacity, targetParams.envelopeOpacity, k);
    displayedParams.spindleOpacity  = lerp(displayedParams.spindleOpacity,  targetParams.spindleOpacity,  k);
    displayedParams.condensed       = lerp(displayedParams.condensed,       targetParams.condensed,       k);
    displayedParams.split           = lerp(displayedParams.split,           targetParams.split,           k);
    displayedParams.elongation      = lerp(displayedParams.elongation,      targetParams.elongation,      k);
    displayedParams.pinch           = lerp(displayedParams.pinch,           targetParams.pinch,           k);

    displayedParams.chromosomes.forEach((c, i) => {
      const t = targetParams.chromosomes[i];
      c.joined = lerpPt(c.joined, t.joined, k);
      c.top    = lerpPt(c.top,    t.top,    k);
      c.bottom = lerpPt(c.bottom, t.bottom, k);
      c.angle  = lerp(c.angle, t.angle, k);
    });

    if (displayedParams.nucleusCentre && targetParams.nucleusCentre) {
      displayedParams.nucleusCentre = lerpPt(displayedParams.nucleusCentre, targetParams.nucleusCentre, k);
    } else if (targetParams.nucleusCentre) {
      displayedParams.nucleusCentre = { ...targetParams.nucleusCentre };
    }

    if (displayedParams.nucleusTop && targetParams.nucleusTop) {
      displayedParams.nucleusTop = lerpPt(displayedParams.nucleusTop, targetParams.nucleusTop, k);
    } else if (targetParams.nucleusTop) {
      displayedParams.nucleusTop = { ...targetParams.nucleusTop };
    }

    if (displayedParams.nucleusBottom && targetParams.nucleusBottom) {
      displayedParams.nucleusBottom = lerpPt(displayedParams.nucleusBottom, targetParams.nucleusBottom, k);
    } else if (targetParams.nucleusBottom) {
      displayedParams.nucleusBottom = { ...targetParams.nucleusBottom };
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawCellMembrane();
    drawNucleus();
    drawSpindle();
    drawChromosomes();
    drawStageTitle();
    drawLegend();
  }

  function drawCellMembrane() {
    const p = displayedParams;
    const elongation = p.elongation;
    const pinching = p.pinch;

    // Vertical stretch as the cell elongates
    const rx = CELL_RX * (1 - elongation * 0.15);
    const ry = CELL_RY * (1 + elongation * 0.25);

    // Mid-point horizontal radius — shrinks as pinch increases
    const midRx = rx * (1 - pinching * 0.88);

    ctx.beginPath();
    ctx.moveTo(CELL_CX, CELL_CY - ry);
    ctx.bezierCurveTo(
      CELL_CX + rx, CELL_CY - ry,
      CELL_CX + rx, CELL_CY - ry * 0.3,
      CELL_CX + midRx, CELL_CY
    );
    ctx.bezierCurveTo(
      CELL_CX + rx, CELL_CY + ry * 0.3,
      CELL_CX + rx, CELL_CY + ry,
      CELL_CX, CELL_CY + ry
    );
    ctx.bezierCurveTo(
      CELL_CX - rx, CELL_CY + ry,
      CELL_CX - rx, CELL_CY + ry * 0.3,
      CELL_CX - midRx, CELL_CY
    );
    ctx.bezierCurveTo(
      CELL_CX - rx, CELL_CY - ry * 0.3,
      CELL_CX - rx, CELL_CY - ry,
      CELL_CX, CELL_CY - ry
    );
    ctx.closePath();

    // Fill
    ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
    ctx.fill();

    // Membrane outline
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawNucleus() {
    const p = displayedParams;
    if (p.envelopeOpacity < 0.02) return;

    ctx.globalAlpha = p.envelopeOpacity;
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2.5;

    if (p.nucleusCentre) {
      ctx.beginPath();
      ctx.arc(p.nucleusCentre.x, p.nucleusCentre.y, 110, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(167,139,250,0.06)';
      ctx.fill();
    }

    if (p.nucleusTop && p.nucleusBottom) {
      ctx.beginPath();
      ctx.arc(p.nucleusTop.x, p.nucleusTop.y, 95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(167,139,250,0.06)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.nucleusBottom.x, p.nucleusBottom.y, 95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function drawSpindle() {
    const p = displayedParams;
    if (p.spindleOpacity < 0.02) return;

    ctx.globalAlpha = p.spindleOpacity;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 1.5;

    const poleTop = { x: CELL_CX, y: CELL_CY - 160 };
    const poleBottom = { x: CELL_CX, y: CELL_CY + 160 };

    p.chromosomes.forEach((c) => {
      const mid = p.split < 0.5 ? c.joined : c.top;
      ctx.beginPath();
      ctx.moveTo(poleTop.x, poleTop.y);
      ctx.lineTo(mid.x, mid.y);
      ctx.stroke();

      const mid2 = p.split < 0.5 ? c.joined : c.bottom;
      ctx.beginPath();
      ctx.moveTo(poleBottom.x, poleBottom.y);
      ctx.lineTo(mid2.x, mid2.y);
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
  }

  function drawChromosomes() {
    const p = displayedParams;

    p.chromosomes.forEach((chrom, i) => {
      const meta = CHROMOSOMES[i];
      const size = meta.size;

      // When condensed low, draw as faint squiggles
      const alpha = 0.25 + p.condensed * 0.75;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = meta.color;
      ctx.lineCap = 'round';

      const lw = 4 + p.condensed * 5;

      // Upper chromatid
      const topPos = p.split < 0.001
        ? chrom.joined
        : lerpPt(chrom.joined, chrom.top, p.split);
      const bottomPos = p.split < 0.001
        ? chrom.joined
        : lerpPt(chrom.joined, chrom.bottom, p.split);

      // Angle: when joined, chromatids tilt to form the X. When split, become vertical.
      const joinedAngle = 0.5;
      const topAngle = lerp(chrom.angle + joinedAngle, 0, p.split);
      const bottomAngle = lerp(chrom.angle - joinedAngle, 0, p.split);

      drawChromatid(topPos.x, topPos.y, topAngle, size, lw);
      drawChromatid(bottomPos.x, bottomPos.y, bottomAngle, size, lw);

      // Centromere dot when joined
      if (p.split < 0.3) {
        ctx.globalAlpha = alpha * (1 - p.split / 0.3);
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(chrom.joined.x, chrom.joined.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    });
  }

  function drawChromatid(x, y, angle, size, lineWidth) {
    const length = 30 * size;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(0, -length);
    ctx.lineTo(0, length);
    ctx.stroke();
    ctx.restore();
  }

  function drawStageTitle() {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText((currentStage + 1) + '. ' + FRAMES[currentStage].name, 30, 26);
  }

  function drawLegend() {
    const x = W - 30;
    let y = 40;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    CHROMOSOMES.forEach((c, i) => {
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(x - 130, y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText('chromosome ' + (i + 1), x, y);
      y += 18;
    });
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    advanceToward(dt);

    if (playing) {
      playTimer += dt;
      if (playTimer > 2.6) {
        playTimer = 0;
        if (currentStage < FRAMES.length - 1) {
          goToStage(currentStage + 1);
        } else {
          stopPlay();
        }
      }
    }

    render();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    stageName.textContent = FRAMES[currentStage].name;
    stageDesc.textContent = FRAMES[currentStage].description;
    chromValue.textContent = currentStage >= 4 ? '8' : '4';
  }

  /* ── Reset ──────────────────────────────────────────── */

  function reset() {
    stopPlay();
    currentStage = 0;
    displayedParams = snapshotOf(FRAMES[0]);
    targetParams = snapshotOf(FRAMES[0]);
    helpEl.hidden = true;
    insightEl.hidden = true;
    updateDots();
    syncReadout();
  }

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);
  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  buildDots();
  syncReadout();
  start();

})();
