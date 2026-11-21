# REDESIGN AUDIT — digestive-system SVG base art

**Status:** read-only audit completed; decisions recorded below. No simulation code, tools or tests were changed by the audit. A separate look-only prototype was then built under `sims/digestive-system/prototype/`; it does **not** modify `script.js`.

Evidence basis: `sims/digestive-system/Digestive_system_diagram_en.svg` (415,148 bytes, 408 lines, viewBox `0 0 581.00001 820.99997`, Inkscape 1.0rc1) and the current working tree of `script.js` (69,455 bytes, 1,867 lines; modified vs HEAD before this branch). The SVG is at the sim root, **not** `assets/`. Anatomy paths have no semantic ids or labels — ids are generated (`path3169`, `rect3958`) — so the part mapping below was reconstructed from leader-line endpoints, fill colours and transformed bounding boxes.

## Decisions

1. Rendering target: **Path2D data file** (per-part recolour/glow, fits existing offscreen cache).
2. Crop: **torso crop + synthetic mouth arch** (`viewBox="130 390 310 410"`).
3. Provenance: **local prototype only; I will verify the licence before any release**.
4. Physiology: preserve current organ transit timings when the redesign is implemented.
5. This report is to be written to disk; the prototype is look-only and must not retune physiology yet.

## 1. SVG STRUCTURE

### 1a. Every `<g>` (12 total)

| Line | id | inkscape:label | children | transform / style |
|---|---|---|---|---|
| 148 | `layer1` | Draw | 1 | `translate(-9.5,-11.862187)`, inline |
| 149 | `g5461` | — | 53 | `translate(0.9945865,-5.1502486)` |
| 150 | `g9404` | — | 68 | `translate(-391.9025,23.798341)` |
| 221 | `g10309` | — | 19 | `translate(-249.15432,-48.972269)` |
| 285 | `g10089` | — | 12 | near-identity matrix + `translate(-340.42751,4.1786011)` |
| 301 | `g11213` | — | 3 | `translate(-115.66453,-65.867069)` |
| 306 | `g11205` | — | 3 | matrix with y scale `1.1233936` |
| 311 | `g11226` | — | 8 | `translate(-126.51058,-85.056219)` |
| 323 | `layer4` | Salivary glands | **0** | empty |
| 324 | `layer5` | Patterns | 3 | `display:none` |
| 329 | `layer3` | Arrows | 36 | leader/callout layer |
| 367 | `layer2` | Text | 39 | 39 `<switch>` elements |

Counts: 216 `<path>` = 157 anatomy (layer1) + 3 patterns + 28 leaders + 28 marker paths in `<defs>`; plus 3 `<ellipse>`, 8 `<rect>`, 117 `<text>` and 117 `<tspan>`, 39 `<switch>`.

### 1b. Anatomy → ids (SVG-space coordinates after transforms)

