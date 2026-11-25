(() => {
  'use strict';

  const FRAME_MS = 1000 / 60;
  let frame = 0;
  let virtualMs = 0;
  let seed = 0x1a2b3c4d;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => virtualMs
  });
  Date.now = () => virtualMs;

  let pending = [];
  window.requestAnimationFrame = (cb) => {
    pending.push(cb);
    return pending.length;
  };
  window.cancelAnimationFrame = () => {};

  window.__clock = {
    get frame() { return frame; },
    get ms() { return virtualMs; },
    step() {
      frame += 1;
      virtualMs = frame * FRAME_MS;
      const callbacks = pending;
      pending = [];
      for (const cb of callbacks) cb(virtualMs);
    },
    run(maxFrames) {
      const limit = maxFrames || 6000;
      const feed = document.getElementById('feedBtn');
      const readout = document.getElementById('whereValue');
      const transit = document.getElementById('transitValue');
      if (!window.__probe) throw new Error('missing window.__probe');
      feed.click();
      let last = readout.textContent;
      const records = [];
      for (let i = 0; i < limit; i++) {
        this.step();
        const label = readout.textContent;
        if (label !== last) {
          const p = window.__probe();
          records.push({
            frame: frame,
            virtualSeconds: virtualMs / 1000,
            label: label,
            s: p.s,
            simMin: p.simMin,
            simSec: p.simSec,
            peristalsis: p.peristalsis,
            tableSpeed: p.speed
          });
          last = label;
        }
        if (label === 'Eliminated') break;
      }
      const finalProbe = window.__probe();
      return JSON.stringify({
        records: records,
        final: {
          frame: frame,
          virtualSeconds: virtualMs / 1000,
          transitText: transit.textContent,
          s: finalProbe.s,
          simMin: finalProbe.simMin,
          simSec: finalProbe.simSec
        }
      });
    }
  };
})();
