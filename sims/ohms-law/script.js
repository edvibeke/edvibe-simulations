(() => {
  'use strict';

  /* ── Geometry ────────────────────────────────────────
     The circuit is a rectangle. The battery sits on the
     left wire, the resistor on the right wire. Electrons
     travel clockwise. */

  const CIRCUIT = {
    left:   100,
    right:  800,
    top:    90,
    bottom: 410,
    width:  700,
    height: 320
  };

  const PERIMETER      = 2 * (CIRCUIT.width + CIRCUIT.height); // 2040
  const DOT_COUNT      = 32;                                    // 64 px spacing
  const BATTERY_TOP    = 230;  // + terminal
  const BATTERY_BOTTOM = 270;  // − terminal
  const RESISTOR_TOP   = 210;
  const RESISTOR_BOTTOM = 290;

  /* ── DOM ───────────────────────────────────────────── */

  const canvas            = document.getElementById('stage');
  const ctx               = canvas.getContext('2d');
  const voltageSlider     = document.getElementById('voltage');
  const resistanceSlider  = document.getElementById('resistance');
  const voltageValue      = document.getElementById('voltageValue');
  const resistanceValue   = document.getElementById('resistanceValue');
  const currentValue      = document.getElementById('currentValue');
  const powerValue        = document.getElementById('powerValue');
  const helpEl            = document.getElementById('help');
  const insightEl         = document.getElementById('insight');

  /* ── State (§5, §15: one state object) ─────────────── */

  function makeInitialState() {
    const voltage    = 12;
    const resistance = 6;
    const current    = voltage / resistance;
    return {
      voltage,
      resistance,
      current,
      power: voltage * current,
      flowOffset: 0
    };
  }

  let state = makeInitialState();
  let rafId = null;
  let lastRenderTime = 0;
  let resistanceChanges = 0;

  /* ── Physics (Ohm's Law) ───────────────────────────── */

  function recompute() {
    state.current = state.voltage / state.resistance;
    state.power   = state.voltage * state.current;
  }

  /* ── Readout sync ──────────────────────────────────── */

  function syncReadout() {
    voltageValue.textContent    = state.voltage.toFixed(0) + ' V';
    resistanceValue.textContent = state.resistance.toFixed(0) + ' Ω';
    currentValue.textContent    = state.current.toFixed(2) + ' A';
    powerValue.textContent      = state.power.toFixed(1) + ' W';
  }

  /* ── Drawing ───────────────────────────────────────── */

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWires();
    drawBattery();
    drawResistor();
    drawLabels();
    drawElectrons();
  }

  function drawWires() {
    ctx.strokeStyle = '#64748b';       // --ev-neutral
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Top wire — full width
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.left, CIRCUIT.top);
    ctx.lineTo(CIRCUIT.right, CIRCUIT.top);
    ctx.stroke();

    // Right upper (above resistor)
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.right, CIRCUIT.top);
    ctx.lineTo(CIRCUIT.right, RESISTOR_TOP);
    ctx.stroke();

    // Right lower (below resistor)
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.right, RESISTOR_BOTTOM);
    ctx.lineTo(CIRCUIT.right, CIRCUIT.bottom);
    ctx.stroke();

    // Bottom wire — full width
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.right, CIRCUIT.bottom);
    ctx.lineTo(CIRCUIT.left, CIRCUIT.bottom);
    ctx.stroke();

    // Left lower (below battery)
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.left, CIRCUIT.bottom);
    ctx.lineTo(CIRCUIT.left, BATTERY_BOTTOM);
    ctx.stroke();

    // Left upper (above battery)
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.left, BATTERY_TOP);
    ctx.lineTo(CIRCUIT.left, CIRCUIT.top);
    ctx.stroke();
  }

  function drawBattery() {
    ctx.strokeStyle = '#e2e8f0';       // --ev-text
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Positive terminal — long bar
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.left - 30, BATTERY_TOP);
    ctx.lineTo(CIRCUIT.left + 30, BATTERY_TOP);
    ctx.stroke();

    // Negative terminal — short bar
    ctx.beginPath();
    ctx.moveTo(CIRCUIT.left - 15, BATTERY_BOTTOM);
    ctx.lineTo(CIRCUIT.left + 15, BATTERY_BOTTOM);
    ctx.stroke();

    // + / − signs
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 18px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', CIRCUIT.left - 50, BATTERY_TOP);
    ctx.fillText('−', CIRCUIT.left - 50, BATTERY_BOTTOM);
  }

  function drawResistor() {
    const x = CIRCUIT.right - 30;
    const y = RESISTOR_TOP;
    const w = 60;
    const h = RESISTOR_BOTTOM - RESISTOR_TOP;

    ctx.fillStyle = '#0f172a';         // --ev-bg (darker than surface, reads as "component")
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
  }

  function drawLabels() {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 20px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';

    // Voltage — left of battery
    ctx.textAlign = 'right';
    ctx.fillText(state.voltage.toFixed(0) + ' V', CIRCUIT.left - 70, 250);

    // Resistance — right of resistor
    ctx.textAlign = 'left';
    ctx.fillText(state.resistance.toFixed(0) + ' Ω', CIRCUIT.right + 55, 250);

    // Current — center of circuit
    ctx.textAlign = 'center';
    ctx.font = '700 28px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.fillText('I = ' + state.current.toFixed(2) + ' A', 450, 250);
  }

  function drawElectrons() {
    if (state.current <= 0) return;

    const spacing = PERIMETER / DOT_COUNT;
    ctx.fillStyle = '#818cf8';         // --ev-primary-2

    for (let i = 0; i < DOT_COUNT; i++) {
      const t = (i * spacing + state.flowOffset) % PERIMETER;
      const p = pointOnPath(t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function pointOnPath(t) {
    const { left, right, top, bottom, width, height } = CIRCUIT;

    if (t < width) {
      return { x: left + t, y: top };                             // top: L→R
    } else if (t < width + height) {
      return { x: right, y: top + (t - width) };                  // right: T→B
    } else if (t < 2 * width + height) {
      return { x: right - (t - width - height), y: bottom };      // bottom: R→L
    } else {
      return { x: left, y: bottom - (t - 2 * width - height) };   // left: B→T
    }
  }

  /* ── Animation loop (§6) ───────────────────────────── */

  function update(dt) {
    if (state.current > 0) {
      // Visual speed scales with current but caps so it doesn't blur.
      const speed = Math.min(state.current * 80, 600);
      state.flowOffset = (state.flowOffset + speed * dt) % PERIMETER;
    }
  }

  function tick(now) {
    const dt = Math.min((now - lastRenderTime) / 1000, 0.05);
    lastRenderTime = now;
    update(dt);
    render();
    // Stop the loop when the sim is at rest (§8: idle CPU near 0%).
    if (state.current > 0) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function ensureLoop() {
    if (!rafId && state.current > 0) {
      lastRenderTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /* ── Interaction handlers ──────────────────────────── */

  function onVoltageInput() {
    state.voltage = parseFloat(voltageSlider.value);
    recompute();
    syncReadout();

    if (state.current > 0) {
      ensureLoop();          // next frame will render
    } else {
      stopLoop();
      render();              // static frame so readout is honest
    }
  }

  function onResistanceInput() {
    state.resistance = parseFloat(resistanceSlider.value);
    resistanceChanges++;
    recompute();
    syncReadout();

    if (resistanceChanges >= 3) {
      insightEl.hidden = false;
    }

    if (state.current > 0) {
      ensureLoop();
    } else {
      stopLoop();
      render();
    }
  }

  /* ── Reset (§5: reset is sacred) ───────────────────── */

  function reset() {
    stopLoop();
    state = makeInitialState();
    voltageSlider.value    = state.voltage;
    resistanceSlider.value = state.resistance;
    resistanceChanges = 0;
    helpEl.hidden = true;
    insightEl.hidden = true;
    syncReadout();
    render();
    ensureLoop();
  }

  /* ── Events ────────────────────────────────────────── */

  voltageSlider.addEventListener('input', onVoltageInput);
  resistanceSlider.addEventListener('input', onResistanceInput);

  document.querySelector('[data-action="reset"]').addEventListener('click', reset);

  document.querySelector('[data-action="help"]').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });

  /* ── Init ──────────────────────────────────────────── */

  voltageSlider.value    = state.voltage;
  resistanceSlider.value = state.resistance;
  syncReadout();
  render();
  ensureLoop();

})();
