CHECKS: PASS — all checks passed
ANCHORS FILE: `/home/ninja/Desktop/opencode/edvibe-simulations/sims/digestive-system/anchors.json`
MTIME: `2026-11-24T04:40:59-05:00`  MD5: `6b86bccb806df98942f09dd679129c05`
ANCHORS AS READ (before boundary move): oesophagus=21, stomach=19, duodenum=13, small=70, colon=24, rectum=13
Anchors after boundary move: oesophagus=21, stomach=19, duodenum=13, small=70, colon=24, rectum=13. Last rectum anchor: `[298, 794.5]`.

# Digestive prototype — full rebuild report

## Summary

### Landmark table

| landmark | segment | anchor index | s | % along segment |
|---|---|---:|---:|---:|
| mouth | arch | 2 | 24.51 | 40.0% |
| oesophagus | oesophagus | 10 | 61.34 | 0.0% |
| cardia | stomach | 0 | 130.82 | 100.0% |
| stomach | stomach | 9 | 266.57 | 57.7% |
| pylorus | stomach | 18 | 366.24 | 100.0% |
| duodenum | duodenum | 4 | 418.48 | 24.7% |
| flexure | small | 0 | 541.18 | 82.6% |
| jejunum | small | 3 | 577.92 | 0.0% |
| ileum | small | 33 | 935.50 | 41.0% |
| caecum | colon | 0 | 1449.54 | 0.0% |
| hepatic | colon | 6 | 1594.09 | 25.6% |
| transverse | colon | 8 | 1686.14 | 42.0% |
| splenic | colon | 11 | 1778.04 | 58.3% |
| descending | colon | 16 | 1874.47 | 75.4% |
| rectum | rectum | 0 | 2013.10 | 0.0% |

### ARC values

| ARC | old | new |
|---|---:|---:|
| mouth | 20.45 | 24.51 |
| oesophagus | 51.16 | 61.34 |
| cardia | 109.12 | 130.82 |
| stomach | 222.34 | 266.57 |
| pylorus | 305.47 | 366.24 |
| duodenum | 349.05 | 418.48 |
| flexure | 451.39 | 541.18 |
| jejunum | 482.03 | 577.92 |
| ileum | 780.28 | 935.50 |
| caecum | 1209.03 | 1449.54 |
| hepatic | 1329.60 | 1594.09 |
| transverse | 1406.38 | 1686.14 |
| splenic | 1483.03 | 1778.04 |
| descending | 1563.46 | 1874.47 |
| rectum | 1679.09 | 2013.10 |

### SPEED options

| breakpoint | one pylorus→caecum | extra jejunum breakpoint |
|---|---:|---:|
| 0 | 64.0753 | 64.0753 |
| ARC.oesophagus | 98.2418 | 98.2418 |
| ARC.stomach | 2.8978 | 2.8978 |
| ARC.pylorus | 6.0213 | 3.4753 |
| ARC.jejunum | — | 7.3244 |
| ARC.caecum | 0.9958 | 0.9958 |
| ARC.rectum | 1.3822 | 1.3822 |

### Per-organ transit times

| organ | old min | one speed min | one change | split min | split change |
|---|---:|---:|---:|---:|---:|
| mouth | 0.9572 | 0.9572 | -0.00% | 0.9572 | -0.00% |
| oesophagus | 0.7073 | 0.7073 | 0.00% | 0.7073 | 0.00% |
| stomach | 35.7772 | 35.7793 | 0.01% | 35.7793 | 0.01% |
| duodenum | 60.9091 | 35.1548 | -42.28% | 60.9091 | -0.00% |
| small intestine | 119.0026 | 144.7569 | 21.64% | 119.0026 | 0.00% |
| colon | 565.9269 | 565.9269 | 0.00% | 565.9269 | 0.00% |
| rectum | 41.1088 | 41.1088 | 0.00% | 41.1088 | 0.00% |

### Strides for the new total

| constant | old (from `baseline-old.json`) | proposed |
|---|---:|---:|
| WAVE_STRIDE | 208.06 | 249.45 |
| villus stride | 11.45 | 13.73 |
| haustra stride | 13.05 | 15.65 |

Re-run with:

```bash
python3 sims/digestive-system/prototype/build-path.py
```

Prototype folder only. `script.js`, tools and tests were not changed.

## Checks

PASS — rectum end is at or below SVG y=775, landmark s values strictly increase, Catmull path leaves the lumen by at most 6 px, all segments are ≥95% inside, and self-crossings are limited to the intended duodenum/colon handoff.

Warnings (wrong-mask runs and large anchor gaps without a truly outside run):

- WARN wrong_mask_run: 456–482 in path6063, path10149, path10151
- WARN wrong_mask_run: 1616–1678 in path10143, path10149
- WARN anchor_gap>35px: duodenum[5]→duodenum[6] 43.8
- WARN anchor_gap>35px: small[31]→small[32] 35.5
- WARN anchor_gap>35px: colon[7]→colon[8] 65.5

