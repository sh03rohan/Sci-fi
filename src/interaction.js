import * as THREE from 'three';
import { clamp, dist } from './util.js';

const DWELL_RADIUS = 30;     // px the pointer may wander during a dwell
const SWIPE_COOLDOWN = 900;
// tunables (overridden by the settings panel)
const cfg = { dwellMs: 800, resetMs: 1200, swipeVx: 1400, rotSens: 1.0 };
const ROT = () => 0.011 * cfg.rotSens;

/*
  Gesture map
  ☝ point              cursor → scan / select (DRAW mode: annotate)
  🤏 pinch (1 hand)     rotate              🤏🤏 pinch (2 hands)  zoom
  ✊ fist (1 hand)      grab & drag the hologram
  🖐 open (1 hand)      swipe left/right → previous/next model · hold still → reset
  🖐🖐 open (2 hands)   distance → explode view · angle → roll (Z rotation)
  ✌ peace              slice plane follows hand height
*/
export function createInteraction({ scene, panel, hud, sound, library, targets }) {
  const st = scene.state;
  let drag = null, zoom = null, dwell = null, grab = null, twoOpen = null, openHold = null, lastHover = null;
  let lastSwipe = 0, sliceHold = 0, sliceByHand = false, drawing = false;
  const mouse = { x: -1, y: -1, inside: false };
  let cursor = null, zoomLine = null;
  const modes = { draw: false, gaze: false, time: false };
  let lastFaceEvent = 0;

  const release = () => { drag = null; zoom = null; };
  function resetAll() {
    st.targetScale = 1; st.rotX = 0.15; st.rotZ = 0; st.velX = 0; st.velY = 0; st.autoSpin = true;
    st.targetExplode = 0; st.slice = null; st.targetOffset.x = 0; st.targetOffset.y = 0;
    scene.clearStrokes(); panel.close(); sound.close();
  }
  // world units per screen pixel at the hologram's depth
  function worldPerPx() { const h = 2 * scene.camera.position.z * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2)); return h / window.innerHeight; }

  function openAt(hit) {
    scene.pulse(hit.point); sound.confirm();
    st.autoSpin = false; st.velX = 0; st.velY = 0;
    if (hit.hotspot) { panel.open(hit.hotspot.data, hit.point); return; }
    const p = hit.point, id = Math.abs(Math.round(p.x * 71 + p.y * 131 + p.z * 197)) % 900 + 100;
    panel.open({
      title: `UNMAPPED · ${hit.modelName} · P-${id}`, subtitle: 'SURFACE SCAN · NO REGISTERED NODE', level: 20 + (id % 60),
      data: { ...hit.describe, SIGNAL: `${(id % 37) + 12} dB`, THREAT: ['LOW', 'NOMINAL', 'UNKNOWN'][id % 3], STATUS: 'PASSIVE' },
    }, hit.point);
  }

  // Pointer (index tip or mouse). DOM targets first, then the hologram.
  function handlePointer(p, now, instant = false) {
    const target = targets.hitTest(p.x, p.y);
    if (target) {
      st.hover = null; lastHover = null; scene.endStroke();
      if (instant) { targets.fire(target); targets.setHover(null); return; }
      if (!dwell || dwell.target !== target) dwell = { start: now, origin: { ...p }, fired: false, target };
      const prog = clamp((now - dwell.start) / cfg.dwellMs, 0, 1);
      if (prog >= 1 && !dwell.fired) { dwell.fired = true; targets.fire(target); }
      targets.setHover(target, dwell.fired ? 1 : prog);
      cursor = { x: p.x, y: p.y, progress: dwell.fired ? 0 : prog, active: true, hover: true, label: 'SELECT' };
      return;
    }
    targets.setHover(null);
    const hit = scene.raycast(p.x, p.y);

    if (modes.draw && !instant) {
      // annotate: draw while pointing at the surface
      if (hit) { scene.drawPoint(hit.point); drawing = true; } else if (drawing) { scene.endStroke(); drawing = false; }
      cursor = { x: p.x, y: p.y, progress: 0, active: !!hit, hover: false, label: hit ? 'DRAW' : '' };
      return;
    }

    const hover = hit?.hotspot || null;
    st.hover = hover;
    if (hover && hover !== lastHover) sound.hover();
    lastHover = hover;
    if (instant) { if (hit) openAt(hit); return; }
    if (!hit) { dwell = null; cursor = { x: p.x, y: p.y, progress: 0, active: false, hover: false }; return; }
    if (!dwell || dwell.target || dist(dwell.origin, p) > DWELL_RADIUS) dwell = { start: now, origin: { ...p }, fired: false };
    const prog = clamp((now - dwell.start) / cfg.dwellMs, 0, 1);
    if (prog >= 1 && !dwell.fired) { dwell.fired = true; openAt(hit); }
    cursor = { x: p.x, y: p.y, progress: dwell.fired ? 0 : prog, active: true, hover: !!hover };
  }

  function update(hands, face, now, fm = null) {
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
      zoom = null;
      const p = pinching[0].pinch;
      if (!drag) drag = { last: { ...p } };
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y; drag.last = { ...p };
      if (modes.time) {
        gestureName = 'SCRUB';
        scene.setTime(st.time + dx / (window.innerWidth * 0.5));
        hint = { x: p.x, y: p.y, label: `T ${Math.round(st.time * 100)}%`, progress: st.time };
      } else {
        gestureName = 'ROTATE';
        st.rotY += dx * ROT(); st.rotX += dy * ROT();
        st.velY = dx * ROT() * 30; st.velX = dy * ROT() * 30; st.autoSpin = false;
      }
    } else release();

    /* ---- grab & drag (fist) ---- */
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
      /* ---- one open palm: swipe to switch / hold to reset ---- */
      if (open.length === 1 && !pinching.length && !fists.length) {
        const h = open[0];
        gestureName = 'OPEN';
        if (Math.abs(h.vel.x) > cfg.swipeVx && now - lastSwipe > SWIPE_COOLDOWN) {
          lastSwipe = now; openHold = null;
          library.step(h.vel.x > 0 ? 1 : -1); // moving right (on screen) → next
          gestureName = h.vel.x > 0 ? 'SWIPE →' : '← SWIPE';
        } else {
          const speed = Math.hypot(h.vel.x, h.vel.y);
          if (!openHold || speed > 260) openHold = { start: now };
          const prog = clamp((now - openHold.start) / cfg.resetMs, 0, 1);
          if (prog > 0.15) hint = { x: h.palm.x, y: h.palm.y, label: 'RESET', progress: prog };
          if (prog >= 1) { resetAll(); openHold = null; }
        }
      } else openHold = null;
    }

    /* ---- slice (peace sign) ---- */
    if (peace.length && !pinching.length) {
      gestureName = 'SLICE';
      const p = peace[0].palm;
      // palm height → world Y at the hologram
      const ndcY = 1 - (p.y / window.innerHeight) * 2;
      const worldY = ndcY * scene.camera.position.z * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2));
      st.slice = clamp(worldY, -1.6, 1.6); sliceHold = now; sliceByHand = true;
      hint = { x: p.x, y: p.y, label: `SLICE ${st.slice.toFixed(2)}` };
    } else if (sliceByHand && st.slice !== null && now - sliceHold > 2500) {
      st.slice = null; sliceByHand = false; // auto-heal a couple of seconds after the hand leaves
    } else if (st.slice === null) sliceByHand = false;

    /* ---- pointer ---- */
    if (!pinching.length && pointing) { gestureName = modes.draw ? 'DRAW' : 'POINT'; handlePointer(pointing.tip, now); }
    else if (!pointing) { dwell = null; st.hover = null; targets.setHover(null); if (drawing) { scene.endStroke(); drawing = false; } }

    // gaze pointer when no hands are visible
    if (hands.length === 0 && modes.gaze && fm?.gaze) { gestureName = 'GAZE'; handlePointer(fm.gaze, now); }
    else if (hands.length === 0 && mouse.inside && !mDraw) handlePointer(mouse, now);

    // face events: double blink = click at the current cursor, mouth open = alert, brow raise = zoom step
    if (fm?.events?.length && now - lastFaceEvent > 400) {
      lastFaceEvent = now;
      for (const ev of fm.events) {
        if (ev === 'doubleBlink') { const at = cursor || (modes.gaze && fm.gaze) || (mouse.inside ? mouse : null); if (at) { handlePointer({ x: at.x, y: at.y }, now, true); hud.alert('BLINK SELECT'); } }
        else if (ev === 'mouthOpen') { hud.alert('⚠ VOCAL ALERT · THREAT SCAN'); sound.confirm(); st.autoSpin = false; onFaceEvent('mouthOpen'); }
        else if (ev === 'browRaise') { st.targetScale = clamp(st.targetScale * 1.18, 0.5, 2.3); hud.alert('BROW RAISE · ZOOM'); sound.tick(); onFaceEvent('browRaise'); }
      }
    }

    if (face) { st.pTarget.x = clamp((0.5 - face[1].x) * 2, -1, 1); st.pTarget.y = clamp((0.5 - face[1].y) * 2, -1, 1); }
    else { st.pTarget.x = 0; st.pTarget.y = 0; }

    hud.setGesture(gestureName); hud.setRot(st.rotX, st.rotY); hud.setZoom(st.scale);
    hud.setExplode?.(st.explode);
    return { cursor, zoomLine, hint };
  }

  let onFaceEvent = () => {};
  function setMode(name, on) { modes[name] = on; if (!on && name === 'draw') scene.endStroke(); if (name === 'gaze') hud.setGazeActive(on); }

  // ---------- mouse fallback ----------
  let mDrag = null, mDraw = false;
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (mDraw) { const hit = scene.raycast(e.clientX, e.clientY); if (hit) scene.drawPoint(hit.point); else scene.endStroke(); return; }
    if (mDrag) {
      const dx = e.clientX - mDrag.x, dy = e.clientY - mDrag.y; mDrag = { x: e.clientX, y: e.clientY, moved: mDrag.moved + Math.abs(dx) + Math.abs(dy), shift: mDrag.shift };
      if (mDrag.shift) { const k = worldPerPx() / st.scale; st.targetOffset.x = clamp(st.targetOffset.x + dx * k, -2.4, 1.6); st.targetOffset.y = clamp(st.targetOffset.y - dy * k, -1.2, 1.2); }
      else { st.rotY += dx * ROT(); st.rotX += dy * ROT(); st.velY = dx * ROT() * 30; st.velX = dy * ROT() * 30; }
      st.autoSpin = false;
    }
  });
  window.addEventListener('mousedown', (e) => {
    if (e.target.closest?.('#panel,#landing,#library,#toolbar,#settings')) return;
    if (modes.draw) { mDraw = true; return; }
    mDrag = { x: e.clientX, y: e.clientY, moved: 0, shift: e.shiftKey };
  });
  window.addEventListener('mouseup', (e) => {
    if (mDraw) { mDraw = false; scene.endStroke(); return; }
    if (mDrag && mDrag.moved < 6 && !e.target.closest?.('#panel,#landing,#library,#toolbar,#settings')) handlePointer({ x: e.clientX, y: e.clientY }, performance.now(), true);
    mDrag = null;
  });
  document.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('wheel', (e) => {
    if (e.altKey) { st.targetExplode = clamp(st.targetExplode + (e.deltaY > 0 ? -0.08 : 0.08), 0, 1); return; }
    st.targetScale = clamp(st.targetScale * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.3); st.autoSpin = false;
  }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') resetAll();
    if (e.key === 'ArrowRight') library.step(1); if (e.key === 'ArrowLeft') library.step(-1);
    if (e.key === 'e') st.targetExplode = st.targetExplode > 0.5 ? 0 : 1;
    if (e.key === 's') st.slice = st.slice === null ? 0.2 : null;
    if (e.key === 'ArrowUp' && st.slice !== null) st.slice = clamp(st.slice + 0.1, -1.6, 1.6);
    if (e.key === 'ArrowDown' && st.slice !== null) st.slice = clamp(st.slice - 0.1, -1.6, 1.6);
    if (e.key === 'q') st.rotZ -= 0.1; if (e.key === 'w') st.rotZ += 0.1;
    const n = parseInt(e.key, 10); if (n >= 1 && n <= scene.defs.length) library.select(n - 1);
  });

  // ---------- touch (mobile) ----------
  let touches = null;
  window.addEventListener('touchstart', (e) => {
    if (e.target.closest('#panel,#landing,#library,#toolbar,#settings,#timeline')) return;
    touches = { pts: [...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })), moved: 0, t0: performance.now() };
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!touches) return;
    const pts = [...e.touches].map((t) => ({ x: t.clientX, y: t.clientY }));
    if (pts.length === 1 && touches.pts.length === 1) {
      const dx = pts[0].x - touches.pts[0].x, dy = pts[0].y - touches.pts[0].y; touches.moved += Math.abs(dx) + Math.abs(dy);
      if (modes.draw) { const hit = scene.raycast(pts[0].x, pts[0].y); if (hit) scene.drawPoint(hit.point); }
      else { st.rotY += dx * ROT(); st.rotX += dy * ROT(); st.velY = dx * ROT() * 30; st.velX = dy * ROT() * 30; st.autoSpin = false; }
    } else if (pts.length >= 2 && touches.pts.length >= 2) {
      const d0 = dist(touches.pts[0], touches.pts[1]), d1 = dist(pts[0], pts[1]);
      st.targetScale = clamp(st.targetScale * (d1 / (d0 || 1)), 0.5, 2.3); st.autoSpin = false; touches.moved += 10;
    }
    touches.pts = pts;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!touches) return;
    if (touches.moved < 8 && performance.now() - touches.t0 < 500 && touches.pts.length === 1) handlePointer(touches.pts[0], performance.now(), true);
    if (modes.draw) scene.endStroke();
    if (!e.touches.length) touches = null; else touches.pts = [...e.touches].map((t) => ({ x: t.clientX, y: t.clientY }));
  });

  function applySettings(sv) { cfg.dwellMs = sv.dwellMs; cfg.resetMs = sv.resetMs; cfg.swipeVx = sv.swipeVx; cfg.rotSens = sv.rotSens; }
  return { update, setMode, modes, resetAll, applySettings, set onFaceEvent(fn) { onFaceEvent = fn; } };
}
