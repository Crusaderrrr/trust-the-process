/**
 * iOS draws the on-screen keyboard over the page without resizing it, and our document never
 * scrolls (index.css), so a field near the end of a scroll area stays hidden behind it. While the
 * keyboard is up, give scroll areas that much extra room and scroll the focused field into view.
 */
const vv = window.visualViewport;

function update(reveal: boolean) {
  if (!vv) return;
  const kb = window.innerHeight - vv.height;
  // Small differences are browser toolbars or pinch zoom, not a keyboard.
  const open = vv.scale === 1 && kb > 100;
  const root = document.documentElement;
  root.classList.toggle('kb-open', open);
  root.style.setProperty('--kb', `${kb}px`);

  const el = document.activeElement;
  if (!open || !reveal || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const hidden = el.getBoundingClientRect().bottom + 16 - (vv.offsetTop + vv.height);
  if (hidden > 0) el.closest('.scroll-area')?.scrollBy({ top: hidden });
}

vv?.addEventListener('resize', () => update(true));
// Moving between fields keeps the keyboard up, so no resize fires.
document.addEventListener('focusin', () => requestAnimationFrame(() => update(true)));
