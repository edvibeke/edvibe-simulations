# tools

Checks for the simulations. They exist because a canvas sim can look perfect
and still be wrong: a readout that only updates on interaction, a force arrow
that points the wrong way, a thumbnail that saved blank. So nothing here
believes the source — every claim is measured against a running page.

No dependencies. Node 22 ships a global `WebSocket`, and the rest is standard
library. You need `chromium` on the path, or set `CHROME`:

```sh
CHROME=/usr/bin/google-chrome-stable node tools/sims/newtons-laws/newtons-laws-audit.mjs
```

## Running them

`check.mjs` runs everything for every sim and exits non-zero if anything fails,
so it drops straight into CI or a pre-commit hook:

```sh
node tools/check.mjs                  # every sim
node tools/check.mjs newtons-laws     # one sim, plus its landing-page card
```

To run a suite on its own:

```sh
node tools/sims/newtons-laws/newtons-laws-verify.mjs   # static, fast
node tools/sims/newtons-laws/newtons-laws-audit.mjs    # behaviour + pixels, slow
node tools/card.mjs newtons-laws                       # landing-page card
```

`thumb.mjs` is left out of `check.mjs` because it writes to the repository. It
regenerates `sims/<name>/thumbnail.jpg`: assert the layout fits, fire the
shutter, save. It is a capture tool, not a test — the `verify` and `audit`
suites are what tell you the result is any good.

## The four kinds of check

**`*-verify.mjs` — static.** Reads `script.js` and `index.html` as text and
asserts things about them: that the physics constants are self-consistent, that
every preset's numbers match the caption printed beside it, that the layout
holds at the extremes of every slider. No browser, so it runs in about a
second. Use it first.

**`*-audit.mjs` — behavioural.** Boots the real page in headless Chrome and
drives it with real pointer and key events. Checks the readouts after each
action, where things are *actually drawn* (sampling pixels, not trusting the
model), that ink stays inside its block, that a settled sim stops repainting,
and that the accessibility wiring holds: one polite live region, no readouts
inside it, `aria-pressed` on exactly one preset. This is the suite that finds
the bugs worth finding — it caught a `release` handler that announced "friction
holds it" for crates that were about to move, and an "it is moving" hint that
only ever fired once the crate had stopped.

**`*-thumb.mjs` — capture.** Renders the sim into a 1080×675 frame, pads it to
the contract size without resampling, and saves a JPEG. Gutters must be page
background, not a stretched crop.

**`card.mjs` — catalogue.** Checks a sim's landing-page card against its
neighbours: same parts, same grid columns, right subject, and a thumbnail that
loads at exactly 1080×675. Takes the sim name as an argument.

## Shared pieces

`cdp.mjs` is a small Chrome DevTools Protocol client and static file server.
It picks its own port, so suites can run side by side.

`paths.mjs` works out where the repository is from its own location. Nothing
here contains an absolute path, so a clone anywhere works.

`parse.mjs` extracts a sim's layout constants and rebuilds the geometry they
imply. The geometry checks read their numbers out of `script.js` rather than
restating them, so the checker cannot drift away from the code it checks.

`check.mjs` is the runner: it finds suites by name, runs them, and prints a
summary. It exits non-zero if anything fails.

Ports are assigned by the OS and the repo root is worked out from each file's
own location, so suites can run side by side and a clone anywhere will do.

Scratch captures go to `tools/.scratch/`, which is gitignored and created on
demand.

## Adding a suite for a new sim

Copy the two or three files from the closest existing sim, rename them to
`<sim-name>-verify.mjs` and `<sim-name>-audit.mjs`, and change the sim name in
each. `check.mjs` finds them by name, so nothing else needs editing.

The audits are worth writing fresh: the point is that they drive the actual
controls, and a copy-pasted check for the wrong slider proves nothing. See the
top of each file for what it covers.

Three sims have suites today. The rest were checked by hand, which is why the
helpers are general enough to point at any of them.
