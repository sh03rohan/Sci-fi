import { clamp, dist } from './util.js';

const DWELL_MS = 800;       // hold the pointer this long to "touch"
const DWELL_RADIUS = 30;    // px the pointer may wander during a dwell
const FIST_MS = 450;
const ROT_SENS = 0.011;

export function createInteraction({ scene, panel, hud, sound, library }) {
  const st = scene.state;
  let drag = null, zoom = null, dwell = null, fistSince = null, lastHover = null;
  const mouse = { x: -1, y: -1, inside: false };
  let cursor = null, zoomLine = null;

  const release = () => { drag = null; zoom = null; };
  function resetAll() {
    st.targetScale = 1; st.rotX = 0.15; st.velX = 0; st.velY = 0; st.autoSpin = true;
    panel.close(); sound.close();
  }

  function openAt(hit) {
    scene.pulse(hit.point); sound.confirm();
    st.autoSpin = false; st.velX = 0; st.velY = 0;
    if (hit.hotspot) { panel.open(hit.hotspot.data, hit.point); return; }
    const p = hit.point, id = Math.abs(Math.round(p.x * 71 + p.y * 131 + p.z * 197)) % 900 + 100;
    panel.open({
      title: `UNMAPPED · ${hit.modelName} · P-${id}`,
      subtitle: 'SURFACE SCAN · NO REGISTERED NODE',
      level: 20 + (id % 60),
      data: { ...hit.describe, SIGNAL: `${(id % 37) + 12} dB`, THREAT: ['LOW', 'NOMINAL', 'UNKNOWN'][id % 3], STATUS: 'PASSIVE' },
    }, hit.point);
  }

  // Pointer (index tip or mouse). Library slots take priority over the hologram.
  function handlePointer(p, now, instant = false) {
    const slot = library.hitTest(p.x, p.y);
    if (slot >= 0) {
      st.hover = null; lastHover = null;
      if (instant) { library.select(slot); library.setHover(-1); return; }
      if (!dwell || dwell.slot !== slot) dwell = { start: now, origin: { ...p }, fired: false, slot };
      const prog = clamp((now - dwell.start) / DWELL_MS, 0, 1);
      if (prog >= 1 && !dwell.fired) { dwell.fired = true; library.select(slot); }
      library.setHover(slot, dwell.fired ? 1 : prog);
      cursor = { x: p.x, y: p.y, progress: dwell.fired ? 0 : prog, active: true, hover: true, label: 'SELECT' };
      return;
    }
    library.setHover(-1);

    const hit = scene.raycast(p.x, p.y);
    const hover = hit?.hotspot || null;
    st.hover = hover;
    if (hover && hover !== lastHover) sound.hover();
    lastHover = hover;

    if (instant) { if (hit) openAt(hit); return; }
    if (!hit) { dwell = null; cursor = { x: p.x, y: p.y, progress: 0, active: false, hover: false }; return; }
    if (!dwell || dwell.slot !== undefined || dist(dwell.origin, p) > DWELL_RADIUS) dwell = { start: now, origin: { ...p }, fired: false };
    const prog = clamp((now - dwell.start) / DWELL_MS, 0, 1);
    if (prog >= 1 && !dwell.fired) { dwell.fired = true; openAt(hit); }
    cursor = { x: p.x, y: p.y, progress: dwell.fired ? 0 : prog, active: true, hover: !!hover };
  }

  function update(hands, face, now) {
    cursor = null; zoomLine = null;
    const pinching = hands.filter((h) => h.type === 'pinch');
    const pointing = hands.find((h) => h.type === 'point');
    const fist = hands.find((h) => h.type === 'fist');
    let gestureName = hands.length ? 'IDLE' : 'NO HAND';

    if (pinching.length >= 2) {
      gestureName = 'ZOOM'; drag = null;
      const d = dist(pinching[0].pinch, pinching[1].pinch);
      if (!zoom) zoom = { startDist: d, startScale: st.targetScale };
      st.targetScale = clamp(zoom.startScale * (d / zoom.startDist), 0.5, 2.3);
      zoomLine = [pinching[0].pinch, pinching[1].pinch]; st.autoSpin = false;
    } else if (pinching.length === 1) {
      gestureName = 'ROTATE'; zoom = null;
      const p = pinching[0].pinch;
      if (!drag) drag = { last: { ...p } };
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y; drag.last = { ...p };
      st.rotY += dx * ROT_SENS; st.rotX += dy * ROT_SENS;
      st.velY = dx * ROT_SENS * 30; st.velX = dy * ROT_SENS * 30; st.autoSpin = false;
    } else release();

    if (!pinching.length && pointing) { gestureName = 'POINT'; handlePointer(pointing.tip, now); }
    else if (!pointing) { dwell = null; st.hover = null; library.setHover(-1); }

    if (fist && !pinching.length && !pointing) {
      gestureName = 'FIST';
      if (!fistSince) fistSince = now;
      if (now - fistSince > FIST_MS) { resetAll(); fistSince = null; }
    } else fistSince = null;

    if (hands.length === 0 && mouse.inside) handlePointer(mouse, now);

    if (face) { st.pTarget.x = clamp((0.5 - face[1].x) * 2, -1, 1); st.pTarget.y = clamp((0.5 - face[1].y) * 2, -1, 1); }
    else { st.pTarget.x = 0; st.pTarget.y = 0; }

    hud.setGesture(gestureName); hud.setRot(st.rotX, st.rotY); hud.setZoom(st.scale);
    return { cursor, zoomLine };
  }

  // ---------- mouse fallback ----------
  let mDrag = null;
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (mDrag) {
      const dx = e.clientX - mDrag.x, dy = e.clientY - mDrag.y; mDrag = { x: e.clientX, y: e.clientY, moved: mDrag.moved + Math.abs(dx) + Math.abs(dy) };
      st.rotY += dx * ROT_SENS; st.rotX += dy * ROT_SENS; st.velY = dx * ROT_SENS * 30; st.velX = dy * ROT_SENS * 30; st.autoSpin = false;
    }
  });
  window.addEventListener('mousedown', (e) => { if (e.target.closest('#panel,#landing,#library')) return; mDrag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  window.addEventListener('mouseup', (e) => {
    if (mDrag && mDrag.moved < 6 && !e.target.closest('#panel,#landing,#library')) handlePointer({ x: e.clientX, y: e.clientY }, performance.now(), true);
    mDrag = null;
  });
  document.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('wheel', (e) => { st.targetScale = clamp(st.targetScale * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.3); st.autoSpin = false; }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') resetAll();
    const n = parseInt(e.key, 10); if (n >= 1 && n <= scene.defs.length) library.select(n - 1);
  });

  return { update };
}
