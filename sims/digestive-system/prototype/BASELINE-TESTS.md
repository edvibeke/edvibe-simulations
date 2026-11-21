# Baseline tests and timings

Branch checked: `svg-art`.

Baseline was captured before any `script.js` edit. No test files were edited.

## Commands

```sh
node tools/check.mjs digestive-system
node tools/sims/digestive-system/digestive-system-verify.mjs
node tools/sims/digestive-system/digestive-system-audit.mjs
node tools/card.mjs digestive-system
```

Node runtime used because no `node` is installed on PATH: temporary `/tmp/opencode/node-v22.23.5-linux-x64/bin/node` (v22.23.5).

## Summary

| Suite | PASS | FAIL | Exit |
|---|---:|---:|---:|
| `check.mjs digestive-system` | 311 reported by runner | 1 reported by runner | 1 |
| `digestive-system-verify.mjs` | 234 | 0 | 0 |
| `digestive-system-audit.mjs` | 63 | 1 | 1 |
| `card.mjs digestive-system` | 13 | 1 | 1 |

## Baseline failures

| Suite | Check | Failure |
|---|---|---|
| browser audit | `a second feed is refused while a meal is still inside` | `Oesophagus 0.1 h -> Stomach 0.2 h` |
| card | `the thumbnail loads at the contract size` | `0x0` |

## Real elapsed time per organ

Measured in the running simulation with default peristalsis (100%), sampling the `Now in` readout every 50 ms from `feedBtn.click()` until `Eliminated`. No simulation constants were edited.

| State | First seen (s) | Last seen (s) | Duration (s) |
|---|---:|---:|---:|
| Mouth (chewing) | 0.05 | 6.00 | 6.00 |
| Mouth (swallowing) | 6.05 | 8.00 | 2.00 |
| Mouth | 8.05 | 8.10 | 0.10 |
| Oesophagus | 8.15 | 8.15 | 0.05 |
| Stomach | 8.20 | 10.86 | 2.70 |
| Duodenum | 10.90 | 12.70 | 1.85 |
| Small intestine | 12.75 | 17.90 | 5.22 |
| Large intestine | 17.97 | 44.95 | 27.03 |
| Rectum | 45.00 | 48.40 | 3.45 |

Total measured wall time from first non-empty readout to `Eliminated`: **48.40 s**.
Final transit readout: **31.0 h**.
Samples collected: **969**.
Completed: **yes**.

## Raw runner output

```text
==========================================================
digestive-system
==========================================================
  ok    static  234 passed
  FAIL  browser failed
        FAIL  a second feed is refused while a meal is still inside (Oesophagus 0.1 h -> Stomach 0.2 h)
        1 FAILURE(S)
  ok    card    14 passed

----------------------------------------------------------
1 suite(s) failed. 311 checks passed, 1 failed.

EXIT_STATUS=1
```

## Static verify pass/fail list

