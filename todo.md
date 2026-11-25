# Realistic Body Simulation Roadmap

## Mission
Convert `edvibe-simulations/sims/digestive-system` into a realistic, interactive 3D human-body simulation while preserving its existing geometry, measurements, and physiological calculations.

## Non-Negotiables (Keep Existing Calculations In Line)
- Preserve design-space mapping: `W=900`, `H=540`, `AREA`, `FIGURE`, `S`, `OX`, `OX`, `gx()`, `gy()`, `gs()`
- Preserve tract centerline and spline construction: `TRACK.upper/small/colon`, `ANCHORS`, Catmull-Rom path, `cum`, `TUBE_END`
- Preserve landmark arcs: `ARC` values for mouth, oesophagus, cardia, stomach, pylorus, duodenum, flexure, jejunum, ileum, caecum, hepatic, transverse, splenic, descending, rectum
- Preserve depth layering: `LAYERS` ordering, duodenum behind transverse colon, coils in front
- Preserve laterality rule: anterior view, patient left on viewer right, `MID=450`
- Preserve supporting anatomy constants: `LIVER`, `GALLBLADDER`, `PANCREAS`, `STOMACH_SHAPE`, `DUODENUM`, `PANCREATIC_HEAD`, `PORTAL`, `LYMPH`, villus radii
- Preserve physiological outputs and controls: bolus position, secretion triggers, transit, absorption, pH, pressure, flow direction

## Phase 1 — 3D Scene Foundation (Digestive First)
- [ ] Audit and document current render pipeline, coordinate spaces, and all outputs
- [ ] Introduce Three.js/WebGL renderer behind a feature flag while retaining Canvas2D fallback
- [ ] Map existing 2D design coordinates into 3D world coordinates without changing `gx/gy/gs` source values
- [ ] Add camera: anterior default, orbit, zoom, pan, reset, focus organ
- [ ] Add lighting: key, fill, ambient, contact shadows, environment reflection map
- [ ] Add measurement overlay parity: canvas width/height, panel positions, footer baseline checks

## Phase 2 — Realistic Anatomy & Materials
- [ ] Replace flat organ outlines with meshes derived from existing anchor paths and shapes
- [ ] Model stomach from `STOMACH_SHAPE`, fundus/body/antrum; pylorus from `ARC.pylorus`
- [ ] Model liver/gallbladder/pancreas from `LIVER`, `GALLBLADDER`, `PANCREAS`, `DUODENUM`, `PANCREATIC_HEAD`
- [ ] Model intestines from `TRACK` splines with correct tube radius and curvature
- [ ] Model colon frame from `TRACK.colon` with haustra and flexures
- [ ] Add tissue materials: mucosa, smooth muscle, serosa, fat, blood vessel, bone
- [ ] Add surface detail: rugae, folds, villi, mesentery, peritoneal reflections
- [ ] Add wet sheen, translucency, subsurface scattering, and depth fog

## Phase 3 — Motion & Physiology
- [ ] Convert bolus motion to 3D path following while using `cum` and `sampleAt(s)`
- [ ] Keep landmark triggers tied to `ARC` values
- [ ] Add peristalsis waves along upper/small/colon segments
- [ ] Add sphincter timing and directional flow
- [ ] Add chyme volume conservation and particle advection
- [ ] Add secretions: saliva, gastric acid, bile, pancreatic enzymes
- [ ] Add portal vein flow from pancreatic head to liver
- [ ] Add lymphatic flow from villi toward thoracic duct
- [ ] Keep absorption, pH, transit, and pressure calculations synchronized with animation

## Phase 4 — Interaction & Education
- [ ] Organ hover/click selection with anatomical labels
- [ ] Layer toggles: skin, muscle, organs, vessels, nerves
- [ ] Cross-section views without breaking existing depth layer semantics
- [ ] Meal presets and digestion timeline
- [ ] Controls: motility, acid, enzymes, obstruction, reset, pause, slow motion, step
- [ ] Data panels: pH, transit time, absorption rate, pressure, flow rate
- [ ] Accessibility: keyboard navigation, screen-reader labels, reduced motion

## Phase 5 — Performance & Validation
- [ ] LOD meshes and texture compression
- [ ] Mobile performance targets
- [ ] Visual validation against anatomy references
- [ ] Regression tests for `ARC`, `TUBE_END`, `sampleAt`, layer order, and physiological outputs
- [ ] Keep all calculations in line after every visual change

## Rollout Order
1. Digestive system
2. Heart/circulation
3. Lungs/respiration
4. Nervous/muscular systems
5. Full-body integration
