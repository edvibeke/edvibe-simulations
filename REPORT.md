# EdVibe Simulations — Full Review Report

**Date:** 8 October 2026
**Scope:** all 30 simulations, the shared runtime and theme, the landing page, and the check tooling
**Method:** static source audit in 6 parallel batches (science correctness · code conventions · accessibility), plus direct audit of `shared/`, `index.html` and `tools/`. Every claim tagged 🔍 was re-verified against the source during consolidation. Nothing was modified — this is a report only.

**Totals: 183 findings — 10 blockers · 36 majors · 72 minors · 65 nits.**

| Severity | Meaning |
| --- | --- |
| **blocker** | Broken behaviour or wrong science a learner will hit — wrong answer, unreachable feature, contradiction on screen |
| **major** | Convention violated or accessibility barrier a learner would realistically hit |
| **minor** | Should fix, low impact — misleading copy, small visual defect, incomplete reset |
| **nit** | Polish — dead code, wording, punctuation |

---

## 1. Headline results

| Gate | Result |
| --- | --- |
| `node tools/check.mjs` (baseline, 4 sims with suites) | **827 passed, 0 failed** |
| `node tools/card.mjs` × 30 (landing cards, thumbnails, page errors) | **30/30 ok** |
| `node --check` on every `script.js` (run per batch) | all 30 pass |
| `thumbnail.jpg` present, contract size 1080×675 | 30/30 |
| Skip link · `role="img"` + `aria-label` · `color-scheme` · script order | 30/30 |

The automated suites are green — **but they only exist for 4 of 30 sims** (digestive-system, levers-moments, momentum-collisions, newtons-laws). 170 of the findings below live in the 26 sims no tool ever opens, or in behaviour no current check asserts. Green CI here means "the 13% we test passes", not "the library is healthy".

### Per-sim summary (B = blocker, M = major, m = minor, n = nit)

| Sim | B | M | m | n | Total |
| --- | --- | --- | --- | --- | --- |
| ohms-law | 0 | 1 | 0 | 1 | 2 |
| hookes-law | 0 | 2 | 2 | 4 | 8 |
| pendulum | 0 | 1 | 2 | 2 | 5 |
| projectile-motion | 0 | 2 | 2 | 3 | 7 |
| refraction | 1 | 0 | 3 | 3 | 7 |
| terminal-velocity | 0 | 0 | 1 | 0 | 1 |
| wave-interference | 0 | 0 | 1 | 2 | 3 |
| gravity-energy | 0 | 1 | 2 | 0 | 3 |
| gas-laws | 0 | 1 | 2 | 0 | 3 |
| series-parallel-circuits | 0 | 1 | 1 | 1 | 3 |
| levers-moments | 0 | 2 | 2 | 0 | 4 |
| newtons-laws | 0 | 2 | 4 | 0 | 6 |
| momentum-collisions | 0 | 0 | 1 | 2 | 3 |
| covalent-bonding | 0 | 1 | 1 | 3 | 5 |
| ionic-bonding | 1 | 2 | 3 | 2 | 8 |
| dynamic-equilibrium | 0 | 0 | 3 | 4 | 7 |
| electrolysis | 0 | 1 | 3 | 2 | 6 |
| ph-scale | 1 | 2 | 4 | 1 | 8 |
| rates-of-reaction | 0 | 0 | 2 | 2 | 4 |
| states-of-matter | 0 | 1 | 4 | 3 | 8 |
| titration | 0 | 1 | 3 | 3 | 7 |
| enzymes | 0 | 0 | 3 | 1 | 4 |
| food-chains | 0 | 3 | 6 | 2 | 11 |
| heart | 1 | 1 | 2 | 1 | 5 |
| mitosis | 2 | 1 | 2 | 2 | 7 |
| natural-selection | 1 | 3 | 1 | 2 | 7 |
| osmosis | 0 | 1 | 1 | 3 | 5 |
| photosynthesis | 0 | 1 | 1 | 3 | 5 |
| lungs | 1 | 0 | 3 | 5 | 9 |
| digestive-system | 2 | 1 | 3 | 3 | 9 |
| **Sim subtotal** | **10** | **32** | **68** | **60** | **170** |
| Shared runtime / landing / tools (§6–8) | 0 | 4 | 4 | 5 | 13 |
| **Grand total** | **10** | **36** | **72** | **65** | **183** |

---

## 2. The 10 blockers — explained

### B1 · digestive-system — the location badge is pinned to the wrong organ
`sims/digestive-system/script.js:1039` 🔍

```js
const s = clamp(headS === null ? 0 : headS, TUBE_END);
```

The local `clamp` is `(v, lo, hi) => …` (script.js:370). Called with **two** arguments, `TUBE_END` lands in the `lo` slot and `hi` is `undefined`, so the comparison `v > hi` is always false and the function returns `TUBE_END` for every position below the end. The badge therefore never moves: on load it floats over the rectum reading **"Mouth · pH 7.6"** while the readout says "No meal yet"; during a stomach phase it reads "Stomach · pH 7.6" while the legend shows pH 2.0. Line 1127 in the same file calls `clamp(s, 0, TUBE_END)` correctly — this one site was missed.
**Fix:** `clamp(headS === null ? 0 : headS, 0, TUBE_END)`. The existing audit checks meal flow and readouts but never compares the badge's position/pH against `phAt(headS)` — which is why this survived a green suite.

### B2 · digestive-system — all decorative anatomy is frozen
`sims/digestive-system/script.js:1313` 🔍

```js
render(EV.visualTime(dt));
```

`EV.visualTime()` expects an **absolute timestamp** and returns a constant under reduced motion. It is handed the frame **delta** (0–0.05 s), so the time base `t` inside `render` never exceeds ~0.05: contraction waves never travel along the gut (`waveDrift`, `waveCentres`), villi never pulse, bile and bicarbonate flow dots sit still. The model still steps, so the sim *looks* alive while its anatomy is dead still — and no existing check measures motion over time. The correct pattern is in lungs: `EV.visualTime(now)` (script.js:279).

### B3 · mitosis — the chromosome readout is wrong on both key stages
`sims/mitosis/script.js:536` 🔍

```js
chromValue.textContent = currentStage >= 4 ? '8' : '4';
```

Stage order: 0 Interphase, 1 Prophase, 2 Metaphase, **3 Anaphase**, 4 Telophase, 5 Cytokinesis. So:

