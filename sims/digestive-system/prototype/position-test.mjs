import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const PROBE = path.join(HERE, 'position-probe.mjs');

let failed = false;
for (const chew of [0, 3]) {
  const probe = spawnSync(process.execPath, [PROBE, ROOT, String(chew)], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  process.stdout.write(probe.stdout);
  process.stderr.write(probe.stderr);
  const file = path.join(HERE, `position-check-${chew}.json`);
  const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (!result) {
    failed = true;
    console.log(`FAIL: position oracle did not complete for chew=${chew}`);
    continue;
  }
  console.log(`oracle: chew=${chew} counts=${JSON.stringify(result.counts)} offences=${result.offences.length}`);
  for (const o of result.offences.slice(0, 12)) {
    console.log(`FAIL [${o.kind}] ${o.detail}`);
  }
  if (result.offences.length) failed = true;
}

if (failed) {
  console.log('FAILED: independent position oracle reported offences');
  process.exitCode = 1;
} else {
  console.log('PASS: emitted dots follow independent traced routes and SVG masks');
}
