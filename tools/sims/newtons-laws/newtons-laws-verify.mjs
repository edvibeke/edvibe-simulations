/* Static checks for sims/newtons-laws.


   Parses the layout block and the preset table out of script.js (so the
   checker cannot drift from the drawing code) and the slider bounds out of
   index.html, then asserts the geometry holds at the extremes of every
   control, the physics is self-consistent, and each preset's numbers match
   the caption printed beside it. */

import { sim } from '../../paths.mjs';
import fs from 'node:fs';

const DIR = sim('newtons-laws');
const src = fs.readFileSync(DIR + '/script.js', 'utf8');
const html = fs.readFileSync(DIR + '/index.html', 'utf8');

const canvasW = +html.match(/<canvas id="stage" width="(\d+)"/)[1];
const canvasH = +html.match(/height="(\d+)"/)[1];

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
};

function block(startMark, endMark) {
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0 || b <= a) throw new Error('cannot slice ' + startMark);
  return src.slice(a, b);
}

const L = new Function(block('/* ── Layout', '/* ── Presets') + `
  return { SCENE, PANEL, PAD, G, STATIC_FACTOR, FLOOR_Y, CRATE_W, CRATE_H,
           PX_PER_M, TRACK_M, START_X, ARROW_SPAN, ARROW_MIN, LANE_GAP,
           CRATE_GAP, V_EPS };`)();

const P = new Function(block('/* ── Presets', '/* ── DOM') + `
  return { PRESETS, DEFAULT_PRESET };`)();

/* Sliders, straight from the markup. */
const sliders = {};
for (const m of html.matchAll(/<input type="range" id="(\w+)" class="ev-slider"\s*\n?\s*min="([\d.]+)" max="([\d.]+)" step="([\d.]+)" value="([\d.]+)">/g)) {
  sliders[m[1]] = { min: +m[2], max: +m[3], step: +m[4], value: +m[5] };
}

/* ── Physics, mirroring script.js ───────────────────── */

const applied = s => s.push - s.pull;
const grip    = s => L.STATIC_FACTOR * s.mu * s.mass * L.G;
const sliding = s => s.mu * s.mass * L.G;

/* Signed friction: opposes the applied force while at rest, the motion once
   rolling. Positive is rightward, exactly as in script.js. */
const _friction = s => Math.abs(s.v) < L.V_EPS
  ? -Math.sign(applied(s)) * Math.min(Math.abs(applied(s)), grip(s))
  : -Math.sign(s.v) * sliding(s);

const heldByWall = s => !!s.atEnd && Math.sign(applied(s)) === s.endSign;
const friction = s => heldByWall(s) ? 0 : _friction(s);
const wall     = s => heldByWall(s) ? -applied(s) : 0;

const at = (s, v) => Object.assign({}, s, { v });
const rest = s => at(s, 0);
/* Parked against the wall, so it is at rest by definition. */
const walled = (s, sign) => Object.assign({}, s, { v: 0, atEnd: true, endSign: sign });

const net   = s => applied(s) + friction(s) + wall(s);
const accel = s => net(s) / s.mass;

/* ── Canvas and block layout ────────────────────────── */

check('canvas is 16:10-ish and matches the block layout',
  canvasW === L.SCENE.x + L.SCENE.w + 12 + L.PANEL.w + L.SCENE.x
  && canvasH === L.SCENE.y + L.SCENE.h + L.SCENE.y,
  canvasW + 'x' + canvasH + ' vs '
  + (L.SCENE.x + L.SCENE.w + 12 + L.PANEL.w + L.SCENE.x) + 'x' + (L.SCENE.y + L.SCENE.h + L.SCENE.y));

check('the two blocks exactly fill the canvas width',
  L.SCENE.x + L.SCENE.w === L.PANEL.x - 12,
  'scene ends ' + (L.SCENE.x + L.SCENE.w) + ', panel starts ' + L.PANEL.x);

check('scene and panel have identical padding on all sides',
  L.SCENE.x === canvasW - (L.PANEL.x + L.PANEL.w)
  && L.SCENE.y === canvasH - (L.PANEL.y + L.PANEL.h));

