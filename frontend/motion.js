/**
 * motion.js — Scroll-triggered reveals, count-up, parallax
 * Rules:
 *   • Only transform + opacity animated
 *   • Shared easing via CSS custom property --ease-out
 *   • All disabled when prefers-reduced-motion: reduce
 *   • Zero animation on #page-live-exam (handled in CSS)
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 1. Reveal on scroll (IntersectionObserver) ─────────────────────────── */
export function initReveal() {
  if (reduced) {
    document.querySelectorAll('.reveal, .split-heading').forEach(el => {
      el.classList.add('revealed');
    });
    return;
  }

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll('.reveal, .split-heading').forEach(el => io.observe(el));
}

/* ── 2. Split-line heading helper ───────────────────────────────────────── */
export function splitHeading(el, staggerMs = 80) {
  if (reduced) return;
  const text = el.textContent;
  const words = text.split(' ');
  const lines = [];
  for (let i = 0; i < words.length; i += 4) {
    lines.push(words.slice(i, i + 4).join(' '));
  }
  el.innerHTML = lines.map((line, i) =>
    `<span class="split-line" style="transition-delay:${i * staggerMs}ms">
       <span class="split-line-inner">${line}</span>
     </span>`
  ).join(' ');
  el.classList.add('split-heading');
}

/* ── 3. Count-up animation ──────────────────────────────────────────────── */
export function countUp(el, target, duration = 1200, suffix = '') {
  if (reduced) { el.textContent = target + suffix; return; }

  const start = performance.now();
  const from = 0;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (target - from) * eased);
    el.textContent = current.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* Auto count-up: elements with data-count="500" data-suffix="+" */
export function initCountUps() {
  if (reduced) {
    document.querySelectorAll('[data-count]').forEach(el => {
      el.textContent = el.dataset.count + (el.dataset.suffix || '');
    });
    return;
  }

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        countUp(el, parseInt(el.dataset.count), 1400, el.dataset.suffix || '');
        io.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll('[data-count]').forEach(el => io.observe(el));
}

/* ── 4. Parallax (single hero element only) ─────────────────────────────── */
export function initParallax(el, speed = 0.3) {
  if (reduced || !el) return;
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (ticking) return;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      el.style.transform = `translateY(${y * speed}px)`;
      ticking = false;
    });
    ticking = true;
  }, { passive: true });
}

/* ── 5. Scrollytelling steps ────────────────────────────────────────────── */
export function initScrollytelling(stepsSelector, visualsSelector) {
  if (reduced) {
    document.querySelectorAll(visualsSelector).forEach(v => v.classList.remove('hidden-vis'));
    return;
  }

  const steps   = [...document.querySelectorAll(stepsSelector)];
  const visuals = [...document.querySelectorAll(visualsSelector)];
  if (!steps.length || !visuals.length) return;

  visuals[0]?.classList.remove('hidden-vis');

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const idx = steps.indexOf(e.target);
        if (idx < 0) return;
        visuals.forEach((v, i) => {
          v.classList.toggle('hidden-vis', i !== idx);
        });
      });
    },
    { threshold: 0.5 }
  );
  steps.forEach(s => io.observe(s));
}
