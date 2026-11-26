import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const simsDir = path.join(root, 'sims');
const landing = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const subjects = new Map();
for (const match of landing.matchAll(/<a class="eb-card" href="sims\/([^/]+)\/" data-subject="([^"]+)"/g)) {
  subjects.set(match[1], match[2]);
}

const canonicals = new Map(Object.entries({
  'newtons-laws': 'https://edvibe.co.ke/simulation.php?slug=newtons-laws',
  'momentum-collisions': 'https://edvibe.co.ke/simulation.php?slug=momentum-collisions',
  'levers-moments': 'https://edvibe.co.ke/simulation.php?slug=levers-moments',
  'digestive-system': 'https://edvibe.co.ke/simulation.php?slug=digestive-system',
  photosynthesis: 'https://edvibe.co.ke/simulation.php?slug=photosynthesis',
  'gravity-energy': 'https://edvibe.co.ke/simulation.php?slug=gravity-energy',
  electrolysis: 'https://edvibe.co.ke/simulation.php?slug=electrolysis',
  'covalent-bonding': 'https://edvibe.co.ke/simulation.php?slug=covalent-bonding',
  titration: 'https://edvibe.co.ke/simulation.php?slug=titration',
  'gas-laws': 'https://edvibe.co.ke/simulation.php?slug=gas-laws',
  lungs: 'https://edvibe.co.ke/simulation.php?slug=human-body',
  'food-chains': 'https://edvibe.co.ke/simulation.php?slug=food-chains',
  'dynamic-equilibrium': 'https://edvibe.co.ke/simulation.php?slug=dynamic-equilibrium',
  'series-parallel-circuits': 'https://edvibe.co.ke/simulation.php?slug=series-parralel-circuits',
  'natural-selection': 'https://edvibe.co.ke/simulation.php?slug=natural-selection',
  heart: 'https://edvibe.co.ke/simulation.php?slug=the-heart',
  mitosis: 'https://edvibe.co.ke/simulation.php?slug=mitosis',
  osmosis: 'https://edvibe.co.ke/simulation.php?slug=osmosis',
  enzymes: 'https://edvibe.co.ke/simulation.php?slug=enzymes',
  'ph-scale': 'https://edvibe.co.ke/simulation.php?slug=ph-scale',
  'ionic-bonding': 'https://edvibe.co.ke/simulation.php?slug=ionic-bonding',
  'rates-of-reaction': 'https://edvibe.co.ke/simulation.php?slug=rates-of-reaction',
  'states-of-matter': 'https://edvibe.co.ke/simulation.php?slug=states-of-matter',
  'terminal-velocity': 'https://edvibe.co.ke/simulation.php?slug=terminal-velocity',
  'hookes-law': 'https://edvibe.co.ke/simulation.php?slug=hookes-law',
  refraction: 'https://edvibe.co.ke/simulation.php?slug=refraction',
  'wave-interference': 'https://edvibe.co.ke/simulation.php?slug=wave-interference',
  pendulum: 'https://edvibe.co.ke/simulation.php?slug=simple-pendulum',
  'ohms-law': 'https://edvibe.co.ke/simulation.php?slug=ohms-law',
  'projectile-motion': 'https://edvibe.co.ke/simulation.php?slug=projectile-motion'
}));

const header = `  <header class="eb-header">
    <div class="eb-header__inner">
      <a class="eb-logo" href="https://edvibe.co.ke/index.php" aria-label="EdVibe home">
        <img src="../../assets/media/logo.png" alt="EdVibe">
      </a>
      <button class="eb-nav-toggle" type="button" aria-expanded="false" aria-controls="ebMenu" aria-label="Open navigation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <div class="eb-menu" id="ebMenu">
        <nav class="eb-nav" aria-label="Main navigation">
          <a href="https://edvibe.co.ke/index.php">Home</a>
          <a href="https://edvibe.co.ke/notes.php">Notes &amp; Summary</a>
          <a href="https://edvibe.co.ke/quizzes.php">Quizzes</a>
          <a href="../../index.html" aria-current="page">Simulations</a>
          <a href="https://edvibe.co.ke/about.php">About us</a>
          <a href="https://edvibe.co.ke/contact.php">Contact</a>
        </nav>
        <div class="eb-actions">
          <a class="eb-login" href="https://edvibe.co.ke/login.php">Login</a>
          <a class="eb-signup" href="https://edvibe.co.ke/register.php">Sign up free</a>
        </div>
      </div>
    </div>
  </header>

  <div class="eb-sim-main">`;

