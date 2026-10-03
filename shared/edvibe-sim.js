/* ── EdVibe Simulations — shared runtime ────────────────
   Loaded by every simulation before its own script.js.
   Owns the behaviour that used to be copy-pasted into all
   26 pages: icon swapping, HiDPI canvas sizing, reduced-motion
   gating, help/reset wiring and screen-reader announcements.

   Usage from a simulation:

     const stage = EV.stage('stage');
     const ctx   = stage.ctx;          // pre-scaled for devicePixelRatio
     EV.onReset(() => { ... });        // wired to [data-action="reset"]
     EV.onToggle(btn, () => bool);     // keeps aria-pressed in sync
     EV.say('Bond formed');            // polite live-region announcement
*/

window.EV = (() => {
  'use strict';

  /* ── Reduced motion ─────────────────────────────────
     Sim time is clamped to zero while the user prefers reduced
     motion, so rAF loops keep running (and stay interruptible)
     but nothing advances on its own. Sliders still redraw. */

  const motionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener() {} };

  function reducedMotion() { return motionQuery.matches; }

  /* Frame delta in seconds, clamped like the hand-rolled
     versions did, and zeroed under reduced motion. */
  function delta(now, last) {
    if (reducedMotion()) return 0;
    return Math.min((now - last) / 1000, 0.05);
  }

  /* Timestamp for purely decorative motion (pulses, wobbles, sparkles).
     Stopping delta() is not enough on its own: a few simulations animate
     straight off `performance.now()`, which keeps running even when the
     simulation clock is frozen. Passing the result through this returns a
     constant under reduced motion, so those effects hold still. */
  function visualTime(now) {
    return reducedMotion() ? 0 : now;
  }

  /* ── Canvas ─────────────────────────────────────────
     Sizes the backing store to the element's CSS box × DPR and
     pre-scales the context, so all drawing code can keep working
     in the logical 900×540-ish coordinate space. Resizing the
     window re-fits automatically; the CSS `width:100%` rule
     already handles layout. */

  const stages = [];

  function stage(id) {
    const canvas = document.getElementById(id);
    if (!canvas) throw new Error('EV.stage: no #' + id);

    // Logical size comes from the width/height attributes, which is
    // what all the drawing code is written against.
    const logical = { w: canvas.width, h: canvas.height };
    const ctx = canvas.getContext('2d');

    const api = {
      canvas,
      ctx,
      w: logical.w,
      h: logical.h,
      fit,
      /* Repaint hook. A simulation registers the function that draws one
         frame; EV then calls it on demand. Needed because under reduced
         motion the rAF loop is frozen, and many sims update their state
         in the input handler but rely on the next animation frame to push
         it to the readouts. */
      onPaint: null,
      paint() {
        if (typeof api.onPaint === 'function') api.onPaint();
      }
    };

    function fit() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || logical.w;
      const cssH = cssW * (logical.h / logical.w);

      const bw = Math.round(cssW * dpr);
      const bh = Math.round(cssH * dpr);

      // Assigning width/height resets the context, so only do it when
      // the backing store actually needs to change.
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }

      const sx = bw / logical.w;
      const sy = bh / logical.h;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
    }

    fit();
    stages.push(api);

    if (window.ResizeObserver) {
      new ResizeObserver(fit).observe(canvas);
    } else {
      window.addEventListener('resize', fit);
    }

    // devicePixelRatio changes when a window moves between monitors.
    if (window.matchMedia) {
      const watch = () => {
        const mq = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
        mq.addEventListener('change', () => { fit(); watch(); }, { once: true });
      };
      watch();
    }

    return api;
  }

  function refitAll() {
    for (const s of stages) s.fit();
  }

  function paintAll() {
    for (const s of stages) s.paint();
  }

  /* Under reduced motion the simulation clock is stopped, so an interaction
     that only mutates state (and normally gets flushed by the next frame)
     would leave the readouts stale. Repaint once per interaction instead. */
  function repaintOnInteraction() {
    if (!reducedMotion()) return;
    let queued = false;
    const run = () => { queued = false; paintAll(); };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    };
    for (const type of ['input', 'change', 'click', 'pointerup', 'keyup']) {
      document.addEventListener(type, schedule, { passive: true });
    }
    motionQuery.addEventListener?.('change', () => {
      if (reducedMotion()) paintAll();
    });
  }

  /* ── Icons ──────────────────────────────────────────
     Replaces the per-page `evLabel` copies. Falls back silently
     if Lucide has not loaded yet, and re-runs createIcons so the
     new <svg> replaces the placeholder <i>. */

  function icons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
      } catch (err) {
        /* never let icon rendering break the simulation */
      }
    }
  }

  function label(el, icon, text) {
    if (!el) return;
    el.innerHTML = '<i data-lucide="' + icon + '" aria-hidden="true"></i> ' + text;
    icons();
  }

  /* ── Announcements ──────────────────────────────────
     One polite live region per page. Readout values are noisy and
     change every frame, so they are deliberately NOT announced;
     this is only for discrete events a teacher would want spoken. */

  let liveRegion = null;

  function announcer() {
    if (liveRegion) return liveRegion;
    liveRegion = document.createElement('div');
    liveRegion.className = 'ev-sr-only';
    liveRegion.id = 'ev-live';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(liveRegion);
    return liveRegion;
  }

  let sayTimer = null;

  function say(message) {
    const region = announcer();
    // Clearing first guarantees a repeat of the same message is read.
    region.textContent = '';
    if (sayTimer) clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { region.textContent = message; }, 60);
  }

  /* ── Buttons ────────────────────────────────────────
     Help and Reset are identical on every page, so they are wired
     here rather than in each simulation. A simulation that needs
     extra reset behaviour passes it to EV.onReset(); the generic
     handler hides the panels either way. */

  function onReset(fn) {
    const btn = document.querySelector('[data-action="reset"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (typeof fn === 'function') fn();
      document.getElementById('help').hidden = true;
      const insight = document.getElementById('insight');
      if (insight) insight.hidden = true;
      /* Re-arm the insight so it can appear again after a reset. Done
         here rather than in each simulation so no reset callback can
         forget it. */
      resetInsight();
    });
  }

  function wireHelp() {
    const btn = document.querySelector('[data-action="help"]');
    const panel = document.getElementById('help');
    if (!btn || !panel) return;

    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'help');

    btn.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
    });
  }

  /* A button that toggles something on/off: click handler returns the
     new state, and aria-pressed is kept in step for free. */
  function onToggle(btn, handler) {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = handler();
      btn.setAttribute('aria-pressed', String(Boolean(next)));
    });
  }

  /* ── Keyboard access for drag interactions ───────────
     Four simulations are driven by dragging on the canvas, which is
     unusable by keyboard or with a screen reader. This makes the canvas
     focusable and drives the same handlers from the arrow keys, so the
     interaction is reachable without a pointer.

     `move` receives logical canvas coordinates and is called for pointer
     moves and for each arrow-key press. */

  function onDragKey(canvas, move, opts) {
    const options = opts || {};
    const step = options.step || 20;          // logical px per key press
    const bigStep = options.bigStep || 60;    // shift for a larger nudge

    canvas.setAttribute('tabindex', '0');
    canvas.classList.add('ev-canvas-interactive');
    if (options.label) canvas.setAttribute('aria-label', options.label);

    /* Where the keyboard cursor starts. Simulations pass the live position
       of the thing being dragged (usually a getter), so the first arrow
       press moves it by one step from where it actually is, and the cursor
       stays in step with pointer drags and resets. */
    const start = options.start || null;
    let key = null;
    if (start && typeof start !== 'function') key = { x: start.x, y: start.y };

    function nudge(dx, dy) {
      const size = logicalSize(canvas);
      if (!key) key = { x: size.w / 2, y: size.h / 2 };
      if (start && typeof start === 'function') {
        const p = start();
        if (p) { key.x = p.x; key.y = p.y; }
      }
      key.x = clamp(key.x + dx, 0, size.w);
      key.y = clamp(key.y + dy, 0, size.h);
      move(key.x, key.y, { source: 'keyboard' });
    }

    canvas.addEventListener('keydown', (e) => {
      const s = e.shiftKey ? bigStep : step;
      switch (e.key) {
        case 'ArrowLeft':  nudge(-s, 0); break;
        case 'ArrowRight': nudge(s, 0); break;
        case 'ArrowUp':    nudge(0, -s); break;
        case 'ArrowDown':  nudge(0, s); break;
        default: return;
      }
      e.preventDefault();
    });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* Logical size of a canvas that EV.stage() is managing, falling back to
     the element's current attribute size. */
  function logicalSize(canvas) {
    for (const s of stages) if (s.canvas === canvas) return { w: s.w, h: s.h };
    return { w: canvas.width, h: canvas.height };
  }

  /* Reveal the insight panel once, announcing its contents. */
  let insightShown = false;

  function revealInsight() {
    const insight = document.getElementById('insight');
    if (!insight || insightShown || !insight.hidden) return;
    insightShown = true;
    insight.hidden = false;
    const text = insight.textContent.replace(/\s+/g, ' ').trim();
    if (text) say(text);
  }

  function resetInsight() {
    insightShown = false;
    /* Drop any announcement still queued from the run that just ended,
       so resetting straight after an insight doesn't read it out. */
    if (sayTimer) { clearTimeout(sayTimer); sayTimer = 0; }
    const region = document.getElementById('ev-live');
    if (region) region.textContent = '';
  }

  function iconsReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', icons);
    } else {
      icons();
    }
  }

  return {
    stage,
    refitAll,
    paintAll,
    repaintOnInteraction,
    icons,
    label,
    say,
    onReset,
    onToggle,
    onDragKey,
    revealInsight,
    resetInsight,
    reducedMotion,
    delta,
    visualTime,
    wireHelp,
    iconsReady
  };
})();

/* Kept for backwards compatibility with the per-page copies that this
   module replaces; new code should call EV.label. */
window.evLabel = window.EV.label;

document.addEventListener('DOMContentLoaded', () => {
  window.EV.iconsReady();
  window.EV.wireHelp();
  window.EV.repaintOnInteraction();
});