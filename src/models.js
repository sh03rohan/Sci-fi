// Procedural holographic models. Each builder returns
// { group, radius, update(dt), toLocal?(hotspotDef) } — all drawn as glowing wireframes.
import * as THREE from 'three';

export const CYAN = new THREE.Color('#00e5ff');
export const PINK = new THREE.Color('#ff3d71');
export const AMBER = new THREE.Color('#ffb300');

const lineMat = (opacity = 0.5, color = CYAN) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const pointMat = (size = 0.012, opacity = 0.7, color = CYAN) =>
  new THREE.PointsMaterial({ color, size, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });

export function edges(geo, opacity = 0.6, color = CYAN, threshold = 1) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo, threshold), lineMat(opacity, color));
}
export function fresnelSphere(r, color, power, strength, side = THREE.FrontSide) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uPower: { value: power }, uStrength: { value: strength } },
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
  return new THREE.Mesh(new THREE.SphereGeometry(r, 48, 48), mat);
}

export function latLonToVec3(lat, lon, r = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat), theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}
export function vec3ToLatLon(v) {
  const n = v.clone().normalize();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(n.y));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(n.z, -n.x)) - 180;
  return { lat, lon: ((lon + 540) % 360) - 180 };
}

// Deterministic pseudo-random so every load looks the same.
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/* ---------------- GLOBE ---------------- */
function buildGlobe() {
  const g = new THREE.Group();
  const pts = [], seg = 72;
  for (let lat = -75; lat <= 75; lat += 15) for (let i = 0; i < seg; i++) pts.push(latLonToVec3(lat, (i / seg) * 360 - 180), latLonToVec3(lat, ((i + 1) / seg) * 360 - 180));
  for (let lon = -180; lon < 180; lon += 15) for (let i = 0; i < seg; i++) pts.push(latLonToVec3((i / seg) * 180 - 90, lon), latLonToVec3(((i + 1) / seg) * 180 - 90, lon));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0.35)));
  const n = 1800, pos = new Float32Array(n * 3), golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i; pos.set([Math.cos(th) * r, y, Math.sin(th) * r], i * 3); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.Points(pg, pointMat()));
  g.add(fresnelSphere(0.985, CYAN, 3.0, 0.9));
  const arcs = [];
  return {
    group: g, radius: 1,
    toLocal: (h) => latLonToVec3(h.lat, h.lon, 1.005),
    describe: (local) => { const { lat, lon } = vec3ToLatLon(local); return { LAT: `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`, LON: `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}` }; },
    afterHotspots(points) {
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i * 3 + 1) % points.length]; if (a === b) continue;
        const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(1 + a.distanceTo(b) * 0.35);
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), lineMat(0.28)));
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
        g.add(dot); arcs.push({ dot, curve, t: Math.random() });
      }
    },
    update(dt) { for (const a of arcs) { a.t = (a.t + dt * 0.25) % 1; a.dot.position.copy(a.curve.getPoint(a.t)); } },
  };
}

