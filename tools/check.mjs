#!/usr/bin/env node

/* Run every check for every sim, and summarise.
   usage: node tools/check.mjs            # everything
          node tools/check.mjs newtons-laws
   Exits non-zero if anything fails. */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIMS = path.join(HERE, 'sims');

/* Suites are found by suffix: <sim>-verify.mjs and <sim>-audit.mjs. The
   browser suites are given a longer timeout, since they boot Chrome. */
const SUITES = [
  { suffix: '-verify.mjs', label: 'static',  timeout: 60_000 },
  { suffix: '-audit.mjs',  label: 'browser', timeout: 300_000 }
];

const only = process.argv[2];
const names = (only ? [only] : fs.readdirSync(SIMS))
  .filter(n => fs.statSync(path.join(SIMS, n)).isDirectory());
if (!names.length) {
  console.error('no such sim: ' + only);
  process.exit(2);
}

const run = (cmd, args, timeout) => new Promise(res => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => { p.kill('SIGKILL'); out += '\ntimed out'; }, timeout);
  p.on('close', code => { clearTimeout(timer); res({ code, out }); });
});

/* Two summary styles are in use: "78 passed, 0 failed" and
   "all checks passed" / "2 FAILURE(S)". Read either. */
const tally = out => {
  const m = [...out.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
  if (m) return { pass: +m[1], fail: +m[2] };
  /* Count the individual lines when a suite does not print a total. */
  const passed = (out.match(/^  PASS/gm) || []).length;
  const f = out.match(/(\d+) FAILURE\(S\)/);
  if (f) return { pass: passed, fail: +f[1] };
  if (/all (?:checks|geometry checks) passed/.test(out)) return { pass: passed, fail: 0 };
  return null;
};

let bad = 0;
let pass = 0, fail = 0;

for (const name of names) {
  console.log('\n' + '='.repeat(58) + '\n' + name + '\n' + '='.repeat(58));
  const jobs = [];
  for (const s of SUITES) {
    const f = path.join(SIMS, name, name + s.suffix);
    if (fs.existsSync(f)) jobs.push({ ...s, file: f });
  }
  if (only) {
    /* For one sim, also run the catalogue check: that is the whole point of
       naming a sim, and it is the check a new card is most likely to fail. */
    jobs.push({ label: 'card', file: path.join(HERE, 'card.mjs'), timeout: 120_000,
                args: [name] });
  }

  /* Static first so a typo shows up before Chrome does. */
  const results = [];
  for (const j of jobs) {
    const { code, out } = await run(process.execPath, [j.file], j.timeout);
    results.push({ j, code, out });
  }

  for (const { j, code, out } of results) {
    const t = tally(out);
    const ok = code === 0 && t && t.fail === 0;
    if (t) { pass += t.pass; fail += t.fail; }
    const said = t ? (t.fail === 0 ? 'ok' : 'failed')
                   : 'no summary';
    if (!ok) {
      bad++;
      console.log('  FAIL  ' + j.label.padEnd(8) + said);
      /* Show only the failures, so the reason is not buried. */
      for (const line of out.split('\n')) {
        if (/FAIL|Error|timed out/.test(line)) console.log('        ' + line.trim());
      }
    } else {
      const n = [...out.matchAll(/^  (?:PASS|ok)/gm)].length;
      console.log('  ok    ' + j.label.padEnd(8)
        + (t && t.pass !== null ? t.pass + ' passed' : n + ' passed'));
    }
  }
}

console.log('\n' + '-'.repeat(58));
console.log(bad
  ? bad + ' suite(s) failed. ' + pass + ' checks passed, ' + fail + ' failed.'
  : 'All ' + pass + ' checks passed across ' + names.length + ' sim(s).');
process.exit(bad ? 1 : 0);
