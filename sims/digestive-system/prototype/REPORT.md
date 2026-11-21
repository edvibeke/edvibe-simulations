FAIL outside_runs>6px: duodenum 456–482 (26 px), colon 1616–1678 (62 px) | segments<95%: colon 86.4%, duodenum 82.0% | anchor_gaps>35px: duodenum[5]→duodenum[6] 43.8, small[31]→small[32] 35.5, colon[7]→colon[8] 65.5
Anchors: oesophagus=21, stomach=19, duodenum=13, small=70, colon=24, rectum=13. Last rectum anchor: `[298, 794.5]`.

# Digestive prototype — full rebuild report

Re-run with:

```bash
python3 sims/digestive-system/prototype/build-path.py
```

Prototype folder only. `script.js`, tools and tests were not changed.

## Checks

Top-line FAIL is triggered by:

- FAIL outside_runs>6px: duodenum 456–482 (26 px), colon 1616–1678 (62 px)
- FAIL segments<95%: colon 86.4%, duodenum 82.0%
- FAIL anchor_gaps>35px: duodenum[5]→duodenum[6] 43.8, small[31]→small[32] 35.5, colon[7]→colon[8] 65.5

## 1. `SPEED` and `speedAt()` in `script.js`

```text
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
440:   }
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

Traced start `[297.1, 327.9]` maps to `[308.50021159542956, 53.99999999999998]`, 40 logical px below the top of `AREA`.

| value | result |
|---|---:|
| crop x | 130.00 |
| crop y | 270.960 |
| crop w | 310.00 |
| crop h | 529.540 |
| scale | 0.702497 |
| figure width | 217.774 |
| figure x | 191.113 |
| figure y | 14.000 |

| marker | s | logical point |
|---|---:|---|
| feed first | 2.00 | (306.83, 16.18) |
| feed last | 18.00 | (294.74, 24.73) |
| Mouth badge | 20.45 | (294.50, 27.00) |

## 4. Lumen report

Full path: 94.0% inside, 813/865 samples, 2 outside runs of 3+ samples.

| segment | inside | samples | score |
|---|---:|---:|---:|
| mouth | 26 | 26 | 100.0% |
| oesophagus | 29 | 29 | 100.0% |
| stomach | 96 | 98 | 98.0% |
| duodenum | 73 | 89 | 82.0% |
| small | 361 | 363 | 99.4% |
| colon | 203 | 235 | 86.4% |
| rectum | 25 | 25 | 100.0% |

| # | segment | s range | length | nearest anchors |
|---:|---|---:|---:|---|
| 1 | duodenum | 456–482 | 26 px | small[2], small[3] |
| 2 | colon | 1616–1678 | 62 px | colon[21], colon[22] |

The editor reports individual traced segments; this score samples one continuous path at 2 px, including handoffs and crossings. The code-drawn mouth has no SVG lumen and is counted inside.

## 5. Landmark overlay

Landmark definitions at the top of `build-path.py`; `s` is taken from the exact Catmull sample at that anchor, with no nearest-point snapping:

| landmark | segment | anchor index | resolved trace anchor | sample | s |
|---|---|---:|---|---:|---:|
| mouth | arch | 2 | arch[2] | 18 | 20.45 |
| oesophagus | oesophagus | 10 | oesophagus[10] | 45 | 51.16 |
| cardia | stomach | 0 | oesophagus[20] | 135 | 109.12 |
| stomach | stomach | 9 | stomach[9] | 216 | 222.34 |
| pylorus | duodenum | 0 | stomach[18] | 297 | 305.47 |
| duodenum | duodenum | 4 | duodenum[4] | 333 | 349.05 |
| flexure | small | 0 | duodenum[12] | 405 | 451.39 |
| jejunum | small | 3 | small[3] | 432 | 482.03 |
| ileum | small | 41 | small[41] | 774 | 881.42 |
| caecum | colon | 0 | small[69] | 1026 | 1209.03 |
| hepatic | colon | 6 | colon[6] | 1080 | 1329.60 |
| transverse | colon | 8 | colon[8] | 1098 | 1406.38 |
| splenic | colon | 11 | colon[11] | 1125 | 1483.03 |
| descending | colon | 16 | colon[16] | 1170 | 1563.46 |
| rectum | rectum | 0 | colon[23] | 1233 | 1679.09 |

`arch` is the code-drawn mouth centreline; shared handoff anchors resolve to the previous segment's last anchor.

| landmark | new s | segment | % along | old s | old % |
|---|---:|---|---:|---:|---:|
| mouth | 20.45 | mouth | 40.0% | 17.38 | 30.3% |
| oesophagus | 51.16 | oesophagus | 0.0% | 57.43 | 0.0% |
| cardia | 109.12 | oesophagus | 100.0% | 81.48 | 100.0% |
| stomach | 222.34 | stomach | 57.7% | 159.68 | 45.5% |
| pylorus | 305.47 | duodenum | 0.0% | 253.41 | 0.0% |
| duodenum | 349.05 | duodenum | 24.7% | 348.83 | 32.6% |
| flexure | 451.39 | duodenum | 82.6% | 457.67 | 69.9% |
| jejunum | 482.03 | small intestine | 0.0% | 545.77 | 0.0% |
| ileum | 881.42 | small intestine | 54.9% | 801.49 | 44.8% |
| caecum | 1209.03 | colon | 0.0% | 1116.98 | 0.0% |
| hepatic | 1329.60 | colon | 25.6% | 1279.76 | 20.5% |
| transverse | 1406.38 | colon | 42.0% | 1521.73 | 51.1% |
| splenic | 1483.03 | colon | 58.3% | 1687.99 | 72.1% |
| descending | 1563.46 | colon | 75.4% | 1768.65 | 82.3% |
| rectum | 1679.09 | rectum | 0.0% | 1909.28 | 0.0% |

All 15 are drawn as labelled dots on the art with their `s` values.

## 6. Timing by numerical integration

Old `TUBE_END = 1991.50`; new `TUBE_END = 1726.48`. Integration step `0.02` px using the step function from `script.js`.

| ARC | old | new |
|---|---:|---:|
| mouth | 17.38 | 20.45 |
| oesophagus | 57.43 | 51.16 |
| cardia | 81.48 | 109.12 |
| stomach | 159.68 | 222.34 |
| pylorus | 253.41 | 305.47 |
| duodenum | 348.83 | 349.05 |
| flexure | 457.67 | 451.39 |
| jejunum | 545.77 | 482.03 |
| ileum | 801.49 | 881.42 |
| caecum | 1116.98 | 1209.03 |
| hepatic | 1279.76 | 1329.60 |
| transverse | 1521.73 | 1406.38 |
| splenic | 1687.99 | 1483.03 |
| descending | 1768.65 | 1563.46 |
| rectum | 1909.28 | 1679.09 |

### One pylorus→caecum speed

| breakpoint | v |
|---|---:|
| 0 | 53.4440 |
| ARC.oesophagus | 81.9416 |
| ARC.stomach | 2.4171 |
| ARC.pylorus | 5.0222 |
| ARC.caecum | 0.8306 |
| ARC.rectum | 1.1529 |

| organ | old min | new min | change |
|---|---:|---:|---:|
| mouth | 0.9572 | 0.9572 | -0.00% |
| oesophagus | 0.7073 | 0.7073 | 0.00% |
| stomach | 35.7757 | 35.7772 | 0.00% |
| duodenum | 60.9091 | 35.1548 | -42.28% |
| small intestine | 119.0026 | 144.7569 | 21.64% |
| colon | 565.9269 | 565.9269 | 0.00% |
| rectum | 41.1088 | 41.1088 | 0.00% |

### Extra jejunum breakpoint

| breakpoint | v |
|---|---:|
| 0 | 53.4440 |
| ARC.oesophagus | 81.9416 |
| ARC.stomach | 2.4171 |
| ARC.pylorus | 2.8987 |
| ARC.jejunum | 6.1091 |
| ARC.caecum | 0.8306 |
| ARC.rectum | 1.1529 |

| organ | old min | new min | change |
|---|---:|---:|---:|
| mouth | 0.9572 | 0.9572 | -0.00% |
| oesophagus | 0.7073 | 0.7073 | 0.00% |
| stomach | 35.7757 | 35.7772 | 0.00% |
| duodenum | 60.9091 | 60.9091 | 0.00% |
| small intestine | 119.0026 | 119.0026 | 0.00% |
| colon | 565.9269 | 565.9269 | 0.00% |
| rectum | 41.1088 | 41.1088 | 0.00% |

### Strides for the new total

| constant | proposed |
|---|---:|
| WAVE_STRIDE | 208.06 |
| villus stride | 11.45 |
| haustra stride | 13.05 |

## 7. Screenshots

- `screenshots/full-view.png`
- `screenshots/centreline-overlay.png`
- `screenshots/tags-view.png`
- `screenshots/liver-stomach-zoom.png`
- `screenshots/small-intestine-zoom.png`
- `screenshots/colon-zoom.png`

STOPPED for approval. No simulation physiology changed.