- **Anaphase shows 4** while the canvas draws 8 separated daughter chromosomes (centromeres have split — this is the one stage where the count change *is* the lesson).
- **Cytokinesis shows 8** while the description beside it reads "each with 4 chromosomes".

Two visible elements contradict each other in the same viewport, in both directions.

### B4 · mitosis — the sim cannot advance under reduced motion
`sims/mitosis/script.js:256` 🔍

```js
const k = Math.min(1, dt * 3.2);   // ~300 ms smoothing
```

`EV.delta()` returns 0 under `prefers-reduced-motion`, so `k = 0` and every `lerp` in `advanceToward` is a no-op. Pressing **Next** or **Play** updates the stage name, description and readout — but the canvas never leaves the previous stage. For a reduced-motion learner the simulation is simply broken, while the text claims it is working.

### B5 · ph-scale — pH display never moves under reduced motion
`sims/ph-scale/script.js:314` 🔍

```js
if (Math.abs(diff) > 0.01) {
  displayedPH += diff * Math.min(1, dt * 12);   // dt = 0 → no change
} else {
  displayedPH = target;                          // unreachable: diff can't shrink
}
```

The smoothing term is multiplied by `dt`, and the snap branch only fires once the difference is already ≤ 0.01 — which can never happen. Moving the slider updates the internal mix but freezes the displayed pH, [H⁺], acid/neutral/alkali classification and beaker colour. The page then contradicts itself: **"Acid added" next to "Neutral / 7.0 / 1.0 × 10⁻⁷"**. The sim's entire output is unreachable for these users.

### B6 · ionic-bonding — keyboard users can never form the bond
`sims/ionic-bonding/script.js:417–442` 🔍

```js
EV.onDragKey(canvas, (x, y) => {
  if (phase !== 'atomic') return;
  electron.x = …; electron.y = …;      // moves the electron
  stage.paint();
}, { … });

canvas.addEventListener('pointerup', (e) => {   // ← ONLY place that tests the drop
  …
  if (d <= DROP_RADIUS) transferElectron();
});
```

The keyboard handler positions the electron on chlorine's target gap and **never checks whether it landed there**. `transferElectron()` — ionisation, the Continue button, the ionic-bond reveal, the insight — is reachable only via `pointerup`. Yet both the canvas `aria-label` and the help panel explicitly instruct "use the arrow keys". A screen-reader or keyboard-only learner drags the electron onto the target and nothing whatsoever happens.

### B7 · refraction — the θ₂ angle indicator draws a near-full ring
`sims/refraction/script.js:202` 🔍

```js
ctx.arc(NORMAL_X, BOUNDARY_Y, arcR,
        Math.PI / 2,
        Math.PI / 2 - theta2,
        false);            // ← wrong direction
```

With `anticlockwise = false` the canvas sweeps **clockwise from start to end**: from `π/2` all the way around to `π/2 − θ₂`, i.e. `2π − θ₂` ≈ 331° at the default angle. Instead of the small wedge between the normal and the refracted ray, the sim renders a green ring around the hit point — and the `θ₂` label (computed for the small wedge at :208) sits in empty space. The θ₁ arc twelve lines above (script.js:181) has the same geometry and correctly passes `true`.
**Fix:** pass `true`.

### B8 · lungs — the diaphragm moves the wrong way
`sims/lungs/script.js:212` 🔍

```js
const controlY = 500 - in_ * 58;
ctx.moveTo(160, 520);
ctx.quadraticCurveTo(450, controlY, 740, 520);
```

The quadratic's apex is `y = 260 + controlY/2`: **510 fully exhaled, 481 fully inhaled** (canvas y grows downward). So as the lungs inflate the dome arches *further up into the chest* — exactly inverted from "the diaphragm contracts and flattens/descends". Inhalation's core mechanism is drawn backwards, and nothing else in the sim (no rib cage, no pressure–volume diagram) carries the mechanism, so this one curve is the entire lesson.

### B9 · heart — the help teaches the wrong ECG wave
`sims/heart/index.html:148` 🔍

> "the flat line before each spike is the **P wave** (the atria contracting)"

Wrong on two counts: the P wave is the small hump that the sim actually draws before each QRS (amplitude 0.13 at script.js:154), and the flat segment is the isoelectric baseline / PR interval. A learner reading this would get an exam question wrong — and the text contradicts the drawing right above it. The rest of the trace description (QRS, T wave) is correct.

### B10 · natural-selection — the population can go permanently extinct
`sims/natural-selection/script.js:159–172` 🔍

```js
if (deathsThisGen >= deathsPerGen) {          // refill only on a generation boundary
  generation++;
  while (beetles.length < 15) { … refill … }
}
```

Deaths are counted while predation runs. If the field empties **before** `deathsThisGen` reaches the threshold (easy at high pressure: a just-refilled cohort is younger than the minimum lifetime, so natural deaths stall short of 20), then `beetles` is `[]` — no more deaths can ever occur, `deathsThisGen` never reaches the boundary, and the refill never fires. Result: `Population: 0 beetles` frozen forever, graphs and generation counter dead, only Reset recovers. The comment says "Ensure population doesn't die out completely" — the guard that exists is the thing that deadlocks.

---

## 3. All 32 major findings — grouped by theme

### 3.1 Reduced-motion freezes state (4 majors + blockers B4/B5)

The root cause is systemic (see §6.1): `EV.delta()` returns 0, and these sims advance **state**, not decoration, with `dt`.

- **projectile-motion** `script.js:220` 🔍 — at launch `posAt(0).y === 0`, which trips the `state.pos.y <= 0` landing test on the *first* frame: the shot lands instantly, no trajectory is ever drawn, the ghost trail can never form. Readouts show predicted values for a flight the user never sees.
- **states-of-matter** `script.js:130` 🔍 — every particle motion is `p.x += p.vx * dt`, so under reduced motion particles never travel to the homes assigned by `reassignHomes`. Pressing Solid/Liquid/Gas changes colour, caption and readouts while the drawing stays the initial 60×60 px clump: "Solid — Locked in a lattice" printed over an unordered pile.
- **ionic-bonding** `script.js:132` 🔍 — `bondProgress` never advances after "Bring ions together": the readout says "Bonded" with Na⁺/Cl⁻ while the atoms sit at their HOME positions, the IONIC BOND label (needs `bondProgress > 0.85`) never appears, and `bondTick` spins forever. Momentum already solves this with `resolveInstantly()` (script.js:732).
- **newtons-laws** `script.js:176` 🔍 — after Release, `state.v` never advances, so `verdict()` takes the `|v| < V_EPS` branch and reports **"Held by friction"** while the same panel shows Net force 43 N and Acceleration 2.17 m/s². `stillBusy()` stays true and rAF spins on a frozen scene. In normal motion the same wrong verdict flashes for one frame before the first integration step.