const footer = `  </div>

  <footer class="eb-footer">
    <div class="eb-footer__inner">
      <div class="eb-footer__brand">
        <img src="../../assets/media/logo.png" alt="EdVibe">
        <p>Free, interactive science resources for Kenyan classrooms. <span class="eb-always">ALWAYS.</span></p>
      </div>
      <div>
        <h4>Keep learning</h4>
        <ul>
          <li><a href="https://edvibe.co.ke/notes.php">All notes</a></li>
          <li><a href="https://edvibe.co.ke/quizzes.php">Practice quizzes</a></li>
          <li><a href="../../index.html">All simulations</a></li>
        </ul>
      </div>
      <div>
        <h4>EdVibe</h4>
        <ul>
          <li><a href="https://edvibe.co.ke/about.php">About us</a></li>
          <li><a href="https://edvibe.co.ke/contact.php">Contact</a></li>
          <li><a href="https://edvibe.co.ke/register.php">Sign up free</a></li>
        </ul>
      </div>
    </div>
    <div class="eb-footer__bottom">
      <span>© 2026 EdVibe · Made with care in Nairobi, Kenya</span>
      <span><a href="https://edvibe.co.ke/terms.php">Terms</a> · <a href="https://edvibe.co.ke/privacy.php">Privacy</a></span>
    </div>
  </footer>
`;

function brand(html, slug) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  if (!titleMatch) throw new Error(`${slug}: no title`);
  const name = titleMatch[1].replace(/\s*—\s*EdVibe Simulation\s*$/, '').trim();

  const descMatch = html.match(/<meta name="description" content="([^"]*)">/);
  if (!descMatch) throw new Error(`${slug}: no description`);
  const description = `${descMatch[1].replace(/\s+$/, '')} Built for Kenyan classrooms and free on EdVibe.`.replace(/"/g, '&quot;');

  const subject = subjects.get(slug) || 'Science';
  const canonical = canonicals.get(slug) || `https://edvibeke.github.io/edvibe-simulations/sims/${slug}/`;
  const image = `https://edvibeke.github.io/edvibe-simulations/sims/${slug}/thumbnail.jpg`;
  const pageTitle = `${name} Simulation | EdVibe`;

  html = html.replace(/(<meta name="viewport"[^>]*>\n)/, '$1  <meta name="theme-color" content="#004439">\n');
  html = html.replace(/<link rel="icon"[^>]*>/, '  <link rel="icon" type="image/png" href="../../assets/media/favicon.png">\n  <link rel="apple-touch-icon" href="../../assets/media/favicon.png">');
  html = html.replace(/<meta name="description" content="[^"]*">/, `  <meta name="description" content="${description}">\n  <meta name="robots" content="index, follow">`);
  html = html.replace(/  <title>/, `  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="EdVibe">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@edvibeke">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <title>`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${pageTitle}</title>`);
  html = html.replace(/(<link rel="stylesheet" href="\.\.\/\.\.\/shared\/edvibe-sim\.css">)/, '$1\n  <link rel="stylesheet" href="../../shared/edvibe-brand.css">');
  html = html.replace(/(<link rel="stylesheet" href="\.\.\/\.\.\/shared\/edvibe-brand\.css">)/, '$1\n  <script>if (window.self !== window.top) document.documentElement.classList.add(\'eb-iframe\');document.documentElement.classList.add(\'eb-js\');</script>');

  html = html.replace('<body>', '<body class="eb-sim">');
  html = html.replace(/(\n  <a class="ev-skip"[^>]*>[^<]*<\/a>\n)/, `$1\n${header}\n`);
  html = html.replace(/(\n(\s*)<h1>)/, (match, whole, indent) => `\n${indent}<span class="eb-sim-tag">${subject} · Interactive</span>${whole}`);
  html = html.replace('  <script src="../../shared/edvibe-sim.js"></script>', `${footer}\n  <script src="../../shared/edvibe-sim.js"></script>`);
  html = html.replace(/(  <script src="\.\.\/\.\.\/shared\/lucide\.min\.js"><\/script>\n)/, '$1  <script src="../../shared/edvibe-brand.js"></script>\n');

  return html;
}

const changed = [];
const skipped = [];
for (const entry of fs.readdirSync(simsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(simsDir, entry.name, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('edvibe-brand.css')) {
    skipped.push(entry.name);
    continue;
  }
  if (!html.includes('class="ev-header"') || !html.includes('class="ev-skip"')) {
    skipped.push(`${entry.name} (unsupported layout)`);
    continue;
  }
  fs.writeFileSync(file, brand(html, entry.name));
  changed.push(entry.name);
}

console.log(`branded ${changed.length} pages`);
console.log(`skipped ${skipped.length}: ${skipped.join(', ')}`);