| Part | ids / lines | Confidence |
|---|---|---|
| mouth / oral cavity | `rect4797` L248, `rect4808` L247, `rect4914` L264, `path128` L249, `path130` L250 | leader `polyline239` → (259.6,105.3) |
| tongue | `path143` L251, `path6529` L252, `rect5227` L271, `rect5246` L273, `path5249` L274 | leader `polyline235/237` |
| teeth | `g11213` L302-304, `g11205` L307-309, `g11226` L312-319 (yellow `#ffc20e`/`#faa41a`) | 14 paths; not cleanly upper/lower |
| palate / uvula | `rect4808` L247, `rect4800` L244, `rect4802` L245, `path6469` L232, `rect4797` L248 | leader `polyline239` |
| pharynx | `path10680` L281, `path676/678/680/5183` L257-260, `rect6476` L235 | leader `polyline245` → (300.5,148.7) |
| salivary glands | `g10309` L222-240 (19 paths, blue `#2196f9`/`#dfecfb`); `rect6473` L234, `rect6476` L235, `rect5125` L236, `rect5125-7` L237, `path5162` L238, `path5166` L239 | `layer4` is empty; glands live in Draw |
| oesophagus | `rect4987` L149 (fill `#f9bb9d`) + `path6525` L220 (stroke `#c0272d`); tube x≈282–312, y≈181–416 | leader `polyline247` → (300.1,280.6) |
| stomach | `path6063` L207 (`#f26522`) + `path6047` L209 + `path6309` L208 (outlines) + `rect7359` L210 | leader `polyline283` → (365.5,453.2) |
| liver | `path2176` L151 (`#c47a51`) + `path2348` L152 (`#966548`) + radial highlight `rect4052` L195 | leader `polyline285` → (219.6,452.1) |
| gallbladder | `rect7010` L157, `rect6053` L158, `rect7015` L154, `path7013` L156, `path4743` L155 | leader `polyline287` → (233.7,483.4) |
| common bile duct | `path4743` L155, `path8630` L216, `path8632` L217, `path8634` L218 | leader `path11294` → (264.0,542.6) |
| pancreas | `path3169` L197 (22 subpaths, `#e9afaf`) + `rect4019` L196 + `rect3958` L198 + `rect3958-8` L200 + `rect3958-8-4` L199 + `path3954*` L177-193 | leader `polyline321` → (283.4,527.5) |
| pancreatic duct | **not isolated**: same cluster as pancreas/bile duct (`path3169`, `rect3958-8`, `path8630`) | leader `polyline289` → (284.8,543.8) |
| duodenum | `path2174` L159 (`#e89e55`) + `rect8590` L213 + `path8607` L214 + `path8609` L215 | leader `polyline291` → (246.0,539.9) |
| small intestine | `path10149` L289 — one 17,409-char path, fill `#f69161`, stroke `#c0272d`; plus `rect4556` L212, `rect3998` L206, `path10161` L294 | leaders `path12806`, `line305` |
| cecum | `rect10067` L296, `rect10086` L297, `path10157` L292, part of `path10151` L291 | leader `line295` → (237.9,694.8) |
| appendix | **merged into `path10151` L291**; `path10118` L299 + `rect11465` L300 are blue annotation artefacts | leader `line293` → (249.0,727.4) |
| ascending colon | `path10155` L291, `path10157` L292 | leader `line309` → (213.1,659.1) |
| transverse colon | `path10159` L293 + `path3954…` L177-193 | leader `line307` → (291.5,583.9) |
| descending colon | `path10145` L287, `path10147` L288 | leader `line311` → (395.2,678.4) |
| sigmoid colon | `path10143` L286 (gradient fill) | leader `line299` → (321.0,727.2) |
| rectum | `path10143` L286 (same path as sigmoid) | leader `path16148` → (297.7,753.7) |
| anus | `path5249-7` L282 + `path22855` L283 | leader `path22339` → (297.7,791.8) |
| body outline | `path164` L276, `path168` L277, `path170` L284, `path172` L278 — four separate `#ffb4b4` strokes | geometric |

### 1c. Isolatability

- One path, recolourable: oesophagus (fill+outline pair), stomach, liver, small intestine (`path10149`), sigmoid+rectum (`path10143`, not separable).
- Several paths, recolourable by id list: gallbladder (6), pancreas (~30), duodenum (4), colon segments, mouth/tongue/teeth/salivary glands.
- Not isolatable as drawn: appendix (inside `path10151`), pancreatic duct vs common bile duct, sigmoid vs rectum, transverse colon (split across `g9404`/`g10089`), body outline (4 strokes). These need re-tracing/splitting or code-drawn replacements.

### 1d. Fills, strokes, defs

- Gradient-filled paths (6): `rect4052`→`radialGradient29329` L195; `rect5125`→`linearGradient5134` L236; `rect5125-7`→`linearGradient5134-9` L237; `path5162`→`linearGradient5164` L238; `path5166`→`linearGradient5168` L239; `path10143`→`linearGradient10163` L286.
- Stroke-only paths include `path6525` L220, `path128/130/164/168/170/172` L249/250/276-278, `path8630/8632/8634` L216-218, `path6047/6309` L209/208, `path10118` L299, and all 28 leader paths.
- Defs: 8 `<linearGradient>` (`XMLID_8_` L88 with 14 stops L89-102, `linearGradient4072-7` L123, `linearGradient5134` L128, `linearGradient5128` L129, `linearGradient5134-9` L133, `linearGradient5164` L134, `linearGradient5168` L135, `linearGradient10163` L136); 1 `<radialGradient>` `radialGradient29329` L122; 6 `xlink:href` gradient inheritances; 28 `<marker>` ids including `DotM` L13; 19 `<inkscape:path-effect>` L104-121.
- `<filter>`, `<clipPath>`, `<mask>`, `<pattern>`, `<image>`, `<style>`, `<script>`: **0**.

### 1e. Z-order

