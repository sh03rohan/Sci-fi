// Bottom-right tool buttons, dwell-selectable like the library.
export function createToolbar({ container, targets, interaction, scene, sound, voice, live, glb, fx, occlusion, recorder, alerts, settings, flipCamera }) {
  const st = scene.state;
  const defs = [
    { id: 'draw', label: '✎ DRAW', toggle: true, on: () => interaction.setMode('draw', true), off: () => interaction.setMode('draw', false) },
    { id: 'clear', label: '⌫ CLEAR', on: () => { scene.clearStrokes(); sound.close(); } },
    { id: 'explode', label: '✣ EXPLODE', toggle: true, on: () => (st.targetExplode = 1), off: () => (st.targetExplode = 0) },
    { id: 'slice', label: '⊟ SLICE', toggle: true, on: () => (st.slice = 0.2), off: () => (st.slice = null) },
    { id: 'reset', label: '↺ RESET', on: () => interaction.resetAll() },
    { id: 'time', label: '⏱ TIME', toggle: true, on: () => { interaction.setMode('time', true); document.getElementById('timeline').classList.remove('hidden'); }, off: () => { interaction.setMode('time', false); document.getElementById('timeline').classList.add('hidden'); } },
    { id: 'live', label: '◉ LIVE', toggle: true, on: () => live.start(), off: () => live.stop() },
    { id: 'load', label: '⬆ LOAD .GLB', on: () => glb.open() },
    { id: 'fx', label: '✦ FX', toggle: true, on: () => fx.setFX(true), off: () => fx.setFX(false) },
    { id: 'occl', label: '✋ OCCLUDE', toggle: true, on: () => occlusion.setEnabled(true), off: () => occlusion.setEnabled(false) },
    { id: 'theme', label: '◐ THEME', on: () => fx.cycleTheme() },
    { id: 'gaze', label: '◎ GAZE', toggle: true, on: () => interaction.setMode('gaze', true), off: () => interaction.setMode('gaze', false) },
    { id: 'snap', label: '📸 SNAP', on: () => recorder.screenshot() },
    { id: 'rec', label: '● REC', toggle: true, on: () => recorder.start(), off: () => recorder.stop() },
    { id: 'alert', label: '⚠ ALERT', on: () => alerts.trigger() },
    { id: 'flip', label: '🔄 CAMERA', on: () => flipCamera() },
    { id: 'settings', label: '⚙ SETTINGS', toggle: true, on: () => settings.open(), off: () => settings.close() },
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
  let n = 0;
  function update() {
    if (n++ % 10) return;
    buttons.explode.classList.toggle('active', st.targetExplode > 0.5);
    buttons.slice.classList.toggle('active', st.slice !== null);
    buttons.draw.classList.toggle('active', interaction.modes.draw);
    buttons.voice.classList.toggle('active', voice.active);
    buttons.gaze.classList.toggle('active', interaction.modes.gaze);
    buttons.time.classList.toggle('active', interaction.modes.time);
    buttons.fx.classList.toggle('active', fx.state.fx);
    buttons.occl.classList.toggle('active', occlusion.enabled);
    buttons.rec.classList.toggle('active', recorder.recording);
    buttons.settings.classList.toggle('active', settings.isOpen);
    buttons.alert.classList.toggle('active', alerts.active);
    buttons.live.classList.toggle('active', live.active);
    buttons.voice.classList.toggle('disabled', !voice.supported);
  }
  return { update };
}
