import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(here, '..', 'script.js');
const src = fs.readFileSync(scriptPath, 'utf8');

function slice(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (a < 0 || b < 0 || b <= a) throw new Error(`bad slice ${startMarker} -> ${endMarker}`);
  return src.slice(a, b);
}

const physiology = slice('  const clamp =', '  /* ══ Geometry helpers');
const readout = slice('  function syncReadout(dt)', '  /* ══ Loop');
const presetsStart = src.indexOf('  const PRESETS = {');
const presetsEnd = src.indexOf('\n  };', presetsStart);
if (presetsStart < 0 || presetsEnd < 0) throw new Error('PRESETS not found');
const presetsSource = src.slice(presetsStart, presetsEnd + 5);
const PRESETS = new Function(`${presetsSource}\nreturn PRESETS;`)();

const factoryBody = `
  const out = {
    hr: { textContent: '', style: {} }, sv: { textContent: '', style: {} },
    co: { textContent: '', style: {} }, ef: { textContent: '', style: {} },
    bp: { textContent: '', style: {} }, map: { textContent: '', style: {} }
  };
  const sliders = {
    hr: { value: '70', setAttribute() {} }, contract: { value: '1', setAttribute() {} },
    preload: { value: '1', setAttribute() {} }, valve: { value: '100', setAttribute() {} },
    resistance: { value: '1', setAttribute() {} }
  };
  const valueLabels = {
    hr: { textContent: '' }, contract: { textContent: '' }, preload: { textContent: '' },
    valve: { textContent: '' }, resistance: { textContent: '' }
  };
  let s = null;
  let svSmooth = 68;
  let currentParams = { hr: 70, contract: 1, preload: 1, valve: 1, resistance: 1, afib: false };
  function params() { return currentParams; }
  ${physiology}
  ${readout}
  return {
    clamp, timing, makeState, phaseAt, step,
    setScenario(p, state) { currentParams = p; s = state; },
    resetSmooth(v) { svSmooth = v; },
    read(dt) {
      syncReadout(dt);
      return {
        hrOut: out.hr.textContent,
        svOut: out.sv.textContent,
        coOut: out.co.textContent,
        efOut: out.ef.textContent,
        bpOut: out.bp.textContent,
        mapOut: out.map.textContent,
        hrValue: valueLabels.hr.textContent,
        contractValue: valueLabels.contract.textContent,
        preloadValue: valueLabels.preload.textContent,
        valveValue: valueLabels.valve.textContent,
        resistanceValue: valueLabels.resistance.textContent
      };
    }
  };
`;

const api = new Function(factoryBody)();
const MAX_STEP = 1 / 120;
const FRAME = 1 / 60;
const SETTLE_STEPS = 240;
const BEATS_PER_SCENARIO = 10;

function copyParams(p) {
  return { hr: p.hr, contract: p.contract, preload: p.preload, valve: p.valve, resistance: p.resistance, afib: p.afib };
}

function scenarioDefinition(kind, source, params, extra = {}) {
  return { kind, source, params: copyParams(params), ...extra };
}

function buildScenarioDefinitions() {
  const rest = PRESETS.rest;
  const defs = [];
  for (const name of Object.keys(PRESETS)) {
    defs.push({
      id: `preset:${name}`,
      definition: scenarioDefinition('preset', `PRESETS.${name}`, PRESETS[name])
    });
  }
  defs.push({
    id: 'afib:on-rest',
    definition: scenarioDefinition('afib', 'PRESETS.rest + afib=true', { ...rest, afib: true })
  });

  const sliderEdges = [
    ['hr', 40, 40], ['hr', 200, 200],
    ['contract', 0.4, 0.4], ['contract', 1.6, 1.6],
    ['preload', 0.6, 0.6], ['preload', 1.4, 1.4],
    ['valve', 20, 0.2], ['valve', 100, 1],
    ['resistance', 0.3, 0.3], ['resistance', 1.8, 1.8]
  ];
  for (const [slider, sliderValue, value] of sliderEdges) {
    const edge = sliderValue === ({ hr: 200, contract: 1.6, preload: 1.4, valve: 100, resistance: 1.8 })[slider] ? 'max' : 'min';
    defs.push({
      id: `slider:${slider}:${edge}`,
      definition: scenarioDefinition(
        'slider-edge',
        `${slider} ${edge}`,
        { ...rest, [slider]: value },
        { slider, sliderValue }
      )
    });
  }
  return defs;
}