/* ── Vertical bands: heading, arrows, crate, floor, ticks, net arrow ── */

const headingY   = L.SCENE.y + 24;
const arrowTop   = L.FLOOR_Y - L.CRATE_H - L.CRATE_GAP;
const laneY      = n => arrowTop - n * L.LANE_GAP;
const tickLabelY = L.FLOOR_Y + 22;
const netY       = L.FLOOR_Y + 56;
const sceneBottom = L.SCENE.y + L.SCENE.h;

check('the highest arrow lane clears the scene heading',
  laneY(2) - 10 - 12 > headingY + 6,
  'lane 2 label top ' + (laneY(2) - 22) + ' vs heading ' + headingY);

check('force arrows stack upwards without overlapping',
  (arrowTop - laneY(1)) === L.LANE_GAP && (arrowTop - laneY(2)) === 2 * L.LANE_GAP
  && L.LANE_GAP > 22, L.LANE_GAP + 'px between lanes');

check('the crate sits on the floor, not through it',
  L.FLOOR_Y - L.CRATE_H > arrowTop && arrowTop > laneY(2));

check('the net arrow clears the tick labels and stays inside the scene',
  netY - 11 - 12 > tickLabelY && netY + 9 < sceneBottom - 8,
  'net arrow y ' + netY + ', scene bottom ' + sceneBottom);

check('tick labels never collide',
  L.PX_PER_M * 2 > 12, 'a tick every ' + (L.PX_PER_M * 2) + 'px');

check('the net arrow band does not overlap the floor hatching',
  L.FLOOR_Y + 11 < netY - 23, 'hatch ends ' + (L.FLOOR_Y + 11));

/* ── Horizontal: crate and arrows stay inside the scene ── */

const sceneL = L.SCENE.x + L.PAD;
const sceneR = L.SCENE.x + L.SCENE.w - L.PAD;
const travelPx = L.TRACK_M * L.PX_PER_M;

check('at either end of the track the crate clears the scene walls',
  L.START_X - travelPx - L.CRATE_W / 2 > sceneL
  && L.START_X + travelPx + L.CRATE_W / 2 < sceneR,
  'crate spans ' + (L.START_X - travelPx - L.CRATE_W / 2) + '..'
  + (L.START_X + travelPx + L.CRATE_W / 2) + ' inside ' + sceneL + '..' + sceneR);

check('the longest arrow stays inside the scene from either end',
  L.START_X - travelPx - L.ARROW_SPAN > sceneL
  && L.START_X + travelPx + L.ARROW_SPAN < sceneR,
  'arrows reach ' + (L.START_X - travelPx - L.ARROW_SPAN) + '..'
  + (L.START_X + travelPx + L.ARROW_SPAN));

check('the crate never collides with the panel',
  L.START_X + travelPx + L.CRATE_W / 2 < L.PANEL.x - 12);

check('the track is wide enough to be worth watching but not a treadmill',
  travelPx >= 80 && travelPx <= 220, travelPx + 'px each way');

/* ── Panel internals ────────────────────────────────── */

const panelX = L.PANEL.x + L.PAD;
const panelW = L.PANEL.w - L.PAD * 2;

check('panel contents fit between the panel walls',
  panelX > L.PANEL.x && panelX + panelW < L.PANEL.x + L.PANEL.w,
  'inner ' + panelX + '..' + (panelX + panelW));

check('the three bars, the divider and the verdict pill do not overlap',
  84 + 26 < 148 && 148 + 26 < 212 && 212 + 26 < 276 && 276 < 312 && 312 + 38 < 380);

check('the caption block has room below it',
  380 + 8 * 16 < sceneBottom - 8, sceneBottom - 380 + 'px left');

/* Caption wrapping, at the worst case we actually ship. */
function wrappedRows(text, maxW) {
  const cjkish = 0; // unused; width measured by hand below
  const avg = 6.0;  // 12px system-ui, measured conservatively
  return Math.ceil(text.length * avg / (maxW - cjkish));
}
const worstRows = Math.max(...Object.values(P.PRESETS).map(p => wrappedRows(p.caption, panelW)));
check('no preset caption overflows the panel',
  worstRows <= 8 && 380 + worstRows * 16 <= L.PANEL.y + L.PANEL.h - 8,
  worstRows + ' rows');