`defs` → `metadata` → `layer1` → `rect4987` → `g9404` → `path6525` → `g10309` → head details → `path10680` → anus pair → body outlines → `g10089` → teeth groups → empty `layer4` → hidden `layer5` → `layer3` leaders → `layer2` text. Overlaps: liver/stomach/pancreas fills overlap; transverse colon crosses duodenum; small intestine coils overlay the colon frame; leader/text layers are removable.

## 2. THINGS TO REMOVE

- `layer2` L367-407: 39 `<switch>` elements, 117 `<text>` ids (`text223-*`, `text225-*`, …, `text269-*`).
- `layer3` L329-366: callout boxes (`rect10944`, `rect10963`, `rect7102`, `rect18980`), 28 leader paths (`polyline233` … `path7649`), 4 highlight rectangles (`rect10706`, `rect11`, `rect10961`, `rect10942`).
- `layer5` L324-328: `rect4311`, `rect4311-7`, `rect4451` — already `display:none`.
- `layer4` L323: empty.
- Removing all four groups deletes zero anatomy paths. Keep the 6 anatomy gradient defs if gradient fills are used; the 28 marker defs can go with the leaders.

## 3. LICENSE / PROVENANCE

**Local prototype only; I will verify the licence before any release.** Metadata L138-145 contains only `dc:format image/svg+xml`, `dc:type StillImage`, and an empty `dc:title`. Raw scan found no author, licence, copyright or attribution text; no comments. `creativecommons.org` appears only as an unused XML namespace. The `_en` suffix and `eu`/`ml` switch languages are descriptive, not provenance. Do not ship until verified.

## 4. RENDERING OPTIONS

Runtime facts: `W=900,H=540` (`script.js:28-29`); `EV.stage()` at `:317`; DPR scaling in `shared/edvibe-sim.js:55-126`; `STATIC_CACHE` at `:1253`, scale `max(devicePixelRatio, canvas.width/W, canvas.height/H)` at `:1255-1261`, built at `:1295-1345`, blitted at `:1352-1355` and `:1614-1640`; `stage.onPaint` at `:1795-1799`. Glow/gradient helpers already exist (`GLOW` `:1155-1216`, `organGradient` `:1218`, `rimGlow` `:1228`). `Path2D` is not currently used.

| Option | Pros | Cons |
|---|---|---|
| **(a) JS Path2D data file — selected** | ~113k chars of path data; per-part recolour, gradients and `shadowBlur`; fits offscreen cache; crisp at any DPR; no decode/data URL/CSP | Must convert ancestor transforms; 157 paths need an id→part map |
| (b) Cleaned SVG → Image | Fast proof of concept; HiDPI via destination raster | Recolour baked; no per-part runtime state; CSP/data-URL risk |
| (c) Inline SVG overlay | CSS theming | z-index; canvas audit probes only canvas pixels; two DOM trees |

## 5. CROP / LAYOUT

Recommended crop: `viewBox="130 390 310 410"`. Scale `372/410=0.907317`; rendered size **281.3×372 logical px**, at **x=159.4, y=14** in `AREA`. Mapping: `logicalX=159.4+(svgX−130)×0.9073`, `logicalY=14+(svgY−390)×0.9073`.

- Oesophagus after crop: SVG y390–416 survives → ~**23.6 px stub** at x≈310, y14–24.
- Mouth: **not visible** (SVG y11–183 is above the crop). A code-drawn mouth/upper-oesophagus arch is required.
- Whole-SVG fit would be `scale=372/821=0.453`, only ~263 px wide; rejected.

## 6. NEW CENTRELINE — **PROPOSED, UNVERIFIED**

All numbers in this section were computed on paper from the 39 anchor points and the crop transform above. They have **not** been validated against the real artwork in `script.js` or the final simulated path. The look-only prototype overlay is the first visual check; physiology stays untouched.

### 6a. Anchors

The 39 SVG anchors from the audit are retained for the prototype. Anchors 0–3 are off-canvas with the chosen crop; anchors 4–38 are drawable.

