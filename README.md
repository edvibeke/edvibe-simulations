# EdVibe Simulations

A collection of free, interactive science simulations for the classroom — physics, chemistry and biology. No dependencies, no build step: each simulation is a self-contained web page rendered on `<canvas>`.

**Live site:** <https://edvibeke.github.io/edvibe-simulations/>

## Simulations

### Physics
- [Ohm's Law](sims/ohms-law/)
- [Hooke's Law](sims/hookes-law/)
- [Pendulum](sims/pendulum/)
- [Projectile Motion](sims/projectile-motion/)
- [Refraction](sims/refraction/)
- [Terminal Velocity](sims/terminal-velocity/)
- [Wave Interference](sims/wave-interference/)

### Chemistry
- [Covalent Bonding](sims/covalent-bonding/)
- [Dynamic Equilibrium](sims/dynamic-equilibrium/)
- [Electrolysis](sims/electrolysis/)
- [Ionic Bonding](sims/ionic-bonding/)
- [The pH Scale](sims/ph-scale/)
- [Rates of Reaction](sims/rates-of-reaction/)
- [States of Matter](sims/states-of-matter/)

### Biology
- [Enzymes](sims/enzymes/)
- [Food Chains](sims/food-chains/)
- [The Heart](sims/heart/)
- [Mitosis](sims/mitosis/)
- [Natural Selection](sims/natural-selection/)
- [Osmosis](sims/osmosis/)

## Structure

```
.
├── index.html                Landing page (all sims, filterable by subject)
├── shared/
│   └── edvibe-sim.css        Shared base theme used by every simulation
├── sims/
│   └── <sim-name>/
│       ├── index.html        The sim page
│       ├── script.js         Simulation logic + canvas rendering
│       └── style.css         Only the sim's own extra styles (optional)
└── .github/workflows/
    └── pages.yml             Deploys the repo to GitHub Pages
```

The shared theme defines the standard building blocks — `.ev-header`, `.ev-btn`,
`.ev-stage`, `.ev-controls`, `.ev-slider`, `.ev-readout`, `.ev-help` and
`.ev-insight` — so every simulation looks and behaves consistently. Each sim's
local `style.css` should only contain rules that are unique to that sim.

## Adding a new simulation

1. Create a folder under `sims/` (kebab-case, e.g. `sims/gravity-well/`).
2. Add `index.html` using the shared classes and linking the shared stylesheet:
   ```html
   <link rel="stylesheet" href="../../shared/edvibe-sim.css">
   ```
   plus `style.css` only if you have bespoke styles.
3. Add `script.js` — draw on `<canvas id="stage">` with an animation loop, wire
   the sliders/buttons via `data-action="reset"` / `data-action="help"`, and use
   the `ev-help` / `ev-insight` panels pattern from existing sims.
4. Add a card to the landing page (`index.html`) under the right subject.
5. Commit and push to `main` — the GitHub Actions workflow deploys automatically.

## Conventions

- Each page includes a header with an "All simulations" link back to `../../index.html`.
- Every sim has a Reset and Help control (via `data-action`), a hidden `#help`
  panel, and a hidden `#insight` panel that reveals a take-home concept after a
  few interactions.
- Interactions are keyboard/focus friendly: use `:focus-visible`, real buttons,
  and `aria-pressed` / `aria-label` on toggles.
- Respect `prefers-reduced-motion` (already handled in the shared theme).