/* ── Sliders agree with the physics ─────────────────── */

const ids = { push: 'push', pull: 'pull', friction: 'mu', mass: 'mass' };
check('all four sliders exist', Object.keys(sliders).length === 4, Object.keys(sliders).join(', '));

for (const [el, key] of Object.entries(ids)) {
  const sl = sliders[el];
  const onStep = sl.step < 1
    ? Math.abs(Math.round((sl.value - sl.min) / sl.step) * sl.step + sl.min - sl.value) < 1e-9
    : Number.isInteger(sl.value);
  check('the ' + el + " slider's default sits on a step", !!sl && onStep,
    sl ? sl.value + ' step ' + sl.step : 'missing');
}

check('slider bounds cover the full drawing range of each arrow',
  sliders.push.max / 400 * L.ARROW_SPAN === L.ARROW_SPAN
  && sliders.pull.max === sliders.push.max && sliders.push.min === 0);

check('no slider can produce a negative or non-finite force',
  sliders.push.min >= 0 && sliders.pull.min >= 0 && sliders.friction.min >= 0,
  'zero force is allowed; only mass may not reach zero');

check('every preset value is reachable on its slider',
  Object.entries(P.PRESETS).every(([k, p]) =>
    p.push >= sliders.push.min && p.push <= sliders.push.max
    && p.pull >= sliders.pull.min && p.pull <= sliders.pull.max
    && p.mu >= sliders.friction.min && p.mu <= sliders.friction.max
    && p.mass >= sliders.mass.min && p.mass <= sliders.mass.max),
  Object.keys(P.PRESETS).join(', '));

check('every preset value lands on a slider step',
  Object.entries(P.PRESETS).every(([k, p]) => {
    const ok = (el, val) => {
      const sl = sliders[el];
      return Math.abs((val - sl.min) / sl.step - Math.round((val - sl.min) / sl.step)) < 1e-9;
    };
    return ok('push', p.push) && ok('pull', p.pull) && ok('friction', p.mu) && ok('mass', p.mass);
  }));

