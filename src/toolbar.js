// Bottom-right tool buttons, dwell-selectable like the library.
export function createToolbar({ container, targets, interaction, scene, sound, voice }) {
  const st = scene.state;
  const defs = [
    { id: 'draw', label: '✎ DRAW', toggle: true, on: () => interaction.setMode('draw', true), off: () => interaction.setMode('draw', false) },
    { id: 'clear', label: '⌫ CLEAR', on: () => { scene.clearStrokes(); sound.close(); } },
    { id: 'explode', label: '✣ EXPLODE', toggle: true, on: () => (st.targetExplode = 1), off: () => (st.targetExplode = 0) },
    { id: 'slice', label: '⊟ SLICE', toggle: true, on: () => (st.slice = 0.2), off: () => (st.slice = null) },
    { id: 'reset', label: '↺ RESET', on: () => interaction.resetAll() },
    { id: 'voice', label: '🎤 VOICE', toggle: true, on: () => { if (!voice.toggle()) { /* unsupported */ } }, off: () => voice.stop() },
  ];
  container.innerHTML = `<div class="tb-title">◈ TOOLS</div>`;
  const buttons = {};
  for (const d of defs) {
    const el = document.createElement('div');
    el.className = 'tb-btn'; el.innerHTML = `<span>${d.label}</span><div class="tb-prog"><div></div></div>`;
    container.appendChild(el);
    buttons[d.id] = el;
    targets.register(el, () => {
      if (d.toggle) { const on = !el.classList.contains('active'); el.classList.toggle('active', on); (on ? d.on : d.off)(); if (d.id !== 'voice') sound.confirm(); }
      else { d.on(); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 300); }
    }, { progressEl: el.querySelector('.tb-prog div') });
  }
  // keep toggles in sync with state changed elsewhere (gestures, keys)
  function update() {
    buttons.explode.classList.toggle('active', st.targetExplode > 0.5);
    buttons.slice.classList.toggle('active', st.slice !== null);
    buttons.draw.classList.toggle('active', interaction.modes.draw);
    buttons.voice.classList.toggle('active', voice.active);
    buttons.voice.classList.toggle('disabled', !voice.supported);
  }
  return { update };
}
