import * as THREE from 'three';
import { clamp, lerp } from './util.js';

const CYAN = new THREE.Color('#00e5ff');
const PINK = new THREE.Color('#ff3d71');
const R = 1;

function latLonToVec3(lat, lon, r = R) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}
function vec3ToLatLon(v) {
  const n = v.clone().normalize();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(n.y));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(n.z, -n.x)) - 180;
  return { lat, lon: ((lon + 540) % 360) - 180 };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,229,255,0.55)');
  grd.addColorStop(0.4, 'rgba(0,229,255,0.12)');
  grd.addColorStop(1, 'rgba(0,229,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function wireGlobe() {
  const pts = [];
  const seg = 72;
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let i = 0; i < seg; i++) {
      pts.push(latLonToVec3(lat, (i / seg) * 360 - 180), latLonToVec3(lat, ((i + 1) / seg) * 360 - 180));
    }
  }
  for (let lon = -180; lon < 180; lon += 15) {
    for (let i = 0; i < seg; i++) {
      pts.push(latLonToVec3((i / seg) * 180 - 90, lon), latLonToVec3(((i + 1) / seg) * 180 - 90, lon));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  return new THREE.LineSegments(geo, mat);
}

function dotSphere(n = 1800) {
  const pos = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    pos[i * 3] = Math.cos(th) * r * R * 1.002;
    pos[i * 3 + 1] = y * R * 1.002;
    pos[i * 3 + 2] = Math.sin(th) * r * R * 1.002;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: CYAN, size: 0.012, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

function fresnelSphere(r, color, power, strength, side = THREE.FrontSide) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uPower: { value: power }, uStrength: { value: strength } },
    vertexShader: `#include <clipping_planes_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mvPosition = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mvPosition.xyz); gl_Position = projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `#include <clipping_planes_pars_fragment>
      uniform vec3 uColor; uniform float uPower; uniform float uStrength; varying vec3 vN; varying vec3 vV;
      void main(){
        #include <clipping_planes_fragment>
        float f = pow(1.0 - abs(dot(vN, vV)), uPower); gl_FragColor = vec4(uColor, f*uStrength + 0.02); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side, clipping: true,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(r, 64, 64), mat);
}

function ring(radius, dashed, opacity) {
  const pts = [];
  for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color: CYAN, dashSize: 0.08, gapSize: 0.1, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
    : new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  if (dashed) line.computeLineDistances();
  return line;
}