### 3.2 Perpetual rAF loops (4 majors)

The browser audits' own criterion is "a settled sim stops repainting". 20 of 30 sims have `requestAnimationFrame` with **no `cancelAnimationFrame` anywhere** (grep-verified); these four are the clearest violations:

- **gravity-energy** `script.js:300` 🔍 — `tick()` always reschedules; while **paused** the scene is repainted identically forever. `update()` is gated on `paused`, the rAF is not.
- **gas-laws** `script.js:233` 🔍 — no pause at all; the loop runs from load forever even when the piston hasn't moved (the particle wobble is decorative and already `visualTime`-gated).
- **series-parallel-circuits** `script.js:219` 🔍 — same: traffic dots and glow repaint continuously with the circuit unchanged.
- **covalent-bonding** `script.js:266` 🔍 — `tick` reschedules unconditionally; once fully bonded (`bondAmount() === 1`) the electrons are pinned and **every frame is identical** — a permanent loop, also under reduced motion. (`stop()` exists in the file but is never called.)

Related minors: dynamic-equilibrium, titration, food-chains, mitosis, natural-selection, osmosis, lungs, digestive-system, photosynthesis all repaint while paused or settled (counted as minors below). Full inventory of the 20: digestive-system, dynamic-equilibrium, electrolysis, enzymes, food-chains, gas-laws, heart, hookes-law, levers-moments, lungs, mitosis, momentum-collisions, natural-selection, newtons-laws, osmosis, ph-scale, photosynthesis, series-parallel-circuits, states-of-matter, titration.

### 3.3 Stale preset captions (2 majors)

- **levers-moments** `script.js:563,574,586` 🔍 — every control change calls `markPreset('')` (which clears the *button's* `aria-pressed`) but never `state.preset`, so `caption()` (script.js:145) keeps drawing the preset caption. Move the load arm and the panel still says *"Equal weights at equal distances. The plank is level…"* while the beam is drawn tipped and the readout says "Effort side drops". `NEUTRAL_CAPTION` (script.js:67) is unreachable dead code.
- **newtons-laws** `script.js:552` 🔍 — identical defect: after any slider move the caption still quotes the old preset's numbers (e.g. push-cart's *"The grip can hold about 77 N"* once μ is changed to 1.00).

**Fix is one line, already written correctly elsewhere:** momentum-collisions does `state.preset = null` at script.js:695, and its verify suite asserts it (verify:503). Neither levers' nor newtons' suite covers it — they check only that a caption *string* exists, not that it changes.

### 3.4 Wrong or self-contradictory visuals (6 majors)

