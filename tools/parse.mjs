/* Parses the layout constants out of a sim's script.js and rebuilds the


   geometry the sim draws, so a verifier can measure the picture without a
   browser. Shared by verify.mjs (static checks) and audit.mjs (pixel probes). */

import fs from 'node:fs';

export function parseScript(file) {
  const src = fs.readFileSync(file, 'utf8');

  /* Every `const` the script declares, so a constant can be evaluated with
     the others already in scope instead of a hand-written list. */
  const declared = new Set(
    [...src.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]));

  /* `const NAME = <literal>` cut out by bracket matching, with strings and
     comments skipped so a `}` inside one cannot end the literal early.
     The expression is then evaluated against the script's own constants, so
     a scale that is derived from the panels is read the way the sim
     derives it rather than being re-derived here. */
  function raw(name) {
    const m = new RegExp('(?:^|\\n)\\s*(?:const|let|var)\\s+[^;\\n=]*?\\b' + name + '\\s*=\\s*', 'm').exec(src);
    if (!m) throw new Error('constant not found: ' + name);
    const from = m.index + m[0].length;
    const first = src[from];
    const open = { '[': ']', '{': '}' }[first];
    if (!open) {
      let stop = from;
      while (stop < src.length && src[stop] !== ';' && src[stop] !== '\n') stop++;
      return src.slice(from, stop);
    }
    let depth = 0, end = -1, i = from, q = null;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (q) { if (ch === q && src[i - 1] !== '\\') q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) throw new Error('unbalanced literal: ' + name);
    return src.slice(from, end);
  }

  const memo = new Map();
  const scope = new Proxy(Object.create(null), {
    has: (_t, k) => declared.has(k),
    get: (_t, k) => (declared.has(k) ? lit(k) : undefined)
  });
  function lit(name) {
    if (memo.has(name)) return memo.get(name);
    const fn = new Function('__s__', 'with (__s__) { return (' + raw(name) + '); }');
    const v = fn(scope);
    memo.set(name, v);
    return v;
  }

  /* the landmark names ARC is built from, read out of the source so the
     verifier cannot drift from the sim's own table */
  function arcNames() {
    const block = /const\s+ARC\s*=\s*\{\s*\};([\s\S]*?)\n\}\)\(\);/.exec(src);
    if (!block) throw new Error('could not find the ARC landmark block');
    return [...block[1].matchAll(/\bat\('([a-zA-Z]+)'/g)].map((m) => m[1]);
  }

  const g = {
    src,
    W: lit('W'), H: lit('H'), S: lit('S'), OX: lit('OX'), OY: lit('OY'),
    MID: lit('MID'),
    MARGIN: lit('MARGIN'), AREA: lit('AREA'), FIGURE: lit('FIGURE'),
    RAIL: lit('RAIL'), FOOT: lit('FOOT'),
    FOOTER_LAST_BASELINE: lit('FOOTER_LAST_BASELINE'),
    TUBE_W: lit('TUBE_W'),
    VILLUS_INNER: lit('VILLUS_INNER'), VILLUS_OUTER: lit('VILLUS_OUTER'),
    TRACK: lit('TRACK'),
    LIVER: lit('LIVER'), GALLBLADDER: lit('GALLBLADDER'),
    PANCREAS: lit('PANCREAS'), STOMACH: lit('STOMACH_SHAPE'),
    DUODENUM: lit('DUODENUM'), PANCREATIC_HEAD: lit('PANCREATIC_HEAD'),
    PORTAL: lit('PORTAL'), LYMPH: lit('LYMPH'),
    SECRETIONS: lit('SECRETIONS'),
    LABELS: lit('LABELS'), VESSEL_LABELS: lit('VESSEL_LABELS'),
    ORGAN_ENZYME: (() => {
      const b = /const\s+ORGAN_ENZYME\s*=\s*\{([\s\S]*?)\n  \};/.exec(src);
      if (!b) throw new Error('ORGAN_ENZYME table not found');
      return Function('return ({' + b[1] + '\n})')();
    })(),
    arcNames: arcNames()
  };

  g.gx = (x) => g.OX + (x - g.OX) * g.S;
  g.gy = (y) => g.OY + (y - g.OY) * g.S;
  g.gs = (v) => v * g.S;
  /* the widest anything drawn on the tube reaches out from the centreline:
     the villus tips, which are further out than the wall */
  g.REACH = g.TUBE_W / 2 + g.VILLUS_OUTER;

  g.anchors = g.TRACK.upper.concat(g.TRACK.small, g.TRACK.colon);

  /* the same Catmull-Rom pass the sim runs */
  g.path = []; g.cum = []; g.dx = []; g.dy = [];
  (function build() {
    const a = g.anchors;
    let total = 0;
    const push = (x, y) => {
      const px = g.gx(x), py = g.gy(y);
      if (g.path.length) {
        const p = g.path[g.path.length - 1];
        total += Math.hypot(px - p.x, py - p.y);
      }
      g.path.push({ x: px, y: py }); g.cum.push(total); g.dx.push(x); g.dy.push(y);
    };
    for (let i = 0; i < a.length - 1; i++) {
      const p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(a.length - 1, i + 2)];
      for (let j = 0; j < 9; j++) {
        const t = j / 9, t2 = t * t, t3 = t2 * t;
        push(
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                 (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                 (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3));
      }
    }
    push(a[a.length - 1][0], a[a.length - 1][1]);
  })();
  g.TUBE_END = g.cum[g.cum.length - 1];

  const atPoint = (x, y) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < g.path.length; i++) {
      const d = Math.hypot(g.path[i].x - g.gx(x), g.path[i].y - g.gy(y));
      if (d < bd) { bd = d; best = i; }
    }
    return g.cum[best];
  };
  g.ARC = {};
  g.LANDMARK = {};
  for (const name of g.arcNames) {
    const m = new RegExp("at\\('" + name + "',\\s*(-?\\d+(?:\\.\\d+)?),\\s*(-?\\d+(?:\\.\\d+)?)\\)").exec(src);
    if (!m) throw new Error('no coordinates for landmark ' + name);
    g.LANDMARK[name] = { x: +m[1], y: +m[2] };
    g.ARC[name] = atPoint(+m[1], +m[2]);
  }

  /* index of the path point at an arclength, so a verifier can ask for the
     stretch of tract between two landmarks without re-deriving the curve */
  g.iAt = (s) => {
    s = Math.min(Math.max(s, 0), g.TUBE_END);
    let lo = 0, hi = g.cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (g.cum[mid] < s) lo = mid + 1; else hi = mid; }
    return lo === 0 ? 0 : lo - 1;
  };

  g.at = (s) => {
    s = Math.min(Math.max(s, 0), g.TUBE_END);
    let lo = 0, hi = g.cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (g.cum[mid] < s) lo = mid + 1; else hi = mid; }
    const i = lo === 0 ? 0 : lo - 1, seg = g.cum[i + 1] - g.cum[i], f = seg > 0 ? (s - g.cum[i]) / seg : 0;
    const p0 = g.path[i], p1 = g.path[i + 1] || p0;
    return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f };
  };

  /* nearest centreline point to a design point */
  g.near = (dx, dy) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < g.path.length; i++) {
      const d = Math.hypot(g.dx[i] - dx, g.dy[i] - dy);
      if (d < bd) { bd = d; bi = i; }
    }
    return { i: bi, s: g.cum[bi], x: g.dx[bi], y: g.dy[bi], d: bd };
  };

  return g;
}