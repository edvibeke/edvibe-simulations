# Phase 1 Audit — Digestive System Render Pipeline

## Coordinate spaces
- Canvas: W=900, H=540 (index.html canvas).
- Panels: RAIL {x:600,y:32,w:284,h:330}, FOOT {x:40,y:400,w:844,h:128}.
- AREA (anatomy viewport): x=14,y=14,w=572,h=372.
- FIGURE (authored space): x=60,y=44,w=750,h=516.
- S = min(AREA.w/FIGURE.w, AREA.h/FIGURE.h); OX,OY as in script.js:36-37.
- gx(x)=OX+(x-OX)*S; gy(y)=OY+(y-OY)*S; gs(v)=v*S.
- MID=450 (patient left on viewer right).

## Render pipeline (render(t))
1. clearRect(0,0,W,H)
2. For each L in LAYERS: drawWall, drawVilli, drawCapillaries, drawHaustra, drawWaves
3. drawStomach, drawLiver, drawVessels, drawGlands, drawParticles, drawDots, drawLabels, drawBadge, drawLegend, drawFooter
- Loop: tick -> EV.delta -> step(dt) (physiology) -> render(EV.visualTime) -> syncReadout -> rAF.

## Outputs (syncReadout)
- whereValue, digestedValue, energyValue, glucoseValue, waterValue, transitValue.

## Key preserved constants
- TRACK.upper/small/colon, ANCHORS, cum, TUBE_END, ARC, LAYERS, LIVER, GALLBLADDER, PANCREAS, STOMACH_SHAPE, DUODENUM, PANCREATIC_HEAD, PORTAL, LYMPH, villus radii.

## Feature flag plan
- Add `?renderer=webgl` query / localStorage `ev.renderer` to opt into Three.js path; default canvas2d. Keep all constants and sampleAt() untouched.
