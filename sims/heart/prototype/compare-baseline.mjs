import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBaseline } from './heart-baseline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(here, 'baseline-2d.json');

const expected = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const actual = buildBaseline();

const actualScenarioIds = Object.keys(actual.scenarios);
const expectedScenarioIds = Object.keys(expected.scenarios);
let actualBeats = 0;
let expectedBeats = 0;
for (const id of actualScenarioIds) actualBeats += actual.scenarios[id].beats.length;
for (const id of expectedScenarioIds) expectedBeats += expected.scenarios[id].beats.length;

console.log(`SCENARIOS_EXPECTED:${expectedScenarioIds.length}`);
console.log(`SCENARIOS_ACTUAL:${actualScenarioIds.length}`);
console.log(`BEATS_EXPECTED:${expectedBeats}`);
console.log(`BEATS_ACTUAL:${actualBeats}`);

assert.deepStrictEqual(actual, expected);
console.log(`DIFFS:0`);
console.log(`MATCHED:1`);
