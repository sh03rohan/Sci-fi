// Voice commands (Web Speech API recognition) + spoken responses (speech synthesis).
// Everything runs in the browser; Chrome/Edge support recognition, most browsers support synthesis.
const MODEL_WORDS = {
  globe: ['terra', 'earth', 'globe', 'planet', 'world', 'one', '1'],
  city: ['city', 'arcology', 'building', 'tower', 'urban', 'two', '2'],
  car: ['car', 'vehicle', 'vector', 'auto', 'three', '3'],
  galaxy: ['galaxy', 'space', 'stars', 'star', 'nebula', 'four', '4'],
  dna: ['dna', 'helix', 'genome', 'gene', 'five', '5'],
  heart: ['heart', 'cardio', 'cardiac', 'organ', 'six', '6'],
  jet: ['jet', 'fighter', 'plane', 'aircraft', 'raptor', 'seven', '7'],
  station: ['station', 'habitat', 'halo', 'orbital', 'eight', '8'],
  atom: ['atom', 'atomic', 'element', 'gold', 'quantum', 'nine', '9'],
  bioframe: ['skeleton', 'bioframe', 'bones', 'body', 'skeletal', 'ten', '10'],
};
const num = (s) => s.replace(/\b(\d+)\b/g, (m) => m.split('').join(' '));

