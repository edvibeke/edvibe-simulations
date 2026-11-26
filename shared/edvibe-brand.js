(() => {
  const root = document.documentElement;
  root.classList.add('eb-js');
  if (window.self !== window.top) root.classList.add('eb-iframe');

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function navigation() {
    const header = document.querySelector('.eb-header');
    const toggle = document.querySelector('.eb-nav-toggle');
    if (!header || !toggle) return;

    const close = () => {
      header.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    header.querySelectorAll('.eb-menu a').forEach(link => {
      link.addEventListener('click', close);
    });

    document.addEventListener('click', event => {
      if (!header.contains(event.target)) close();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
  }

  function filters() {
    const buttons = Array.from(document.querySelectorAll('.eb-filter'));
    const cards = Array.from(document.querySelectorAll('.eb-card'));
    const count = document.getElementById('ebCount');
    const empty = document.getElementById('ebEmpty');
    if (!buttons.length || !cards.length) return;

    const valid = new Set(buttons.map(button => button.dataset.subject));
    const requested = new URLSearchParams(window.location.search).get('subject');
    let current = requested && valid.has(requested) ? requested : 'all';

    function apply(subject, animate) {
      const before = new Map();
      if (animate && !reduced()) {
        cards.forEach(card => {
          if (!card.hidden) before.set(card, card.getBoundingClientRect());
        });
      }

      buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.subject === subject));
      });

      let shown = 0;
      cards.forEach(card => {
        const visible = subject === 'all' || card.dataset.subject === subject;
        card.hidden = !visible;
        if (visible) shown += 1;
      });

      if (count) count.textContent = String(shown);
      if (empty) empty.hidden = shown !== 0;

      if (!animate || reduced()) return;

      cards.forEach(card => {
        if (card.hidden) return;
        const previous = before.get(card);
        if (!previous) {
          card.animate(
            [{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
            { duration: 280, easing: 'ease-out' }
          );
          return;
        }
        const now = card.getBoundingClientRect();
        const dx = previous.left - now.left;
        const dy = previous.top - now.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          card.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 320, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
          );
        }
      });
    }

    buttons.forEach(button => {
      button.addEventListener('click', () => {
        current = button.dataset.subject;
        apply(current, true);
        try {
          const url = current === 'all' ? window.location.pathname : `?subject=${current}`;
          window.history.replaceState(null, '', url);
        } catch (error) {
          window.location.hash = current === 'all' ? 'main' : current;
        }
      });
    });

    apply(current, false);
  }

  function reveals() {
    const items = Array.from(document.querySelectorAll('.eb-reveal'));
    if (!items.length) return;

    if (reduced() || !('IntersectionObserver' in window)) {
      items.forEach(item => item.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.04 });

    items.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index % 6, 5) * 45}ms`;
      observer.observe(item);
    });
  }

  function counters() {
    document.querySelectorAll('[data-count]').forEach(element => {
      const target = Number(element.dataset.count) || 0;
      if (reduced()) {
        element.textContent = String(target);
        return;
      }
      const duration = 900;
      const start = performance.now();
      const step = now => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = String(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function heroCanvas() {
    const canvas = document.getElementById('ebHeroCanvas');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let ratio = 1;
    let time = 900;
    let frame = 0;
    let running = false;
    const colors = ['#004439', '#00b894', '#fd961e'];

    function draw() {
      context.clearRect(0, 0, width, height);
      const cx = width * (width < 700 ? 0.5 : 0.72);
      const cy = height * 0.5;
      const rx = Math.min(width * 0.32, 280);
      const ry = Math.min(height * 0.34, 140);

      colors.forEach((color, index) => {
        context.save();
        context.translate(cx, cy);
        context.rotate((Math.PI / 3) * index + time * 0.00006 * (index % 2 ? 1 : -1));
        context.beginPath();
        context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        context.strokeStyle = color;
        context.globalAlpha = 0.17;
        context.lineWidth = 1.5;
        context.stroke();

        const angle = time * 0.00055 + index * 2.1;
        context.beginPath();
        context.arc(Math.cos(angle) * rx, Math.sin(angle) * ry, index === 2 ? 5 : 4, 0, Math.PI * 2);
        context.globalAlpha = 0.6;
        context.fillStyle = color;
        context.fill();
        context.restore();
      });
    }

    function fit() {
      const bounds = canvas.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    }

    function loop(now) {
      time = now;
      draw();
      frame = requestAnimationFrame(loop);
    }

    function start() {
      if (running || reduced()) return;
      running = true;
      frame = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
    }

    fit();
    start();

    if ('ResizeObserver' in window) {
      new ResizeObserver(fit).observe(canvas);
    } else {
      window.addEventListener('resize', fit, { passive: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });
  }

  function pointerGlow() {
    if (reduced() || !window.matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('.eb-card').forEach(card => {
      card.addEventListener('pointermove', event => {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - bounds.left}px`);
        card.style.setProperty('--my', `${event.clientY - bounds.top}px`);
      });
    });
  }

  function init() {
    navigation();
    filters();
    reveals();
    counters();
    heroCanvas();
    pointerGlow();
    if (window.EV && typeof window.EV.icons === 'function') window.EV.icons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