## 1. `SPEED` and `speedAt()` in `script.js`

```text
426:   const MIN_PER_SEC = 46;
427:   const SPEED = [
428:     { s: 0,               v: 60 },
429:     { s: ARC.oesophagus,  v: 34 },
430:     { s: ARC.stomach,     v: 2.8 },
431:     { s: ARC.pylorus,     v: 4.8 },
432:     { s: ARC.caecum,      v: 1.4 },
433:     { s: ARC.rectum,      v: 2.0 }
434:   ];
435: 
436:   function speedAt(s) {
437:     let v = SPEED[0].v;
438:     for (const step of SPEED) if (s >= step.s) v = step.v;
439:     return v;
```

Speed is a **step per band**, not interpolated: the last step with `s >= step.s` wins.

## 2. Anchors and boundary

Boundary kept at `297.7, 728.2`. Rectum ends at `[298, 794.5]`.

| segment | anchors |
|---|---:|
| oesophagus | 21 |
| stomach | 19 |
| duodenum | 13 |
| small | 70 |
| colon | 24 |
| rectum | 13 |

Largest neighbouring-anchor gap per segment:

| segment | gap | distance |
|---|---|---:|
| oesophagus | oesophagus[0] → oesophagus[1] | 20.28 |
| stomach | stomach[6] → stomach[7] | 25.83 |
| duodenum | duodenum[5] → duodenum[6] | 43.85 |
| small | small[31] → small[32] | 35.52 |
| colon | colon[7] → colon[8] | 65.54 |
| rectum | rectum[1] → rectum[2] | 16.41 |

## 3. Mouth headroom and layout

Traced start `[297.1, 327.9]` maps to `[310.1911139020473, 127.95698924731181]`, 47.96 logical px below the top of `AREA`.

| value | result |
|---|---:|
| crop x | 130.00 |
| crop y | 270.960 |
| crop w | 310.00 |
| crop h | 529.540 |
| scale | 0.842241 |
| figure width | 261.095 |
| figure x | 169.453 |
| figure y | 80.000 |

| marker | s | logical point |
|---|---:|---|
| feed first | 2.00 | (308.19, 82.61) |
| feed last | 18.00 | (295.05, 88.88) |
| Mouth badge | 24.51 | (293.41, 95.59) |

## 4. Lumen report

Full path: 99.5% inside, 861/865 samples, 0 outside runs of 3+ samples.

| segment | inside | samples | score |
|---|---:|---:|---:|
| mouth | 26 | 26 | 100.0% |
| oesophagus | 29 | 29 | 100.0% |
| stomach | 98 | 98 | 100.0% |
| duodenum | 87 | 89 | 97.8% |
| small | 361 | 363 | 99.4% |
| colon | 235 | 235 | 100.0% |
| rectum | 25 | 25 | 100.0% |

Raw assigned-mask outside runs (before mask/handoff fixes): 2
Remaining outside runs after re-score: 0

| # | segment | s range | length | nearest anchors |
|---:|---|---:|---:|---|