export function createVoice({ scene, library, interaction, panel, hud, sound, extras = {} }) {
  const st = scene.state;
  const el = {
    box: document.getElementById('voice'), state: document.getElementById('v-state'),
    heard: document.getElementById('v-heard'), said: document.getElementById('v-said'),
  };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, wanted = false, muted = false, restartTimer = null;
  const log = [];

  /* ---------- speaking ---------- */
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices(); if (!vs.length) return;
    voice = vs.find((v) => /en-GB/i.test(v.lang) && /female|Google UK English Female|Libby|Sonia/i.test(v.name))
      || vs.find((v) => /Google UK English Female|Samantha|Zira|Aria|Jenny/i.test(v.name))
      || vs.find((v) => /^en/i.test(v.lang)) || vs[0];
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, { priority = false } = {}) {
    el.said.textContent = text; el.said.classList.remove('flash'); void el.said.offsetWidth; el.said.classList.add('flash');
    if (muted || !('speechSynthesis' in window)) return;
    if (priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(num(text));
    if (voice) u.voice = voice;
    u.rate = 1.04; u.pitch = 0.85; u.volume = 0.9;
    // pause recognition while speaking so the system does not hear itself
    u.onstart = () => { if (rec && listening) { try { rec.abort(); } catch {} } };
    u.onend = () => { if (wanted) scheduleRestart(150); };
    speechSynthesis.speak(u);
  }

  /* ---------- command grammar ---------- */
  function modelFrom(t) {
    for (const [id, words] of Object.entries(MODEL_WORDS)) if (words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) return id;
    return null;
  }
  // Finds a node by name across every model: returns { def, index } (index into def.hotspots).
  function hotspotFrom(t) {
    const score = (h) => {
      const words = (h.title + ' ' + (h.subtitle || '')).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['sector', 'node', 'primary', 'region', 'grid', 'array', 'field', 'core'].includes(w));
      return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    };
    const order = [scene.current?.def, ...scene.defs].filter(Boolean);
    let best = null;
    for (const def of order) def.hotspots.forEach((h, index) => { const sc = score(h); if (sc > 0 && (!best || sc > best.sc)) best = { def, index, sc }; });
    return best;
  }
  let pendingOpen = null;
  scene.onModelChange((def) => {
    if (!pendingOpen || pendingOpen.def !== def) return;
    const { index } = pendingOpen; pendingOpen = null;
    setTimeout(() => { const h = scene.current.hotspots[index]; if (!h) return; scene.pulse(h.local); panel.open(h.data, h.local); st.autoSpin = false; }, 350);
  });

  function handle(raw) {
    const t = raw.toLowerCase().trim();
    el.heard.textContent = `“${raw.trim()}”`;
    const cur = scene.current;

    if (/\b(next|forward)\b/.test(t) && /model|one|unit|next/.test(t)) { library.step(1); return say('Loading next unit.'); }
    if (/\b(previous|back|last)\b/.test(t)) { library.step(-1); return say('Loading previous unit.'); }
    if (/\b(open|show|load|switch|bring up|select|display)\b/.test(t)) {
      const id = modelFrom(t);
      if (id) {
        const def = scene.defs.find((d) => d.id === id);
        if (cur && cur.def.id === id) return say(`${def.name} is already on stage.`);
        library.select(scene.defs.indexOf(def)); return say(`Loading ${def.name}.`);
      }
    }
    if (/\b(scan|analy[sz]e|inspect|target|lock)\b/.test(t)) {
      const found = hotspotFrom(t);
      if (found) {
        const data = found.def.hotspots[found.index];
        if (cur && cur.def === found.def) { const h = cur.hotspots[found.index]; scene.pulse(h.local); panel.open(h.data, h.local); st.autoSpin = false; }
        else { pendingOpen = found; library.select(scene.defs.indexOf(found.def)); }
        return say(`${data.title.replace(/·/g, ',')} locked. ${data.subtitle || ''}`);
      }
      if (/\b(scan|analy[sz]e)\b/.test(t)) return say('Specify a registered node.');
    }
    if (/zoom\s*(in|closer)|\bcloser\b|magnify|enlarge/.test(t)) { st.targetScale = Math.min(2.3, st.targetScale * 1.35); st.autoSpin = false; return say('Zooming in.'); }
    if (/zoom\s*(out|back)|\bsmaller\b|shrink/.test(t)) { st.targetScale = Math.max(0.5, st.targetScale / 1.35); return say('Zooming out.'); }
    if (/\b(explode|disassemble|break apart|open up|expand)\b/.test(t)) { st.targetExplode = 1; return say('Exploded view.'); }
    if (/\b(assemble|collapse|put (it )?back|implode|close up)\b/.test(t)) { st.targetExplode = 0; return say('Reassembling.'); }
    if (/\b(slice|cut|cross[- ]?section)\b/.test(t)) { st.slice = st.slice === null ? 0.2 : st.slice; return say('Section plane engaged.'); }
    if (/\b(heal|unslice|remove (the )?(cut|slice)|full view)\b/.test(t)) { st.slice = null; return say('Section plane removed.'); }
    if (/\b(draw|annotate|mark(ing)?|pen)\b/.test(t) && /\b(off|stop|exit|disable)\b/.test(t)) { interaction.setMode('draw', false); return say('Annotation off.'); }
    if (/\b(draw|annotate|mark(ing)?|pen)\b/.test(t)) { interaction.setMode('draw', true); return say('Annotation mode.'); }
    if (/\b(clear|erase|wipe)\b/.test(t)) { scene.clearStrokes(); return say('Annotations cleared.'); }
    if (/\b(stop|freeze|hold)\b/.test(t) && /spin|rotat|turn|still/.test(t)) { st.autoSpin = false; st.velX = 0; st.velY = 0; return say('Rotation halted.'); }
    if (/\b(spin|rotate|turn)\b/.test(t)) { st.autoSpin = true; return say('Rotating.'); }
    if (/\b(close|dismiss|hide)\b/.test(t) && /panel|info|window|that|it/.test(t)) { panel.close(); return say('Closed.'); }
    if (/\b(reset|home|restore|default)\b/.test(t)) { interaction.resetAll(); return say('Interface reset.'); }
    const tl = t.match(/\b(timeline|time|scrub)\b.*?(\d{1,3})/);
    if (tl) { scene.setTime(parseInt(tl[2], 10) / 100); return say(`Timeline at ${tl[2]} percent.`); }
    if (/\b(live|real[- ]?time|satellite|iss|earthquake)\b/.test(t) && /\b(off|stop|disable)\b/.test(t)) { extras.live?.stop(); return say('Live feed disabled.'); }
    if (/\b(live|real[- ]?time|satellite|iss|earthquake)\b/.test(t)) { extras.live?.start(); if (cur?.def.id !== 'globe') library.select(scene.defs.findIndex((d) => d.id === 'globe')); return say('Live feed online. Tracking the station and seismic events.'); }
    if (/\b(status|report|sitrep|summary)\b/.test(t)) {
      const n = cur ? cur.hotspots.length : 0;
      return say(`${cur ? cur.def.name : 'No model'} on stage with ${n} registered nodes. Zoom ${st.scale.toFixed(1)}. All systems nominal.`);
    }
    if (/\b(hello|hi|hey|good (morning|evening|afternoon))\b/.test(t)) return say('Online and listening, operator.');
    if (/\b(thank|thanks)\b/.test(t)) return say('Anytime.');
    if (/\b(mute|quiet|silence)\b/.test(t)) { muted = true; el.said.textContent = 'VOICE OUTPUT MUTED'; return; }
    if (/\b(unmute|speak)\b/.test(t)) { muted = false; return say('Voice output restored.'); }
    if (/\b(help|commands|what can you do)\b/.test(t)) return say('Try: open galaxy, scan Tokyo, zoom in, explode, slice, draw, next model, reset, or status.');
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

  // speak when a node is opened by gesture/mouse too
  panel.onOpen = (info) => { if (wanted) say(`${info.title.replace(/·/g, ',')}.`); };

  setState(SR ? 'VOICE ○ OFF' : 'VOICE ○ UNSUPPORTED', 'off');
  return { start, stop, toggle, say, handle, get active() { return wanted; }, get supported() { return !!SR; }, setMuted: (m) => (muted = m) };
}