/* ---------------- CITY ---------------- */
function buildCity() {
  const g = new THREE.Group(), rand = rng(42);
  const N = 9, cell = 0.22, half = (N * cell) / 2;
  // ground grid
  const gp = [];
  for (let i = 0; i <= N; i++) { const v = -half + i * cell; gp.push(new THREE.Vector3(-half, 0, v), new THREE.Vector3(half, 0, v), new THREE.Vector3(v, 0, -half), new THREE.Vector3(v, 0, half)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp), lineMat(0.25)));
  const lights = [];
  for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
    const d = Math.hypot(x - 4, z - 4);
    if (rand() < 0.15 && d > 1) continue;
    const h = d < 0.5 ? 1.6 : 0.15 + rand() * (1.1 - d * 0.15);
    const w = cell * (0.55 + rand() * 0.3);
    const box = edges(new THREE.BoxGeometry(w, h, w), 0.55);
    box.position.set(-half + (x + 0.5) * cell, h / 2, -half + (z + 0.5) * cell);
    g.add(box);
    // floor lines on taller buildings
    if (h > 0.6) {
      const fl = [];
      for (let y = 0.15; y < h; y += 0.12) { fl.push(new THREE.Vector3(-w / 2, y, w / 2), new THREE.Vector3(w / 2, y, w / 2), new THREE.Vector3(w / 2, y, w / 2), new THREE.Vector3(w / 2, y, -w / 2)); }
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fl), lineMat(0.18)); l.position.copy(box.position); l.position.y = 0; g.add(l);
    }
    if (h > 0.9) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshBasicMaterial({ color: PINK })); m.position.set(box.position.x, h + 0.02, box.position.z); g.add(m); lights.push(m); }
  }
  // antenna on the central tower
  const ant = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 1.95, 0)]), lineMat(0.8));
  g.add(ant);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.06, 24), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 1.95; g.add(ring);
  g.position.y = -0.75;
  let t = 0;
  return {
    group: g, radius: 1.25, tiltLimit: 0.9,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => ({ BLOCK: `${String.fromCharCode(65 + Math.min(8, Math.max(0, Math.floor((p.x + half) / cell))))}-${Math.min(9, Math.max(1, Math.floor((p.z + half) / cell) + 1))}`, ELEV: `${Math.max(0, p.y + 0.75).toFixed(2)} km` }),
    update(dt) { t += dt; ring.scale.setScalar(1 + (t % 1.2) * 2.2); ring.material.opacity = 0.8 * (1 - (t % 1.2) / 1.2); for (const l of lights) l.material.opacity = 0.5 + 0.5 * Math.sin(t * 4 + l.position.x * 9); },
  };
}

/* ---------------- CAR ---------------- */
function buildCar() {
  const g = new THREE.Group();
  // side profile → extrude for the body shell
  const s = new THREE.Shape();
  s.moveTo(-1.1, 0.05); s.lineTo(-1.15, 0.3); s.lineTo(-0.95, 0.42); s.lineTo(-0.45, 0.46); s.lineTo(-0.1, 0.78);
  s.lineTo(0.5, 0.8); s.lineTo(0.95, 0.5); s.lineTo(1.15, 0.42); s.lineTo(1.15, 0.12); s.lineTo(1.0, 0.05); s.lineTo(-1.1, 0.05);
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false }); body.translate(0, 0, -0.45);
  g.add(edges(body, 0.7, CYAN, 15));
  const shell = new THREE.Mesh(body, new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(shell);
  // cabin lines (windows)
  const wp = [];
  for (let z of [-0.46, 0.46]) { wp.push(new THREE.Vector3(-0.42, 0.47, z), new THREE.Vector3(-0.1, 0.76, z), new THREE.Vector3(0.1, 0.47, z), new THREE.Vector3(0.1, 0.78, z), new THREE.Vector3(0.9, 0.49, z), new THREE.Vector3(0.5, 0.78, z)); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp), lineMat(0.5)));
  // wheels
  const wheels = [];
  for (const [x, z] of [[-0.7, 0.5], [-0.7, -0.5], [0.7, 0.5], [0.7, -0.5]]) {
    const w = new THREE.Group();
    w.add(edges(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 24), 0.75, CYAN, 20));
    const spokes = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spokes.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22)); }
    const sp = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), lineMat(0.6)); sp.position.y = z > 0 ? 0.08 : -0.08; w.add(sp);
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.26, z); g.add(w); wheels.push(w);
  }
  // headlights / taillights
  for (const [x, c] of [[1.16, 0xffffff], [-1.16, 0xff3d71]]) for (const z of [-0.3, 0.3]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, 0.3, z); g.add(m);
  }
  // scan plane
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 1.0), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  scan.rotation.y = Math.PI / 2; scan.position.y = 0.42; scan.scale.set(1, 0.85, 1); g.add(scan);
  g.position.y = -0.35; g.rotation.y = -0.6;
  let t = 0;
  return {
    group: g, radius: 1.3, tiltLimit: 0.6,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => ({ SECTION: p.x > 0.4 ? 'FRONT' : p.x < -0.4 ? 'REAR' : 'CABIN', SIDE: p.z > 0 ? 'LEFT' : 'RIGHT', HEIGHT: `${(p.y + 0.35).toFixed(2)} m` }),
    update(dt) { t += dt; for (const w of wheels) w.rotation.y += dt * 2.5; scan.position.x = Math.sin(t * 0.8) * 1.1; },
  };
}

