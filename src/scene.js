import * as THREE from 'three';
import { clamp, lerp } from './util.js';
import { MODEL_BUILDERS, CYAN, PINK, fresnelSphere } from './models.js';
import { MODEL_BUILDERS_2 } from './models2.js';

const BUILDERS = { ...MODEL_BUILDERS, ...MODEL_BUILDERS_2 };
export const registerBuilder = (id, fn) => (BUILDERS[id] = fn);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,229,255,0.55)'); grd.addColorStop(0.4, 'rgba(0,229,255,0.12)'); grd.addColorStop(1, 'rgba(0,229,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function ring(radius, dashed, opacity) {
  const pts = [];
  for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color: CYAN, dashSize: 0.08, gapSize: 0.1, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
    : new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geo, mat); if (dashed) line.computeLineDistances(); return line;
}

// Builds a model instance + its hotspot markers. Used by the main stage and the library minis.
export function instantiate(def, withHotspots = true) {
  const m = BUILDERS[def.id]();
  const hotspots = [];
  if (withHotspots) {
    const ringGeo = new THREE.RingGeometry(0.035, 0.045, 32);
    for (const h of def.hotspots) {
      const p = m.toLocal(h);
      const g = new THREE.Group(); g.position.copy(p);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), new THREE.MeshBasicMaterial({ color: PINK }));
      const rg = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      g.add(core, rg, hit); m.group.add(g);
      hotspots.push({ data: h, group: g, core, ring: rg, hit, local: p });
    }
    m.afterHotspots?.(hotspots.map((h) => h.local));
  }
  return { ...m, def, hotspots };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.set(0, 0, 4.7);

  const root = new THREE.Group(); root.position.set(1.05, 0, 0); scene.add(root);
  const stage = new THREE.Group(); root.add(stage);      // scales in/out on model switch
  const holder = new THREE.Group(); stage.add(holder);   // rotates with gestures

  const ringGroup = new THREE.Group(); root.add(ringGroup);
  const r1 = ring(1.35, true, 0.5); r1.rotation.x = THREE.MathUtils.degToRad(72); r1.rotation.z = THREE.MathUtils.degToRad(-18);
  const r2 = ring(1.5, false, 0.18); r2.rotation.x = THREE.MathUtils.degToRad(80); r2.rotation.z = THREE.MathUtils.degToRad(25);
  ringGroup.add(r1, r2);
  const base = ring(1.15, false, 0.25); base.position.y = -1.25; root.add(base);
  const base2 = ring(0.9, true, 0.35); base2.position.y = -1.25; root.add(base2);
  const atmo = fresnelSphere(1.06, CYAN, 4.0, 0.5, THREE.BackSide); stage.add(atmo);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(4.2); root.add(glow);

  let current = null;               // instantiated model
  let hitSphere = null;
  let defs = [];
  let transition = null;            // { phase:'out'|'in', t, nextId }
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(0.9, 1, 48);

  const state = {
    rotX: 0.15, rotY: 0, rotZ: 0, velX: 0, velY: 0, scale: 1, targetScale: 1, tiltLimit: 1.2,
    autoSpin: true, parallax: { x: 0, y: 0 }, pTarget: { x: 0, y: 0 }, hover: null, stageScale: 1,
    explode: 0, targetExplode: 0,           // 0..1 parts pushed outward
    slice: null,                            // null or world-space Y height of the cut
    offset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, // grab & drag position
    time: 0.5,                              // timeline scrubber 0..1
  };
  const HOME = { x: 1.05, y: 0 };
  renderer.localClippingEnabled = true;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  // slice indicator: a flat square outline at the cut height
  const sliceRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.6, 0, -1.6), new THREE.Vector3(1.6, 0, -1.6), new THREE.Vector3(1.6, 0, 1.6), new THREE.Vector3(-1.6, 0, 1.6)]), new THREE.LineBasicMaterial({ color: PINK, transparent: true, opacity: 0.8 }));
  sliceRing.visible = false; root.add(sliceRing);
  // annotation strokes (air-draw)
  const strokes = []; let stroke = null;
  const strokeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const _parts = { list: [] };
  const listeners = [];

  function mount(def) {
    if (current) { holder.remove(current.group); if (hitSphere) holder.remove(hitSphere); }
    current = instantiate(def);
    holder.add(current.group);
    hitSphere = new THREE.Mesh(new THREE.SphereGeometry(current.radius, 32, 32), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    holder.add(hitSphere);
    atmo.visible = def.id === 'globe';
    state.tiltLimit = current.tiltLimit ?? 1.2;
    state.explode = 0; state.targetExplode = 0; clearStrokes();
    current.setTime?.(state.time);
    // explode parts: every direct child of the model group, pushed away from the model centre
    const box = new THREE.Box3().setFromObject(current.group); const centre = box.getCenter(new THREE.Vector3()); current.group.worldToLocal(centre);
    const hotGroups = new Set(current.hotspots.map((h) => h.group));
    const centred = def.id === 'globe' || def.id === 'galaxy'; // concentric models: shells scale instead of flying apart
    let shell = 0;
    _parts.list = current.group.children.map((c, i) => {
      if (hotGroups.has(c)) {
        // nodes drift outward a little so they stay on the expanded surface
        const d = c.position.clone().sub(centre); const len = d.length() || 1;
        return { obj: c, pos0: c.position.clone(), scale0: c.scale.clone(), dir: d.normalize().multiplyScalar(centred ? len * 0.22 : 0.35 + len * 0.6), k: 1 };
      }
      const b = new THREE.Box3().setFromObject(c); const cc = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3()); current.group.worldToLocal(cc);
      const dir = cc.clone().sub(centre); const radial = !centred && dir.length() > 0.05;
      if (!radial) { shell++; return { obj: c, pos0: c.position.clone(), scale0: c.scale.clone(), dir: null, k: 0.4 + (shell % 4) * 0.35 }; }
      return { obj: c, pos0: c.position.clone(), scale0: c.scale.clone(), dir: dir.normalize().multiplyScalar(0.35 + dir.length() * 0.6), k: 1 };
    });
    current.group.traverse((o) => { if (o.material) { for (const m of [].concat(o.material)) { m.clippingPlanes = [clipPlane]; m.clipShadows = false; } } });
    state.rotX = clamp(state.rotX, -state.tiltLimit, state.tiltLimit);
    for (const fn of listeners) fn(def);
  }
  function loadModels(list, firstId = 'globe') { defs = list; mount(defs.find((d) => d.id === firstId) || defs[0]); }
  function select(id) {
    if (!current || current.def.id === id || (transition && transition.nextId === id)) return false;
    transition = { phase: 'out', t: 0, nextId: id };
    return true;
  }
  const onModelChange = (fn) => listeners.push(fn);

  function pulse(localPoint, color = PINK) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.copy(localPoint); m.lookAt(camera.position.clone().applyMatrix4(holder.matrixWorld.clone().invert()));
      m.scale.setScalar(0.01); holder.add(m); ripples.push({ m, t: -i * 0.18 });
    }
  }

  function clearStrokes() { for (const l of strokes) { holder.remove(l); l.geometry.dispose(); } strokes.length = 0; stroke = null; }
  function endStroke() { stroke = null; }
  // Adds a point (holder-local) to the current stroke, starting a new one if needed.
  function drawPoint(local) {
    const p = local.clone().multiplyScalar(1.015);
    if (!stroke) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3000 * 3), 3)); geo.setDrawRange(0, 0);
      stroke = new THREE.Line(geo, strokeMat.clone()); stroke.userData.n = 0; holder.add(stroke); strokes.push(stroke);
    }
    const n = stroke.userData.n; if (n >= 3000) { stroke = null; return drawPoint(local); }
    if (n > 0) { const a = stroke.geometry.attributes.position; const lx = a.getX(n - 1), ly = a.getY(n - 1), lz = a.getZ(n - 1); if (Math.hypot(lx - p.x, ly - p.y, lz - p.z) < 0.01) return; }
    stroke.geometry.attributes.position.setXYZ(n, p.x, p.y, p.z); stroke.geometry.attributes.position.needsUpdate = true;
    stroke.userData.n = n + 1; stroke.geometry.setDrawRange(0, n + 1); stroke.geometry.computeBoundingSphere();
  }
  function setSlice(worldY) { state.slice = worldY; }
  function setTime(k) { state.time = clamp(k, 0, 1); current?.setTime?.(state.time); }
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function raycast(sx, sy) {
    if (!current || transition) return null;
    ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hs = raycaster.intersectObjects(current.hotspots.map((h) => h.hit), false);
    if (hs.length) { const h = current.hotspots.find((x) => x.hit === hs[0].object); return { point: h.local.clone(), hotspot: h }; }
    const g = raycaster.intersectObject(hitSphere, false);
    if (!g.length) return null;
    const local = holder.worldToLocal(g[0].point.clone());
    return { point: local, hotspot: null, describe: current.describe(local), modelName: current.def.name };
  }
  function localToScreen(local) {
    const w = holder.localToWorld(local.clone());
    const centre = root.getWorldPosition(new THREE.Vector3());
    const facing = w.clone().sub(centre).normalize().dot(camera.position.clone().sub(w).normalize());
    const p = w.project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, front: facing > -0.1 };
  }

  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();

  let t = 0;
  function update(dt) {
    t += dt;
    if (transition) {
      transition.t += dt / 0.28;
      if (transition.phase === 'out') {
        state.stageScale = Math.max(0.001, 1 - transition.t);
        if (transition.t >= 1) { mount(defs.find((d) => d.id === transition.nextId)); transition.phase = 'in'; transition.t = 0; state.rotY = 0; state.targetScale = 1; state.autoSpin = true; }
      } else {
        state.stageScale = Math.min(1, transition.t);
        if (transition.t >= 1) transition = null;
      }
    }
    stage.scale.setScalar(state.stageScale);

    if (state.autoSpin) state.velY = lerp(state.velY, 0.15, 0.02);
    state.rotY += state.velY * dt; state.rotX += state.velX * dt;
    state.rotX = clamp(state.rotX, -state.tiltLimit, state.tiltLimit);
    if (!state.autoSpin) { state.velX *= Math.pow(0.08, dt); state.velY *= Math.pow(0.08, dt); }
    holder.rotation.set(state.rotX, state.rotY, state.rotZ);
    state.scale = lerp(state.scale, state.targetScale, 1 - Math.pow(0.001, dt));
    root.scale.setScalar(state.scale);
    state.offset.x = lerp(state.offset.x, state.targetOffset.x, 1 - Math.pow(0.0005, dt));
    state.offset.y = lerp(state.offset.y, state.targetOffset.y, 1 - Math.pow(0.0005, dt));
    root.position.set(HOME.x + state.offset.x, HOME.y + state.offset.y, 0);
    // explode
    state.explode = lerp(state.explode, state.targetExplode, 1 - Math.pow(0.002, dt));
    for (const p of _parts.list) {
      if (p.dir) p.obj.position.copy(p.pos0).addScaledVector(p.dir, state.explode * 1.6);
      else p.obj.scale.copy(p.scale0).multiplyScalar(1 + state.explode * 0.3 * p.k);
    }
    // slice plane (world space, clips everything above the cut)
    if (state.slice === null) { clipPlane.constant = 1e6; sliceRing.visible = false; }
    else { clipPlane.constant = state.slice; sliceRing.visible = true; sliceRing.position.y = (state.slice - root.position.y) / state.scale; sliceRing.material.opacity = 0.5 + Math.sin(t * 6) * 0.3; }

    ringGroup.rotation.y += dt * 0.25; base2.rotation.y -= dt * 0.4;
    glow.material.opacity = 0.75 + Math.sin(t * 2) * 0.1;
    if (current) {
      current.update(dt);
      for (const h of current.hotspots) {
        h.group.quaternion.copy(holder.quaternion).invert(); // billboard-ish toward camera
        const s = 1 + Math.sin(t * 3 + h.local.x * 5) * 0.25;
        h.ring.scale.setScalar(state.hover === h ? 1.9 : s);
        h.ring.material.color.set(state.hover === h ? '#ffffff' : PINK);
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.t += dt; if (r.t < 0) continue;
      const k = r.t / 0.9; r.m.scale.setScalar(0.01 + k * 0.32); r.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { holder.remove(r.m); r.m.material.dispose(); ripples.splice(i, 1); }
    }
    state.parallax.x = lerp(state.parallax.x, state.pTarget.x, 1 - Math.pow(0.01, dt));
    state.parallax.y = lerp(state.parallax.y, state.pTarget.y, 1 - Math.pow(0.01, dt));
    camera.position.x = state.parallax.x * 0.35; camera.position.y = state.parallax.y * 0.25;
    camera.lookAt(HOME.x * 0.45, 0, 0);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
  }

  return {
    state, renderer, camera, loadModels, select, onModelChange, raycast, localToScreen, pulse, update, resize,
    drawPoint, endStroke, clearStrokes, setSlice, setTime, registerBuilder, HOME,
    get current() { return current; }, get defs() { return defs; }, get busy() { return !!transition; },
  };
}
