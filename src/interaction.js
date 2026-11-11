import { clamp, dist } from './util.js';

const DWELL_MS = 800;       // hold the pointer this long to "touch"
const DWELL_RADIUS = 30;    // px the pointer may wander during a dwell
const FIST_MS = 450;
const ROT_SENS = 0.011;

export function createInteraction({ scene, panel, hud, sound }) {
  const st = scene.state;
  let drag = null;          // { last:{x,y} }
  let zoom = null;          // { startDist, startScale }
  let dwell = null;         // { start, origin:{x,y}, fired }
  let fistSince = null;
  let lastHover = null;
  let mouse = { x: -1, y: -1, down: false, inside: false };
  let cursor = null, zoomLine = null;

  function release() { drag = null; zoom = null; }
  function resetAll() {
    st.targetScale = 1; st.rotX = 0.15; st.velX = 0; st.velY = 0; st.autoSpin = true;
    panel.close(); sound.close();
  }

  function openAt(hitInfo) {
    scene.pulse(hitInfo.point);
    sound.confirm();
    st.autoSpin = false; st.velX = 0; st.velY = 0;
    if (hitInfo.hotspot) {
      panel.open(hitInfo.hotspot.data, hitInfo.point);
    } else {
      const { lat, lon } = hitInfo.latlon;
      const id = Math.abs(Math.round(lat * 7 + lon * 13)) % 900 + 100;
      panel.open({
        title: `UNMAPPED · GRID ${id}`,
        subtitle: 'SURFACE SCAN · NO REGISTERED NODE',
        level: 20 + (id % 60),
        data: {
          LAT: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`,
          LON: `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`,
          SIGNAL: `${(id % 37) + 12} dB`,
          THREAT: id % 3 === 0 ? 'LOW' : id % 3 === 1 ? 'NOMINAL' : 'UNKNOWN',
          STATUS: 'PASSIVE',
        },
      }, hitInfo.point);
    }
  }

  // Pointer (index tip or mouse) hovering/dwelling logic.
  function handlePointer(p, now, instant = false) {
    const hitInfo = scene.raycast(p.x, p.y);
    const hover = hitInfo?.hotspot || null;
    st.hover = hover;
    if (hover && hover !== lastHover) sound.hover();
    lastHover = hover;

    if (instant) { if (hitInfo) openAt(hitInfo); return; }

    if (!hitInfo) { dwell = null; cursor = { x: p.x, y: p.y, progress: 0, active: false, hover: false }; return; }
    if (!dwell || dist(dwell.origin, p) > DWELL_RADIUS) dwell = { start: now, origin: { x: p.x, y: p.y }, fired: false };
    const prog = clamp((now - dwell.start) / DWELL_MS, 0, 1);
    if (prog >= 1 && !dwell.fired) { dwell.fired = true; openAt(hitInfo); }
    cursor = { x: p.x, y: p.y, progress: dwell.fired ? 0 : prog, active: true, hover: !!hover };
  }

  function update(hands, face, now) {
    cursor = null; zoomLine = null;
    const pinching = hands.filter((h) => h.type === 'pinch');
    const pointing = hands.find((h) => h.type === 'point');
    const fist = hands.find((h) => h.type === 'fist');
    let gestureName = 'NONE';

    if (pinching.length >= 2) {
      gestureName = 'ZOOM';
      drag = null;
      const d = dist(pinching[0].pinch, pinching[1].pinch);
      if (!zoom) zoom = { startDist: d, startScale: st.targetScale };
      st.targetScale = clamp(zoom.startScale * (d / zoom.startDist), 0.5, 2.3);
      zoomLine = [pinching[0].pinch, pinching[1].pinch];
      st.autoSpin = false;
    } else if (pinching.length === 1) {
      gestureName = 'ROTATE';
      zoom = null;
      const p = pinching[0].pinch;
      if (!drag) drag = { last: { ...p } };
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y;
      drag.last = { ...p };
      st.rotY += dx * ROT_SENS; st.rotX += dy * ROT_SENS;
      st.velY = dx * ROT_SENS * 30; st.velX = dy * ROT_SENS * 30; // inertia on release
      st.autoSpin = false;
    } else {
      release();
    }

    if (!pinching.length && pointing) {
      gestureName = 'POINT';
      handlePointer(pointing.tip, now);
    } else if (!pointing) {
      dwell = null; st.hover = null;
    }

    if (fist && !pinching.length && !pointing) {
      gestureName = 'FIST';
      if (!fistSince) fistSince = now;
      if (now - fistSince > FIST_MS) { resetAll(); fistSince = null; }
    } else fistSince = null;

    if (hands.length === 0 && gestureName === 'NONE') {
      gestureName = hands.length ? 'IDLE' : 'NO HAND';
      // Mouse fallback when no hands are visible.
      if (mouse.inside) handlePointer(mouse, now);
    }

    // Face parallax: nose tip (landmark 1), mirrored.
    if (face) {
      const nx = (0.5 - face[1].x) * 2, ny = (0.5 - face[1].y) * 2;
      st.pTarget.x = clamp(nx, -1, 1); st.pTarget.y = clamp(ny, -1, 1);
    } else { st.pTarget.x = 0; st.pTarget.y = 0; }

    hud.setGesture(gestureName);
    hud.setRot(st.rotX, st.rotY); hud.setZoom(st.scale);
    return { cursor, zoomLine };
  }

  // ---------- mouse / touch fallback ----------
  let mDrag = null;
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (mDrag) {
      const dx = e.clientX - mDrag.x, dy = e.clientY - mDrag.y; mDrag = { x: e.clientX, y: e.clientY, moved: mDrag.moved + Math.abs(dx) + Math.abs(dy) };
      st.rotY += dx * ROT_SENS; st.rotX += dy * ROT_SENS; st.velY = dx * ROT_SENS * 30; st.velX = dy * ROT_SENS * 30; st.autoSpin = false;
    }
  });
  window.addEventListener('mousedown', (e) => { if (e.target.closest('#panel,#landing')) return; mDrag = { x: e.clientX, y: e.clientY, moved: 0 }; });
  window.addEventListener('mouseup', (e) => {
    if (mDrag && mDrag.moved < 6 && !e.target.closest('#panel,#landing')) handlePointer({ x: e.clientX, y: e.clientY }, performance.now(), true);
    mDrag = null;
  });
  window.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('wheel', (e) => { st.targetScale = clamp(st.targetScale * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.3); st.autoSpin = false; }, { passive: true });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') resetAll(); });

  return { update };
}
