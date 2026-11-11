import * as THREE from 'three';
import { clamp, dist } from './util.js';

const DWELL_MS = 800;        // hold the pointer this long to "touch"
const DWELL_RADIUS = 30;     // px the pointer may wander during a dwell
const RESET_MS = 1200;       // open palm held still
const ROT_SENS = 0.011;

/*
  Gesture map (same tracking data as v1, only logic on top)
  ☝ point              cursor → scan (DRAW mode: annotate)
  🤏 pinch (1 hand)     rotate              🤏🤏 pinch (2 hands)  zoom
  ✊ fist               grab & move the hologram
  🖐 open (1 hand)      hold still → reset
  🖐🖐 open (2 hands)   distance → explode view · twist → roll
  ✌ peace              slice plane follows hand height
*/
export function createInteraction({ scene, panel, hud, sound, tools }) {
  const st = scene.state;
  let drag = null, zoom = null, dwell = null, grab = null, twoOpen = null, openHold = null, lastHover = null;
  let sliceHold = 0, sliceByHand = false, drawing = false;
  const mouse = { x: -1, y: -1, inside: false };
  let cursor = null, zoomLine = null;
  const modes = { draw: false };

  const release = () => { drag = null; zoom = null; };
  function resetAll() {
    st.targetScale = 1; st.rotX = 0.15; st.rotZ = 0; st.velX = 0; st.velY = 0; st.autoSpin = true;
    st.targetExplode = 0; st.slice = null; st.targetOffset.x = 0; st.targetOffset.y = 0;
    scene.clearStrokes(); panel.close(); sound.close();
  }
  // world units per screen pixel at the hologram's depth
  const worldPerPx = () => (2 * scene.camera.position.z * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2))) / window.innerHeight;

  function openAt(hitInfo) {
    scene.pulse(hitInfo.point); sound.confirm();
    st.autoSpin = false; st.velX = 0; st.velY = 0;
    if (hitInfo.hotspot) { panel.open(hitInfo.hotspot.data, hitInfo.point); return; }
    const { lat, lon } = hitInfo.latlon;
    const id = Math.abs(Math.round(lat * 7 + lon * 13)) % 900 + 100;
    panel.open({
      title: `UNMAPPED · GRID ${id}`, subtitle: 'SURFACE SCAN · NO REGISTERED NODE', level: 20 + (id % 60),
      data: {
        LAT: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`, LON: `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`,
        SIGNAL: `${(id % 37) + 12} dB`, THREAT: ['LOW', 'NOMINAL', 'UNKNOWN'][id % 3], STATUS: 'PASSIVE',
      },
    }, hitInfo.point);
  }

  // Pointer (index tip or mouse): tool buttons first, then the hologram.
  function handlePointer(p, now, instant = false) {
    const btn = tools.hitTest(p.x, p.y);
    if (btn) {
      st.hover = null; lastHover = null; scene.endStroke();
      if (instant) { tools.fire(btn); tools.setHover(null); return; }
      if (!dwell || dwell.btn !== btn) dwell = { start: now, origin: { ...p }, fired: false, btn };
      const prog = clamp((now - dwell.start) / DWELL_MS, 0, 1);
      if (prog >= 1 && !dwell.fired) { dwell.fired = true; tools.fire(btn); }
      tools.setHover(btn, dwell.fired ? 1 : prog);
      cursor = { x: p.x, y: p.y, progress: dwell.fired ? 0 : prog, active: true, hover: true, label: 'SELECT' };
      return;
    }
    tools.setHover(null);
    const hitInfo = scene.raycast(p.x, p.y);

    if (modes.draw && !instant) {
      if (hitInfo) { scene.drawPoint(hitInfo.point); drawing = true; } else if (drawing) { scene.endStroke(); drawing = false; }
      cursor = { x: p.x, y: p.y, progress: 0, active: !!hitInfo, hover: false, label: hitInfo ? 'DRAW' : '' };
      return;
    }

    const hover = hitInfo?.hotspot || null;
    st.hover = hover;
    if (hover && hover !== lastHover) sound.hover();
    lastHover = hover;
    if (instant) { if (hitInfo) openAt(hitInfo); return; }
    if (!hitInfo) { dwell = null; cursor = { x: p.x, y: p.y, progress: 0, active: false, hover: false }; return; }
    if (!dwell || dwell.btn || dist(dwell.origin, p) > DWELL_RADIUS) dwell = { start: now, origin: { ...p }, fired: false };
    const prog = clamp((now - dwell.start) / DWELL_MS, 0, 1);
    if (prog >= 1 && !dwell.fired) { dwell.fired = true; openAt(hitInfo); }
    cursor = { x: p.x, y: p.y, progress: dwell.fired ? 0 : prog, active: true, hover: !!hover };
  }

  function update(hands, face, now) {
    cursor = null; zoomLine = null;
    const by = (t) => hands.filter((h) => h.type === t);
    const pinching = by('pinch'), open = by('open'), fists = by('fist'), peace = by('peace');
    const pointing = hands.find((h) => h.type === 'point');
    let gestureName = hands.length ? 'IDLE' : 'NO HAND';
    let hint = null;

    /* ---- zoom / rotate (pinch) ---- */
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

    /* ---- grab & move (fist) ---- */
    if (fists.length === 1 && !pinching.length) {
      gestureName = 'GRAB';
      const p = fists[0].palm;
      if (!grab) { grab = { start: { ...p }, off: { ...st.targetOffset } }; sound.tick(); }
      const k = worldPerPx() / st.scale;
      st.targetOffset.x = clamp(grab.off.x + (p.x - grab.start.x) * k, -2.4, 1.6);
      st.targetOffset.y = clamp(grab.off.y - (p.y - grab.start.y) * k, -1.2, 1.2);
      st.autoSpin = false;
      hint = { x: p.x, y: p.y, label: 'HOLDING' };
    } else grab = null;

    /* ---- two open palms: explode + roll ---- */
    if (open.length >= 2) {
      gestureName = 'EXPLODE';
      const a = open[0].palm, b = open[1].palm;
      const d = dist(a, b), ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (!twoOpen) twoOpen = { d0: d, e0: st.targetExplode, ang0: ang, rz0: st.rotZ };
      st.targetExplode = clamp(twoOpen.e0 + (d - twoOpen.d0) / 320, 0, 1);
      let da = ang - twoOpen.ang0; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      st.rotZ = twoOpen.rz0 - da;
      zoomLine = [a, b]; st.autoSpin = false; openHold = null;
    } else {
      twoOpen = null;
      /* ---- one open palm held still: reset ---- */
      if (open.length === 1 && !pinching.length && !fists.length) {
        const h = open[0]; gestureName = 'OPEN';
        const speed = Math.hypot(h.vel.x, h.vel.y);
        if (!openHold || speed > 260) openHold = { start: now };
        const prog = clamp((now - openHold.start) / RESET_MS, 0, 1);
        if (prog > 0.15) hint = { x: h.palm.x, y: h.palm.y, label: 'RESET', progress: prog };
        if (prog >= 1) { resetAll(); openHold = null; }
      } else openHold = null;
    }

    /* ---- slice (peace sign) ---- */
    if (peace.length && !pinching.length) {
      gestureName = 'SLICE';
      const p = peace[0].palm;
      const ndcY = 1 - (p.y / window.innerHeight) * 2;
      const worldY = ndcY * scene.camera.position.z * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2));
      st.slice = clamp(worldY, -1.6, 1.6); sliceHold = now; sliceByHand = true;
      hint = { x: p.x, y: p.y, label: `SLICE ${st.slice.toFixed(2)}` };
    } else if (sliceByHand && st.slice !== null && now - sliceHold > 2500) {
      st.slice = null; sliceByHand = false; // heals a couple of seconds after the hand leaves
    } else if (st.slice === null) sliceByHand = false;

    /* ---- pointer ---- */
    if (!pinching.length && pointing) { gestureName = modes.draw ? 'DRAW' : 'POINT'; handlePointer(pointing.tip, now); }
    else if (!pointing) { dwell = null; st.hover = null; tools.setHover(null); if (drawing) { scene.endStroke(); drawing = false; } }

    if (hands.length === 0 && mouse.inside && !mDraw) handlePointer(mouse, now);

    if (face) { st.pTarget.x = clamp((0.5 - face[1].x) * 2, -1, 1); st.pTarget.y = clamp((0.5 - face[1].y) * 2, -1, 1); }
    else { st.pTarget.x = 0; st.pTarget.y = 0; }

    hud.setGesture(gestureName); hud.setRot(st.rotX, st.rotY); hud.setZoom(st.scale);
    return { cursor, zoomLine, hint };
  }

  function setMode(name, on) { modes[name] = on; if (!on && name === 'draw') scene.endStroke(); }

  // ---------- mouse fallback ----------
  let mDrag = null, mDraw = false;
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (mDraw) { const hit = scene.raycast(e.clientX, e.clientY); if (hit) scene.drawPoint(hit.point); else scene.endStroke(); return; }
    if (mDrag) {
      const dx = e.clientX - mDrag.x, dy = e.clientY - mDrag.y; mDrag = { x: e.clientX, y: e.clientY, moved: mDrag.moved + Math.abs(dx) + Math.abs(dy), shift: mDrag.shift };
      if (mDrag.shift) { const k = worldPerPx() / st.scale; st.targetOffset.x = clamp(st.targetOffset.x + dx * k, -2.4, 1.6); st.targetOffset.y = clamp(st.targetOffset.y - dy * k, -1.2, 1.2); }
      else { st.rotY += dx * ROT_SENS; st.rotX += dy * ROT_SENS; st.velY = dx * ROT_SENS * 30; st.velX = dy * ROT_SENS * 30; }
      st.autoSpin = false;
    }
  });
  window.addEventListener('mousedown', (e) => {
    if (e.target.closest?.('#panel,#landing,#tools')) return;
    if (modes.draw) { mDraw = true; return; }
    mDrag = { x: e.clientX, y: e.clientY, moved: 0, shift: e.shiftKey };
  });
  window.addEventListener('mouseup', (e) => {
    if (mDraw) { mDraw = false; scene.endStroke(); return; }
    if (mDrag && mDrag.moved < 6 && !e.target.closest?.('#panel,#landing,#tools')) handlePointer({ x: e.clientX, y: e.clientY }, performance.now(), true);
    mDrag = null;
  });
  document.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('wheel', (e) => {
    if (e.altKey) { st.targetExplode = clamp(st.targetExplode + (e.deltaY > 0 ? -0.08 : 0.08), 0, 1); return; }
    st.targetScale = clamp(st.targetScale * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.3); st.autoSpin = false;
  }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') resetAll();
    if (e.key === 'e') st.targetExplode = st.targetExplode > 0.5 ? 0 : 1;
    if (e.key === 's') st.slice = st.slice === null ? 0.2 : null;
    if (e.key === 'ArrowUp' && st.slice !== null) st.slice = clamp(st.slice + 0.1, -1.6, 1.6);
    if (e.key === 'ArrowDown' && st.slice !== null) st.slice = clamp(st.slice - 0.1, -1.6, 1.6);
    if (e.key === 'q') st.rotZ -= 0.1; if (e.key === 'w') st.rotZ += 0.1;
    if (e.key === 'd') setMode('draw', !modes.draw);
  });

  return { update, setMode, modes, resetAll };
}