| # | SVG (x,y) | logical (x,y) | landmark |
|---|---|---|---|
| 0 | 260,78 | 277.3,−269.1 | mouth (off-canvas) |
| 1 | 300,150 | 313.6,−203.8 | pharynx (off) |
| 2 | 297,200 | 310.9,−158.4 | upper oesophagus (off) |
| 3 | 297,300 | 310.9,−67.7 | mid oesophagus (off) |
| 4 | 296,400 | 310.0,23.1 | oesophagus stub |
| 5 | 305,435 | 318.1,54.8 | cardia / stomach start |
| 6 | 350,470 | 359.0,86.6 | stomach body |
| 7 | 320,515 | 331.8,127.4 | antrum |
| 8 | 285,540 | 300.0,150.1 | pylorus |
| 9 | 265,555 | 281.9,163.7 | duodenal bulb |
| 10 | 250,585 | 268.2,190.9 | descending duodenum |
| 11 | 270,600 | 286.4,204.5 | horizontal duodenum |
| 12 | 310,600 | 322.7,204.5 | duodenojejunal flexure |
| 13 | 360,615 | 368.0,218.1 | jejunum |
| 14 | 380,640 | 386.2,240.8 | coil |
| 15 | 330,655 | 340.8,254.4 | coil |
| 16 | 270,650 | 286.4,249.9 | coil |
| 17 | 240,670 | 259.2,268.0 | coil |
| 18 | 280,690 | 295.5,286.2 | coil |
| 19 | 340,690 | 349.9,286.2 | coil |
| 20 | 350,710 | 359.0,304.3 | coil |
| 21 | 300,715 | 313.6,308.9 | coil |
| 22 | 265,700 | 281.9,295.3 | terminal ileum |
| 23 | 245,700 | 263.7,295.3 | ileocecal valve / caecum |
| 24 | 230,705 | 250.1,299.8 | cecum |
| 25 | 210,690 | 232.0,286.2 | ascending colon |
| 26 | 210,640 | 232.0,240.8 | ascending colon |
| 27 | 215,590 | 236.5,195.5 | hepatic flexure |
| 28 | 235,580 | 254.6,186.4 | transverse colon |
| 29 | 290,580 | 304.5,186.4 | transverse colon |
| 30 | 345,580 | 354.4,186.4 | transverse colon |
| 31 | 390,585 | 395.3,190.9 | splenic flexure |
| 32 | 395,620 | 399.8,222.7 | descending colon |
| 33 | 392,670 | 397.1,268.0 | descending colon |
| 34 | 388,700 | 393.5,295.3 | descending colon |
| 35 | 365,720 | 372.6,313.4 | sigmoid |
| 36 | 330,730 | 340.8,322.5 | sigmoid |
| 37 | 300,760 | 313.6,349.7 | rectum |
| 38 | 298,792 | 311.8,378.7 | anus |

### 6b. ARC values are arclength in px, not anchor indices

The earlier shorthand “ARC.stomach=5, pylorus=8, caecum=23, rectum=37” meant **anchor indices**, not values for `ARC` in `script.js`. `ARC` stores `cum[best]` — cumulative arclength in logical px (`script.js:160-190`). The expected **PROPOSED, UNVERIFIED** px values are:

| ARC key | Source anchor | Expected px |
|---|---|---|
| `mouth` | mid synthetic arch | 28.7 |
| `oesophagus` | end of synthetic arch | 57.4 |
| `cardia` | 5 | 90.1 |
| `stomach` | 5 (same as cardia, so speed/churn start at the same boundary) | 90.1 |
| `pylorus` | 8 | 230.0 |
| `duodenum` | 9 | 252.7 |
| `flexure` | 12 | 342.1 |
| `jejunum` | 13 | 389.4 |
| `ileum` | 18 | 593.8 |
| `caecum` | 23 | 766.8 |
| `hepatic` | 27 | 894.7 |
| `transverse` | 29 | 964.8 |
| `splenic` | 31 | 1055.9 |
| `descending` | 33 | 1133.4 |
| `rectum` | 37 | 1260.1 |
| `TUBE_END` | 38 | 1289.2 |

Per-organ lengths (**PROPOSED, UNVERIFIED**, logical px):

| Organ | Span | Length px |
|---|---|---|
| synthetic mouth arch | 0 → 57.4 | 57.4 |
| oesophagus stub | 57.4 → 90.1 | 32.7 |
| stomach | 90.1 → 230.0 | 139.9 |
| small intestine | 230.0 → 766.8 | 536.8 |
| colon | 766.8 → 1260.1 | 493.3 |
| rectum | 1260.1 → 1289.2 | 29.1 |

### 6c. Why TUBE_END is ~1289, not ~1533

`1533.5 px` was the straight-line length of the **full 39-anchor polyline (anchors 0–38)** at the crop scale, including off-canvas anchors 0–3 (mouth, pharynx, upper/mid oesophagus). Those four off-canvas segments total **301.7 px**. The crop plan replaces them with a **57.4 px synthetic mouth arch**, so `1533.5 − 301.7 + 57.4 = 1289.2 px`. Both figures remain **PROPOSED and UNVERIFIED** until checked against the rendered art and a real Catmull-Rom path.

