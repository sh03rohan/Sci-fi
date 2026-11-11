import { startCamera } from './camera.js';
import { createTracker } from './tracking.js';
import { GestureEngine } from './gestures.js';
import { createScene } from './scene.js';
import { createHUD } from './hud.js';
import { createPanel } from './panel.js';
import { createInteraction } from './interaction.js';
import { createSound } from './sound.js';
import { createLibrary } from './library.js';
import { createTargets } from './targets.js';
import { createToolbar } from './toolbar.js';
import { createVoice } from './voice.js';
import { createFaceState } from './face.js';
import { createLive } from './live.js';
import { createGlbImporter } from './glb.js';
import { createFX } from './fx.js';
import { createOcclusion } from './occlusion.js';
import { createSettings } from './settings.js';
import { createRecorder } from './record.js';
import { createAlerts } from './alert.js';
import { Q, setTier, tick as qualityTick, onQuality } from './quality.js';
import { makeVideoMapper } from './util.js';

const $ = (id) => document.getElementById(id);
const video = $('cam');
const landing = $('landing'), btn = $('btn-start'), log = $('boot-log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bootLog(msg, cls = '') {
  const d = document.createElement('div'); d.textContent = msg; if (cls) d.className = cls;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
  while (log.children.length > 7) log.removeChild(log.firstChild);
}

btn.addEventListener('click', boot, { once: true });

