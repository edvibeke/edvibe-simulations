import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const PROBE = path.join(HERE, 'position-probe.mjs');
const SUMMARY_FILE = path.join(HERE, 'landmark-positions.json');
const TRACE_FILE = path.join(HERE, 'position-trace.json');
const RESULT_FILE = path.join(HERE, 'position-test-result.json');

const probe = spawnSync(process.execPath, [PROBE, ROOT, 'trace'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
});
if (probe.status !== 0) {
  console.error(probe.stdout);
  console.error(probe.stderr);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
const frames = JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const NAME_TO_ORGAN = {
  Mouth: 'mouth',
  Oesophagus: 'oesophagus',
  Stomach: 'stomach',
  Duodenum: 'duodenum',
  'Small intestine': 'ileum',
  'Large intestine': 'colon',
  Rectum: 'rectum'
};

const offences = [];
const add = (frame, kind, detail) => offences.push({ frame: frame, kind: kind, detail: detail });

for (const l of summary.landmarks) {
  const dx = l.sample.x - l.committed.x;
  const dy = l.sample.y - l.committed.y;
  if (Math.hypot(dx, dy) > 2) {
    add(null, 'landmark', `${l.key}: sampleAt=${l.sample.x.toFixed(2)},${l.sample.y.toFixed(2)} committed=${l.committed.x.toFixed(2)},${l.committed.y.toFixed(2)} delta=${dx.toFixed(2)},${dy.toFixed(2)}`);
  }
}

for (const f of frames) {
  const tol = f.tolerancePx;
  for (const p of f.particles) {
    if (!p.drawn) {
      add(f.frame, 'missing-draw', `particle ${p.index} has no draw call`);
      continue;
    }
    const d = dist(p.drawn, p.sample);
    if (d > tol) {
      add(f.frame, 'particle-offset', `${p.organ} p${p.index} s=${p.s.toFixed(2)} drawn=${p.drawn.x.toFixed(2)},${p.drawn.y.toFixed(2)} sample=${p.sample.x.toFixed(2)},${p.sample.y.toFixed(2)} d=${d.toFixed(2)} > ${tol.toFixed(2)}`);
    }
    if (p.nearestTruePathPx > tol) {
      add(f.frame, 'off-centreline', `${p.organ} p${p.index} s=${p.s.toFixed(2)} nearestTruePath=${p.nearestTruePathPx.toFixed(2)} > ${tol.toFixed(2)}`);
    }
  }

  const mouthBadge = /^(In the mouth|Swallowing)/.test(f.badgeText || '');
  if (mouthBadge) {
    const d = f.badgeSpot ? dist(f.badgeSpot, summary.mouthSpot) : Infinity;
    if (d > 0.5) {
      add(f.frame, 'badge-spot-mouth', `spot=${JSON.stringify(f.badgeSpot)} mouthMarker=${JSON.stringify(summary.mouthSpot)} d=${d.toFixed(2)}`);
    }
    continue;
  }

  const badgeDist = f.badgeSpot && f.headSample ? dist(f.badgeSpot, f.headSample) : Infinity;
  if (badgeDist > 0.5) {
    add(f.frame, 'badge-spot', `spot=${JSON.stringify(f.badgeSpot)} sampleAt(headS)=${JSON.stringify(f.headSample)} d=${badgeDist.toFixed(2)}`);
  }

  const organName = (f.badgeText || '').split(' · ')[0];
  const expectedOrgan = NAME_TO_ORGAN[organName];
  const drawn = f.particles.filter((p) => p.drawn);
  let nearest = null;
  let nearestD = Infinity;
  for (const p of drawn) {
    const d = f.badgeSpot ? dist(p.drawn, f.badgeSpot) : Infinity;
    if (d < nearestD) {
      nearestD = d;
      nearest = p;
    }
  }
  if (!expectedOrgan || !nearest || nearest.organ !== expectedOrgan) {
    add(f.frame, 'badge-organ', `badge="${f.badgeText}" expected=${expectedOrgan} nearest=${nearest ? nearest.organ + ' at s=' + nearest.s.toFixed(2) : 'none'}`);
  }
}

fs.writeFileSync(RESULT_FILE, JSON.stringify({
  tolerancePx: frames.length ? frames[0].tolerancePx : null,
  frames: frames.length,
  offences: offences
}, null, 2));

const counts = {};
for (const o of offences) counts[o.kind] = (counts[o.kind] || 0) + 1;
const frameOffences = offences.filter((o) => o.frame !== null)
  .sort((a, b) => a.frame - b.frame);
const landmarkOffences = offences.filter((o) => o.frame === null);
console.log(`position-test: ${frames.length} sampled frames, tolerance ${frames[0] ? frames[0].tolerancePx.toFixed(3) : 0}px, offences ${offences.length}`);
console.log('by kind: ' + JSON.stringify(counts));
for (const o of frameOffences.slice(0, 10)) {
  console.log(`FAIL frame ${o.frame} [${o.kind}] ${o.detail}`);
}
for (const o of landmarkOffences.slice(0, 10)) {
  console.log(`FAIL landmark [${o.kind}] ${o.detail}`);
}
if (offences.length) {
  console.log(`FAILED: ${offences.length} position offences (first 10 shown)`);
  process.exitCode = 1;
} else {
  console.log('PASS: food, centreline and badge positions agree for the whole meal');
}