### 6d. PROPOSED, UNVERIFIED physiology deltas (do not apply in prototype)

| Constant | Proposed | Note |
|---|---|---|
| `SPEED` mouth | 60 | synthetic arch length matches old mouth span |
| `SPEED` oesophagus | 34 → 46.4 | compensates 24.1→32.7 px |
| `SPEED` stomach | 2.8 → 2.28 | compensates 171.9→139.9 px |
| `SPEED` small intestine | 4.8 → 2.98 | compensates 863.6→536.8 px |
| `SPEED` colon | 1.4 → 0.87 | compensates 792.3→493.3 px |
| `SPEED` rectum | 2.0 → 0.71 | compensates 82.2→29.1 px |
| `WAVE_STRIDE` | 240 → 155 | total-length ratio 1289.2/1991.5 |
| villus stride | 9 → 5.6 | small-intestine length ratio |
| haustra stride | 22 → 13.7 | colon length ratio |

These are paper estimates only. The prototype does **not** change any of them.

## 7. WHAT BREAKS

| Item | Action | Class |
|---|---|---|
| `TRACK`/`ANCHORS` `:78-121`, `gx/gy/S/OX/OY/AREA/FIGURE` `:35-48` | new values when implemented | retire old geometry |
| `buildPath` `:126-156`, `cum`, `TUBE_END` `:158` | keep algorithm, new numbers | mechanism kept |
| `ARC` names + `at()` coords `:163-190` | keep 15 names, rewrite coords/px | physiology vocabulary kept |
| `LAYERS` `:198-202` | new spans, same order | mixed |
| `SPEED` `:427-434`, `WAVE_STRIDE` `:442`, `ABSORB` `:277`, pH windows `:279-282` | **PROPOSED** retune only | physiology kept, numbers unverified |
| `SECRETIONS` `:289-294`, `organAt` `:385-393`, `phAt` `:466-472` | keep unchanged | must keep |
| `LIVER`, `STOMACH_SHAPE`, `GALLBLADDER`, `PANCREAS`, `DUODENUM`, `PANCREATIC_HEAD` `:224-234` | delete from drawing or keep as routing metadata | retire old geometry |
| `PORTAL`, `LYMPH` `:239-242` | keep as dot routes, re-place | physiology visualisation |
| `LABELS` (10) `:1362-1373`, `VESSEL_LABELS` (2) `:1375-1378` | rewrite positions | geometry |
| `GLOW` `:1155-1216`, gradients/rims | keep and reuse | style kit |
| `tools/parse.mjs` | keep extraction, retarget to new data | rewrite extraction |
| `digestive-system-verify.mjs` (469 lines, 69 `ok`) | keep panel/footer/secretion/enzyme/canvas checks; rewrite crossing/hairpin/coil/label-clearance geometry checks | mixed |
| `digestive-system-audit.mjs` (371 lines, 53 `ok`) | keep boot/chew/meal/guards/enzyme/panel checks; rewrite villi/portal/label probes | mixed |
| `index.html:36` canvas 900×540 | unchanged | keep |

## 8. STYLE FEASIBILITY

Most organs are solid fills and recolour well via id lists plus `rimGlow`/`organGradient`. The single small-intestine path has no internal texture, so villi/waves must stay code-drawn. Liver veins are baked into `path2348` shading; they can be tinted, not isolated, so add `veinStroke` overlays. Colon texture is many tiny `path3954*` pieces and may look noisy at 0.9×. Teeth/salivary gradients need full replacement. Body-outline strokes can be retinted as a cyan rim.

## 9. PORTING PLAN (small, verifiable)

1. Clean asset: drop `layer2/3/4/5`, keep used defs.
2. Licence verification before release (local prototype only now).
3. Convert anatomy paths + ancestor transforms to JS data with part tags.
4. Recolour + glow one part first (liver).
5. Move all parts into `buildStaticCache`; remove old organ draws.
6. **Highest risk:** new centreline + ARC/LABELS + crop mapping; verify every landmark sits in the correct lumen.
7. Re-tune physiology only after geometry is frozen.
8. Rewrite parse/verify/audit checks.
9. Regenerate labels.

## 10. RECOMMENDATION

Proceed with the Path2D plan and torso crop + synthetic arch, **local prototype only; verify the licence before any release**. All centreline-derived numbers are **PROPOSED and UNVERIFIED** and must not be applied to `script.js`, tools or tests until the prototype overlay has been reviewed and approved.
