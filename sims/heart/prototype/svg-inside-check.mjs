import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const simRoot = path.resolve(here, '..');
const svgPath = path.join(simRoot, 'art', 'heart-anatomy.svg');
const geometryPath = path.join(here, 'svg-geometry.json');
const geometry = JSON.parse(fs.readFileSync(geometryPath, 'utf8'));
const FIT = geometry.fit;

function makeHtml(points) {
  return `<!doctype html>
<meta charset="utf-8">
<iframe id="frame" src="${pathToFileURL(svgPath).href}" style="width:1000px;height:1000px"></iframe>
<pre id="out"></pre>
<script>
const fit = ${JSON.stringify(FIT)};
const points = ${JSON.stringify(points)};
const out = document.getElementById('out');
const frame = document.getElementById('frame');
frame.addEventListener('load', () => {
  const doc = frame.contentDocument;
  const results = [];
  for (const point of points) {
    const el = doc.getElementById(point.id);
    if (!el || typeof el.isPointInFill !== 'function') {
      results.push({ id: point.id, kind: point.kind || '', x: point.x, y: point.y, inside: false, error: 'missing geometry element' });
      continue;
    }
    const svgX = (point.x - fit.tx) / fit.scale;
    const svgY = (point.y - fit.ty) / fit.scale;
    const local = new DOMPoint(svgX, svgY).matrixTransform(el.getCTM().inverse());
    let inside = false;
    let error = '';
    try {
      inside = el.isPointInFill(local);
    } catch (e) {
      error = String(e);
    }
    results.push({ id: point.id, kind: point.kind || '', x: point.x, y: point.y, svgX, svgY, localX: local.x, localY: local.y, inside, error });
  }
  out.textContent = JSON.stringify(results);
});
</script>`;
}

export function insideMany(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const dir = fs.mkdtempSync('/tmp/opencode/inside-');
  const page = path.join(dir, 'page.html');
  const profile = path.join(dir, 'chrome');
  const dom = path.join(dir, 'dom.html');
  fs.writeFileSync(page, makeHtml(points));
  const stdout = execFileSync('chromium', [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=10000',
    '--dump-dom',
    pathToFileURL(page).href
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  fs.writeFileSync(dom, stdout);
  const match = stdout.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!match) throw new Error('inside check output not found');
  const text = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  return JSON.parse(text);
}

export function inside(id, x, y) {
  return insideMany([{ id, x, y }])[0].inside;
}

export { FIT, geometry };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const ids = ['right_atrium', 'right_ventricle', 'left_atrium', 'left_ventricle'];
  const points = [];
  for (const id of ids) {
    points.push({ id, x: geometry.shapes[id].canvas.centre.x, y: geometry.shapes[id].canvas.centre.y, kind: 'centre' });
    points.push({ id, x: -500, y: -500, kind: 'far-outside' });
  }
  const results = insideMany(points);
  for (const result of results) {
    console.log(`${result.id}\t${result.kind || ''}\t${result.x.toFixed(4)}\t${result.y.toFixed(4)}\t${result.inside ? 'INSIDE' : 'OUTSIDE'}`);
  }
  const centresPass = results.filter((r, i) => i % 2 === 0).every((r) => r.inside);
  const outsidePass = results.filter((r, i) => i % 2 === 1).every((r) => !r.inside);
  console.log(`CENTRES_PASS:${centresPass ? 1 : 0}`);
  console.log(`FAR_OUTSIDE_PASS:${outsidePass ? 1 : 0}`);
  if (!centresPass || !outsidePass) process.exitCode = 1;
}
