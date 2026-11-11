// Info panel anchored to a point on the globe, with an SVG connector line.
export function createPanel() {
  const panel = document.getElementById('panel');
  const title = document.getElementById('p-title'), sub = document.getElementById('p-sub');
  const rows = document.getElementById('p-rows'), bar = document.getElementById('p-bar');
  const svg = document.getElementById('connector'), line = document.getElementById('c-line'), dot = document.getElementById('c-dot');
  const closeBtn = document.getElementById('p-close');

  let anchorLocal = null; // THREE.Vector3 in globe-local space
  let ph = 0, lastPos = '';
  let onClose = () => {}; const openListeners = []; const onOpen = (info) => openListeners.forEach((f) => f(info));
  closeBtn.addEventListener('click', () => close());

  function open(info, local) {
    anchorLocal = local;
    title.textContent = info.title;
    sub.textContent = info.subtitle || '';
    rows.innerHTML = Object.entries(info.data).map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');
    panel.classList.remove('hidden'); svg.style.display = 'block'; ph = 0; lastPos = '';
    bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth; bar.style.transition = ''; bar.style.width = `${info.level ?? 50}%`;
    onOpen(info);
  }
  function close() {
    if (panel.classList.contains('hidden')) return;
    panel.classList.add('hidden'); svg.style.display = 'none'; anchorLocal = null; onClose();
  }
  const isOpen = () => anchorLocal !== null;

  // Call every frame with scene.localToScreen to keep the panel following the globe.
  function update(localToScreen) {
    if (!anchorLocal) return;
    const a = localToScreen(anchorLocal);
    const W = window.innerWidth, H = window.innerHeight, pw = 300; if (!ph) ph = panel.offsetHeight || 200;
    const right = a.x + 70 + pw < W;
    let left = right ? a.x + 70 : a.x - 70 - pw;
    left = Math.min(Math.max(left, 8), Math.max(8, W - pw - 8));
    const top = Math.min(Math.max(a.y - 60, 60), H - ph - 40);
    const key = `${Math.round(left)}|${Math.round(top)}`; if (key !== lastPos) { lastPos = key; panel.style.left = `${left}px`; panel.style.top = `${top}px`; }
    const ex = right ? left : left + pw, ey = top + 14;
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', ex); line.setAttribute('y2', ey);
    dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y);
    const op = a.front ? 1 : 0.25;
    panel.style.opacity = op; svg.style.opacity = op;
  }

  return { open, close, isOpen, update, set onClose(fn) { onClose = fn; }, set onOpen(fn) { openListeners.push(fn); } };
}
