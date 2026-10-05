/* Check a sim's card on the landing page renders like its neighbours.
   usage: node tools/card.mjs [sims/newtons-laws] */

import { serve, Chrome, sleep } from './cdp.mjs';

let pass = 0, fail = 0;
const check = (n, ok, d) => {
  if (ok) { pass++; console.log('  PASS  ' + n + (d ? '  (' + d + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '  (' + d + ')' : '')); }
};

const server = await serve();
const chrome = await Chrome.launch({ url: 'about:blank', width: 1200, height: 1000 });
await chrome.attach();
await chrome.onNewDocument(`
  window.__err = [];
  window.addEventListener('error', e => window.__err.push(String(e.message)));
`);
await chrome.goto(server.url('/index.html'));
await sleep(1000);

const SIM = (process.argv[2] || 'newtons-laws').replace(/^sims\//, '');

const card = await chrome.eval(`
  const SIM = ${JSON.stringify(SIM)};
  const c = document.querySelector('.ev-card[href="sims/' + SIM + '/"]');
  if (!c) return null;
  const section = c.closest('.ev-section');
  const r = c.getBoundingClientRect();
  /* Measured against the grid, not a magic number, so a theme change
     cannot fail this for the wrong reason. */
  const all = Array.from(document.querySelectorAll('.ev-card'));
  const widths = all.map(x => +x.getBoundingClientRect().width.toFixed(1));
  return {
    title: c.querySelector('h3').textContent,
    blurb: c.querySelector('p').textContent,
    subject: c.querySelector('.ev-card__subject').textContent,
    section: section.querySelector('h2').textContent,
    sectionSubject: section.dataset.section,
    w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    widths,
    parts: Array.from(c.children).map(e => e.tagName + '.' + e.className)
  };
`);
check('the new card is on the page', card !== null);
/* Named after the folder, so it holds for any sim and not just one.
   Punctuation is dropped on both sides: ohms-law is shown as Ohm's Law. */
const plain = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '');
const words = plain(SIM.replace(/-/g, ' ')).split(' ').filter(w => w.length > 2);
const title = plain(card.title);
check('it is titled after the folder it links to',
  words.every(w => title.includes(w)),
  card.title + ' vs ' + SIM);
check('it is described in a sentence', card.blurb.length > 20, card.blurb);
check('it is filed under the subject its section is for',
  card.subject.toLowerCase() === card.section.toLowerCase()
  && card.subject.toLowerCase() === card.sectionSubject,
  card.subject + ' in "' + card.section + '" (' + card.sectionSubject + ')');
check('every card on the page is the same width as this one',
  card.w > 0 && card.widths.every(w => Math.abs(w - card.w) < 0.6),
  card.w + 'px, against ' + [...new Set(card.widths)].join('/') + 'px');

const neighbours = await chrome.eval(`
  const SIM = ${JSON.stringify(SIM)};
  const mine = document.querySelector('.ev-card[href="sims/' + SIM + '/"]');
  const all = Array.from(mine.closest('.ev-section').querySelectorAll('.ev-card'));
  const box = c => c.getBoundingClientRect();
  /* The cards that actually share a row: same top, to its left or right. */
  const row = all.filter(c => Math.abs(box(c).top - box(mine).top) < 2);
  const n = c => Array.from(c.children).map(e => e.tagName + '.' + e.className).join('|');
  return {
    first: n(all[0]), mine: n(mine),
    firstSubject: all[0].querySelector('.ev-card__subject').textContent,
    sectionSize: all.length,
    /* Each row of the grid sits on the same set of columns as every other
       row, and this card is on one of them: it cannot be narrower, wider,
       or half on and half off the grid. */
    /* Every row of the grid starts its cards on the same columns. A card
       alone on the last row has no companion to compare with, so it is
       checked against the row above instead. */
    aligned: (() => {
      const cols = rs => rs.map(c => +box(c).left.toFixed(1)).join(',');
      const tops = [...new Set(all.map(c => Math.round(box(c).top)))].sort((a, b) => a - b);
      const rowTop = Math.round(box(mine).top);
      const idx = tops.indexOf(rowTop);
      /* Compare with the nearest row of the same or greater width. */
      for (const t of [tops[idx - 1], tops[idx + 1]]) {
        if (t === undefined) continue;
        const other = all.filter(c => Math.round(box(c).top) === t);
        if (other.length >= row.length) {
          return row.every(c => other.some(o => Math.abs(box(o).left - box(c).left) < 0.6));
        }
      }
      return row.every(c => Math.abs(box(c).left - box(mine).left) < 0.6);
    })(),
    sized: row.every(c => Math.abs(box(c).width - box(mine).width) < 0.6
                       && Math.abs(box(c).height - box(mine).height) < 0.6),
    column: row.indexOf(mine) + 1,
    perRow: row.length,
    /* Grid columns repeat, so its column index is where the source order
       says it should be. */
    expected: all.indexOf(mine) % row.length + 1
  };
`);
check('the new card is built from the same parts as its neighbours',
  card.parts.join('|') === neighbours.first, neighbours.first);
check('it shares a subject section with the cards around it',
  card.subject === neighbours.firstSubject && neighbours.sectionSize > 1,
  card.section + ', ' + neighbours.sectionSize + ' cards');
check('it lines up with the cards it shares a row with',
  neighbours.aligned, 'column ' + neighbours.column + ' of ' + neighbours.perRow);
check('it is the same size as the cards beside it', neighbours.sized);
check('it is in the column its order implies',
  neighbours.column === neighbours.expected,
  'column ' + neighbours.column + ', expected ' + neighbours.expected);
check('its blurb poses a question rather than describing the widget',
  card.blurb.length > 40 && card.blurb.length < 110
  && !/slider|button|click/i.test(card.blurb), card.blurb);

/* The thumbnail URL must resolve exactly as the consuming page builds it. */
const probe = await chrome.eval(`
  const img = new Image();
  const ok = await new Promise(res => {
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = 'sims/' + ${JSON.stringify(SIM)} + '/thumbnail.jpg';
  });
  return { ok, w: img.naturalWidth, h: img.naturalHeight };
`);
check('the thumbnail loads at the contract size',
  probe.ok && probe.w === 1080 && probe.h === 675, probe.w + 'x' + probe.h);

const errs = await chrome.eval("return window.__err;");
check('the landing page loads clean', errs.length === 0, errs.join(' | ') || 'none');

const count = await chrome.eval("return document.getElementById('evCount').textContent;");
check('the All (n) label counted itself',
  count === String(card.widths.length), count + ' vs ' + card.widths.length + ' cards');

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
await chrome.close();
await server.close();
process.exit(fail ? 1 : 0);