/* ---------------- GALAXY ---------------- */
function buildGalaxy() {
  const g = new THREE.Group(), rand = rng(7);
  const n = 7000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), arms = 3;
  const c1 = new THREE.Color('#9af7ff'), c2 = new THREE.Color('#ff3d71'), c3 = new THREE.Color('#ffffff');
  for (let i = 0; i < n; i++) {
    const r = Math.pow(rand(), 0.7) * 1.25;
    const arm = i % arms, base = (arm / arms) * Math.PI * 2, twist = r * 3.2;
    const spread = (rand() - 0.5) * (0.35 + r * 0.25) * (rand() < 0.5 ? 1 : 0.4);
    const a = base + twist + spread;
    const y = (rand() - 0.5) * 0.08 * (1.4 - r) + (rand() - 0.5) * 0.02;
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    const c = r < 0.15 ? c3 : c1.clone().lerp(c2, Math.min(1, Math.pow(r / 1.25, 1.5) * (0.4 + rand() * 0.8)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.014, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(pts);
  g.add(fresnelSphere(0.16, new THREE.Color('#bffaff'), 1.2, 1.4));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); g.add(core);
  // orbit rings
  for (const r of [0.45, 0.85, 1.25]) { const rp = []; for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; rp.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); } g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rp), lineMat(0.12))); }
  g.rotation.x = 0.55;
  return {
    group: g, radius: 1.3, tiltLimit: 1.4,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => { const r = Math.hypot(p.x, p.z); return { RADIUS: `${(r * 40).toFixed(1)} kly`, ARM: ['PERSEUS', 'SAGITTARIUS', 'OUTER'][Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 3) % 3], DENSITY: `${Math.max(1, Math.round((1.3 - r) * 90))} ★/pc³` }; },
    update(dt) { pts.rotation.y += dt * 0.08; core.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.15); },
  };
}

/* ---------------- DNA ---------------- */
function buildDNA() {
  const g = new THREE.Group();
  const turns = 2.5, H = 2.2, R = 0.42, steps = 160;
  const a = [], b = [], rungs = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, ang = t * Math.PI * 2 * turns, y = -H / 2 + t * H;
    a.push(new THREE.Vector3(Math.cos(ang) * R, y, Math.sin(ang) * R));
    b.push(new THREE.Vector3(Math.cos(ang + Math.PI) * R, y, Math.sin(ang + Math.PI) * R));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(a), lineMat(0.8)));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(b), lineMat(0.8, PINK)));
  const pairs = [];
  for (let i = 0; i <= steps; i += 6) {
    rungs.push(a[i], b[i]);
    for (const [p, c] of [[a[i], CYAN], [b[i], PINK]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), new THREE.MeshBasicMaterial({ color: c })); m.position.copy(p); g.add(m); }
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); mid.position.lerpVectors(a[i], b[i], 0.5); g.add(mid); pairs.push(mid);
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rungs), lineMat(0.35, AMBER)));
  g.rotation.z = 0.25;
  let t = 0;
  return {
    group: g, radius: 1.25, tiltLimit: 0.8,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => ({ 'BASE PAIR': `#${Math.round(((p.y + H / 2) / H) * 3200)}`, STRAND: p.x > 0 ? 'SENSE' : 'ANTISENSE', 'GC %': `${40 + Math.round(Math.abs(p.z) * 30)}%` }),
    update(dt) { t += dt; pairs.forEach((m, i) => (m.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 - i * 0.3)))); },
  };
}

export const MODEL_BUILDERS = {
  globe: buildGlobe, city: buildCity, car: buildCar, galaxy: buildGalaxy, dna: buildDNA,
};