function runScenario(params) {
  const s = api.makeState();
  const restP = copyParams(PRESETS.rest);

  api.setScenario(restP, s);
  for (let i = 0; i < SETTLE_STEPS; i++) api.step(s, MAX_STEP, restP);
  s.workAcc = 0;
  s.work = 1.0;

  api.setScenario(params, s);
  api.resetSmooth(68);
  api.read(undefined);

  let clock = 0;
  const beats = [];
  const pending = [];
  let guardFrames = 0;

  while (beats.length < BEATS_PER_SCENARIO && guardFrames++ < 100000) {
    let left = FRAME;
    let guardSlices = 0;
    while (left > 1e-9 && guardSlices++ < 64) {
      const toEdge = s.cycleLen - s.tc;
      const h = Math.min(MAX_STEP, left, toEdge > 1e-6 ? toEdge : MAX_STEP);
      const crossing = toEdge <= h + 1e-12;
      const pre = crossing
        ? { lvPeak: s.lvPeak, aoPeak: s.aoPeak, phase: s.phase, phaseKey: s.phaseKey }
        : null;
      left -= h;
      api.step(s, h, params);
      clock += h;
      if (pre) pending.push(pre);
    }

    const display = api.read(FRAME);
    for (const pre of pending) {
      const hypertrophy = api.clamp(Math.sqrt(Math.max(0.4, pre.lvPeak) / 120), 0.85, 1.75);
      beats.push({
        beat: beats.length + 1,
        simulatedTimeSeconds: Number(clock.toFixed(6)),
        phase: pre.phase,
        phaseKey: pre.phaseKey,
        values: {
          ...display,
          hudPhase: pre.phase.toUpperCase(),
          hudLVPressure: `${Math.round(pre.lvPeak)} / ${Math.round(pre.aoPeak)} mmHg`,
          lvPeak: Number(pre.lvPeak.toFixed(6)),
          aoPeak: Number(pre.aoPeak.toFixed(6)),
          edvMl: Number(s.edv.toFixed(6)),
          esvMl: Number(s.esv.toFixed(6)),
          mapMmHg: Number(s.map.toFixed(6)),
          strokeWork: `${s.work.toFixed(1)} J per beat`,
          valveGradient: `${Math.round(pre.lvPeak - pre.aoPeak)} mmHg`,
          lvWall: `${Math.round(10 * hypertrophy)} mm`,
          cycleLengthSeconds: Number(s.cycleLen.toFixed(6))
        }
      });
    }
    pending.length = 0;
  }

  if (beats.length !== BEATS_PER_SCENARIO) throw new Error(`only ${beats.length} beats captured`);
  return beats;
}

export function buildBaseline() {
  const defs = buildScenarioDefinitions();
  const scenarios = {};
  for (const def of defs) {
    scenarios[def.id] = {
      definition: def.definition,
      beats: runScenario(def.definition.params)
    };
  }
  return {
    method: 'Virtual clock: settled 240 fixed 1/120 s steps at the page default 70 BPM, then applied each scenario and ran 1/60 s frames, each sliced at MAX_STEP=1/120 s and at beat boundaries; readouts called once per virtual frame using the source syncReadout() formula. Covers all PRESETS from script.js, afib on at rest parameters, and every slider at its specified min and max.',
    virtualClock: {
      frameSeconds: FRAME,
      maxStepSeconds: MAX_STEP,
      settleSteps: SETTLE_STEPS,
      settleHeartRateBpm: 70,
      beatsPerScenario: BEATS_PER_SCENARIO
    },
    scenarioCount: defs.length,
    beatCount: defs.length * BEATS_PER_SCENARIO,
    scenarios
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const baseline = buildBaseline();
  const outPath = path.resolve(here, 'baseline-2d.json');
  fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`SAVED:${outPath}`);
  console.log(`SCENARIOS:${baseline.scenarioCount}`);
  console.log(`BEATS:${baseline.beatCount}`);
}
