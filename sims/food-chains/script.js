(() => {
  'use strict';

  /* ── Layout ─────────────────────────────────────────── */

  const W = 900, H = 540;
  const CHAIN_Y = 130;                 // vertical centre of the food chain row
  const SLOT_W = 140;                  // width of each slot
  const SLOT_START_X = 40;

  const PYRAMID = { x: 560, y: 90, w: 320, h: 380 };
  const ENERGY_TOP = 1000;             // arbitrary units at the producer level

  /* ── Organisms ──────────────────────────────────────── */

  // Each organism: { id, name, icon, role, trophic }
  // trophic: 1 = producer, 2 = primary consumer, 3 = secondary, 4 = tertiary

  const ORGANISMS = [
    { id: 'grass',   name: 'Grass',   role: 'Producer',   trophic: 1 },
    { id: 'tree',    name: 'Tree',    role: 'Producer',   trophic: 1 },
    { id: 'rabbit',  name: 'Rabbit',  role: 'Herbivore',  trophic: 2 },
    { id: 'caterpillar', name: 'Caterpillar', role: 'Herbivore', trophic: 2 },
    { id: 'bird',    name: 'Bird',    role: 'Carnivore',  trophic: 3 },
    { id: 'frog',    name: 'Frog',    role: 'Carnivore',  trophic: 3 },
    { id: 'snake',   name: 'Snake',   role: 'Carnivore',  trophic: 4 },
    { id: 'fox',     name: 'Fox',     role: 'Top predator', trophic: 5 }
  ];

  // Vector artwork for each organism, used in both the picker and the canvas.
  const ICONS = {
    grass: '<svg viewBox="0 0 24 24"><g stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M5 17V8M12 17V5M19 17V8"/><path d="M3 18h18"/></g></svg>',
    tree: '<svg viewBox="0 0 24 24"><g fill="none" stroke="#15803d" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l6 6H6z"/><path d="M12 8l7 7H5z"/><path d="M12 14l4.5 4.5h-9z"/></g><path d="M12 19v2" stroke="#92400e" stroke-width="2" stroke-linecap="round"/></svg>',
    rabbit: '<svg viewBox="0 0 24 24"><g fill="none" stroke="#e2e8f0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="15" rx="6" ry="6.5"/><ellipse cx="8" cy="6" rx="1.8" ry="5"/><ellipse cx="16" cy="6" rx="1.8" ry="5"/></g><circle cx="9.5" cy="13.5" r="0.9" fill="#0f172a"/><circle cx="14.5" cy="13.5" r="0.9" fill="#0f172a"/></svg>',
    caterpillar: '<svg viewBox="0 0 24 24"><g fill="#a3e635" stroke="#4d7c0f" stroke-width="1.2"><circle cx="5" cy="17" r="3"/><circle cx="11" cy="16" r="3"/><circle cx="17" cy="17" r="3"/><circle cx="14" cy="9.5" r="3.5"/></g><path d="M12.5 7l-1-2M15 7l2-1.5" stroke="#4d7c0f" stroke-width="1.3" stroke-linecap="round"/><circle cx="11" cy="8.5" r="0.9" fill="#1e293b"/></svg>',
    bird: '<svg viewBox="0 0 24 24"><g fill="#38bdf8" stroke="#0369a1" stroke-width="1.4"><circle cx="9" cy="15" r="5.5"/><circle cx="13.5" cy="8" r="3.4"/></g><path d="M16.5 4.5l4-1.5-1.5 4z" fill="#fbbf24" stroke="#b45309" stroke-width="1"/><path d="M12.5 6.5c3 1 5 3 5.5 6" stroke="#0ea5e9" stroke-width="1.2" fill="none"/><circle cx="12.8" cy="7.4" r="0.8" fill="#0f172a"/></svg>',
    frog: '<svg viewBox="0 0 24 24"><path d="M5 14a7 7 0 0 1 14 0v1c0 2.5-1.5 4-3.5 4h-7C6.5 19 5 17.5 5 15z" fill="#4ade80" stroke="#16a34a" stroke-width="1.4"/><circle cx="9" cy="11.5" r="1.7" fill="#fff"/><circle cx="15" cy="11.5" r="1.7" fill="#fff"/><circle cx="9" cy="11.8" r="0.8" fill="#0f172a"/><circle cx="15" cy="11.8" r="0.8" fill="#0f172a"/><path d="M5 19l-1.5 1.5M19 19l1.5 1.5" stroke="#16a34a" stroke-width="1.4" stroke-linecap="round"/></svg>',
    snake: '<svg viewBox="0 0 24 24"><path d="M4 16c3.5 0 3.5-4 7-4s3.5 4 7 4 2.5-3 3.5-3" fill="none" stroke="#84cc16" stroke-width="3" stroke-linecap="round"/><circle cx="21" cy="10" r="1" fill="#ef4444"/><path d="M22 9.4l1.4-1" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round"/></svg>',
    fox: '<svg viewBox="0 0 24 24"><path d="M8 7l-3-1 2 3M16 7l3-1-2 3" stroke="#fb923c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M12 5l3.5 3.5L12 9 8.5 8.5z" fill="#fb923c" stroke="#c2410c" stroke-width="1.3" stroke-linejoin="round"/><path d="M5 9l4.5 2.5L12 21l2.5-9.5L19 9l-7 4z" fill="#fb923c" stroke="#c2410c" stroke-width="1.3" stroke-linejoin="round"/><circle cx="9.5" cy="11.5" r="0.8" fill="#0f172a"/><circle cx="14.5" cy="11.5" r="0.8" fill="#0f172a"/><path d="M12 14l-0.8 1.4h1.6z" fill="#7f1d1d"/></svg>'
  };

  const iconImages = {};
  function preloadIcons() {
    Object.keys(ICONS).forEach(id => {
      const img = new Image();
      img.onload = () => { iconImages[id] = img; };
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(ICONS[id]);
    });
  }

  const MAX_CHAIN = 5;

  /* ── DOM ────────────────────────────────────────────── */

  const canvas         = document.getElementById('stage');
  const ctx            = canvas.getContext('2d');
  const pickerEl       = document.getElementById('organismPicker');
  const clearBtn       = document.getElementById('clearBtn');
  const lengthValue    = document.getElementById('lengthValue');
  const energyValue    = document.getElementById('energyValue');
  const trophicValue   = document.getElementById('trophicValue');
  const helpEl         = document.getElementById('help');
  const insightEl      = document.getElementById('insight');

  /* ── State ──────────────────────────────────────────── */

  let chain = [];             // array of organism objects in order
  let particles = [];          // energy particles flowing along the chain
  let rafId = null;
  let lastTime = 0;
  let chainCount = 0;

  /* ── Picker build ───────────────────────────────────── */

  function buildPicker() {
    pickerEl.innerHTML = '';
    ORGANISMS.forEach(org => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ev-organism-btn';
      btn.innerHTML = `
        <span class="ev-organism-btn__icon">${ICONS[org.id]}</span>
        <span>${org.name}</span>
        <span class="ev-organism-btn__role">${org.role}</span>
      `;
      btn.addEventListener('click', () => addOrganism(org));
      pickerEl.appendChild(btn);
    });
  }

  /* ── Chain logic ────────────────────────────────────── */

  function canAdd(org) {
    if (chain.length >= MAX_CHAIN) return { ok: false, reason: 'Chain is full' };

    if (chain.length === 0) {
      if (org.trophic !== 1) return { ok: false, reason: 'Start with a producer' };
      return { ok: true };
    }

    const last = chain[chain.length - 1];
    // Next trophic level must be exactly one more than the last
    if (org.trophic !== last.trophic + 1) {
      return { ok: false, reason: 'Must eat the previous organism' };
    }
    return { ok: true };
  }

  function addOrganism(org) {
    const check = canAdd(org);
    if (!check.ok) {
      flashPickerError(check.reason);
      return;
    }

    chain.push(org);
    chainCount++;

    // Spawn energy particles for the new link
    if (chain.length >= 2) {
      spawnParticlesBetween(chain.length - 2, chain.length - 1);
    }

    syncReadout();
    if (chainCount >= 3) insightEl.hidden = false;
  }

  function flashPickerError(msg) {
    // Quick visual cue using the header — simple version
    const header = document.querySelector('.ev-header__text p');
    if (!header) return;
    const original = header.textContent;
    header.innerHTML = '<i data-lucide="triangle-alert" aria-hidden="true"></i> ' + msg;
    if (window.lucide) lucide.createIcons();
    header.style.color = '#f59e0b';
    setTimeout(() => {
      header.textContent = original;
      header.style.color = '';
    }, 1200);
  }

  function clearChain() {
    chain = [];
    particles = [];
    syncReadout();
    insightEl.hidden = true;
  }

  /* ── Energy particles ───────────────────────────────── */

  function chainSlotCentre(i) {
    const totalW = chain.length * SLOT_W;
    const startX = (W * 0.55 - totalW) / 2 + SLOT_W / 2;
    return { x: startX + i * SLOT_W, y: CHAIN_Y };
  }

  function spawnParticlesBetween(fromIdx, toIdx) {
    const a = chainSlotCentre(fromIdx);
    const b = chainSlotCentre(toIdx);
    for (let i = 0; i < 8; i++) {
      particles.push({
        fromX: a.x, fromY: a.y,
        toX: b.x, toY: b.y,
        t: i / 8,
        speed: 0.25 + Math.random() * 0.1
      });
    }
  }

  function respawnAllParticles() {
    particles = [];
    for (let i = 0; i < chain.length - 1; i++) {
      spawnParticlesBetween(i, i + 1);
    }
  }

  /* ── Update ─────────────────────────────────────────── */

  function update(dt) {
    for (const p of particles) {
      p.t += p.speed * dt;
      if (p.t >= 1) p.t -= 1;
    }
  }

  /* ── Render ─────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawChainArea();
    drawChain();
    drawEnergyArrow();
    drawPyramid();
  }

  function drawChainArea() {
    ctx.fillStyle = 'rgba(30,41,59,0.5)';
    ctx.fillRect(20, 40, 520, 480);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 40, 520, 480);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('YOUR FOOD CHAIN', 280, 34);

    if (chain.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Click an organism below to start', 280, 260);
      ctx.font = '400 12px system-ui, sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText('Start with a producer (grass or tree)', 280, 290);
    }
  }

  function drawChain() {
    for (let i = 0; i < chain.length; i++) {
      const org = chain[i];
      const pos = chainSlotCentre(i);

      // Card
      const cw = 110, chh = 110;
      const cx = pos.x - cw / 2;
      const cy = pos.y - chh / 2;

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      roundRect(cx, cy, cw, chh, 12);
      ctx.fill();

      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2.5;
      roundRect(cx, cy, cw, chh, 12);
      ctx.stroke();

      // Icon
      const iconImg = iconImages[org.id];
      if (iconImg) ctx.drawImage(iconImg, pos.x - 26, pos.y - 44, 52, 52);

      // Name
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(org.name, pos.x, pos.y + 26);

      // Trophic label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('Level ' + org.trophic, pos.x, pos.y + 44);

      // Arrow to next
      if (i < chain.length - 1) {
        const next = chainSlotCentre(i + 1);
        drawChainArrow(pos, next);
      }
    }
  }

  function drawChainArrow(from, to) {
    const x1 = from.x + 60;
    const x2 = to.x - 60;
    const y = from.y - 20;

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();

    // Arrowhead
    const headSize = 8;
    const angle = Math.atan2(0, x2 - x1);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - Math.cos(angle - 0.5) * headSize, y - Math.sin(angle - 0.5) * headSize);
    ctx.lineTo(x2 - Math.cos(angle + 0.5) * headSize, y - Math.sin(angle + 0.5) * headSize);
    ctx.closePath();
    ctx.fill();
  }

  function drawEnergyArrow() {
    // Energy particles flowing right along the chain
    for (const p of particles) {
      const x = p.fromX + (p.toX - p.fromX) * p.t;
      const y = p.fromY - 20 + Math.sin(p.t * Math.PI) * -6;

      ctx.fillStyle = 'rgba(250,204,21,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
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

  /* ── Pyramid ────────────────────────────────────────── */

  function drawPyramid() {
    const p = PYRAMID;

    // Background
    ctx.fillStyle = 'rgba(11,18,32,0.5)';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, p.w, p.h);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ENERGY PYRAMID', p.x + p.w / 2, p.y + 8);

    if (chain.length === 0) {
      ctx.fillStyle = '#334155';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('Build a chain to see energy', p.x + p.w / 2, p.y + p.h / 2);
      return;
    }

    // Draw pyramid from bottom (producer) to top
    const layers = chain.length;
    const baseY = p.y + p.h - 40;
    const topY = p.y + 40;
    const availH = baseY - topY;
    const layerH = availH / layers;

    const maxWidth = p.w - 40;
    const minWidth = 20;

    for (let i = 0; i < layers; i++) {
      // i = 0 is bottom (producer)
      const fracBottom = 1 - i / layers;
      const fracTop = 1 - (i + 1) / layers;
      const wBottom = maxWidth * fracBottom;
      const wTop = maxWidth * fracTop;

      const yBottom = baseY - i * layerH;
      const yTop = yBottom - layerH;

      const cx = p.x + p.w / 2;
      const colour = colourForLevel(i);

      // Trapezoid
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(cx - wBottom / 2, yBottom);
      ctx.lineTo(cx + wBottom / 2, yBottom);
      ctx.lineTo(cx + wTop / 2, yTop + 2);
      ctx.lineTo(cx - wTop / 2, yTop + 2);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Energy at this level
      const org = chain[i];
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const energyVal = ENERGY_TOP * Math.pow(0.1, i);
      const label = energyVal >= 1 ? energyVal.toFixed(0) : energyVal.toFixed(2);
      ctx.fillText(label, cx, (yBottom + yTop) / 2);

      // Percentage on the side
      if (i > 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const pct = Math.pow(0.1, i) * 100;
        const pctLabel = pct >= 1 ? pct.toFixed(0) + '%' : pct.toFixed(1) + '%';
        ctx.fillText(pctLabel, cx + wBottom / 2 + 6, (yBottom + yTop) / 2);
      }
    }

    // Explain loss arrows
    ctx.fillStyle = '#ef4444';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('↓ 90% lost at', p.x + p.w - 8, p.y + 30);
    ctx.fillText('each level', p.x + p.w - 8, p.y + 44);
  }

  function colourForLevel(i) {
    const palette = ['#22c55e', '#84cc16', '#facc15', '#f59e0b', '#ef4444'];
    return palette[Math.min(i, palette.length - 1)];
  }

  /* ── Readout ────────────────────────────────────────── */

  function syncReadout() {
    lengthValue.textContent = chain.length;

    if (chain.length === 0) {
      energyValue.textContent = '—';
      energyValue.style.color = '#94a3b8';
      trophicValue.textContent = '0';
      return;
    }

    const topEnergy = ENERGY_TOP * Math.pow(0.1, chain.length - 1);
    const label = topEnergy >= 1 ? topEnergy.toFixed(0) : topEnergy.toFixed(2);
    energyValue.textContent = label;
    energyValue.style.color = topEnergy > 10 ? '#10b981'
                            : topEnergy > 1 ? '#f59e0b'
                            : '#ef4444';

    trophicValue.textContent = chain.length;
  }

  /* ── Loop ───────────────────────────────────────────── */

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);
    render();

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Events ─────────────────────────────────────────── */

  clearBtn.addEventListener('click', clearChain);

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    clearChain();
    chainCount = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
  });

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ───────────────────────────────────────────── */

  buildPicker();
  preloadIcons();
  syncReadout();
  start();

})();
