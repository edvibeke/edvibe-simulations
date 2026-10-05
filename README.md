# EdVibe Simulations

A collection of free, interactive science simulations for the classroom — physics, chemistry and biology. No dependencies, no build step: each simulation is a self-contained web page rendered on `<canvas>`.

**Live site:** <https://edvibeke.github.io/edvibe-simulations/>

## Simulations

27 in total: 10 physics, 8 chemistry, 9 biology.

### Physics
- [Ohm's Law](sims/ohms-law/)
- [Hooke's Law](sims/hookes-law/)
- [Pendulum](sims/pendulum/)
- [Projectile Motion](sims/projectile-motion/)
- [Refraction](sims/refraction/)
- [Terminal Velocity](sims/terminal-velocity/)
- [Wave Interference](sims/wave-interference/)
- [Gravity & Energy](sims/gravity-energy/)
- [Gas Laws — Boyle's Law](sims/gas-laws/)
- [Series vs Parallel Circuits](sims/series-parallel-circuits/)

### Chemistry
- [Covalent Bonding](sims/covalent-bonding/)
- [Dynamic Equilibrium](sims/dynamic-equilibrium/)
- [Electrolysis](sims/electrolysis/)
- [Ionic Bonding](sims/ionic-bonding/)
- [The pH Scale](sims/ph-scale/)
- [Rates of Reaction](sims/rates-of-reaction/)
- [States of Matter](sims/states-of-matter/)
- [Acid–Base Titration](sims/titration/)

### Biology
- [Enzymes](sims/enzymes/)
- [Food Chains](sims/food-chains/)
- [The Heart](sims/heart/)
- [Mitosis](sims/mitosis/)
- [Natural Selection](sims/natural-selection/)
- [Osmosis](sims/osmosis/)
- [Photosynthesis](sims/photosynthesis/)
- [The Lungs & Gas Exchange](sims/lungs/)
- [The Digestive System](sims/digestive-system/)

## Structure

```
.
├── index.html                Landing page (all sims, filterable by subject)
├── shared/
│   ├── edvibe-sim.css        Shared base theme used by every simulation
│   ├── edvibe-sim.js         Shared runtime (see below)
│   └── lucide.min.js         Vendored icon set
├── sims/
│   └── <sim-name>/
│       ├── index.html        The sim page
│       ├── script.js         Simulation logic + canvas rendering
│       ├── style.css         Only the sim's own extra styles (optional)
│       └── thumbnail.jpg     1080×675 (16:10) preview — see Thumbnails
└── .github/workflows/
    └── pages.yml             Deploys the repo to GitHub Pages
```

### Shared theme

`shared/edvibe-sim.css` defines the standard building blocks — `.ev-header`,
`.ev-btn`, `.ev-stage`, `.ev-controls`, `.ev-slider`, `.ev-readout`, `.ev-help`,
`.ev-insight`, `.ev-sr-only` and `.ev-skip` — so every simulation looks and
behaves consistently. Each sim's local `style.css` should only contain rules
that are unique to that sim.

### Shared runtime

`shared/edvibe-sim.js` exposes a single global, `EV`, and owns the behaviour
that would otherwise be copy-pasted into every page. Load it **before**
`lucide.min.js`, which must load **before** the sim's own `script.js` — a few
sims relabel buttons during initialisation and need the icon set to exist
already.

| Member | Purpose |
| --- | --- |
| `EV.stage(id)` | Wraps a canvas: sizes the backing store to CSS box × `devicePixelRatio`, pre-scales the context, and re-fits on resize or monitor change — re-fitting also calls the sim's `onPaint`, because resizing the backing store wipes the drawing. Returns `{ canvas, ctx, w, h, fit }` where `w`/`h` are the **logical** size all drawing code is written against. |
| `EV.delta(now, last)` | Frame delta in seconds, clamped to 0.05, and forced to `0` under `prefers-reduced-motion`. |
| `EV.visualTime(now)` | Timestamp for purely decorative motion (pulses, glows, wobbles). Returns a constant under `prefers-reduced-motion`, so effects driven straight off `performance.now()` also hold still. |
| `EV.reducedMotion()` | Whether the user prefers reduced motion. |
| `EV.label(el, icon, text)` | Swap a button's icon and text (re-runs Lucide). |
| `EV.icons()` | Re-render all `[data-lucide]` placeholders. Safe to call repeatedly. |
| `EV.say(msg)` | Speak a discrete event via a polite `role="status"` live region. |
| `EV.onReset(fn)` | Wire `[data-action="reset"]`; hides `#help` and `#insight` for you. |
| `EV.onToggle(btn, fn)` | Toggle button that keeps `aria-pressed` in step with the handler's return value. |
| `EV.onDragKey(canvas, fn, opts)` | Makes a drag-driven canvas keyboard-operable: sets `tabindex="0"`, then arrow keys call `fn(x, y)` in logical coordinates (Shift for a bigger step). Pass `opts.start` — usually a getter returning the dragged object's live position — so the first press moves from where it actually is. The canvas is automatically repainted. |
| `EV.revealInsight()` | Reveal `#insight` once and announce it. Idempotent. |
| `EV.resetInsight()` | Re-arm the insight panel after a reset. |
| `EV.wireHelp()` | Auto-wired on `DOMContentLoaded`; keeps `aria-expanded` in sync. |

Because the context is pre-scaled, draw in logical coordinates and use
`stage.w` / `stage.h` rather than `canvas.width` / `canvas.height` — the latter
now report the device-pixel backing size.

### Repainting

Assigning `canvas.width` clears the canvas, and `EV.stage` has to do that on
every resize. Sims that run their own `requestAnimationFrame` loop recover on
the next frame; sims that only paint in response to input do not, which is why
re-fitting calls `stage.onPaint` for you. So a sim must be able to draw a
complete frame at any moment from its current state — keep that logic in one
function and register it:

```js
stage.onPaint = () => { syncReadout(); render(); };
```

If your sim paints every frame anyway, you can skip `onPaint` entirely; it is
only the fallback for when the loop is not running (a resize, or
`prefers-reduced-motion`).

## Thumbnails

Each simulation ships a `thumbnail.jpg` — a real screenshot of that simulation,
not an illustration. They are what learners see in the simulation library on
[edvibe.co.ke](https://edvibe.co.ke/simulations.php) before they launch
anything, so a thumbnail that does not match what they get on click is a bad
first impression.

The consuming page builds its URL from the folder name alone:

```
https://cdn.jsdelivr.net/gh/edvibeke/edvibe-simulations@main/sims/<slug>/thumbnail.jpg
```

so the contract is just:

- one `thumbnail.jpg` per sim folder, named exactly `thumbnail.jpg`
- **1080×675** — 16:10, matching the `aspect-ratio: 16/10` of the card it fills
- captured at `deviceScaleFactor: 1` and cropped 1:1, never resampled; several
  sims are thin line art and downscaling flattens the strokes
- framed so the header **and** the whole canvas are in shot, since the card
  already prints the title directly beneath the image

To regenerate one, screenshot the page at a 1080px-wide viewport after letting
the animation settle, then crop to 1080×675. Two things to watch:

- **Resize before you shoot.** Forcing a viewport resize is what clears the
  canvas, so capture at the final size rather than resizing afterwards.
- **Verify, don't assume.** A blank capture still saves as a valid JPEG. Check
  that the canvas region has real ink in it — compare the canvas pixel buffer
  against the page background — before committing.

## Adding a new simulation

1. Create a folder under `sims/` (kebab-case, e.g. `sims/gravity-well/`).
2. Add `index.html` using the shared classes and the skip link, and link the
   shared assets in this order:
   ```html
   <link rel="stylesheet" href="../../shared/edvibe-sim.css">
   <script src="../../shared/edvibe-sim.js"></script>
   <script src="../../shared/lucide.min.js"></script>
   <script src="script.js"></script>
   ```
   Add `style.css` only if you have bespoke styles.
3. Add `script.js` — an IIFE that gets its context from `EV.stage('stage')`,
   advances time with `EV.delta(now, lastTime)`, and draws in logical
   coordinates. Wire reset with `EV.onReset(fn)`; do **not** re-implement the
   help toggle or the insight reveal. Use `EV.say()` for discrete events.
   If the sim is driven by dragging the canvas, add `EV.onDragKey()` so it
   works from the keyboard too.
   If the sim paints on demand rather than every frame, register that paint
   function as `stage.onPaint` so a window resize can redraw it.
4. Add `thumbnail.jpg` to the sim folder — 1080×675, screenshot of the running
   sim. See [Thumbnails](#thumbnails).
5. Add a card to the landing page (`index.html`) under the right subject. The
   "All (n)" count updates itself.
6. Commit and push to `main` — the GitHub Actions workflow deploys
   automatically.

## Conventions

- Each page includes a header with an "All simulations" link back to
  `../../index.html`, a Reset button and a Help button.
- Every sim has a hidden `#help` panel and a hidden `#insight` panel that
  reveals a take-home concept after a few interactions.
- Interactions are keyboard/focus friendly: real `<button>` elements,
  `:focus-visible` outlines, `aria-pressed` on toggles, `aria-expanded` on the
  help button, and a skip link to the canvas.
- Simulations driven by dragging the canvas are also keyboard-operable via
  `EV.onDragKey()`, so the interaction is reachable without a pointer. The
  affected canvases take focus and say so in their `aria-label` and help text.
- Every canvas carries a descriptive `aria-label` and `role="img"`, because the
  drawing itself is not exposed to assistive technology.
- Readout values are deliberately **not** live regions — they change every
  frame and would flood a screen reader. Announce discrete events with
  `EV.say()` instead.
- A sim must survive a window resize or a monitor change without going blank:
  `EV.stage` re-fits the backing store, which clears the canvas, and repaints via
  `stage.onPaint`. Keep every sim able to draw a complete frame from its current
  state.
- `prefers-reduced-motion` is honoured three times over: the shared theme kills
  CSS transitions, `EV.delta()` freezes the simulation clock, and
  `EV.visualTime()` pins decorative effects that are drawn straight from a
  timestamp. Nothing animates on its own, while sliders and buttons stay
  responsive.
- The theme is dark, so pages declare `<meta name="color-scheme" content="dark">`
  to stop the UA rendering light scrollbars and form controls.