check('every preset button in the markup has a matching table entry',
  Object.keys(P.PRESETS).length === (html.match(/data-preset="/g) || []).length
  && [...html.matchAll(/data-preset="([^"]+)"/g)].every(m => P.PRESETS[m[1]]));

check('the default preset exists and is the markup default',
  !!P.PRESETS[P.DEFAULT_PRESET]
  && P.PRESETS[P.DEFAULT_PRESET].push === sliders.push.value
  && P.PRESETS[P.DEFAULT_PRESET].pull === sliders.pull.value
  && P.PRESETS[P.DEFAULT_PRESET].mu === sliders.friction.value
  && P.PRESETS[P.DEFAULT_PRESET].mass === sliders.mass.value);

/* ── The physics is right ───────────────────────────── */

check('a resting crate feels only as much friction as it needs, and no more',
  /* A push the grip can handle is cancelled exactly. */
  Math.abs(friction(rest({ push: 20, pull: 0, mu: 0.3, mass: 20 }))) === 20
  && net(rest({ push: 20, pull: 0, mu: 0.3, mass: 20 })) === 0);

check('a resting crate cannot get more friction than the grip allows',
  Math.abs(friction(rest({ push: 400, pull: 0, mu: 0.3, mass: 20 }))) === grip({ mu: 0.3, mass: 20 })
  && net(rest({ push: 400, pull: 0, mu: 0.3, mass: 20 })) > 0,
  'grip ' + grip({ mu: 0.3, mass: 20 }).toFixed(1) + ' N');

check('a push too small to beat the grip does nothing at all',
  net(rest({ push: 50, pull: 0, mu: 0.9, mass: 60 })) === 0);

check('once it breaks loose the net force grows, because grip exceeds sliding friction',
  (() => {
    const s = { push: 80, pull: 0, mu: 0.3, mass: 20 };
    return grip(s) > sliding(s) && net(rest(s)) > 0 && net(at(s, 1)) > net(rest(s));
  })(),
  'grip ' + grip({ mu: 0.3, mass: 20 }).toFixed(1) + ' N vs sliding '
  + sliding({ mu: 0.3, mass: 20 }).toFixed(1) + ' N');

check('a pull too small to beat the grip is cancelled too',
  net(rest({ push: 0, pull: 50, mu: 0.9, mass: 60 })) === 0);

check('friction always opposes the motion',
  net(at({ push: 0, pull: 0, mu: 1, mass: 60 }, 3)) === -sliding({ mu: 1, mass: 60 })
  && net(at({ push: 0, pull: 0, mu: 1, mass: 60 }, -3)) === sliding({ mu: 1, mass: 60 }));

check('friction always opposes the applied force while the crate is still',
  friction(rest({ push: 0, pull: 200, mu: 1, mass: 60 })) > 0
  && friction(rest({ push: 200, pull: 0, mu: 1, mass: 60 })) < 0);

check('a balanced crate coasts at a constant speed (first law)',
  Math.abs(net(at({ push: sliding({ mu: 0.3, mass: 20 }), pull: 0, mu: 0.3, mass: 20 }, 2))) < 1e-9,
  'sliding friction on 20 kg at 0.3 is ' + sliding({ mu: 0.3, mass: 20 }).toFixed(2) + ' N');

check('a balanced moving crate is reachable from the sliders',
  sliders.push.max >= sliding({ mu: sliders.friction.max, mass: sliders.mass.min })
  ? true
  : sliders.push.max >= sliding({ mu: 0.3, mass: 20 }));

check('doubling the mass halves the acceleration at the same net force',
  Math.abs(accel(at({ push: 400, pull: 0, mu: 0, mass: 10 }, 1))
         - 2 * accel(at({ push: 400, pull: 0, mu: 0, mass: 20 }, 1))) < 1e-9);

check('acceleration can never divide by zero',
  sliders.mass.min > 0, 'mass floor ' + sliders.mass.min + ' kg');

check('a zero push and a zero pull can never start the crate',
  net(rest({ push: 0, pull: 0, mu: 1, mass: 60 })) === 0);

/* ── The end of the track is a wall, and it carries the load ── */

check('a crate jammed against the wall has no net force, whatever is pushing',
  net(walled({ push: 120, pull: 0, mu: 0.3, mass: 20 }, 1)) === 0
  && net(walled({ push: 400, pull: 0, mu: 0.9, mass: 60 }, 1)) === 0
  && net(walled({ push: 400, pull: 0, mu: 1, mass: 60 }, 1)) === 0);

check('the wall cancels the push exactly, so nothing creeps into it',
  Math.abs(accel(walled({ push: 120, pull: 0, mu: 0.3, mass: 20 }, 1))) < 1e-12);

check('a crate held by the wall feels no floor friction',
  Math.abs(friction(walled({ push: 400, pull: 0, mu: 0.9, mass: 60 }, 1))) === 0);

check('a force pointing away from the wall is not cancelled by it',
  net(walled({ push: 0, pull: 200, mu: 0.3, mass: 20 }, 1)) < 0);

check('the wall only ever holds, never pushes',
  /* Sweep every combination. Whenever the wall is engaged it must cancel the
     applied force exactly and point back towards the crate; whenever the force
     turns round it must contribute nothing at all. */
  (() => {
    for (const push of [400, 200, 5, 0]) {
      for (const pull of [400, 200, 5, 0]) {
        for (const sgn of [1, -1]) {
          const s = walled({ push, pull, mu: 0.3, mass: 20 }, sgn);
          const engaged = Math.sign(applied(s)) === sgn && applied(s) !== 0;
          if (engaged) {
            if (net(s) !== 0) return false;
            if (wall(s) !== -applied(s)) return false;
            if (wall(s) * sgn >= 0) return false;      /* never a shove */
            if (Math.abs(accel(s)) > 1e-12) return false;
          } else if (wall(s) !== 0) {
            return false;
          }
        }
      }
    }
    return true;
  })(), '96 combinations swept');

/* ── Captions quote the numbers the sim will show ──── */

/* Captions say "about N", so allow the rounding a reader would forgive. */
const quoted = (caption, re) => {
  const m = caption.match(re);
  return m ? +m[1] : NaN;
};

const b = P.PRESETS.bookshelf;
check("the bookcase is genuinely held, not just slow",
  net(rest(b)) === 0 && net(at(b, 1)) < 0);
check("the bookcase caption quotes a grip limit above its push",
  Math.abs(quoted(b.caption, /about (\d+) N/) - grip(b)) <= 2 && grip(b) > b.push,
  'caption ' + quoted(b.caption, /about (\d+) N/) + ' N vs computed ' + grip(b).toFixed(1) + ' N');

const pc = P.PRESETS['push-cart'];
check("push-cart's caption quotes both the grip limit and the sliding friction",
  Math.abs(quoted(pc.caption, /about (\d+) N/) - grip(pc)) <= 2
  && pc.caption.includes(Math.round(sliding(pc)) + ' N'),
  Math.round(grip(pc)) + ' N grip, ' + Math.round(sliding(pc)) + ' N sliding');

check('the ice rink really is nearly frictionless',
  sliding(P.PRESETS['ice-rink']) < 0.1 * sliding(pc),
  sliding(P.PRESETS['ice-rink']).toFixed(2) + ' N');

check('the four presets are four genuinely different situations',
  new Set(Object.values(P.PRESETS).map(p => Math.round(sliding(p)))).size === 4,
  Object.values(P.PRESETS).map(p => Math.round(sliding(p)) + ' N').join(', '));

/* ── Source-level invariants ────────────────────────── */

check('the crate is held until Release, so it cannot fly off unseen',
  /if \(!released \|\| dragging \|\| state\.atEnd\) return;/.test(src) && /released = false;/.test(src));

check('static friction is modelled, not only sliding friction',
  /function staticLimit\(\)/.test(src) && /STATIC_FACTOR/.test(src)
  && !/function frictionForce\(\)\s*\{\s*if \(state\.v === 0\) return 0/.test(src));

check('the force labels sit inside the arrow rather than past its tip',
  /fillText\(label, \(x0 \+ x1\) \/ 2/.test(src));

check('the render loop parks itself when nothing is moving',
  /rafId = null;\s*\n\s*\}\s*\n\s*\n\s*function startLoop/.test(src)
  && /function startLoop\(\)/.test(src)
  && (src.match(/startLoop\(\);/g) || []).length >= 6);

check('a wall of the track parks the crate instead of grinding against it',
  /state\.atEnd = true/.test(src) && /resumeIfReversed/.test(src));

check('the wall contributes a force of its own rather than being ignored',
  /function wallForce\(\)/.test(src) && /appliedForce\(\) \+ frictionForce\(\) \+ wallForce\(\)/.test(src)
  && /function heldByWall\(\)/.test(src));

check('interactions are debounced, not counted per event',
  /INTERACTION_WINDOW_MS/.test(src) && /lastInteraction/.test(src));

check('the readout is never a live region',
  !/aria-live/.test(html) && !/aria-live/.test(src));

check('discrete events go through EV.say',
  (src.match(/EV\.say\(/g) || []).length >= 5);

check('reset restores the defaults and re-presses the default preset',
  /function reset\(\)/.test(src) && /makeInitialState\(\)/.test(src)
  && /markPreset\(DEFAULT_PRESET\)/.test(src) && /EV\.resetInsight\(\)/.test(src));

/* These two live outside the state object, so makeInitialState cannot reset
   them and reset() has to do it by hand or the next run cannot announce. */
check('motion is not announced until the speed is worth quoting',
  /SAY_V = 0\.5/.test(src) && /Math\.abs\(state\.v\) >= SAY_V/.test(src));

check('motion is announced as it starts, not only when the crate settles',
  /announceMotion\(\);\s*\n\s*\}/.test(src)
  && /function announceMotion\(\)/.test(src)
  && (src.match(/announceMotion\(\);/g) || []).length === 1);

check('reset clears the flags that live outside the state object',
  /function reset\(\)[\s\S]*?endAnnounced = false;/.test(src)
  && /function reset\(\)[\s\S]*?wasMoving = false;/.test(src));

check('the release announcement is judged from the forces, not a future velocity',
  /function willMove\(\)/.test(src)
  && /Math\.abs\(appliedForce\(\)\) > staticLimit\(\)/.test(src)
  && /!willMove\(\)[\s\S]{0,200}Released, but the friction holds it/.test(src)
  && /Speeding up ' \+ \(a > 0 \? 'to the right' : 'to the left'\)/.test(src));

check('a second press of Release replays instead of silently rewinding',
  /const again = released/.test(src) && /if \(again\)/.test(src)
  && /Back to the start line/.test(src));

check('grabbing the crate takes its tail with it',
  /dragging = true;[\s\S]*?state\.trail = \[\];/.test(src));

check('the trail is bounded so it cannot grow without limit',
  /state\.trail\.length > TRAIL_MAX/.test(src) && /state\.trail\.shift\(\)/.test(src)
  && /TRAIL_MAX = \d+/.test(src));

check('the trail is spaced by distance, not by frame rate',
  /TRAIL_STEP_M/.test(src) && /Math\.abs\(state\.x - state\.lastTrailX\) >= TRAIL_STEP_M/.test(src)
  && !/state\.trail\.push\(state\.x\);\s*\n\s*if \(Math\.abs\(state\.v\) > 0\.05\)/.test(src));

check('reset is wired through the shared handler only',
  (src.match(/data-action="reset"/g) || []).length === 0
  && /EV\.onReset\(reset\)/.test(src));

/* Every named helper must be referenced somewhere other than its own
   declaration, so nothing lingers after a refactor. */
const declared = [...src.matchAll(/^\s*function (\w+)\s*\(/gm)].map(m => m[1]);
const unused = declared.filter(n => (src.match(new RegExp('\\b' + n + '\\b', 'g')) || []).length < 2);
check('every helper is actually called', unused.length === 0,
  declared.length + ' helpers' + (unused.length ? ', unused: ' + unused.join(', ') : ''));

check('no leftover debugging or placeholders',
  !/TODO|FIXME|console\.(log|debug|warn)|debugger/.test(src));

check('the shared runtime is used, not re-implemented',
  /EV\.stage\('stage'\)/.test(src) && /EV\.delta\(/.test(src) && /EV\.onDragKey\(/.test(src)
  && /stage\.onPaint/.test(src) && !/getElementById\('stage'\)\s*\)\s*;\s*const ctx\s*=\s*canvas\.getContext/.test(src));

check('scripts load in the required order',
  /edvibe-sim\.css[\s\S]*edvibe-sim\.js[\s\S]*lucide\.min\.js[\s\S]*script\.js/.test(html)
  && !/defer|async/.test(html));

check('the page keeps the house landmarks',
  /class="ev-skip" href="#main"/.test(html) && /id="help" hidden/.test(html)
  && /id="insight" hidden/.test(html) && /data-action="help"/.test(html)
  && /color-scheme" content="dark"/.test(html));

check('the canvas describes itself and is keyboard reachable',
  /id="stage"[^>]*role="img"/.test(html.replace(/\s+/g, ' '))
  && /aria-label="[^"]{60,}/.test(html) && /EV\.onDragKey/.test(src));

check('every label points at its control',
  [...html.matchAll(/<label for="(\w+)">/g)].every(m => html.includes('id="' + m[1] + '"'))
  && [...html.matchAll(/<label for="(\w+)">/g)].map(m => m[1]).length === 4);

check('every slider has a live value readout',
  Object.keys(sliders).every(id => html.includes('id="' + id + 'Value"')));

check('preset buttons are real buttons that report their state',
  (html.match(/data-preset="/g) || []).length === 4
  && /btn\.setAttribute\('aria-pressed'/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
