// Dwell-selectable DOM targets (library slots, toolbar buttons).
// A target is hovered by the finger cursor; holding for DWELL fires its action.
export function createTargets(sound) {
  const list = [];
  let hovered = null;

  function register(el, onSelect, { progressEl = null, toggle = false } = {}) {
    const t = { el, onSelect, progressEl, toggle };
    list.push(t);
    el.addEventListener('click', () => fire(t));
    return t;
  }
  function fire(t) { t.onSelect(t); }
  function hitTest(x, y) {
    for (const t of list) {
      if (t.el.offsetParent === null) continue; // hidden
      const r = t.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return t;
    }
    return null;
  }
  function setHover(t, progress = 0) {
    if (t !== hovered) {
      if (hovered) { hovered.el.classList.remove('hover'); if (hovered.progressEl) hovered.progressEl.style.width = '0%'; }
      hovered = t;
      if (t) { t.el.classList.add('hover'); sound.tick(); }
    }
    if (t && t.progressEl) t.progressEl.style.width = `${progress * 100}%`;
  }
  return { register, hitTest, setHover, fire };
}