```text
verifying /home/ninja/Desktop/opencode/edvibe-simulations/sims/digestive-system/script.js
canvas 900x540   design->canvas x0.7209302325581395 at (-48.74999999999991,-63.49999999999991)   midline x=450   tube 24 wide, drawn reach 23 design (33.2px tip to tip)

BOUNDING BOX  (everything drawn must be on the canvas)
  PASS  tract box inside the canvas with 10px to spare (94.3,35.6 .. 563.6,357.9)
  PASS  stomach box inside the canvas with 10px to spare (331.2,106.6 .. 449.0,209.8)
  PASS  liver box inside the canvas with 10px to spare (107.5,34.2 .. 478.1,100.5)
  PASS  gallbladder box inside the canvas with 10px to spare (130.6,101.2 .. 147.9,114.2)
  PASS  pancreas box inside the canvas with 10px to spare (265.4,195.2 .. 385.0,227.9)
  PASS  portal box inside the canvas with 10px to spare (165.2,91.9 .. 312.3,224.5)
  PASS  lymph box inside the canvas with 10px to spare (483.8,57.3 .. 541.5,299.5)
  PASS  label "mouth" on the canvas (centre 358.4,23.7, half width 15.4)
  PASS  label "oesophagus" on the canvas (centre 381.5,65.6, half width 30.8)
  PASS  label "stomach" on the canvas (centre 491.0,114.6, half width 21.6)
  PASS  label "liver" on the canvas (centre 175.3,19.4, half width 15.4)
  PASS  label "gallbladder" on the canvas (centre 93.1,82.9, half width 33.9)
  PASS  label "pancreas" on the canvas (centre 491.0,189.6, half width 24.6)
  PASS  label "duodenum" on the canvas (centre 231.5,202.5, half width 24.6)
  PASS  label "small intestine" on the canvas (centre 202.7,272.5, half width 46.2)
  PASS  label "large intestine" on the canvas (centre 72.9,189.6, half width 46.2)
  PASS  label "rectum" on the canvas (centre 491.0,377.0, half width 18.5)
  PASS  vessel label "portal vein → liver" on the canvas
  PASS  vessel label "lymph duct" on the canvas

PANEL CLEARANCES
  legend  600,32 .. 884,362
  footer  40,400 .. 884,528
  PASS  legend and footer do not overlap (gap 38.0px)
  PASS  legend clears the footer by at least 24px (gap 38.0px)
  PASS  legend panel has an 8px margin to the canvas edge (right 16.0px, bottom 178.0px)
  PASS  footer panel has an 8px margin to the canvas edge (right 16.0px, bottom 12.0px)
  drawing area 600.0 x 400.0 (left of the legend, above the footer)
  PASS  tract clears both panels (clear, clear)
  PASS  stomach clears both panels (clear, clear)
  PASS  liver clears both panels (clear, clear)
  PASS  gallbladder clears both panels (clear, clear)
  PASS  pancreas clears both panels (clear, clear)
  PASS  portal clears both panels (clear, clear)
  PASS  lymph clears both panels (clear, clear)
  PASS  footer last baseline + descender fits the panel (124 of 128)
  PASS  footer text stays 8px off the canvas bottom (524.0 of 532)
  PASS  the gap between panels is a deliberate gutter, not a squeeze

THE FIT
  panels leave 14,14 .. 586.0,386.0
  figure  60,44 .. 810.0,560.0
  PASS  the scale is the largest that fits the figure in the area left by the panels (0.7 vs 0.7)
  PASS  the figure lands in the middle of that area (300.0,200.0 vs 300.0,200.0)
  PASS  every anchor and label sits inside the declared figure box (120,64 .. 800,560)

SELF-INTERSECTION
  PASS  no layer crosses itself
  PASS  every crossing is between neighbouring depth layers, never a jump: upper tract x colon frame at s=384.2/1427.5
  PASS  at most two crossings in the whole tract (1)
  1 crossing(s): upper tract x colon frame at s=384.2/1427.5
  PASS  the duodenum passes behind the transverse colon in exactly one place (1)
  PASS  the two structures cross at an angle, not head-on (75.4 degrees)
  PASS  and it crosses level with the transverse colon, not somewhere else ({"x":415.7613168724279,"y":361.97530864197535})
  PASS  the duodenum is 49.0 design from the colon frame 80px along, clear of the 24px it needs
  PASS  the duodenum is 49.8 design from the colon frame 40px along, clear of the 24px it needs
  PASS  the duodenum is 47.1 design from the colon frame 40px along, clear of the 24px it needs
  PASS  the duodenum is 53.7 design from the colon frame 80px along, clear of the 24px it needs
  PASS  the depth layers tile the tract from 0 to the anus with no gaps or overlaps
  PASS  no doubled-back tube legs (no zero-width hairpin)
  caecum anchors [[380,520],[300,520],[232,518],[198,518],[168,510],[152,484]]
  PASS  caecum is on the tract
  PASS  caecum turns through more than a tube width, so it reads as a pouch not a corner (64.5 design across the turn, tube 24)
  PASS  no two stretches of the same layer merge into one blob

LATERALITY  (anterior view: design x > 450 = patient LEFT = viewer RIGHT)
  PASS  liver is on the patient RIGHT (x=262, patient RIGHT)
  PASS  stomach is on the patient LEFT (x=560, patient LEFT)
  PASS  duodenum is on the patient RIGHT (x=424)
  PASS  gallbladder tucks under the right lobe of the liver (x=212)
  PASS  gallbladder hangs below the liver (174 vs 162)
  PASS  pancreatic head reaches the patient RIGHT (head x=388)
  PASS  pancreatic tail reaches the patient LEFT (tail x=552)
  PASS  pancreas does not run past the stomach (tail 552 vs stomach 560)
  PASS  pancreatic head sits in the duodenal curve
  PASS  pancreas lies below the stomach (318 vs 244)
  PASS  ascending colon is on the patient RIGHT (x=149.7037037037037)
  PASS  descending colon is on the patient LEFT (x=800.5925925925926)
  PASS  hepatic flexure sits under the right lobe of the liver (x=206)
  PASS  splenic flexure is out on the patient LEFT flank (x=768)
  PASS  descending colon runs down the patient LEFT flank, outside and below the stomach (colon x=800.5925925925926 vs stomach centre x=560)
  PASS  splenic flexure is the high point of the colon (328 vs hepatic side 327.1824417009602)
  PASS  rectum finishes back near the midline (x=548)
  PASS  mouth starts near the midline (x=462)

ACCESSORY ORGANS
  PASS  portal vein ends inside the liver (ends at [248,152])
  PASS  portal vein starts at the pancreatic head, as the drawing says
  PASS  portal vein starts below the duodenum
  PASS  pancreas is clear of the liver
  PASS  liver clears the top of the drawing area
  PASS  pancreatic tail stays in the abdomen
  PASS  lymph duct finishes up on the patient LEFT, above the stomach
  PASS  lymph duct starts on the patient LEFT flank (x=690)

COILED BOWEL
  row 0: design y=412  x 520..736  canvas y=279.3
  row 1: design y=440  x 740..740  canvas y=299.5   (turn, not a run)
  row 2: design y=466  x 428..734  canvas y=318.2
  row 3: design y=486  x 412..412  canvas y=332.7   (turn, not a run)
  row 4: design y=518  x 232..430  canvas y=355.7
  PASS  the small intestine is drawn as at least three sweeps (3)
  PASS  coils clear the ascending colon (gap 82.2962962962963 design, need 50)
  PASS  coils clear the descending colon (gap 60.59259259259261 design, need 50)
  PASS  first sweep clears the sagging transverse colon (gap 54 design = 5.8px)

DATA TABLES
  PASS  secretion 'saliva' is keyed to a real landmark ('mouth')
  PASS  secretion 'saliva' fires at arclength 17.4, not 0
  PASS  secretion 'gastric juice' is keyed to a real landmark ('stomach')
  PASS  secretion 'gastric juice' fires at arclength 159.7, not 0
  PASS  secretion 'pancreatic juice and bile' is keyed to a real landmark ('pylorus')
  PASS  secretion 'pancreatic juice and bile' fires at arclength 253.4, not 0
  PASS  secretion 'intestinal juice' is keyed to a real landmark ('jejunum')
  PASS  secretion 'intestinal juice' fires at arclength 545.8, not 0
  PASS  secretions fire in anatomical order, one per organ: mouth@17.4 stomach@159.7 pylorus@253.4 jejunum@545.8
  PASS  every secretion carries a volume
  PASS  the enzyme table covers all 7 organs the readout can name (has 7)
  PASS  organ 'mouth' names its enzyme
  PASS  organ 'oesophagus' names its enzyme
  PASS  organ 'stomach' names its enzyme
  PASS  organ 'duodenum' names its enzyme
  PASS  organ 'ileum' names its enzyme
  PASS  organ 'colon' names its enzyme
  PASS  organ 'rectum' names its enzyme

LABELS
  PASS  label "mouth" clears the tract by 15.4px (nearest s=0.0)
  PASS  label "mouth" clears both panels (right 373.8 vs 594, bottom 30.7 vs 394)
  PASS  label "oesophagus" clears the tract by 20.3px (nearest s=43.2)
  PASS  label "oesophagus" clears both panels (right 412.3 vs 594, bottom 72.6 vs 394)
  PASS  label "stomach" clears the tract by 41.3px (nearest s=179.5)
  PASS  label "stomach" clears both panels (right 512.6 vs 594, bottom 121.6 vs 394)
  PASS  label "liver" clears the tract by 120.3px (nearest s=6.5)
  PASS  label "liver" clears both panels (right 190.7 vs 594, bottom 26.0 vs 394)
  PASS  label "gallbladder" clears the tract by 130.5px (nearest s=1284.9)
  PASS  label "gallbladder" clears both panels (right 127.0 vs 594, bottom 89.9 vs 394)
  PASS  label "pancreas" clears the tract by 16.6px (nearest s=1671.4)
  PASS  label "pancreas" clears both panels (right 515.7 vs 594, bottom 196.6 vs 394)
  PASS  label "duodenum" clears the tract by 20.1px (nearest s=1346.0)
  PASS  label "duodenum" clears both panels (right 256.2 vs 594, bottom 209.5 vs 394)
  PASS  label "small intestine" clears the tract by 14.3px (nearest s=1396.2)
  PASS  label "small intestine" clears both panels (right 248.9 vs 594, bottom 279.5 vs 394)
  PASS  label "large intestine" clears the tract by 26.7px (nearest s=1275.2)
  PASS  label "large intestine" clears both panels (right 119.1 vs 594, bottom 196.6 vs 394)
  PASS  label "rectum" clears the tract by 8.9px (nearest s=1900.3)
  PASS  label "rectum" clears both panels (right 509.5 vs 594, bottom 384.0 vs 394)
  PASS  labels "mouth" and "oesophagus" do not collide
  PASS  labels "mouth" and "stomach" do not collide
  PASS  labels "mouth" and "liver" do not collide
  PASS  labels "mouth" and "gallbladder" do not collide
  PASS  labels "mouth" and "pancreas" do not collide
  PASS  labels "mouth" and "duodenum" do not collide
  PASS  labels "mouth" and "small intestine" do not collide
  PASS  labels "mouth" and "large intestine" do not collide
  PASS  labels "mouth" and "rectum" do not collide
  PASS  labels "oesophagus" and "stomach" do not collide
  PASS  labels "oesophagus" and "liver" do not collide
  PASS  labels "oesophagus" and "gallbladder" do not collide
  PASS  labels "oesophagus" and "pancreas" do not collide
  PASS  labels "oesophagus" and "duodenum" do not collide
  PASS  labels "oesophagus" and "small intestine" do not collide
  PASS  labels "oesophagus" and "large intestine" do not collide
  PASS  labels "oesophagus" and "rectum" do not collide
  PASS  labels "stomach" and "liver" do not collide
  PASS  labels "stomach" and "gallbladder" do not collide
  PASS  labels "stomach" and "pancreas" do not collide
  PASS  labels "stomach" and "duodenum" do not collide
  PASS  labels "stomach" and "small intestine" do not collide
  PASS  labels "stomach" and "large intestine" do not collide
  PASS  labels "stomach" and "rectum" do not collide
  PASS  labels "liver" and "gallbladder" do not collide
  PASS  labels "liver" and "pancreas" do not collide
  PASS  labels "liver" and "duodenum" do not collide
  PASS  labels "liver" and "small intestine" do not collide
  PASS  labels "liver" and "large intestine" do not collide
  PASS  labels "liver" and "rectum" do not collide
  PASS  labels "gallbladder" and "pancreas" do not collide
  PASS  labels "gallbladder" and "duodenum" do not collide
  PASS  labels "gallbladder" and "small intestine" do not collide
  PASS  labels "gallbladder" and "large intestine" do not collide
  PASS  labels "gallbladder" and "rectum" do not collide
  PASS  labels "pancreas" and "duodenum" do not collide
  PASS  labels "pancreas" and "small intestine" do not collide
  PASS  labels "pancreas" and "large intestine" do not collide
  PASS  labels "pancreas" and "rectum" do not collide
  PASS  labels "duodenum" and "small intestine" do not collide
  PASS  labels "duodenum" and "large intestine" do not collide
  PASS  labels "duodenum" and "rectum" do not collide
  PASS  labels "small intestine" and "large intestine" do not collide
  PASS  labels "small intestine" and "rectum" do not collide
  PASS  labels "large intestine" and "rectum" do not collide
  PASS  vessel label "portal vein → liver" clears the tract by 76.2px
  PASS  vessel label "portal vein → liver" clears both panels
  PASS  vessel label "lymph duct" clears the tract by 27.9px
  PASS  vessel label "lymph duct" clears both panels
  PASS  vessel labels clear the anatomy labels: "mouth" / "oesophagus"
  PASS  vessel labels clear the anatomy labels: "mouth" / "stomach"
  PASS  vessel labels clear the anatomy labels: "mouth" / "liver"
  PASS  vessel labels clear the anatomy labels: "mouth" / "gallbladder"
  PASS  vessel labels clear the anatomy labels: "mouth" / "pancreas"
  PASS  vessel labels clear the anatomy labels: "mouth" / "duodenum"
  PASS  vessel labels clear the anatomy labels: "mouth" / "small intestine"
  PASS  vessel labels clear the anatomy labels: "mouth" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "mouth" / "rectum"
  PASS  vessel labels clear the anatomy labels: "mouth" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "mouth" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "stomach"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "liver"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "gallbladder"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "pancreas"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "duodenum"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "small intestine"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "rectum"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "oesophagus" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "stomach" / "liver"
  PASS  vessel labels clear the anatomy labels: "stomach" / "gallbladder"
  PASS  vessel labels clear the anatomy labels: "stomach" / "pancreas"
  PASS  vessel labels clear the anatomy labels: "stomach" / "duodenum"
  PASS  vessel labels clear the anatomy labels: "stomach" / "small intestine"
  PASS  vessel labels clear the anatomy labels: "stomach" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "stomach" / "rectum"
  PASS  vessel labels clear the anatomy labels: "stomach" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "stomach" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "liver" / "gallbladder"
  PASS  vessel labels clear the anatomy labels: "liver" / "pancreas"
  PASS  vessel labels clear the anatomy labels: "liver" / "duodenum"
  PASS  vessel labels clear the anatomy labels: "liver" / "small intestine"
  PASS  vessel labels clear the anatomy labels: "liver" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "liver" / "rectum"
  PASS  vessel labels clear the anatomy labels: "liver" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "liver" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "gallbladder" / "pancreas"
  PASS  vessel labels clear the anatomy labels: "gallbladder" / "duodenum"
  PASS  vessel labels clear the anatomy labels: "gallbladder" / "small intestine"
  PASS  vessel labels clear the anatomy labels: "gallbladder" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "gallbladder" / "rectum"
  PASS  vessel labels clear the anatomy labels: "gallbladder" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "gallbladder" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "pancreas" / "duodenum"
  PASS  vessel labels clear the anatomy labels: "pancreas" / "small intestine"
  PASS  vessel labels clear the anatomy labels: "pancreas" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "pancreas" / "rectum"
  PASS  vessel labels clear the anatomy labels: "pancreas" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "pancreas" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "duodenum" / "small intestine"
  PASS  vessel labels clear the anatomy labels: "duodenum" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "duodenum" / "rectum"
  PASS  vessel labels clear the anatomy labels: "duodenum" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "duodenum" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "small intestine" / "large intestine"
  PASS  vessel labels clear the anatomy labels: "small intestine" / "rectum"
  PASS  vessel labels clear the anatomy labels: "small intestine" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "small intestine" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "large intestine" / "rectum"
  PASS  vessel labels clear the anatomy labels: "large intestine" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "large intestine" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "rectum" / "portal vein → liver"
  PASS  vessel labels clear the anatomy labels: "rectum" / "lymph duct"
  PASS  vessel labels clear the anatomy labels: "portal vein → liver" / "lymph duct"

all geometry checks passed

EXIT_STATUS=0
```

