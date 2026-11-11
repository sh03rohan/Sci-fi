// Minimal tool strip (DRAW / CLEAR / RESET): plain DOM, selectable by click or by pointing and holding.
export function createTools({ container, interaction, scene, sound, voice, game }) {
  const defs = [
    { id: 'draw', label: '✎ DRAW', toggle: true, on: () => interaction.setMode('draw', true), off: () => interaction.setMode('draw', false) },
    { id: 'clear', label: '⌫ CLEAR', on: () => { scene.clearStrokes(); sound.close(); } },
    { id: 'reset', label: '↺ RESET', on: () => interaction.resetAll() },
    { id: 'game', label: '🎯 GAME', toggle: true, on: () => game.start(), off: () => game.stop() },
    { id: 'voice', label: '🎤 VOICE', toggle: true, on: () => { if (!voice.toggle()) sound.close(); }, off: () => voice.stop() },
  ];
  const list = [];
  for (const d of defs) {
    const el = document.createElement('div'); el.className = 'tool'; el.innerHTML = `<span>${d.label}</span><i></i>`;
    container.appendChild(el);
    const t = { el, d, prog: el.querySelector('i'), rect: null };
    el.addEventListener('click', () => fire(t)); list.push(t);
  }
  let hovered = null, rectsAt = 0;
  function fire(t) {
    if (t.d.toggle) { const on = !t.el.classList.contains('active'); t.el.classList.toggle('active', on); (on ? t.d.on : t.d.off)(); if (t.d.id !== 'voice' && t.d.id !== 'game') sound.confirm(); }
    else { t.d.on(); t.el.classList.add('flash'); setTimeout(() => t.el.classList.remove('flash'), 300); }
  }
  function hitTest(x, y) {
    if (performance.now() - rectsAt > 800) { for (const t of list) t.rect = t.el.getBoundingClientRect(); rectsAt = performance.now(); }
    return list.find((t) => t.rect && x >= t.rect.left && x <= t.rect.right && y >= t.rect.top && y <= t.rect.bottom) || null;
  }
  function setHover(t, progress = 0) {
    if (t !== hovered) { if (hovered) { hovered.el.classList.remove('hover'); hovered.prog.style.width = '0%'; } hovered = t; if (t) { t.el.classList.add('hover'); sound.tick(); } }
    if (t) t.prog.style.width = `${progress * 100}%`;
  }
  let n = 0;
  function update() { if (n++ % 10) return; list[0].el.classList.toggle('active', interaction.modes.draw); list[3].el.classList.toggle('active', game.active); list[4].el.classList.toggle('active', voice.active); list[4].el.classList.toggle('disabled', !voice.supported); }
  return { hitTest, fire, setHover, update };
}