async function boot() {
  const sound = createSound(); sound.unlock(); sound.boot();
  btn.classList.add('hidden'); log.classList.remove('hidden');
  bootLog('HOLO-INTERFACE v1.0 · boot sequence');
  await sleep(200);

  // 3D scene + data first (fast), then camera, then AI models.
  const scene = createScene($('gl'));
  const hud = createHUD($('overlay'));
  const panel = createPanel();
  const models = await fetch(`${import.meta.env.BASE_URL}data/models.json`).then((r) => r.json());
  scene.loadModels(models, 'globe');
  const targets = createTargets(sound);
  let settings, voice, alerts; // created below once the dependants exist
  const library = createLibrary({ scene, container: $('library'), defs: models, sound, targets });
  scene.onModelChange((def) => hud.setModel(def.name));
  hud.setModel(scene.current.def.name);
  const nodes = models.reduce((n, m) => n + m.hotspots.length, 0);
  bootLog(`hologram core online · ${models.length} models · ${nodes} nodes`, 'ok');

  let cameraOk = false;
  try {
    bootLog('requesting camera access…');
    await startCamera(video);
    cameraOk = true; hud.setStatus('cam', true);
    bootLog(`camera online · ${video.videoWidth}×${video.videoHeight}`, 'ok');
  } catch (e) {
    bootLog(`camera unavailable (${e.name}) · falling back to mouse control`, 'err');
    video.classList.add('hidden');
  }

  let tracker = null;
  if (cameraOk) {
    try {
      let pref = {}; try { pref = JSON.parse(localStorage.getItem('holo.settings.v1') || '{}'); } catch {}
      tracker = await createTracker((m) => bootLog(m), { multiUser: !!pref.multiUser });
      bootLog('hand tracking online · 21 landmarks', 'ok');
      bootLog('face tracking online · parallax enabled', 'ok');
    } catch (e) {
      console.error(e);
      bootLog(`tracking failed (${e.message?.slice(0, 60)}) · mouse control only`, 'err');
    }
  }

  bootLog('all systems nominal · entering interface', 'ok');
  await sleep(700);
  landing.style.transition = 'opacity 0.6s'; landing.style.opacity = '0';
  setTimeout(() => landing.remove(), 650);
  $('hud').classList.remove('hidden');

  let facing = 'user';
  const mirror = () => (settings ? settings.s.mirror : true) && facing === 'user';
  const toScreen = makeVideoMapper(video, mirror);
  const gestures = new GestureEngine(toScreen);
  const faceState = createFaceState();
  const interaction = createInteraction({ scene, panel, hud, sound, library, targets });
  const live = createLive({ scene, sound, hud });
  const glb = createGlbImporter({ scene, library, sound, onLog: (m) => voice?.say?.(m) });
  const fx = createFX({ scene, library, hud, sound });
  settings = createSettings({ container: $('settings'), targets, sound, onChange: (sv) => {
    interaction.applySettings(sv); hud.setTrails(sv.trails); if (sv.quality !== Q.tier) setTier(sv.quality);
    document.documentElement.style.setProperty('--hud-scale', sv.hudScale);
    $('grain').style.opacity = sv.grain; voice?.setVolume?.(sv.voiceVolume);
    $('hud').querySelector('.hud-bottom').style.display = sv.showHints ? '' : 'none';
    video.style.transform = mirror() ? 'scaleX(-1)' : 'none';
    alerts?.schedule?.();
  } });
  const occlusion = cameraOk ? await createOcclusion({ video, canvas: $('occl'), toScreen, onLog: bootLog }) : { update: () => [], setEnabled: async () => false, enabled: false };
  const extras = { live, fx, occlusion };
  voice = createVoice({ scene, library, interaction, panel, hud, sound, extras });
  const voiceExtras = (_v, more) => Object.assign(extras, more);
  const recorder = createRecorder({ video, layers: () => [$('gl'), $('occl'), $('overlay')], sound, hud, mirror });
  alerts = createAlerts({ scene, panel, hud, sound, voice, fx, settings });
  async function flipCamera() {
    if (!cameraOk) return;
    facing = facing === 'user' ? 'environment' : 'user';
    try { await startCamera(video, facing); } catch { facing = facing === 'user' ? 'environment' : 'user'; await startCamera(video, facing); }
    video.style.transform = mirror() ? 'scaleX(-1)' : 'none'; hud.alert(`CAMERA · ${facing === 'user' ? 'FRONT' : 'REAR'}`);
  }
  voice.setVolume(settings.s.voiceVolume);
  const toolbar = createToolbar({ container: $('toolbar'), targets, interaction, scene, sound, voice, live, glb, fx, occlusion, recorder, alerts, settings, flipCamera });
  voiceExtras(voice, { recorder, alerts, settings, flipCamera });
  window.addEventListener('keydown', (e) => { if (e.key === 'p') recorder.screenshot(); if (e.key === 'r') recorder.toggle(); if (e.key === 'a') alerts.trigger(); if (e.key === ',') settings.toggle(); if (e.key === 'k') flipCamera(); });
  panel.onOpen = () => fx.scramblePanel();
  window.addEventListener('keydown', (e) => { if (e.key === 'c') fx.cycleTheme(); if (e.key === 'f') fx.setFX(!fx.state.fx); if (e.key === 'o') occlusion.setEnabled(!occlusion.enabled); });
  // timeline slider ↔ scene time
  const tlRange = $('tl-range'), tlVal = $('tl-val');
  tlRange.addEventListener('input', () => scene.setTime(tlRange.value / 1000));
  window.addEventListener('keydown', (e) => { if (e.key === '[') scene.setTime(scene.state.time - 0.05); if (e.key === ']') scene.setTime(scene.state.time + 0.05); });
  window.addEventListener('keydown', (e) => { if (e.key === 'v' || e.key === 'V') voice.toggle(); if (e.key === 'g' || e.key === 'G') interaction.setMode('gaze', !interaction.modes.gaze); });
  interaction.onFaceEvent = (ev) => { if (voice.active) voice.say(ev === 'mouthOpen' ? 'Alert acknowledged. Running threat scan.' : 'Zooming in.'); };

  let last = performance.now();
  let lastResult = { hands: [], face: null, faces: [] };
  let injected = null; // debug: window.__holo.inject({hands,face}) feeds synthetic landmarks
  window.__holo = { inject: (r) => (injected = r), scene, library, interaction, voice, live, glb, fx, occlusion, recorder, alerts, settings };
  let handSeen = 0, faceSeen = 0;

  onQuality(() => { hud.requality(); scene.resize(); });
  let fpsShown = 0;
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    qualityTick();
    if (now - fpsShown > 1000 && Q.fps) { fpsShown = now; { const pf = window.__holo.perf || {}; settings.setFps(`${Math.round(Q.fps)} fps · ${['LOW', 'MED', 'HIGH'][Q.level]} · track ${pf.track?.toFixed(0)}ms · 3d ${pf.scene?.toFixed(0)}ms · hud ${pf.hud?.toFixed(0)}ms · lib ${pf.lib?.toFixed(0)}ms`); } }
    const dt = Math.min((now - last) / 1000, 0.05); last = now;

    const perf = window.__holo.perf || (window.__holo.perf = { track: 0, scene: 0, hud: 0, lib: 0 });
    let t0 = performance.now();
    if (injected) lastResult = injected;
    else if (tracker) {
      const r = tracker.detect(video);
      if (r) lastResult = r;
    }
    perf.track = perf.track * 0.9 + (performance.now() - t0) * 0.1;
    const hands = gestures.update(lastResult.hands, now);
    const face = lastResult.face;

    if (hands.length) handSeen = now; if (face) faceSeen = now;
    hud.setStatus('hand', now - handSeen < 300);
    hud.setStatus('face', now - faceSeen < 500);

    const fm = faceState.update(face, toScreen, now); window.__holo.fm = fm;
    const { cursor, zoomLine, hint } = interaction.update(hands, face, now, fm);
    toolbar.update(); live.update(dt); alerts.update(dt);
    if (Math.abs(tlRange.value / 1000 - scene.state.time) > 0.002) { tlRange.value = Math.round(scene.state.time * 1000); tlVal.textContent = `${Math.round(scene.state.time * 100)}%`; }
    t0 = performance.now(); scene.update(dt); perf.scene = perf.scene * 0.9 + (performance.now() - t0) * 0.1;
    t0 = performance.now(); library.render(dt); perf.lib = perf.lib * 0.9 + (performance.now() - t0) * 0.1;
    panel.update(scene.localToScreen);
    occlusion.update(hands, now);
    t0 = performance.now(); hud.draw({ hands, face, faces: lastResult.faces || [], fm, toScreen, cursor, zoomLine, hint, dt }); perf.hud = perf.hud * 0.9 + (performance.now() - t0) * 0.1;
  }
  loop();
}