function arc(a, b) {
  const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1 + a.distanceTo(b) * 0.35));
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
  const mat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  return { line, dot, curve, t: Math.random() };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.set(0, 0, 4.7);

  // Root sits right of centre so the user has room on the left.
  const root = new THREE.Group();
  root.position.set(1.05, 0.0, 0);
  scene.add(root);

  const globe = new THREE.Group(); // this one rotates with gestures
  root.add(globe);

  globe.add(wireGlobe(), dotSphere());
  globe.add(fresnelSphere(R * 0.985, CYAN, 3.0, 0.9));
  const atmo = fresnelSphere(R * 1.06, CYAN, 4.0, 0.5, THREE.BackSide); root.add(atmo);

  // Hit sphere (invisible-ish) for raycasting.
  const hit = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 32), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  globe.add(hit);

  // Rings (not rotating with the globe).
  const ringGroup = new THREE.Group(); root.add(ringGroup);
  const r1 = ring(R * 1.35, true, 0.5); r1.rotation.x = THREE.MathUtils.degToRad(72); r1.rotation.z = THREE.MathUtils.degToRad(-18);
  const r2 = ring(R * 1.5, false, 0.18); r2.rotation.x = THREE.MathUtils.degToRad(80); r2.rotation.z = THREE.MathUtils.degToRad(25);
  ringGroup.add(r1, r2);
  const base = ring(R * 1.15, false, 0.25); base.position.y = -R * 1.25; root.add(base);
  const base2 = ring(R * 0.9, true, 0.35); base2.position.y = -R * 1.25; root.add(base2);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(R * 4.2); root.add(glow);

  // Hotspots
  const hotspots = [];
  const arcs = [];
  const hotMat = new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.95 });
  const hotRingGeo = new THREE.RingGeometry(0.035, 0.045, 32);
  function addHotspots(list) {
    for (const h of list) {
      const p = latLonToVec3(h.lat, h.lon, R * 1.005);
      const g = new THREE.Group(); g.position.copy(p); g.lookAt(p.clone().multiplyScalar(2));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), hotMat.clone());
      const rg = new THREE.Mesh(hotRingGeo, new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      const hitS = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hitS.userData.hotspot = h;
      g.add(core, rg, hitS);
      globe.add(g);
      hotspots.push({ data: h, group: g, core, ring: rg, hit: hitS, local: p });
    }
    for (let i = 0; i < list.length; i++) {
      const a = hotspots[i].local, b = hotspots[(i * 3 + 1) % hotspots.length].local;
      if (a === b) continue;
      const ar = arc(a, b); globe.add(ar.line, ar.dot); arcs.push(ar);
    }
  }

  // Ripples at touch points
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(0.9, 1, 48);
  function pulse(localPoint, color = PINK) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.copy(localPoint).multiplyScalar(1.01); m.lookAt(localPoint.clone().multiplyScalar(2));
      m.scale.setScalar(0.01); globe.add(m);
      ripples.push({ m, t: -i * 0.18 });
    }
  }

  // State
  const state = {
    rotX: 0.15, rotY: 0, rotZ: 0, velX: 0, velY: 0, scale: 1, targetScale: 1,
    autoSpin: true, parallax: { x: 0, y: 0 }, pTarget: { x: 0, y: 0 }, hover: null,
    explode: 0, targetExplode: 0,                          // 0..1 shells pushed outward
    slice: null,                                           // null or world-space Y of the cut
    offset: { x: 0, y: 0 }, targetOffset: { x: 0, y: 0 }, // grab & move
  };
  const HOME = { x: root.position.x, y: root.position.y };
  // slice: one clipping plane shared by every globe material
  renderer.localClippingEnabled = true;
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  let clipApplied = 0;
  const applyClip = () => { globe.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.clippingPlanes = [clipPlane]; }); clipApplied = globe.children.length; };
  applyClip();
  const sliceRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.6, 0, -1.6), new THREE.Vector3(1.6, 0, -1.6), new THREE.Vector3(1.6, 0, 1.6), new THREE.Vector3(-1.6, 0, 1.6)]), new THREE.LineBasicMaterial({ color: PINK, transparent: true, opacity: 0.8 }));
  sliceRing.visible = false; root.add(sliceRing);
  // explode: concentric shells scale apart, nodes drift outward
  const shells = globe.children.filter((c) => !hotspots.some((h) => h.group === c)).map((c, i) => ({ obj: c, scale0: c.scale.clone(), k: 0.4 + (i % 4) * 0.35 }));
  // annotation strokes (draw mode)
  const strokes = []; let stroke = null;
  function clearStrokes() { for (const l of strokes) { globe.remove(l); l.geometry.dispose(); } strokes.length = 0; stroke = null; }
  function endStroke() { stroke = null; }
  function drawPoint(local) {
    const p = local.clone().multiplyScalar(1.015);
    if (!stroke) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3000 * 3), 3)); geo.setDrawRange(0, 0);
      stroke = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })); stroke.userData.n = 0; globe.add(stroke); strokes.push(stroke);
    }
    const n = stroke.userData.n; if (n >= 3000) { stroke = null; return drawPoint(local); }
    const a = stroke.geometry.attributes.position;
    if (n > 0 && Math.hypot(a.getX(n - 1) - p.x, a.getY(n - 1) - p.y, a.getZ(n - 1) - p.z) < 0.01) return;
    a.setXYZ(n, p.x, p.y, p.z); a.needsUpdate = true; stroke.userData.n = n + 1; stroke.geometry.setDrawRange(0, n + 1); stroke.geometry.computeBoundingSphere();
  }
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ndc in -1..1. Returns {point(local), hotspot|null, latlon} or null.
  function raycast(sx, sy) {
    ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hs = raycaster.intersectObjects(hotspots.map((h) => h.hit), false);
    if (hs.length) {
      const h = hotspots.find((x) => x.hit === hs[0].object);
      return { point: h.local.clone(), hotspot: h, latlon: { lat: h.data.lat, lon: h.data.lon } };
    }
    const g = raycaster.intersectObject(hit, false);
    if (!g.length) return null;
    const local = globe.worldToLocal(g[0].point.clone());
    return { point: local, hotspot: null, latlon: vec3ToLatLon(local) };
  }

  function localToScreen(local) {
    const w = globe.localToWorld(local.clone());
    const facing = w.clone().sub(root.getWorldPosition(new THREE.Vector3())).normalize().dot(camera.position.clone().sub(w).normalize());
    const p = w.project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, front: facing > 0.05 };
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  let t = 0;
  function update(dt) {
    t += dt;
    // Rotation with inertia
    if (state.autoSpin) state.velY = lerp(state.velY, 0.15, 0.02);
    state.rotY += state.velY * dt; state.rotX += state.velX * dt;
    state.rotX = clamp(state.rotX, -1.2, 1.2);
    if (!state.autoSpin) { state.velX *= Math.pow(0.08, dt); state.velY *= Math.pow(0.08, dt); }
    globe.rotation.set(state.rotX, state.rotY, state.rotZ);
    state.scale = lerp(state.scale, state.targetScale, 1 - Math.pow(0.001, dt));
    root.scale.setScalar(state.scale);
    // grab & move
    state.offset.x = lerp(state.offset.x, state.targetOffset.x, 1 - Math.pow(0.0005, dt));
    state.offset.y = lerp(state.offset.y, state.targetOffset.y, 1 - Math.pow(0.0005, dt));
    root.position.set(HOME.x + state.offset.x, HOME.y + state.offset.y, 0);
    // explode view
    state.explode = lerp(state.explode, state.targetExplode, 1 - Math.pow(0.002, dt));
    for (const s of shells) s.obj.scale.copy(s.scale0).multiplyScalar(1 + state.explode * 0.3 * s.k);
    for (const h of hotspots) h.group.position.copy(h.local).multiplyScalar(1 + state.explode * 0.22);
    // slice plane (re-apply to objects added later, e.g. hotspots/arcs)
    if (globe.children.length !== clipApplied) applyClip();
    if (state.slice === null) { clipPlane.constant = 1e6; sliceRing.visible = false; }
    else { clipPlane.constant = state.slice; sliceRing.visible = true; sliceRing.position.y = (state.slice - root.position.y) / state.scale; sliceRing.material.opacity = 0.5 + Math.sin(t * 6) * 0.3; }
    // Rings / decorations
    ringGroup.rotation.y += dt * 0.25; base2.rotation.y -= dt * 0.4;
    glow.material.opacity = 0.75 + Math.sin(t * 2) * 0.1;
    // Hotspot pulse
    for (const h of hotspots) {
      const s = 1 + Math.sin(t * 3 + h.local.x * 5) * 0.25;
      h.ring.scale.setScalar(state.hover === h ? 1.9 : s);
      h.ring.material.color.copy(state.hover === h ? new THREE.Color('#ffffff') : PINK);
    }
    for (const a of arcs) { a.t = (a.t + dt * 0.25) % 1; a.dot.position.copy(a.curve.getPoint(a.t)); }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.t += dt;
      if (r.t < 0) continue;
      const k = r.t / 0.9;
      r.m.scale.setScalar(0.01 + k * 0.32); r.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { globe.remove(r.m); r.m.material.dispose(); ripples.splice(i, 1); }
    }
    // Parallax from face
    state.parallax.x = lerp(state.parallax.x, state.pTarget.x, 1 - Math.pow(0.01, dt));
    state.parallax.y = lerp(state.parallax.y, state.pTarget.y, 1 - Math.pow(0.01, dt));
    camera.position.x = state.parallax.x * 0.35; camera.position.y = state.parallax.y * 0.25;
    camera.lookAt(HOME.x * 0.45, 0, 0);
    renderer.render(scene, camera);
  }

  return { state, camera, addHotspots, raycast, localToScreen, pulse, update, hotspots, resize, drawPoint, endStroke, clearStrokes };
}