Outside-run diagnosis for the raw runs (tube paths containing each run's samples):

| # | s range | classification | containing SVG tube paths |
|---:|---:|---|---|
| 1 | 456–482 | WRONG MASK | path6063 (stomach) ×1, path10149 (small) ×13, path10151 (colon) ×8 |
| 2 | 1616–1678 | WRONG MASK | path10143 (colon) ×32, path10149 (small) ×10 |

The editor reports individual traced segments; this score samples one continuous path at 2 px, including handoffs and crossings. The code-drawn mouth has no SVG lumen and is counted inside.

## 5. Landmark overlay

Landmark definitions at the top of `build-path.py`; `s` is taken from the exact Catmull sample at that anchor, with no nearest-point snapping:

| landmark | segment | anchor index | resolved trace anchor | sample | s |
|---|---|---:|---|---:|---:|
| mouth | arch | 2 | arch[2] | 18 | 24.51 |
| oesophagus | oesophagus | 10 | oesophagus[10] | 45 | 61.34 |
| cardia | stomach | 0 | oesophagus[20] | 135 | 130.82 |
| stomach | stomach | 9 | stomach[9] | 216 | 266.57 |
| pylorus | stomach | 18 | stomach[18] | 297 | 366.24 |
| duodenum | duodenum | 4 | duodenum[4] | 333 | 418.48 |
| flexure | small | 0 | duodenum[12] | 405 | 541.18 |
| jejunum | small | 3 | small[3] | 432 | 577.92 |
| ileum | small | 33 | small[33] | 702 | 935.50 |
| caecum | colon | 0 | small[69] | 1026 | 1449.54 |
| hepatic | colon | 6 | colon[6] | 1080 | 1594.09 |
| transverse | colon | 8 | colon[8] | 1098 | 1686.14 |
| splenic | colon | 11 | colon[11] | 1125 | 1778.04 |
| descending | colon | 16 | colon[16] | 1170 | 1874.47 |
| rectum | rectum | 0 | colon[23] | 1233 | 2013.10 |

`arch` is the code-drawn mouth centreline; shared handoff anchors resolve to the previous segment's last anchor.

| landmark | new s | segment | % along | old s | old % |
|---|---:|---|---:|---:|---:|
| mouth | 24.51 | mouth | 40.0% | 20.45 | 40.0% |
| oesophagus | 61.34 | oesophagus | 0.0% | 51.16 | 0.0% |
| cardia | 130.82 | oesophagus | 100.0% | 109.12 | 100.0% |
| stomach | 266.57 | stomach | 57.7% | 222.34 | 57.7% |
| pylorus | 366.24 | stomach | 100.0% | 305.47 | 100.0% |
| duodenum | 418.48 | duodenum | 24.7% | 349.05 | 24.7% |
| flexure | 541.18 | duodenum | 82.6% | 451.39 | 82.6% |
| jejunum | 577.92 | small intestine | 0.0% | 482.03 | 0.0% |
| ileum | 935.50 | small intestine | 41.0% | 780.28 | 41.0% |
| caecum | 1449.54 | colon | 0.0% | 1209.03 | 0.0% |
| hepatic | 1594.09 | colon | 25.6% | 1329.60 | 25.6% |
| transverse | 1686.14 | colon | 42.0% | 1406.38 | 42.0% |
| splenic | 1778.04 | colon | 58.3% | 1483.03 | 58.3% |
| descending | 1874.47 | colon | 75.4% | 1563.46 | 75.4% |
| rectum | 2013.10 | rectum | 0.0% | 1679.09 | 0.0% |

All 15 are drawn as labelled dots on the art with their `s` values.

## 6. Timing by numerical integration

Old `TUBE_END = 1726.48`; new `TUBE_END = 2069.92`. Integration step `0.02` px using the step function from `script.js`.

| ARC | old | new |
|---|---:|---:|
| mouth | 20.45 | 24.51 |
| oesophagus | 51.16 | 61.34 |
| cardia | 109.12 | 130.82 |
| stomach | 222.34 | 266.57 |
| pylorus | 305.47 | 366.24 |
| duodenum | 349.05 | 418.48 |
| flexure | 451.39 | 541.18 |
| jejunum | 482.03 | 577.92 |
| ileum | 780.28 | 935.50 |
| caecum | 1209.03 | 1449.54 |
| hepatic | 1329.60 | 1594.09 |
| transverse | 1406.38 | 1686.14 |
| splenic | 1483.03 | 1778.04 |
| descending | 1563.46 | 1874.47 |
| rectum | 1679.09 | 2013.10 |

### One pylorus→caecum speed

| breakpoint | v |
|---|---:|
| 0 | 64.0753 |
| ARC.oesophagus | 98.2418 |
| ARC.stomach | 2.8978 |
| ARC.pylorus | 6.0213 |
| ARC.caecum | 0.9958 |
| ARC.rectum | 1.3822 |

| organ | old min | new min | change |
|---|---:|---:|---:|
| mouth | 0.9572 | 0.9572 | -0.00% |
| oesophagus | 0.7073 | 0.7073 | 0.00% |
| stomach | 35.7772 | 35.7793 | 0.01% |
| duodenum | 60.9091 | 35.1548 | -42.28% |
| small intestine | 119.0026 | 144.7569 | 21.64% |
| colon | 565.9269 | 565.9269 | 0.00% |
| rectum | 41.1088 | 41.1088 | 0.00% |

### Extra jejunum breakpoint

| breakpoint | v |
|---|---:|
| 0 | 64.0753 |
| ARC.oesophagus | 98.2418 |
| ARC.stomach | 2.8978 |
| ARC.pylorus | 3.4753 |
| ARC.jejunum | 7.3244 |
| ARC.caecum | 0.9958 |
| ARC.rectum | 1.3822 |

| organ | old min | new min | change |
|---|---:|---:|---:|
| mouth | 0.9572 | 0.9572 | -0.00% |
| oesophagus | 0.7073 | 0.7073 | 0.00% |
| stomach | 35.7772 | 35.7793 | 0.01% |
| duodenum | 60.9091 | 60.9091 | -0.00% |
| small intestine | 119.0026 | 119.0026 | 0.00% |
| colon | 565.9269 | 565.9269 | 0.00% |
| rectum | 41.1088 | 41.1088 | 0.00% |

### Strides for the new total

| constant | old (from `baseline-old.json`) | proposed |
|---|---:|---:|
| WAVE_STRIDE | 208.06 | 249.45 |
| villus stride | 11.45 | 13.73 |
| haustra stride | 13.05 | 15.65 |

## 7. Screenshots

- `screenshots/full-view.png`
- `screenshots/centreline-overlay.png`
- `screenshots/tags-view.png`
- `screenshots/liver-stomach-zoom.png`
- `screenshots/small-intestine-zoom.png`
- `screenshots/colon-zoom.png`

STOPPED for approval. No simulation physiology changed.
