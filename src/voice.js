// Voice commands (Web Speech API) + spoken replies (speech synthesis).
// Runs entirely in the browser, off the render loop. Chrome / Edge support recognition.
export function createVoice({ scene, interaction, panel, sound, game }) {
  const st = scene.state;
  const el = { box: document.getElementById('voice'), state: document.getElementById('v-state'), heard: document.getElementById('v-heard'), said: document.getElementById('v-said') };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, wanted = false, muted = false, restartTimer = null;

  /* ---------- speaking ---------- */
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices(); if (!vs.length) return;
    voice = vs.find((v) => /en-GB/i.test(v.lang) && /female|Libby|Sonia|Google UK English Female/i.test(v.name))
      || vs.find((v) => /Google UK English Female|Samantha|Zira|Aria|Jenny/i.test(v.name))
      || vs.find((v) => /^en/i.test(v.lang)) || vs[0];
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, { priority = false } = {}) {
    el.said.textContent = text; el.said.classList.remove('flash'); void el.said.offsetWidth; el.said.classList.add('flash');
    if (muted || !('speechSynthesis' in window)) return;
    if (priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\b(\d+)\b/g, (m) => m.split('').join(' ')));
    if (voice) u.voice = voice;
    u.rate = 1.04; u.pitch = 0.85; u.volume = 0.9;
    u.onstart = () => { if (rec && listening) { try { rec.abort(); } catch {} } }; // don't hear ourselves
    u.onend = () => { if (wanted) scheduleRestart(150); };
    speechSynthesis.speak(u);
  }

  /* ---------- commands ---------- */
  function hotspotFrom(t) {
    let best = null;
    for (const h of scene.hotspots) {
      const words = (h.data.title + ' ' + (h.data.subtitle || '')).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['sector', 'node', 'primary', 'region', 'grid', 'array', 'field', 'core'].includes(w));
      const sc = words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
      if (sc > 0 && (!best || sc > best.sc)) best = { h, sc };
    }
    return best?.h || null;
  }
  function handle(raw) {
    const t = raw.toLowerCase().trim();
    el.heard.textContent = `“${raw.trim()}”`;

    if (/\b(stop|end|quit|exit)\b.*\b(game|practice|round)\b/.test(t)) { game.stop(); return say('Ending the round.'); }
    if (/\b(start|play|begin|launch|again)\b.*\b(game|practice|round|again)\b|\bplay again\b|\btarget practice\b/.test(t)) { game.start(); return; }
    if (/\b(scan|analy[sz]e|inspect|target|lock|open|show)\b/.test(t)) {
      const h = hotspotFrom(t);
      if (h) { scene.pulse(h.local); panel.open(h.data, h.local); st.autoSpin = false; return say(`${h.data.title.replace(/·/g, ',')} locked. ${h.data.subtitle || ''}`); }
      if (/\b(scan|analy[sz]e)\b/.test(t)) return say('Specify a registered node, for example: scan Tokyo.');
    }
    if (/zoom\s*(in|closer)|\bcloser\b|magnify|enlarge/.test(t)) { st.targetScale = Math.min(2.3, st.targetScale * 1.35); st.autoSpin = false; return say('Zooming in.'); }
    if (/zoom\s*(out|back)|\bsmaller\b|shrink/.test(t)) { st.targetScale = Math.max(0.5, st.targetScale / 1.35); return say('Zooming out.'); }
    if (/\b(explode|disassemble|break apart|open up|expand)\b/.test(t)) { st.targetExplode = 1; return say('Exploded view.'); }
    if (/\b(assemble|collapse|put (it )?back|implode|close up)\b/.test(t)) { st.targetExplode = 0; return say('Reassembling.'); }
    if (/\b(slice|cut|cross[- ]?section)\b/.test(t)) { if (st.slice === null) st.slice = 0.2; return say('Section plane engaged.'); }
    if (/\b(heal|unslice|remove (the )?(cut|slice)|full view)\b/.test(t)) { st.slice = null; return say('Section plane removed.'); }
    if (/\b(draw|annotate|mark(ing)?|pen)\b/.test(t) && /\b(off|stop|exit|disable)\b/.test(t)) { interaction.setMode('draw', false); return say('Annotation off.'); }
    if (/\b(draw|annotate|mark(ing)?|pen)\b/.test(t)) { interaction.setMode('draw', true); return say('Annotation mode.'); }
    if (/\b(clear|erase|wipe)\b/.test(t)) { scene.clearStrokes(); return say('Annotations cleared.'); }
    if (/\b(stop|freeze|hold)\b/.test(t) && /spin|rotat|turn|still/.test(t)) { st.autoSpin = false; st.velX = 0; st.velY = 0; return say('Rotation halted.'); }
    if (/\b(spin|rotate|turn)\b/.test(t)) { st.autoSpin = true; return say('Rotating.'); }
    if (/\b(close|dismiss|hide)\b/.test(t)) { panel.close(); return say('Closed.'); }
    if (/\b(reset|home|restore|default)\b/.test(t)) { interaction.resetAll(); return say('Interface reset.'); }
    if (/\b(status|report|sitrep|summary)\b/.test(t)) return say(`Terra on stage with ${scene.hotspots.length} registered nodes. Zoom ${st.scale.toFixed(1)}. All systems nominal.`);
    if (/\b(hello|hi|hey|good (morning|evening|afternoon))\b/.test(t)) return say('Online and listening, operator.');
    if (/\b(thank|thanks)\b/.test(t)) return say('Anytime.');
    if (/\b(mute|quiet|silence)\b/.test(t)) { muted = true; el.said.textContent = 'VOICE OUTPUT MUTED'; return; }
    if (/\b(unmute|speak)\b/.test(t)) { muted = false; return say('Voice output restored.'); }
    if (/\b(help|commands|what can you do)\b/.test(t)) return say('Try: scan Tokyo, zoom in, explode, assemble, slice, heal, draw, clear, stop spinning, reset, status, or start game.');
    el.said.textContent = '— no matching command —';
  }

  /* ---------- recognition ---------- */
  function setState(s, cls = '') { el.state.textContent = s; el.box.className = cls; }
  function scheduleRestart(ms) { clearTimeout(restartTimer); restartTimer = setTimeout(() => { if (wanted && !listening) start(); }, ms); }
  function start() {
    if (!SR) { setState('VOICE ○ UNSUPPORTED', 'off'); return false; }
    if (listening) return true;
    rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onstart = () => { listening = true; setState('VOICE ● LISTENING', 'on'); };
    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript; }
      if (interim) el.heard.textContent = `… ${interim}`;
      if (final) { sound.tick(); handle(final); }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; setState('VOICE ○ MIC BLOCKED', 'off'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setState(`VOICE ○ ${e.error.toUpperCase()}`, 'off');
    };
    rec.onend = () => { listening = false; if (wanted) { setState('VOICE ◌ …', ''); scheduleRestart(300); } else setState('VOICE ○ OFF', 'off'); };
    try { rec.start(); } catch { return false; }
    wanted = true; return true;
  }
  function stop() { wanted = false; clearTimeout(restartTimer); if (rec) { try { rec.stop(); } catch {} } setState('VOICE ○ OFF', 'off'); }
  function toggle() { if (wanted) stop(); else if (start()) say('Voice control online.'); return wanted; }

  panel.onOpen = (info) => { if (wanted) say(`${info.title.replace(/·/g, ',')}.`); }; // read out nodes opened by gesture too
  setState(SR ? 'VOICE ○ OFF' : 'VOICE ○ UNSUPPORTED', 'off');
  return { start, stop, toggle, say, handle, get active() { return wanted; }, get supported() { return !!SR; } };
}