- **electrolysis** `index.html:64` vs `script.js:201` 🔍 — help says *"The battery pushes electrons through the wires"*, but the animated wire dots run cathode→battery(−) and battery(+)→anode — **conventional current**, opposite to electron flow. Each half is defensible alone; together the canvas contradicts the stated narrative. (Same class of defect as the ohms-law major below.)
- **titration** `script.js:202` 🔍 — x-axis max is `min(MAX_VB, max(2·veq, 4))`: at 0.1 M acid that is 4 mL, but base can be added to 60 mL and `xPos()` is unbounded. The curve and the pulsing current-point marker leave the plot panel and then the 900 px canvas itself (5 Quick-add clicks → marker at x≈957). Readouts stay right; the primary visualisation loses its own marker.
- **food-chains** `script.js:150` 🔍 — `startX = (W*0.55 − totalW)/2 + 70` centres a chain needing `n × 140` px in ~520 px of panel. At `MAX_CHAIN = 5`, slot 0 lands at **x = −32.5**: the producer card is drawn off the left edge, and slot 4 is painted over by the pyramid panel (drawn afterwards at x≥560). Help even suggests "chains rarely have more than four or five links".
- **food-chains** `script.js:131` 🔍 — `flashPickerError()` saves `header.textContent` as the text to restore; a **second** invalid click inside the 1.2 s window saves the *error message* as the original. The header then permanently displays the error — **Reset does not restore it**, and the scheduled timeout will "restore" the error text anyway.
- **hookes-law** `script.js:405` 🔍 — Reset during an auto-sweep doesn't cancel the sweep's rAF: the running `frame()` keeps writing `state.mass`, `massSlider.value` and `state.points`, then calls `EV.revealInsight()` — so after Reset the mass keeps climbing to 2 kg, the "cleared" graph repopulates, and the insight re-appears. (projectile-motion does this correctly with a cancelled flight id.)
- **photosynthesis** `index.html:94` vs `script.js:47` 🔍 — the insight promises *"at high light the rate levels off (a limiting factor bites)"*, but `lightF = (L/100)^1.15` is **convex** (exponent > 1): each +20 % light step contributes *more* than the last (+0.157, +0.192, +0.207, +0.218, +0.226). The rate accelerates and never plateaus — the sim never shows the light-saturation point (Blackman's law) that its own insight teaches. CO₂ (hyperbolic) and temperature (Gaussian) do saturate; light doesn't.

### 3.5 Physics/interaction integrity (3 majors)

- **ohms-law** `script.js:6` 🔍 — the battery is drawn with **+ on top** and the dots circulate **clockwise** — out of + and around the external circuit, i.e. *conventional current*. The header comment says *"Electrons travel clockwise"* and the dots read visually as electrons. Electron flow with + on top must be counter-clockwise. Either the dots are conventional current and unlabelled, or the animation is reversed electron flow — either way a learner can absorb the wrong direction.
- **projectile-motion** `script.js:312` 🔍 — Angle/Speed sliders stay live during flight. Because `v0x()/v0y()/posAt()` read the sliders directly, changing them mid-air kinks the drawn trajectory (old trail points used old values) and rotates the barrel; worse, on landing `state.landed` is recomputed from the **current** slider values, so Range/Height/Time report the analytic full flight of the *new* settings while the ball lands at a different x on screen. Readouts no longer agree with the drawing.
- **hookes-law** `script.js:407` 🔍 — the auto-sweep is driven by raw `performance.now()` wall-clock (`frac = (now − start)/duration`), not `EV.delta`/`EV.visualTime`, so it keeps animating under reduced motion — violating "nothing animates on its own".

### 3.6 Accessibility majors (7 majors)

- **heart** `index.html:115` 🔍 — `aria-live="polite"` on the whole `<section class="ev-readout">`. Six values are rewritten every frame by the rAF loop: a screen-reader user gets a continuous flood. This is the exact anti-pattern the README forbids ("Readout values are deliberately not live regions"), and it is the **only** sim with a live region at all — grep-verified.
- **levers-moments** `index.html:36–37, 108–119` 🔍 — drag-driven canvas whose `aria-label` and help text never mention arrow keys / focusing the canvas (counted: **0** occurrences of "arrow key"), and `EV.onDragKey` (script.js:637) passes no `label` option. All five other drag sims mention them. README requires both the label and the help to say so.
- **newtons-laws** `index.html:36–37` 🔍 — canvas `aria-label` doesn't mention arrow keys (the help does). Half of the convention.
- **pendulum** `index.html:56`, `script.js:212` 🔍 — Pause is a state toggle with **no `aria-pressed`**; `EV.onToggle` is unused. The accessible name does swap Pause↔Play, but the repo convention ("`aria-pressed` on toggles") is explicit. Same violation, grep-verified, in: **dynamic-equilibrium, enzymes, natural-selection, osmosis, wave-interference** — 6 of the 9 pause buttons; only digestive-system, heart and lungs declare it.
- **ph-scale** `script.js:270` 🔍 — **no `EV.say()` anywhere.** The slider exposes only its raw −100…100 value to assistive tech; pH, [H⁺] and the acid/neutral/alkali classification — the central quantity of the sim — are never communicated. Crossing between acid and alkaline is the textbook discrete event `EV.say` exists for.
- **food-chains** `script.js:111` 🔍 — a rejected organism add produces only a 1.2 s visual header flash; no `EV.say()`, so a screen-reader user gets no indication the click was refused. (Same function calls `lucide.createIcons()` directly instead of `EV.icons()`.)
- **natural-selection** `script.js:433` 🔍 — `avgValue.style.color = colourFor(…)` paints the "Average colour" readout dark green (≈`#296b34` at load) on `.ev-readout__item` `#1e293b` → ≈ **2.3:1**, falling to ≈1.6:1 as the population darkens. WCAG AA needs 4.5:1; the word becomes hardest to read exactly when it changes.

### 3.7 Test coverage (1 major, cross-cutting)

**26 of 30 sims have no `tools/sims/<name>/` suite at all**, so `node tools/check.mjs` never opens them — including every sim in this report's blocker list except digestive-system. README step 6 ("Add checks under `tools/sims/<sim-name>/`") has been skipped since the suites were written. See §8.

---

## 4. Complete minor inventory (68)

| Sim | # | Finding |
| --- | --- | --- |
| hookes-law | 1 | `script.js:432` Reset doesn't re-seed the initial graph point (load records one, reset leaves `points = []`) — reset ≠ initial state |
| hookes-law | 2 | `index.html:76` Help describes only the two sliders; never mentions the **Auto-sweep** button, the control that triggers the insight |
| pendulum | 1 | `index.html:77` Help never mentions the **Pause** button, the only way to stop the motion |
| pendulum | 2 | `script.js:46` Period readout uses the small-angle formula (2.01 s at 1 m) while the drawn pendulum starts at 30° (true ≈ 2.04 s) — a stopwatch on the animation won't match; label it as the ideal/small-angle period |
| projectile-motion | 1 | `index.html:76` Help never mentions the "Try 45° max range" preset button |
| projectile-motion | 2 | `script.js:229` Landing (range/height/time) is a discrete event never announced via `EV.say()` — peer sims announce exactly this class of event |
| refraction | 1 | `script.js:234` `RAY_LEN = 340` vs `BOUNDARY_Y = 280`: the first-load "drag me" hint is drawn at y ≈ −2.4, **above the canvas top edge**; the handle also leaves the canvas for θ₁ ≲ 34.6°. The affordance never appears |
| refraction | 2 | `script.js:131` Reflected ray always stroked at 0.35 alpha — including during total internal reflection, where it carries *all* the light and the insight says "it reflects back entirely" |
| refraction | 3 | `EV.say()` never called; entering total internal reflection (the sim's big event) is silent — only `—` appears in the DOM readouts |
| terminal-velocity | 1 | `script.js:89` Insight reveal across repeated drops needs runtime confirmation that `resetInsight` re-arms (drop path vs `EV.onReset`) |
| wave-interference | 1 | `script.js:326` "meet" classification uses rounded path-difference bands (±0.12/0.38) — an on-screen heuristic, approximate near band edges |
| gravity-energy | 1 | `script.js:105` `Math.max(dx, 0.03)` floors the step on shallow slopes — numerical guard, slightly approximate creep |
| gravity-energy | 2 | `script.js:111` Turn detection flips on `trackY(nx) ≤ hTurnPx`, which can trigger a frame before the exact apex in discrete steps |
| gas-laws | 1 | `script.js:234` `dt` computed and never used |
| gas-laws | 2 | `script.js:228` `revealInsight()` called on every `syncReadout` while V ≤ 20 — idempotent but wasteful |
| series-parallel-circuits | 1 | `script.js:239` Insight triggers on the first mode toggle (idempotent, but fires earlier than the "compare both" intent) |
| levers-moments | 1 | `script.js:637` Arrow keys only move the **load**; the effort-arrow drag has no keyboard equivalent, though help promises dragging both (effort slider is a partial workaround) |
| levers-moments | 2 | `script.js:125` "Work in/out … J" is force × arm = a **moment** (N·m), not work (J); true work needs the angle turned |
| newtons-laws | 1 | `script.js:223` Heading "Net force = push − pull − friction" only holds for rightward motion; moving left, friction acts right. The model computes it correctly, the displayed formula doesn't |
| newtons-laws | 2 | `index.html:58` Slider labelled "Friction" shows μ (0.30, dimensionless); identically-worded readout shows newtons (77 N) — same word, two quantities |
| newtons-laws | 3 | `index.html:36` Canvas `aria-label` omits arrow keys (see majors) |
| newtons-laws | 4 | `index.html:111` A sim titled "Newton's Laws" presents only the 1st and 2nd laws — no action–reaction pair anywhere in help, insight or drawing |
| momentum-collisions | 1 | `index.html:119` Help promises "watch one overtake the other", which the model cannot produce: carts start opposed, cannot pass, and post-collision `vB' − vA' ≥ 0` always |
| covalent-bonding | 1 | No `EV.say()` — bond formed/broken (the only discrete events) never announced; the first bond only speaks incidentally via `revealInsight()` |
| ionic-bonding | 1 | No `EV.say()` — electron transfer/ionisation, the core event, is silent (see B6) |
| ionic-bonding | 2 | `index.html:62` Help never mentions the **Continue / "Bring ions together"** button required to finish the bond |
| ionic-bonding | 3 | `script.js:202` Sodium's third shell is never drawn: atomic Na shows rings of 2 and 8 plus a lone electron floating outside an *invisible* shell-3 ring — the "one outer electron" has no visible shell (electron counts and Na⁺/Cl⁻ charges are correct) |
| dynamic-equilibrium | 1 | `script.js:380` Paused scene repainted identically forever (`render + syncReadout + rAF` not gated) |
| dynamic-equilibrium | 2 | `script.js:398` No `EV.say()` for +10 A / +10 B / pause — SR users get no feedback that amounts changed |
| dynamic-equilibrium | 3 | `index.html:70` Help lists add A / add B / temperature; the **Pause** control is never mentioned |
| electrolysis | 1 | `script.js:522` Dead insight-wiring leftovers (`origTick`/`wrappedTick`, `everPowered` written never read) plus a `setInterval(checkInsight, 500)` that polls forever after the insight is shown and is never cleared |
| electrolysis | 2 | `script.js:132` Bubble spawning is gated on `powered` + `Math.random()` only — switching reduced motion mid-run freezes ions but spawns keep firing ~9/s while `updateBubbles` (dt=0) can never pop them → unbounded bubble array |
| electrolysis | 3 | `script.js:468` No `EV.say()` for power on/off — the sim's single discrete event |
| ph-scale | 1 | `script.js:85` Classification reports "Neutral" for 6.5 ≤ pH ≤ 7.5 — pH 6.6 shown as Neutral contradicts neutral = 7 at 25 °C |
| ph-scale | 2 | `script.js:25` pH 8 is light green, visually the same family as pH 7; a real universal indicator is blue-green/teal there — the band won't match a classroom wall chart |
| ph-scale | 3 | `script.js:261` Marker pH text (12 px mono, dark) inside a 20 px light triangle — glyph edges spill onto the dark canvas and disappear at the extremes |
| ph-scale | 4 | `script.js:307` At rest (pure water, no bubbles) the scene is fully static yet rAF repaints it from page load |
| rates-of-reaction | 1 | `script.js:385` Rate = `reactionTimes.length / 5` always divides by 5 s even during the first 5 s — under-reports (10 reactions in 2 s shows 2.0/s, true 5.0/s). Should be `/ Math.min(elapsed, 5)` |
| rates-of-reaction | 2 | `script.js:448` No `EV.say()` for catalyst toggle/reset |
| states-of-matter | 1 | `script.js:24` Solid marker at energy 15 % / −10 °C sits ~12 px below the drawn heating curve (curve is at −5 °C for e=15); liquid and gas markers are on it |
| states-of-matter | 2 | `script.js:281` Melting/boiling points never labelled — dashed 0 °C/100 °C lines carry no text and help never names them |
| states-of-matter | 3 | `index.html:77` Copy says liquid particles are "touching", but liquid homes scatter 48 particles of r=7 across 380×176 px and the lattice spacing is 42×30 px — both > 2 diameters apart |
| states-of-matter | 4 | `script.js:384` Reset sets `switches = 0` then `setState(INITIAL_STATE)` increments it again when the state changes — after a reset from Gas the insight re-arms at 3 switches, not 4 |
| titration | 1 | `script.js:332` `tick()` reschedules unconditionally — settled apparatus + curve repainted at 60 fps forever |
| titration | 2 | `script.js:185` Under reduced motion droplets freeze at `t = 0` at the burette tip and never clear; repeated clicks pile them up |
| titration | 3 | `index.html:77` Help omits the **Acid concentration** slider entirely and implies the setup is fixed at 1.0 M ("The burette holds 1.0 M…") while the slider allows 0.1–2 M |
| enzymes | 1 | `script.js:243` vs `:434` Two disagreeing denaturation labels: canvas flips to "ENZYME (denatured)" at denat > 0.5, the Active-site readout still says "Partly damaged" until > 0.7 — both visible in the 52–58 °C band |
| enzymes | 2 | `index.html:75` Help mentions only the temperature slider; pH slider and Pause never mentioned, though the insight relies on pH |
| enzymes | 3 | `index.html:80` Help/insight say denaturation is "permanent", but `denaturation()` is recomputed from the slider — cooling 70 °C → 37 °C restores 100 % activity. Copy and behaviour teach opposite rules |
| food-chains | 1 | `script.js:399` Level-5 percentage renders "0.0 %" (`pct = 0.01` → `toFixed(1)`) — true value 0.01 % |
| food-chains | 2 | `script.js:443` Idle loop repaints the fully static initial state forever |
| food-chains | 3 | `index.html:65` Help never mentions the "Clear the chain" button |
| food-chains | 4 | `script.js:141` `clearChain()` doesn't reset `chainCount` — after Clear the insight re-reveals on the first organism instead of the third |
| food-chains | 5 | `index.html:40` `aria-label` on a plain `<div>` (generic role cannot be named) — needs a group/list role |
| food-chains | 6 | `script.js:100` Validation only enforces `trophic === last + 1`, so biologically implausible links (grass → rabbit → frog) are accepted despite copy asserting "each organism eats only the one before it" |
| heart | 1 | `index.html:103` Pause pairs `aria-pressed="true"` with the visible label "Resume" — AT announces a pressed toggle while the text says the opposite |
| heart | 2 | `index.html:143` Deoxygenated vs oxygenated blood conveyed by **colour alone** — no legend in help, canvas or readouts |
| mitosis | 1 | `index.html:45` `role="tablist"`/`role="tab"` + `aria-selected` with no `role="tabpanel"`, no ids, no roving tabindex, no arrow-key navigation |
| mitosis | 2 | `script.js:521` Idle loop repaints a converged, static diagram forever |
| natural-selection | 1 | `script.js:315` `Math.floor(b.t * NBINS)` not clamped below — refill beetles can have `t < 0`, writing invisible `bins[-4]`; histogram bars no longer sum to "Population: N" |
| osmosis | 1 | `script.js:417` Two history curves distinguished by colour only, with no in-canvas key; and three naming schemes (readouts "Water on left/right", chambers "SIDE A/B", curves unlabelled) must be mapped by the learner |
| photosynthesis | 1 | `script.js:159` `resetRun()` never clears `bubbleAcc` — a near-complete bubble from the previous run makes the first bubble after Reset pop instantly |
| lungs | 1 | `script.js:138` Airflow "arrow" path is self-intersecting (`moveTo→lineTo×3→closePath`) → a bow-tie, not an arrowhead; direction then rests on two near-identical fills (`rgba(125,211,252,.85)` vs `rgba(94,234,212,.7)`) — colour-only and almost indistinguishable |
| lungs | 2 | `script.js:298` `resetRun()` doesn't clear `lastIn`; after Reset `inhaling` computes false at `in_ = 0`, so the exhaled branch fires immediately and dumps stray CO₂ into a just-emptied body |
| lungs | 3 | `script.js:240` "O₂ in blood" = `93.5 + depth×0.04` (ignores rate), "CO₂ in blood" = `6.4 − rate×0.12` (ignores depth) — each readout is a disguised copy of one slider, not an outcome of gas exchange |
| digestive-system | 1 | `index.html:125` "lower the stomach pH and watch salivary amylase die" is undemonstrable: mouth pH is fixed at 6.8 and amylase only runs in the chew window. The slider actually changes pepsin and when duodenal digestion starts |
| digestive-system | 2 | `script.js:1402` Reset restores every slider and the pause toggle but **not** the Labels toggle — a sim left with Labels off stays off after Reset (initial state is on) |
| digestive-system | 3 | `script.js:500` `feed()` resets `dig`, `absorbed`, `particles` but not `passed` — the footer's "left over" accumulates leftovers from every previous meal |

---

## 5. Complete nit inventory (60)

| Sim | Finding |
| --- | --- |
| ohms-law | `script.js:27` unused `const canvas` (dead code) — this pattern recurs in **20+ sims** (hookes-law:25, pendulum:13, projectile-motion:18, dynamic-equilibrium:24, electrolysis:34, ph-scale:52, rates-of-reaction:23, states-of-matter:62, titration:21, enzymes:28, food-chains:55, mitosis:146, natural-selection:32, osmosis:22, photosynthesis:18) |
| hookes-law | `index.html:77` Help says points are added when you "release" the slider; they're added on every `input` during the drag (≥1 N apart) |
| hookes-law | `script.js:324` Recorded points (yellow, r=5) vs current point (red, r=8) distinguished only by colour/size — red/yellow is the classic CVD-confusable pair; add a shape or label |
| hookes-law | `script.js:82` At the extreme corner (m=2 kg, k=20 N/m) the mass block extends to y≈552 > 540 — bottom ~12 px clipped off-canvas |
| pendulum | `script.js:62` Bob trail not cleared when string length changes mid-swing — stale points from the old radius linger ~1 s, producing a kinked trail |
| projectile-motion | `script.js:11` `WORLD.maxHeightM` declared, never read |
| projectile-motion | `script.js:42` `state.done` written, never read |
| refraction | `index.html:35` `aria-label` runs two sentences together ("…two media Use the arrow keys…") — missing full stop (same in covalent-bonding:36, ionic-bonding:36) |
| refraction | `index.html:73` Third readout "n₁ sin θ₁ / sin θ₂" is identically n₂ by construction (θ₂ is *derived* from Snell's law) — circular, looks like experimental verification |
| refraction | `index.html:56` Four preset buttons expose no `aria-pressed`, unlike the repo's preset groups (heart, levers) |
| wave-interference | `script.js:196` First-time "← drag me" hint — correct behaviour, note only |
| wave-interference | `index.html:36` Canvas aria-label correctly documents arrow keys — note only |
| series-parallel-circuits | `script.js:123` dt usage under reduced motion holds dots still — correct, note only |
| momentum-collisions | `script.js:594` "Left/Right cart speed" quotes exit speed after impact while the cart is drawn parked with no velocity arrow — labelling it "exit speed" would remove the mismatch |
| momentum-collisions | `script.js:300` Dashed lines commented "Where each cart started" are drawn at `cartX()` every frame — they track the carts; comment and likely reader interpretation are wrong |
| covalent-bonding | `index.html:42` `<label>Interaction</label>` has no `for` and no control — unassociated text (this sim has no range inputs) |
| covalent-bonding | `index.html:79` Insight says the electron pair pools "in the overlap region", but at full bond the shells (r=50, centres 110 px apart) don't overlap — the pair floats in the gap |
| covalent-bonding | `script.js:275` Dead code: `stop()` never called; `'H₂'.startsWith('H') ? 'H' : 'H'` (both branches equal); unused `COLORS.atomDim/shell/cloud` |
| ionic-bonding | `script.js:62` Dead code: `electron.dragging` written never read; `COLORS.targetZone` unused; `isIon(which)` ignores its parameter; empty if/else in `drawSodium` |
| ionic-bonding | `index.html:36` aria-label missing sentence break |
| dynamic-equilibrium | `script.js:167` `onPaint` renders with `performance.now()` for the reaction-flash decay instead of `EV.visualTime()` — in-flight flash keeps animating under reduced motion (rates-of-reaction does this correctly) |
| dynamic-equilibrium | `script.js:410` Pause uses label swap only, no `aria-pressed` (`EV.onToggle` available) |
| dynamic-equilibrium | `script.js:24` unused `const canvas` |
| dynamic-equilibrium | `index.html:36` aria-label says "a graph of their amounts over time"; the graph plots **composition fraction** (y-axis "COMPOSITION", 0–100 %) |
| electrolysis | `script.js:34` Dead code: unused `canvas`; `lx`/`ly` computed then never drawn; `if (t < 1)` always true |
| electrolysis | `script.js:126` Once all Cu²⁺ deposit (conc 0 %) the anode keeps bubbling O₂ indefinitely while nothing evolves at the cathode — in reality H₂ appears there once Cu²⁺ is depleted |
| ph-scale | `script.js:52` unused `canvas` |
| rates-of-reaction | `script.js:23` unused `canvas` |
| rates-of-reaction | `script.js:412` `stop()` only ever runs immediately before `start()` inside `reset()` — effectively pointless code |
| states-of-matter | `script.js:62` unused `canvas` |
| states-of-matter | `script.js:141` Damping applied per **frame** (`p.vx *= cfg.damping`), not per second — motion amplitude depends on refresh rate (noticeably harder damping at 120 Hz) |
| states-of-matter | `index.html:77` Insight calls the liquid "Room-temperature liquid" while the liquid readout is 50 °C |
| titration | `index.html:65` Static placeholders `pH 1.0` / `eq 2.0 mL` wrong for initial state (correct: 0.0 pH, 20.0 mL) — corrected on load; first-paint/JS-off only |
| titration | `script.js:21` unused `canvas` |
| titration | `index.html:88` Insight claims a single drop jumps pH "from about 3 to 11"; at default 1.0 M the real jump is ≈1.3 → 12.7 |
| enzymes | `script.js:28,130` unused `canvas`; unused `now` parameter on `step()` |
| food-chains | `script.js:12` "Energy at top: 1000" has no unit (source comments say "arbitrary units" but the readout is a bare number) |
| food-chains | `script.js:169` `respawnAllParticles()` never called (dead code) |
| heart | `script.js:1735` `init()` lines inside `EV.stage(...)` over-indented (cosmetic) |
| mitosis | `index.html:66` Help mentions Next, Play and the dots, but never **Previous** |
| mitosis | `script.js:146` unused `canvas` |
| natural-selection | `script.js:32,51` unused `canvas`; `elapsed` accumulates and is never read |
| natural-selection | `script.js:460` Loop repaints a settled scene while paused (repo is split on this; see §3.2) |
| osmosis | `script.js:22` unused `canvas` |
| osmosis | `script.js:288` Amber "partially permeable membrane" label sits on the amber dashed line, overlapped by passing particles |
| osmosis | `script.js:476` Loop repaints while paused |
| photosynthesis | `script.js:18` unused `canvas` |
| photosynthesis | `index.html:26` No Pause control anywhere — a dark, static beaker still repaints every frame |
| photosynthesis | `index.html:98` "this sim only shows the light-dependent part" sits awkwardly with CO₂ (a Calvin-cycle input) gating the same rate readout |
| lungs | `script.js:228` "left lung" painted at viewer-left; an unlabelled anterior view puts the subject's left lung at viewer-right — opposite of the convention digestive-system documents |
| lungs | `script.js:268` `spawnExchange('co2', 1)` called twice in a row — one lung gets two dots |
| lungs | `script.js:62` `phase = breathT * (rate/60) % 1` rescales elapsed time on every rate change → lungs snap mid-breath when the slider moves |
| lungs | `script.js:87` `render(dt, now)` never reads `dt` |
| lungs | `script.js:252` Loop repaints while paused |
| digestive-system | `script.js:475` For the mouth, `enzymeFactor` falls through to the pancreatic curve (optimum 7.5) — the `ph < 3.4` kill-rule meant to model acid destroying amylase can never fire in the mouth (dead branch) |
| digestive-system | `index.html:116` Help omits the Labels button and the fibre slider |
| digestive-system | `script.js:1312` Loop repaints while paused |

---

## 6. Shared runtime audit (`shared/edvibe-sim.js`)

The runtime is well built — HiDPI fit with re-fit on resize and monitor change, `onPaint` on re-fit, one polite announcer, help/reset wiring, `visualTime`, `onDragKey`. All 30 pages load it in the required order with `role="img"`, skip link and `color-scheme` present (grep-verified). Four real issues:

### 6.1 [major, systemic] `EV.delta() = 0` freezes state machines, not just animation
`shared/edvibe-sim.js:32` — zeroing the clock under reduced motion is right for *decoration*, but at least **7 blockers/majors** (B4, B5, §3.1 ×4, plus hookes' wall-clock sweep) are *state* advanced by `dt`: interpolation, progress counters, verdict logic. README promises "buttons stay responsive" — they update text while the canvas and readouts disagree. The fix pattern already exists in-repo (momentum's `resolveInstantly()`, snap-on-interaction branches). Either ship a documented snap helper (`EV.stepTo()` / instant-settle under RM) or state loudly in the README: *state transitions must not be `dt`-lerped.*

### 6.2 [major] Reduced motion enabled **after** page load is never armed
`shared/edvibe-sim.js:139` — `repaintOnInteraction()` begins with `if (!reducedMotion()) return;`. Its `motionQuery` change-listener and all its `input`/`change`/`click`/`pointerup`/`keyup` listeners are registered *inside* the function — so if the preference is absent at `DOMContentLoaded`, they are never registered at all. A user who turns on reduced motion mid-session freezes the sim clock with **no** repaint-on-interaction fallback. Impact varies (some sims sync readouts directly in handlers, some repaint forever anyway per §3.2), but the feature's contract is silently void. Move the media-query listener (and ideally the event listeners) outside the early return.

### 6.3 [minor] `MediaQueryList.addEventListener` unguarded
`shared/edvibe-sim.js:119` — `mq.addEventListener('change', …)` throws on engines where `MediaQueryList` lacks `addEventListener` (Safari ≤ 13.1, some embedded webviews). This runs inside `EV.stage()`, so the exception kills the whole sim at load. Use `mq.addEventListener?.(…)` with an `addListener` fallback (the file already uses `?.` elsewhere).

### 6.4 [minor] `onReset` null-checks `#insight` but not `#help`
`shared/edvibe-sim.js:217` — `document.getElementById('help').hidden = true` throws if a future page wires Reset without a `#help` panel, while `#insight` right below is guarded. Latent, one-line fix.

### 6.5 [nit] Stale comment
`shared/edvibe-sim.js:4` — "the behaviour that used to be copy-pasted into all 26 pages" (there are 30).

**Runtime features confirmed sound:** resize/DPR watcher behaviour, `say()` clear-then-set with timer and `resetInsight` cancellation, `revealInsight` idempotence, `onDragKey` clamping via logical size with `start` getter, `paintAll`/`refitAll`, icon fallback when Lucide missing, `wireHelp` `aria-expanded`/`aria-controls`.

---

## 7. Landing page audit (`index.html`)

**Automated: 30/30 cards pass `tools/card.mjs`** — every card titled after its folder, filed in the right subject section, identical width to its row-mates, grid-aligned in the column its source order implies, blurb 40–110 chars phrased as a question (no "slider/button/click"), thumbnail loads at exactly **1080×675**, `All (n)` counts itself, and the page loads with **zero JS errors**.

Manual findings:

- **[minor]** Filtering is silent to assistive tech: `apply()` moves `aria-pressed` and toggles `hidden`, but nothing announces the result. One `EV.say(\`${n} simulations shown\`)` in `apply()` (or a live region on the count) closes it.
- **[nit]** `.ev-section:not([hidden]) { display:block }` is redundant — `[hidden]` already hides, and the rule only matches visible sections.
- **[nit]** The hardcoded `<span id="evCount">30</span>` is correct today and self-corrects at load — fine, just noting it's the only hand-maintained number on the page.

Everything else is in order: hero → h2 sections → h3 cards heading hierarchy, skip link to `#main` (`tabindex="-1"`), `:focus-visible` on cards, card hover transform disabled under reduced motion, filter nav labelled, `meta description`/favicon/`color-scheme` present, EV + Lucide loaded last so icons render on `DOMContentLoaded`.

---

## 8. Tools & documentation audit

- **[major] Coverage: 4/30.** `tools/sims/` contains only digestive-system, levers-moments, momentum-collisions, newtons-laws. `check.mjs` discovers suites by filename, so 26 sims are structurally untestable by the runner — every blocker except digestive-system lives there. README step 6 has not been enforced since the suites were written.
- **[nit]** `tools/README.md:95` — "Three sims have suites today" (there are four).
- **[nit]** `card.mjs` only runs when `check.mjs` is given a single sim name — the whole-card sweep I ran manually is never part of the default suite, despite being cheap and high-value.
- **Strengths worth keeping:** suites are browser-driven and measure pixels rather than trusting the model; `parse.mjs` reads geometry constants *out of* `script.js` so checks can't drift; ports are OS-assigned so suites run side by side; nothing hardcodes a path.
- **Coverage gaps the audits proved** (from the suites that exist): none assert stale-preset-caption clearing (levers, newtons), badge position/pH (digestive), decorative motion advancing over time, `stage.onPaint` registration, Reset restoring toggles, or help/insight claims against the model.

---

## 9. What is right — verified, not just assumed

- **Baseline green:** 827 checks pass; all 30 `script.js` parse; all 30 cards and thumbnails pass the contract.
- **Science confirmed correct in place:** Boyle's law keeps T frozen (`PV = 5000`) · series/parallel circuit maths (`P = E²/4R` vs `E²/R`) · momentum's four preset captions re-derived by hand (4.7/10.4 m/s, 0.4 m/s, 3.2 m/s, ⅖ energy loss) · levers moment arithmetic · food-chains 10 % rule (`Math.pow(0.1, i)`) matching pyramid and readout · osmosis gradient/equilibrium · titration curve shape, equivalence at pH 7, phenolphthalein 8.2 threshold · enzymes optimum 37–40 °C with monotonic collapse · heart dual circuits, valve model, LV wall thickness, and its blurb arithmetic (66–67 mL × 70 ≈ 4.7 L/min; EF 42/120 = 35 %) · wave superposition form (`k = 2π/λ`, `v = λf`) · gravity-energy `PE + KE = m·eh` constant.
- **Conventions holding in all 30:** IIFE + `'use strict'`, `EV.stage` with logical coordinates, `stage.onPaint` (29/30 — only digestive misses), `EV.onReset`, script order, skip link, `role="img"` + `aria-label`, `color-scheme`, hidden `#help`/`#insight`, no readout live regions (heart's `aria-live` is the sole violation), no absolute paths, no hand-rolled help toggles.
- **Best-engineered sims:** momentum-collisions (the reference for preset clearing, instant-resolve under RM, `EV.say`, idle stop), heart (model depth, full reset, `EV.onToggle`), newtons-laws/levers-moments (the only ones with full browser audits — which is why their blockers are subtler, caption/verdict logic rather than drawing bugs).

---

## 10. Prioritized fix plan

**P0 — learners are getting wrong answers (10 blockers, ~1 day)**
1. digestive-system `:1039` add the missing `0` arg; `:1313` `render(EV.visualTime(now))`.
2. mitosis `:536` stage-based chromosome table; `:256` snap `displayedParams = targetParams` when `EV.reducedMotion()`.
3. ph-scale `:314` snap `displayedPH = target` under reduced motion (and gate bubble spawn on `EV.visualTime`).
4. ionic-bonding `:417` run the same drop-target test in the `onDragKey` handler (and `EV.say` on transfer).
5. refraction `:205` arc `anticlockwise = true`.
6. lungs `:212` invert the diaphragm (`controlY = 442 + in_ * 58` semantics: dome lower/flatter when inhaled) — verify against a frame.
7. heart `index.html:148` rewrite the P-wave sentence.
8. natural-selection `:159` refill whenever `beetles.length === 0` (or make the generation boundary independent of the death counter).

**P1 — conventions & accessibility (one focused pass)**
9. `state.preset = null` in levers `:563` and newtons `:552` (copy momentum `:695`) + a verify assertion each.
10. heart: remove `aria-live` from the readout section `index.html:115`.
11. Add `aria-pressed` to the 6 bare pause buttons; prefer `EV.onToggle`.
12. Arrow-key copy: levers help + aria-label; newtons aria-label; pass `label` to `EV.onDragKey`.
13. Reduced-motion snaps for projectile-motion, states-of-matter, ionic bonding, newtons-laws verdict (use momentum's `resolveInstantly` pattern).
14. Stop the perpetual loops: cancel rAF when paused/settled in the 10 sims where the scene is static (§3.2 list).
15. `EV.say()` pass over ph-scale, mitosis, refraction (TIR), ionic/covalent bonds, food-chains rejection, projectile landing, dynamic-equilibrium.

**P2 — runtime & tooling (protects everything above)**
16. Runtime: arm `repaintOnInteraction` regardless of load-time preference (§6.2); guard `MQL.addEventListener` (§6.3); null-check `#help` (§6.4); document the RM-snap rule (§6.1).
17. Backfill `*-verify.mjs` for the 26 bare sims (fast, static, locks in 1–3 above), then audits for the drag/animated ones; add a whole-suite `card.mjs` sweep to `check.mjs`.
18. Doc drift: `tools/README.md:95`, `edvibe-sim.js:4`.

**P3 — minors/nits** as listed in §4–5 (help panels missing their own controls is the most learner-visible cluster: 9 sims).

---

*Generated by the 6-batch parallel audit of 8 Oct 2026. Every blocker and every 🔍 claim was re-verified against source during consolidation; items marked "verify" in batch notes still warrant a one-frame browser confirmation (refraction arc, lungs diaphragm direction, titration marker off-canvas, food-chains card off-canvas).*
