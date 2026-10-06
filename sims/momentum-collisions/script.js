(() => {
  'use strict';

  /* ── Layout ──────────────────────────────────────────
     A scene on the left (two carts, the track, the impact mark) and a panel
     on the right that shows what the impact handed over. Every number below
     is in logical canvas pixels. */

  const SCENE = { x: 16,  y: 16, w: 584, h: 508 };
  const PANEL = { x: 612, y: 16, w: 272, h: 508 };
  const PAD   = 16;

  const FLOOR_Y  = 386;           /* canvas y of the track surface */
  const PX_PER_M = 26;            /* world metres → canvas px */
  const TRACK_M  = 7;           /* half-width of the run, in metres */
  const CENTRE_X = SCENE.x + SCENE.w / 2;

  const CART_H     = 44;          /* both carts the same height, so mass shows as length */
  const CART_MIN_W = 30;          /* px, at 0 kg */
  const CART_MAX_W = 76;          /* px, at CART_W_REF kg */
  const CART_W_REF = 120;         /* the heaviest cart the sliders allow */
  const GAP        = 4;           /* touching carts, drawn with this sliver between */

  const START_X    = 3.5;         /* where each cart starts, metres from the centre */
  const BUFFER_H   = 74;          /* the stop block each cart parks against */
  const V_EPS      = 0.02;        /* below this we call a cart stopped, m/s */
  const SAY_V      = 0.5;         /* only announce motion once it has some pace, m/s */

  const CONTACT_S   = 0.34;       /* how long the contact arrows stay up, s */
  const CONTACT_T   = 0.02;       /* impact duration the quoted force is spread over, s */

  const ARROW_SPAN = 96;          /* px a velocity arrow reaches at 20 m/s */
  const ARROW_MIN  = 22;
  const LANE_GAP   = 24;

  /* Panel rows. Kept as named numbers because the static checker reads this
     block back and asserts the rows do not collide. */
  const ROW = {
    heading:   44,
    pA:        76,
    pB:       132,
    divider:  176,
    eIn:      198,
    eOut:     250,
    force:    300,
    verdictL: 322,
    verdictT: 332,
    caption:  392
  };

  const COL = {
    cartA: '#38bdf8', cartAEdge: '#7dd3fc',
    cartB: '#f472b6', cartBEdge: '#f9a8d4',
    force: '#fbbf24',
    ink: '#e2e8f0', dim: '#94a3b8', faint: '#475569', dark: '#0f172a',
    panel: '#1e293b', kept: '#10b981', lost: '#fb923c'
  };

  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const SANS = 'system-ui, -apple-system, sans-serif';

  /* ── Presets ──────────────────────────────────────────
     Every number here is also what the captions below describe, and the
     static checker re-derives each caption from the collision formula. */

  const PRESETS = {
    'equal-carts': {
      label: 'Two equal carts',
      mA: 20, mB: 20, vA: 8, vB: 0, e: 1,
      caption: 'Two identical carts. A springy hit swaps their speeds exactly: '
        + 'the still cart leaves at 8 m/s and the first stops dead. Both momentum '
        + 'and energy survive untouched.'
    },
    'truck-bike': {
      label: 'Truck and bicycle',
      mA: 120, mB: 15, vA: 6, vB: 0, e: 0.95,
      caption: 'A 120 kg truck clips a 15 kg bicycle. The bike is thrown out at '
        + '10.4 m/s while the truck is still doing 4.7 m/s. The heavy cart barely '
        + 'notices, the light one is thrown, and a percent of the energy goes '
        + 'missing as heat and noise.'
    },
    'cue-ball': {
      label: 'Cue ball',
      mA: 7, mB: 6, vA: 5, vB: 0, e: 1,
      caption: 'A 7 kg cue ball into a 6 kg ball. When the masses are close the '
        + 'striker nearly stops, at 0.4 m/s, and hands on nearly all of its speed.'
    },
    'clay-block': {
      label: 'Clay on a cart',
      mA: 20, mB: 30, vA: 8, vB: 0, e: 0,
      caption: 'A lump of clay onto a parked cart, with no bounce at all. They '
        + 'lock together and crawl off at 3.2 m/s. The momentum is exactly right, '
        + 'but three fifths of the energy went into squashing the clay.'
    }
  };
  const DEFAULT_PRESET = 'equal-carts';
  const NEUTRAL_CAPTION = 'Your own setup. Momentum is each mass times its '
    + 'velocity, and the two add to the same total before and after. Bounciness '
    + 'decides whether the kinetic energy comes back too.';

  /* ── DOM ───────────────────────────────────────────── */

  const stage = EV.stage('stage');
  const ctx   = stage.ctx;

  const sliders = {
    mA: document.getElementById('massA'),
    mB: document.getElementById('massB'),
    vA: document.getElementById('speedA'),
    vB: document.getElementById('speedB'),
    e:  document.getElementById('bounce')
  };
  const sliderValues = {
    mA: document.getElementById('massAValue'),
    mB: document.getElementById('massBValue'),
    vA: document.getElementById('speedAValue'),
    vB: document.getElementById('speedBValue'),
    e:  document.getElementById('bounceValue')
  };

  const momentumInValue  = document.getElementById('momentumInValue');
  const momentumOutValue = document.getElementById('momentumOutValue');
  const energyKeptValue  = document.getElementById('energyKeptValue');
  const leftSpeedValue   = document.getElementById('leftSpeedValue');
  const rightSpeedValue  = document.getElementById('rightSpeedValue');
  const verdictValue     = document.getElementById('verdictValue');

  const launchBtn     = document.querySelector('[data-action="launch"]');
  const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));

  /* ── State ─────────────────────────────────────────── */

  let state;
  let rafId = null;
  let lastTime = 0;
  let interactions = 0;
  let lastInteraction = -1e9;
  let wasMovingA = false;
  let wasMovingB = false;
  let launched = false;
  let contactSaid = false;
  let contactTimer = 0;

  function makeInitialState() {
    const preset = PRESETS[DEFAULT_PRESET];
    return {
      mA: preset.mA, mB: preset.mB, vA0: preset.vA, vB0: preset.vB, e: preset.e,
      preset: DEFAULT_PRESET,
      xA: -START_X, xB: START_X,   /* metres from the centre of the track */
      vA: preset.vA, vB: -preset.vB,/* signed velocities, + is rightward */
      vAout: null, vBout: null,   /* the two speeds from just after the impact */
      collided: false,
      impactX: null,                /* where they met, metres */
      contactForce: 0,
      stuck: preset.e === 0,
      pBefore: 0, pAfter: 0, eBefore: 0, eAfter: 0
    };
  }

  /* ── Physics ───────────────────────────────────────── */

  /* Cart width carries the mass, so a 120 kg truck looks it. Length grows as
     the square root of mass because the eye judges a box by its area, and the
     heaviest slider value is the top of that range. The same width in metres
     is what the collision test uses, so drawing and physics cannot disagree. */
  function cartWidth(m) {
    const w = CART_MIN_W + (CART_MAX_W - CART_MIN_W) * Math.sqrt(Math.max(0, m) / CART_W_REF);
    return Math.max(CART_MIN_W, Math.min(CART_MAX_W, w));
  }

  /* Half a cart's length in metres. The same number the contact test, the
     overlap nudge and the parking limit all use, so they cannot disagree. */
  function halfWidth(m) { return cartWidth(m) / 2 / PX_PER_M; }
  function halfWidthA() { return halfWidth(state.mA); }
  function halfWidthB() { return halfWidth(state.mB); }

  function momentumOf(m, v) { return m * v; }
  function energyOf(m, v) { return 0.5 * m * v * v; }

  function totalMomentum() { return momentumOf(state.mA, state.vA) + momentumOf(state.mB, state.vB); }
  function totalEnergy() { return energyOf(state.mA, state.vA) + energyOf(state.mB, state.vB); }

  /* Speed of approach, positive when they close on each other. */
  function closingSpeed() { return state.vA - state.vB; }

  /* Touching, with a hair of daylight left so they read as in contact rather
     than overlapping. */
  function inContact() {
    return Math.abs(state.xA - state.xB) <= halfWidthA() + halfWidthB() + GAP / PX_PER_M;
  }

  /* A one-dimensional collision, worked out in closed form: momentum and
     kinetic energy both come out of it exactly, so nothing drifts frame by
     frame. Restitution e is the share of closing speed that comes back. */
  function solve(a, b) {
    const r = a.v - b.v;
    return {
      a: (a.m * a.v + b.m * b.v - b.m * state.e * r) / (a.m + b.m),
      b: (a.m * a.v + b.m * b.v + a.m * state.e * r) / (a.m + b.m)
    };
  }

  function energyKept() {
    return state.eBefore > 0 ? state.eAfter / state.eBefore : 1;
  }

  /* ── Geometry ──────────────────────────────────────── */

  function clampTrack(m) { return Math.max(-TRACK_M, Math.min(TRACK_M, m)); }
  function cartX(which) { return CENTRE_X + (which === 'A' ? state.xA : state.xB) * PX_PER_M; }
  function cartY() { return FLOOR_Y - CART_H / 2; }

  function caption() {
    const preset = state.preset && PRESETS[state.preset];
    return preset ? preset.caption : NEUTRAL_CAPTION;
  }

  /* ── Render ────────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, stage.w, stage.h);
    drawHeading();
    drawTrack();
    drawImpactMark();
    drawCarts();
    drawVelocityArrows();
    drawContact();
    drawPanel();
  }

  stage.onPaint = () => { syncReadout(); render(); };

  function drawHeading() {
    ctx.fillStyle = COL.dim;
    ctx.font = '600 13px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Momentum in = momentum out. Energy is another matter.',
                 SCENE.x + PAD, SCENE.y + 24);
  }

  function drawTrack() {
    const x0 = CENTRE_X - TRACK_M * PX_PER_M;
    const x1 = CENTRE_X + TRACK_M * PX_PER_M;

    /* The floor runs the full width of the scene; the part the carts can use
       is the stretch between the two stops. */
    ctx.strokeStyle = COL.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SCENE.x + PAD, FLOOR_Y);
    ctx.lineTo(SCENE.x + SCENE.w - PAD, FLOOR_Y);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = SCENE.x + PAD; x <= SCENE.x + SCENE.w - PAD; x += 26) {
      ctx.moveTo(x, FLOOR_Y);
      ctx.lineTo(x - 11, FLOOR_Y + 11);
    }
    ctx.stroke();

    /* The stops. A cart parks with its nose against one of these, which is why
       the parked limit is TRACK_M minus its own half-width. */
    for (const edge of [x0, x1]) {
      ctx.fillStyle = COL.panel;
      ctx.strokeStyle = COL.faint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(edge - 7, FLOOR_Y - BUFFER_H, 14, BUFFER_H, 4);
      ctx.fill();
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = FLOOR_Y - BUFFER_H + 8; y < FLOOR_Y - 6; y += 11) {
        ctx.moveTo(edge - 5, y);
        ctx.lineTo(edge + 5, y - 8);
      }
      ctx.stroke();

      ctx.fillStyle = COL.faint;
      ctx.font = '9px ' + MONO;
      ctx.textAlign = 'center';
      ctx.fillText('stop', edge, FLOOR_Y + 38);
    }

    ctx.fillStyle = COL.faint;
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    for (let m = -Math.floor(TRACK_M); m <= Math.floor(TRACK_M); m += 1) {
      const x = CENTRE_X + m * PX_PER_M;
      ctx.beginPath();
      ctx.moveTo(x, FLOOR_Y);
      ctx.lineTo(x, FLOOR_Y + 7);
      ctx.stroke();
      if (m % 3 === 0) ctx.fillText(String(m), x, FLOOR_Y + 24);
    }

    /* Where each cart started, so the distance each one covers can be read. */
    ctx.setLineDash([3, 4]);
    for (const which of ['A', 'B']) {
      const x = cartX(which);
      ctx.beginPath();
      ctx.moveTo(x, FLOOR_Y - CART_H - 30);
      ctx.lineTo(x, FLOOR_Y + 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
  }

  /* A mark left where they met, so the collision stays on screen after the
     carts have moved on. */
  function drawImpactMark() {
    if (state.impactX === null) return;
    const x = CENTRE_X + state.impactX * PX_PER_M;
    ctx.strokeStyle = COL.force;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, FLOOR_Y - CART_H - 40);
    ctx.lineTo(x, FLOOR_Y + 6);
    ctx.stroke();

    ctx.fillStyle = COL.force;
    ctx.font = '600 10px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText('impact', x, FLOOR_Y - CART_H - 48);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function drawCart(which, colour, edge) {
    const w = cartWidth(which === 'A' ? state.mA : state.mB);
    const x = cartX(which);
    const y = cartY();

    /* Wheels, so it reads as a trolley rather than a block. */
    ctx.fillStyle = COL.faint;
    for (const dx of [-w * 0.28, w * 0.28]) {
      ctx.beginPath();
      ctx.arc(x + dx, FLOOR_Y - 6, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = colour;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - CART_H / 2, w, CART_H, 7);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COL.dark;
    ctx.font = '700 14px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((which === 'A' ? state.mA : state.mB) + ' kg', x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawCarts() {
    drawCart('A', COL.cartA, COL.cartAEdge);
    drawCart('B', COL.cartB, COL.cartBEdge);
  }

  /* Velocity arrow over each cart, from its centre, pointing the way it goes.
     Drawn from the centre rather than the nose so it never runs off the scene
     when a fast cart is near the end. */
  function velocityArrow(which, v, colour, edge) {
    if (Math.abs(v) < V_EPS) return;
    const dir = Math.sign(v);
    const len = Math.max(ARROW_MIN, Math.abs(v) / 20 * ARROW_SPAN);
    const x = cartX(which);
    const y = cartY() - CART_H / 2 - 16 - LANE_GAP;

    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * (len - 12), y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + dir * len, y);
    ctx.lineTo(x + dir * (len - 13), y - 8);
    ctx.lineTo(x + dir * (len - 13), y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'butt';

    ctx.font = '600 11px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillStyle = edge;
    ctx.fillText(Math.abs(v).toFixed(1) + ' m/s', x + dir * len / 2, y - 10);
    ctx.textAlign = 'left';
  }

  function drawVelocityArrows() {
    velocityArrow('A', state.vA, COL.cartA, COL.cartAEdge);
    velocityArrow('B', state.vB, COL.cartB, COL.cartBEdge);
  }

  /* The third law, drawn: one arrow on each cart, the same length, pointing
     away from the contact. Neither is bigger than the other. */
  function drawContact() {
    if (contactTimer <= 0 || !state.collided) return;
    const x = CENTRE_X + state.impactX * PX_PER_M;
    const y = FLOOR_Y - CART_H / 2;
    const len = Math.min(46, 14 + state.contactForce / 400);

    ctx.globalAlpha = Math.min(1, contactTimer / CONTACT_S);

    /* One length, two directions: the pair is equal by construction. */
    for (const dir of [-1, 1]) {
      const colour = dir < 0 ? COL.cartAEdge : COL.cartBEdge;
      const tip = x + dir * (8 + len);

      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + dir * 8, y);
      ctx.lineTo(tip - dir * 11, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(tip, y);
      ctx.lineTo(tip - dir * 12, y - 8);
      ctx.lineTo(tip - dir * 12, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = 'butt';
    }

    ctx.fillStyle = COL.force;
    ctx.font = '600 11px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText('equal and opposite', x, y - CART_H / 2 - 14);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  /* ── The arithmetic panel ──────────────────────────── */

  function drawPanel() {
    const x = PANEL.x + PAD;
    const w = PANEL.w - PAD * 2;

    ctx.fillStyle = COL.panel;
    ctx.strokeStyle = COL.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COL.ink;
    ctx.font = '600 14px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('What the impact moved', x, ROW.heading);

    const pA = momentumOf(state.mA, state.vA);
    const pB = momentumOf(state.mB, state.vB);
    const pFull = Math.max(Math.abs(pA), Math.abs(pB), 40);

    drawBar(x, w, ROW.pA, 'Left cart', fmtMomentum(pA), Math.abs(pA), pFull, COL.cartA, COL.cartAEdge);
    drawBar(x, w, ROW.pB, 'Right cart', fmtMomentum(pB), Math.abs(pB), pFull, COL.cartB, COL.cartBEdge);

    ctx.strokeStyle = COL.faint;
    ctx.beginPath();
    ctx.moveTo(x, ROW.divider);
    ctx.lineTo(x + w, ROW.divider);
    ctx.stroke();

    const eIn = state.eBefore || totalEnergy();
    const eOut = state.collided ? state.eAfter : eIn;
    const eFull = Math.max(eIn, eOut, 20);
    const eCol = state.collided && energyKept() <= 0.98 ? COL.lost : COL.kept;

    drawBar(x, w, ROW.eIn, 'Energy in', Math.round(eIn) + ' J', eIn, eFull, COL.faint, COL.dim);
    drawBar(x, w, ROW.eOut, 'Energy out', Math.round(eOut) + ' J', eOut, eFull,
            state.collided ? eCol : COL.faint, state.collided ? eCol : COL.dim);

    /* Newton's third law, as a number: the same push on each cart. */
    ctx.fillStyle = COL.dim;
    ctx.font = '600 12px ' + SANS;
    ctx.textAlign = 'left';
    ctx.fillText('Push on each cart', x, ROW.force);
    ctx.font = '700 13px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillStyle = state.collided ? COL.force : COL.faint;
    ctx.fillText(state.collided ? fmtForce(state.contactForce) : '—', x + w, ROW.force);
    ctx.textAlign = 'left';

    ctx.fillStyle = COL.dim;
    ctx.font = '600 12px ' + SANS;
    ctx.fillText('Verdict', x, ROW.verdictL);

    ctx.fillStyle = launched ? COL.kept : COL.faint;
    ctx.beginPath();
    ctx.roundRect(x, ROW.verdictT, w, 36, 8);
    ctx.fill();

    ctx.fillStyle = COL.dark;
    ctx.font = '700 14px ' + SANS;
    ctx.textAlign = 'center';
    ctx.fillText(verdict(), x + w / 2, ROW.verdictT + 24);
    ctx.textAlign = 'left';

    drawWrapped(caption(), x, ROW.caption, w, 15, '12px ' + SANS, COL.dim);
  }

  function fmtMomentum(p) {
    return (p < 0 ? '−' : '') + Math.abs(Math.round(p)) + ' kg·m/s';
  }

  function fmtForce(f) {
    if (f >= 1000) return (f / 1000).toFixed(1) + ' kN each';
    return Math.round(f) + ' N each';
  }

  function drawBar(x, w, top, label, value, amount, full, fill, edge) {
    ctx.fillStyle = COL.ink;
    ctx.font = '600 13px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, x, top);

    ctx.font = '700 12px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w, top);
    ctx.textAlign = 'left';

    ctx.fillStyle = COL.dark;
    ctx.beginPath();
    ctx.roundRect(x, top + 10, w, 15, 7);
    ctx.fill();

    const barW = Math.max(0, Math.min(1, amount / full)) * w;
    if (barW <= 1) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, top + 10, barW, 15, 7);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* Greedy word wrap, so the caption never runs past the panel edge. */
  function drawWrapped(text, x, y, maxW, lineH, font, colour) {
    ctx.font = font;
    ctx.fillStyle = colour;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let line = '';
    let row = 0;
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > maxW && line) {
        ctx.fillText(line, x, y + row * lineH);
        row++;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x, y + row * lineH);
    return row + 1;
  }

  /* ── Readout ───────────────────────────────────────── */

  function syncReadout() {
    sliderValues.mA.textContent = state.mA + ' kg';
    sliderValues.mB.textContent = state.mB + ' kg';
    sliderValues.vA.textContent = state.vA0 + ' m/s';
    sliderValues.vB.textContent = state.vB0 + ' m/s';
    sliderValues.e.textContent  = state.e.toFixed(2);

    const pIn = state.collided ? state.pBefore : totalMomentum();
    const pOut = state.collided ? state.pAfter : totalMomentum();

    momentumInValue.textContent  = fmtMomentum(pIn);
    momentumOutValue.textContent = fmtMomentum(pOut);
    energyKeptValue.textContent  = state.collided ? Math.round(energyKept() * 100) + '%' : '—';
    leftSpeedValue.textContent   = speedOut('A').toFixed(2) + ' m/s';
    rightSpeedValue.textContent  = speedOut('B').toFixed(2) + ' m/s';
    verdictValue.textContent     = verdict();
  }

  /* What the cart is doing now, until the impact gives it a new speed — and
     then the speed it left with, which is the number the label promises. A
     cart that has parked against a stop is genuinely at rest, so quoting its
     live velocity would report zero for every cart at the end of the run. */
  function speedOut(which) {
    if (state.collided) return Math.abs(which === 'A' ? state.vAout : state.vBout);
    return Math.abs(which === 'A' ? state.vA : state.vB);
  }

  function verdict() {
    if (!launched) return 'Ready — press Launch';
    if (!state.collided) {
      if (closingSpeed() <= V_EPS) return 'Nothing is moving';
      return 'Closing at ' + closingSpeed().toFixed(1) + ' m/s';
    }
    if (state.stuck) return 'Locked together at ' + speedOut('A').toFixed(1) + ' m/s';
    return 'Momentum kept, ' + Math.round(energyKept() * 100) + '% of the energy too';
  }

  /* ── State mutation ────────────────────────────────── */

  function pushSliders() {
    sliders.mA.value = state.mA;
    sliders.mB.value = state.mB;
    sliders.vA.value = state.vA0;
    sliders.vB.value = state.vB0;
    sliders.e.value  = state.e;
  }

  function clearRun() {
    state.xA = -START_X;
    state.xB = START_X;
    state.vA = state.vA0;
    state.vB = -state.vB0;
    state.collided = false;
    state.impactX = null;
    state.vAout = null;
    state.vBout = null;
    state.contactForce = 0;
    state.stuck = state.e === 0;
    state.pBefore = totalMomentum();
    state.eBefore = totalEnergy();
    state.pAfter = totalMomentum();
    state.eAfter = totalEnergy();
    contactTimer = 0;
    contactSaid = false;
    wasMovingA = false;
    wasMovingB = false;
  }

  const INTERACTION_WINDOW_MS = 900;

  function countInteraction() {
    const now = performance.now();
    if (now - lastInteraction < INTERACTION_WINDOW_MS) return;
    lastInteraction = now;
    interactions++;
    if (interactions >= 4) EV.revealInsight();
  }

  function markPreset(key) {
    for (const btn of presetButtons) {
      btn.setAttribute('aria-pressed', String(!!key && btn.dataset.preset === key));
    }
  }

  function applyPreset(key) {
    const preset = PRESETS[key];
    state.mA = preset.mA;
    state.mB = preset.mB;
    state.vA0 = preset.vA;
    state.vB0 = preset.vB;
    state.e = preset.e;
    state.preset = key;

    markPreset(key);
    pushSliders();
    launched = false;
    clearRun();

    countInteraction();
    EV.say(preset.label + ': a ' + preset.mA + ' kilogram cart at ' + preset.vA
          + ' metres per second, into a ' + preset.mB + ' kilogram cart at ' + preset.vB + '.');
    syncReadout();
    render();
    startLoop();
  }

  function setParam(which, value) {
    if (which === 'mA') state.mA = value;
    else if (which === 'mB') state.mB = value;
    else if (which === 'vA') state.vA0 = value;
    else if (which === 'vB') state.vB0 = value;
    else state.e = value;

    /* A slider tweak means the preset caption no longer describes the run. */
    state.preset = null;
    markPreset('');

    /* Changing a number mid-run would invalidate a collision that had already
       happened, so the run restarts from the new setup instead. */
    clearRun();
    launched = false;
    countInteraction();
    syncReadout();
    render();
    startLoop();
  }

  function launch() {
    const again = launched;
    clearRun();
    launched = true;
    countInteraction();

    /* Prime the motion flags: the launch message already quotes the speed, so
       announcing it again a frame later would only talk over it. */
    wasMovingA = Math.abs(state.vA) >= SAY_V;
    wasMovingB = Math.abs(state.vB) >= SAY_V;

    if (again) {
      EV.say('Back to the start.');
    } else if (closingSpeed() <= V_EPS) {
      EV.say('Launched, but neither cart is moving: nothing can happen.');
    } else {
      EV.say('Launched. They close at ' + closingSpeed().toFixed(1)
            + ' metres per second.');
    }

    /* Under reduced motion the shared clock is frozen, so nothing would ever
       reach the collision. Resolve it in one go and leave the frame showing
       the moment of contact: both velocity arrows, both force arrows, and
       every number final. */
    if (EV.reducedMotion()) resolveInstantly();

    syncReadout();
    render();
    startLoop();
  }

  /* Step the model forward in fixed slices until the collision has happened,
     then hold the contact frame. Nothing here is drawn as motion: the carts
     jump from their start to the impact. */
  const INSTANT_STEP = 1 / 240;
  function resolveInstantly() {
    for (let i = 0; i < 4000 && !state.collided; i++) {
      if (closingSpeed() <= V_EPS) break;
      stepModel(INSTANT_STEP);
    }
    contactTimer = CONTACT_S;
  }

  /* ── The collision ─────────────────────────────────── */

  function collide() {
    const preA = state.vA;
    const preB = state.vB;
    const out = solve({ m: state.mA, v: preA }, { m: state.mB, v: preB });
    state.vA = out.a;
    state.vB = out.b;
    state.vAout = out.a;
    state.vBout = out.b;
    state.collided = true;
    state.stuck = state.e === 0;

    /* Nudge them apart along the line they were already closing on, so they
       read as touching rather than overlapping. They can only be in contact
       while approaching, so the order they stand in is the line to part along:
       the cart on the left goes left and the one on the right goes right. */
    const dir = Math.sign(state.xB - state.xA) || 1;
    const overlap = halfWidthA() + halfWidthB() - Math.abs(state.xA - state.xB);
    if (overlap > 0) {
      state.xA = clampTrack(state.xA - dir * overlap / 2);
      state.xB = clampTrack(state.xB + dir * overlap / 2);
    }
    state.impactX = (state.xA + state.xB) / 2;

    /* Average force = the impulse each cart received, spread over the contact
       time. Both carts get the same number: that is the third law. */
    const impulse = Math.abs(state.mA * (out.a - preA));
    state.contactForce = impulse / CONTACT_T;
    state.pAfter = totalMomentum();
    state.eAfter = totalEnergy();
    contactTimer = CONTACT_S;

    /* Prime the motion flags from the new speeds: the impact message has just
       said where each cart is going, so there is nothing left to add. */
    wasMovingA = Math.abs(state.vA) >= SAY_V;
    wasMovingB = Math.abs(state.vB) >= SAY_V;
  }

  /* One message, not two: the shared announcer debounces, so two calls this
     close together would leave only the second one spoken. */
  function announceImpact() {
    if (contactSaid) return;
    contactSaid = true;
    EV.say('Impact. Each cart is pushed with ' + fmtForce(state.contactForce).replace(' each', '')
      + (state.stuck
        ? '. They lock together and carry on as one.'
        : '. Momentum still adds to ' + Math.round(totalMomentum())
          + ' kilogram metres per second, but only ' + Math.round(energyKept() * 100)
          + ' per cent of the energy came back.'));
  }

  /* ── Model step ────────────────────────────────────── */

  /* Nothing moves until Launch, and a step of zero or less does nothing. The
     first frame after the loop starts can hand back a timestamp older than the
     performance.now() the loop was primed with, and a negative step would
     fling the carts backwards before the learner has touched anything. */
  function stepModel(dt) {
    if (!launched || dt <= 0) return;
    if (contactTimer > 0) contactTimer = Math.max(0, contactTimer - dt);

    /* Once they lock together they are one object and stay locked: hold them
       as a single body so neither can pull ahead of the other. */
    if (state.collided && state.stuck) {
      const v = (state.mA * state.vA + state.mB * state.vB) / (state.mA + state.mB);
      state.vA = v;
      state.vB = v;
      const mid = (state.xA + state.xB) / 2;
      const gap = halfWidthA() + halfWidthB();
      state.xA = mid - gap / 2;
      state.xB = mid + gap / 2;
    }

    state.xA += state.vA * dt;
    state.xB += state.vB * dt;

    /* Only a closing pair can collide, so they cannot collide a second time
       after they have passed each other. */
    if (!state.collided && closingSpeed() > 0 && inContact()) {
      collide();
      announceImpact();
    }

    park();
    resolveOverlap();
    announceMotion();
  }

  /* Two carts on one track cannot pass through each other, so when one runs
     into the other at a stop it is held back rather than left standing inside
     it. Nothing here can push anything either, so a pair that is still nose to
     nose after a collision has nowhere left to go and both stop there. */
  function resolveOverlap() {
    if (state.collided && state.stuck) return;

    /* Nose to nose, with the same little gap the collision leaves between
       them, so a cart held up at a stop looks the same as one just hit. */
    const need = halfWidthA() + halfWidthB() + GAP / PX_PER_M;
    const apart = state.xB - state.xA;
    if (Math.abs(apart) > need) return;

    /* A pair that is parting company is not blocked: two carts that have just
       traded speeds are touching for a frame and both must carry on. */
    if (closingSpeed() <= 0) return;

    const dir = apart >= 0 ? 1 : -1;
    const over = need - Math.abs(apart);

    /* Each cart can only slide as far as its own parking limit: one already
       nose to stop has nowhere left to go, so the gap has to be taken out on
       the other cart. */
    const roomA = dir > 0 ? state.xA + limitFor('A') : limitFor('A') - state.xA;
    const roomB = dir > 0 ? limitFor('B') - state.xB : state.xB + limitFor('B');
    const slideA = Math.min(Math.max(roomA, 0), over);
    const slideB = over - slideA;

    state.xA = clampTrack(state.xA - dir * slideA);
    state.xB = clampTrack(state.xB + dir * slideB);
    state.vA = 0;
    state.vB = 0;
  }

  /* How far a cart may travel before its nose reaches the end of the track. */
  function limitFor(which) {
    return TRACK_M - (which === 'A' ? halfWidthA() : halfWidthB());
  }

  /* Park a cart with its nose against the end of the track, so a heavy cart
     never hangs off the edge of the scene. A locked pair is one object, so it
     has to be stopped by whichever cart is in front: clamping the two of them
     separately would pull them apart at the stop. */
  function park() {
    if (state.collided && state.stuck) {
      const half = halfWidthA() + halfWidthB();
      const limit = TRACK_M - half;
      const mid = (state.xA + state.xB) / 2;
      if (mid > limit || mid < -limit) {
        const held = mid > limit ? limit : -limit;
        state.xA = held - half / 2;
        state.xB = held + half / 2;
        state.vA = 0;
        state.vB = 0;
      }
      return;
    }

    for (const which of ['A', 'B']) {
      const key = which === 'A' ? 'xA' : 'xB';
      const vel = which === 'A' ? 'vA' : 'vB';
      const half = which === 'A' ? halfWidthA() : halfWidthB();
      const limit = limitFor(which);
      if (state[key] <= -limit) { state[key] = -limit; state[vel] = 0; }
      if (state[key] >= limit)  { state[key] = limit;  state[vel] = 0; }
    }
  }

  function announceMotion() {
    const movingA = Math.abs(state.vA) >= SAY_V;
    const movingB = Math.abs(state.vB) >= SAY_V;
    if ((movingA && !wasMovingA) || (movingB && !wasMovingB)) {
      const a = movingA && (!movingB || Math.abs(state.vA) >= Math.abs(state.vB));
      const side = a ? 'Left' : 'Right';
      const v = a ? state.vA : state.vB;
      EV.say(side + ' cart ' + (v > 0 ? 'right' : 'left')
            + ' at ' + Math.abs(v).toFixed(1) + ' metres per second.');
    }
    wasMovingA = movingA;
    wasMovingB = movingB;
  }

  /* ── Input wiring ──────────────────────────────────── */

  for (const [which, el] of Object.entries(sliders)) {
    el.addEventListener('input', () => setParam(which, parseFloat(el.value)));
  }
  launchBtn.addEventListener('click', launch);
  for (const btn of presetButtons) {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  }

  /* ── Animation loop ────────────────────────────────── */

  function stillBusy() {
    return launched && (Math.abs(state.vA) >= V_EPS || Math.abs(state.vB) >= V_EPS
                        || contactTimer > 0);
  }

  function tick(now) {
    const dt = EV.delta(now, lastTime);
    lastTime = now;

    stepModel(dt);
    render();
    syncReadout();

    if (stillBusy()) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    rafId = null;
  }

  /* Reduced motion has already been resolved by hand, so there is nothing to
     loop: keep the frame still and let the handlers repaint. */
  function startLoop() {
    if (EV.reducedMotion() || rafId !== null) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  /* ── Reset ─────────────────────────────────────────── */

  function reset() {
    state = makeInitialState();
    interactions = 0;
    lastInteraction = -1e9;
    launched = false;
    clearRun();
    markPreset(DEFAULT_PRESET);
    pushSliders();
    EV.resetInsight();
    syncReadout();
    render();
    startLoop();
  }

  EV.onReset(reset);

  /* ── Init ──────────────────────────────────────────── */

  state = makeInitialState();
  markPreset(DEFAULT_PRESET);
  pushSliders();
  clearRun();
  syncReadout();
  render();
  startLoop();

})();
