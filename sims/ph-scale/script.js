(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 520;

  const BEAKER = { x: 90, y: 90, w: 320, h: 350, wall: 4 };
  const LIQUID_Y = BEAKER.y + 70;             // top of liquid
  const LIQUID_H = BEAKER.h - 70;

  const SCALE = { x: 500, y: 200, w: 350, h: 44 };

  /* ── Universal indicator colour map ─────────────────── */

  const UI_COLORS = [
    [209, 10, 16],    // 0
    [230, 58, 30],    // 1
    [234, 85, 48],    // 2
    [242, 124, 42],   // 3
    [245, 166, 35],   // 4
    [247, 208, 56],   // 5
    [232, 216, 64],   // 6
    [76, 175, 80],    // 7
    [123, 198, 126],  // 8
    [79, 195, 247],   // 9
    [33, 150, 243],   // 10
    [21, 101, 192],   // 11
    [69, 39, 160],    // 12
    [103, 58, 183],   // 13
    [126, 87, 194]    // 14
  ];

  function colorForPH(ph) {
    const p = Math.max(0, Math.min(14, ph));
    const i0 = Math.floor(p);
    const i1 = Math.min(14, i0 + 1);
    const t = p - i0;
    const a = UI_COLORS[i0];
    const b = UI_COLORS[i1];
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

  /* ── DOM ────────────────────────────────────────────── */

  const canvas     = document.getElementById('stage');
  const ctx        = canvas.getContext('2d');
  const mixSlider  = document.getElementById('mix');
  const mixValue   = document.getElementById('mixValue');
  const phValue    = document.getElementById('phValue');
  const hValue     = document.getElementById('hValue');
  const kindValue  = document.getElementById('kindValue');
  const helpEl     = document.getElementById('help');
  const insightEl  = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let mix = 0;                                  // -100 (acid) → +100 (alkali)
  let displayedPH = 7;                          // smoothed for animation
  let bubbles = [];
  let lastSpawn = 0;
  let rafId = null;
  let lastTime = 0;
  let changeCount = 0;

  function targetPH() {
    // Linear map: -100 → 0, 0 → 7, +100 → 14
    return 7 + (mix / 100) * 7;
  }

  function hydrogenIonConcentration(ph) {
    return Math.pow(10, -ph);
  }

  function classification(ph) {
    if (ph < 1.5) return { text: 'Very strong acid', color: '#dc2626' };
    if (ph < 3)   return { text: 'Strong acid',      color: '#ef4444' };
    if (ph < 5)   return { text: 'Weak acid',        color: '#f97316' };
    if (ph < 6.5) return { text: 'Very weak acid',   color: '#f59e0b' };
    if (ph <= 7.5)return { text: 'Neutral',          color: '#10b981' };
    if (ph <= 9)  return { text: 'Very weak alkali', color: '#22d3ee' };
    if (ph <= 11) return { text: 'Weak alkali',      color: '#3b82f6' };
    if (ph <= 12.5) return { text: 'Strong alkali',  color: '#6366f1' };
    return           { text: 'Very strong alkali', color: '#8b5cf6' };
  }

  /* ── Bubbles ────────────────────────────────────────── */

  function spawnBubble() {
    const intensity = Math.abs(mix) / 100;
    if (intensity < 0.1) return;

    const x = BEAKER.x + BEAKER.wall + 30 + Math.random() * (BEAKER.w - BEAKER.wall * 2 - 60);
    const r = 3 + Math.random() * 6;
    bubbles.push({
      x, y: BEAKER.y + BEAKER.h - 30 - Math.random() * 60,
      r,
      vy: -(30 + intensity * 70 + Math.random() * 30),
      wobblePhase: Math.random() * Math.PI * 2,
      life: 0
    });
  }

  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y += b.vy * dt;
      b.life += dt;
      b.x += Math.sin(b.life * 4 + b.wobblePhase) * 20 * dt;

      // Pop when reaching the liquid surface
      if (b.y < LIQUID_Y + 8) {
        bubbles.splice(i, 1);
      }
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBeaker();
    drawBubbles();
    drawScale();
    drawScaleLabels();
    drawPHMarker();
  }

  function drawBeaker() {
    const b = BEAKER;
    const innerX = b.x + b.wall;
    const innerY = LIQUID_Y;
    const innerW = b.w - b.wall * 2;
    const innerH = LIQUID_H;

    // Beaker background (empty glass)
    ctx.fillStyle = 'rgba(148,163,184,0.06)';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Liquid — colour from current pH
    const liquidColor = colorForPH(displayedPH);
    ctx.fillStyle = rgb(liquidColor);
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Meniscus (slightly darker top edge)
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(innerX, innerY, innerW, 4);

    // Glass outline
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
    ctx.moveTo(b.x - 4, b.y);
    ctx.lineTo(b.x + b.w + 4, b.y);
    ctx.stroke();

    // Reflection highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(b.x + 8, b.y + 12, 12, b.h - 24);
  }

  function drawBubbles() {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const b of bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* ── pH scale ───────────────────────────────────────── */

  function drawScale() {
    const s = SCALE;
    const bands = 15;
    const bandW = s.w / bands;

    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = rgb(colorForPH(i));
      ctx.fillRect(s.x + i * bandW, s.y, bandW + 1, s.h);
    }

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  }

  function drawScaleLabels() {
    const s = SCALE;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Numbers 0-14
    const bands = 15;
    const bandW = s.w / bands;
    for (let i = 0; i < bands; i++) {
      ctx.fillText(i.toString(), s.x + bandW * (i + 0.5), s.y + s.h + 6);
    }

    // Category labels above
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'left';
    ctx.fillText('ACIDIC', s.x, s.y - 14);

    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'center';
    ctx.fillText('NEUTRAL', s.x + s.w / 2, s.y - 14);

    ctx.fillStyle = '#8b5cf6';
    ctx.textAlign = 'right';
    ctx.fillText('ALKALINE', s.x + s.w, s.y - 14);
  }

  function drawPHMarker() {
    const s = SCALE;
    const frac = displayedPH / 14;
    const x = s.x + frac * s.w;
    const y = s.y - 34;

    // Triangle pointer
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(x, s.y - 4);
    ctx.lineTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // pH text on the triangle
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayedPH.toFixed(1), x, y + 8);
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    const ph = displayedPH;
    const h = hydrogenIonConcentration(ph);
    const cls = classification(ph);

    // Slider label
    if (Math.abs(mix) < 3) {
      mixValue.textContent = 'Pure water';
    } else if (mix < 0) {
      mixValue.textContent = 'Acid added';
    } else {
      mixValue.textContent = 'Alkali added';
    }

    // pH value
    phValue.textContent = ph.toFixed(1);
    phValue.style.color = cls.color;

    // [H+] value — formatted in scientific notation
    const exp = Math.floor(Math.log10(h));
    const mantissa = h / Math.pow(10, exp);
    const expStr = exp < 0 ? '⁻' + toSuperscript(Math.abs(exp)) : toSuperscript(exp);
    hValue.textContent = `${mantissa.toFixed(1)} × 10${expStr}`;
    hValue.style.fontSize = '1.4rem';

    // Classification
    kindValue.textContent = cls.text;
    kindValue.style.color = cls.color;
  }

  function toSuperscript(n) {
    const map = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹' };
    return n.toString().split('').map(c => map[c] || c).join('');
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Smooth the pH toward its target (so slider jerks look nice)
    const target = targetPH();
    const diff = target - displayedPH;
    if (Math.abs(diff) > 0.01) {
      displayedPH += diff * Math.min(1, dt * 12);
    } else {
      displayedPH = target;
    }

    // Spawn bubbles occasionally while conditions are non-neutral
    if (Math.abs(mix) > 15 && now - lastSpawn > 180) {
      spawnBubble();
      lastSpawn = now;
    }

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

  /* ── Events ─────────────────────────────────────────── */

  mixSlider.addEventListener('input', () => {
    mix = parseFloat(mixSlider.value);
    changeCount++;
    if (changeCount >= 8) insightEl.hidden = false;
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    mixSlider.value = 0;
    mix = 0;
    displayedPH = 7;
    bubbles = [];
    changeCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    render();
    syncReadout();
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  mix = parseFloat(mixSlider.value);
  displayedPH = targetPH();
  syncReadout();
  render();
  start();

})();