## Browser audit pass/fail list

```text
BOOT
  PASS  shared runtime loaded
  PASS  no load-time exception
  PASS  opens on an empty body ("Now in" = No meal yet)
  PASS  nothing digested at rest (0%)
  PASS  body clock at rest is 0.0 h, not 0.0 h
  PASS  canvas is painted (53.7% ink)
  PASS  icons rendered
  PASS  transit clock stays at 0.0 h while nothing is fed (was 0.0 h)
  PASS  still "No meal yet" after 3.5s idle

THE CHEW WINDOW (swallow delay)
  PASS  bolus waits in the mouth before the swallow
  PASS  chew window lasts at least 5s (was 5.6s)
  PASS  body clock is frozen through the chew window
  PASS  salivary amylase does some but not all of the carb in the mouth (10% of the meal)

THE MEAL
  FAIL  a second feed is refused while a meal is still inside (Oesophagus 0.1 h -> Stomach 0.2 h)
  PASS  the refusal was actually exercised during the meal
  PASS  meal completes in 46s of real time
  PASS  readout reported "Stomach" on the way past
  PASS  readout reported "Duodenum" on the way past
  PASS  readout reported "Small intestine" on the way past
  PASS  readout reported "Large intestine" on the way past
  PASS  energy absorbed > 0 (258 kcal)
  PASS  colon reabsorbed water (1159 mL)
  PASS  blood glucose rose (98 mg/dL)
  PASS  reached the rectum

GUARDS
  PASS  a new meal can be fed once the body is empty (Mouth (chewing))
  PASS  and it starts by being chewed, not swallowed whole
  PASS  Pause freezes the body clock (29.0 h -> 29.0 h)
  PASS  Pause sets aria-pressed
  PASS  Pause button relabels to Play
  PASS  Labels off removes the anatomy labels
  PASS  Labels on restores them
  PASS  Chew raises the surface-area readout (×3.40)
  PASS  Reset empties the body (No meal yet)
  PASS  Reset zeroes the transit clock (0.0 h)
  PASS  Reset zeroes the totals
  PASS  Reset re-arms the help and insight panels
  PASS  Reset restores the sliders

CANVAS TEXT (exact metrics from the live canvas)
  PASS  every painted string is on the canvas
  PASS  drawing text never overlaps other drawing text
  PASS  drawing text stays clear of both panels

ENZYME NAMING
  PASS  mouth names salivary amylase on canvas ("salivary amylase")
  PASS  stomach names pepsin on canvas ("pepsin")
  PASS  small intestine names a pancreatic enzyme on canvas ("amylase, trypsin and lipase")
  enzyme blocks seen: {"Mouth":"salivary amylase","Stomach":"pepsin","Duodenum":"amylase, trypsin and lipase"}

PIXELS
  PASS  canvas repaints after reset (53.7% ink)
  PASS  legend panel is a solid block (99.9%)
  PASS  nothing is drawn in the gutter between the panels
  PASS  footer bottom +12px from the canvas edge
  PASS  nothing is drawn below the footer
  PASS  nothing is drawn right of the legend
  PASS  portal vein is drawn where it enters the liver (72 blue px)
  PASS  no villi interleave in the 25px band between coil rows 412-466 (0 px)
  PASS  no villi interleave in the 23px band between coil rows 466-518 (0 px)
  PASS  the small intestine is drawn as at least three sweeps (3)
  PASS  label "mouth" sits on clear paper (39% ink under it)
  PASS  label "oesophagus" sits on clear paper (41% ink under it)
  PASS  label "stomach" sits on clear paper (39% ink under it)
  PASS  label "liver" sits on clear paper (38% ink under it)
  PASS  label "gallbladder" sits on clear paper (50% ink under it)
  PASS  label "pancreas" sits on clear paper (38% ink under it)
  PASS  label "duodenum" sits on clear paper (38% ink under it)
  PASS  label "small intestine" sits on clear paper (39% ink under it)
  PASS  label "large intestine" sits on clear paper (40% ink under it)
  PASS  label "rectum" sits on clear paper (41% ink under it)
  PASS  no exception at any point in the session

1 FAILURE(S)

EXIT_STATUS=1
```

## Card pass/fail list

```text
  PASS  the new card is on the page
  PASS  it is titled after the folder it links to  (The Digestive System vs digestive-system)
  PASS  it is described in a sentence  (Follow a meal from mouth to rectum, then count what the body actually absorbs.)
  PASS  it is filed under the subject its section is for  (Biology in "Biology" (biology))
  PASS  every card on the page is the same width as this one  (264.5px, against 264.5px)
  PASS  the new card is built from the same parts as its neighbours  (H3.|P.|SPAN.ev-card__subject)
  PASS  it shares a subject section with the cards around it  (Biology, 9 cards)
  PASS  it lines up with the cards it shares a row with  (column 1 of 1)
  PASS  it is the same size as the cards beside it
  PASS  it is in the column its order implies  (column 1, expected 1)
  PASS  its blurb poses a question rather than describing the widget  (Follow a meal from mouth to rectum, then count what the body actually absorbs.)
  FAIL  the thumbnail loads at the contract size  (0x0)
  PASS  the landing page loads clean  (none)
  PASS  the All (n) label counted itself  (30 vs 30 cards)

13 passed, 1 failed

EXIT_STATUS=1
```
