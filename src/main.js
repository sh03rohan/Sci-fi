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
      tracker = await createTracker((m) => bootLog(m));
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

  const toScreen = makeVideoMapper(video);
  const gestures = new GestureEngine(toScreen);
  const faceState = createFaceState();
  const interaction = createInteraction({ scene, panel, hud, sound, library, targets });
  const voice = createVoice({ scene, library, interaction, panel, hud, sound });
  const toolbar = createToolbar({ container: $('toolbar'), targets, interaction, scene, sound, voice });
  window.addEventListener('keydown', (e) => { if (e.key === 'v' || e.key === 'V') voice.toggle(); if (e.key === 'g' || e.key === 'G') interaction.setMode('gaze', !interaction.modes.gaze); });
  interaction.onFaceEvent = (ev) => { if (voice.active) voice.say(ev === 'mouthOpen' ? 'Alert acknowledged. Running threat scan.' : 'Zooming in.'); };

  let last = performance.now();
  let lastResult = { hands: [], face: null };
  let injected = null; // debug: window.__holo.inject({hands,face}) feeds synthetic landmarks
  window.__holo = { inject: (r) => (injected = r), scene, library, interaction, voice };
  let handSeen = 0, faceSeen = 0;

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05); last = now;

    if (injected) lastResult = injected;
    else if (tracker) {
      const r = tracker.detect(video);
      if (r) lastResult = r;
    }
    const hands = gestures.update(lastResult.hands, now);
    const face = lastResult.face;

    if (hands.length) handSeen = now; if (face) faceSeen = now;
    hud.setStatus('hand', now - handSeen < 300);
    hud.setStatus('face', now - faceSeen < 500);

    const fm = faceState.update(face, toScreen, now); window.__holo.fm = fm;
    const { cursor, zoomLine, hint } = interaction.update(hands, face, now, fm);
    toolbar.update();
    scene.update(dt);
    library.render(dt);
    panel.update(scene.localToScreen);
    hud.draw({ hands, face, fm, toScreen, cursor, zoomLine, hint, dt });
  }
  loop();
}
