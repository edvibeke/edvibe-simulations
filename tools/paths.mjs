/* Where everything lives, worked out from this file rather than guessed.


   tools/ sits directly under the repository root. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..');

/* The directory of a sim: sim('newtons-laws') */
export const sim = (name) => path.join(ROOT, 'sims', name);

/* A path inside a sim: inSim('newtons-laws', 'script.js') */
export const inSim = (name, file) => path.join(sim(name), file);

/* The published thumbnail of a sim. */
export const thumb = (name) => inSim(name, 'thumbnail.jpg');

/* Somewhere to put scratch captures without committing them. Created on
   demand, so a clean checkout needs no setup. */
export function scratch(name) {
  const dir = path.join(ROOT, 'tools', '.scratch');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}
