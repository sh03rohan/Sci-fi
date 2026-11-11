// Second batch of procedural holograms: heart, jet, station, atom, bioframe.
import * as THREE from 'three';
import { CYAN, PINK, AMBER, edges, fresnelSphere } from './models.js';

const lineMat = (opacity = 0.5, color = CYAN) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const dot = (r, color, opacity = 1) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
const circle = (r, segs = 64) => { const p = []; for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI * 2; p.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); } return p; };
const line = (pts, opacity, color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(opacity, color));
const describeXYZ = (p) => ({ X: p.x.toFixed(2), Y: p.y.toFixed(2), Z: p.z.toFixed(2) });

/* ---------------- HEART ---------------- */
function buildHeart() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -0.95);
  s.bezierCurveTo(-0.9, -0.3, -1.05, 0.45, -0.5, 0.75); s.bezierCurveTo(-0.15, 0.95, 0, 0.6, 0, 0.45);
  s.bezierCurveTo(0, 0.6, 0.15, 0.95, 0.5, 0.75); s.bezierCurveTo(1.05, 0.45, 0.9, -0.3, 0, -0.95);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.22, bevelSegments: 6, curveSegments: 24 });
  geo.center();
  const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PINK, wireframe: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  const outline = edges(geo, 0.7, PINK, 28);
  const core = new THREE.Group(); core.add(shell, wire, outline); g.add(core);
  // vessels: aorta + pulmonary arcs
  const vessels = new THREE.Group();
  for (const [sx, h] of [[-0.18, 0.9], [0.05, 1.05], [0.28, 0.95]]) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx, 0.55, 0), new THREE.Vector3(sx * 1.6, h, 0.1), new THREE.Vector3(sx * 2.6, h + 0.25, -0.05));
    vessels.add(line(c.getPoints(24), 0.8, CYAN));
  }
  g.add(vessels);
  // ECG trace ring around the heart
  const ecgPts = []; for (let i = 0; i <= 200; i++) { const a = (i / 200) * Math.PI * 2; const ph = (i % 50) / 50; const spike = ph > 0.4 && ph < 0.5 ? Math.sin((ph - 0.4) * 10 * Math.PI) * 0.18 : ph > 0.5 && ph < 0.56 ? -0.07 : 0; ecgPts.push(new THREE.Vector3(Math.cos(a) * 1.35, spike - 0.9, Math.sin(a) * 1.35)); }
  const ecg = line(ecgPts, 0.6, CYAN); g.add(ecg);
  const pulses = []; for (let i = 0; i < 3; i++) { const m = dot(0.02, 0xffffff); g.add(m); pulses.push({ m, t: i / 3 }); }
  let t = 0, beat = 0, bpm = 72;
  return {
    group: g, radius: 1.3, tiltLimit: 0.9,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => ({ CHAMBER: p.y > 0.1 ? (p.x < 0 ? 'R. ATRIUM' : 'L. ATRIUM') : (p.x < 0 ? 'R. VENTRICLE' : 'L. VENTRICLE'), DEPTH: `${(p.z * 40).toFixed(0)} mm`, PERFUSION: `${85 + Math.round(Math.abs(p.x) * 12)}%` }),
    setTime(k) { bpm = 50 + k * 110; },
    update(dt) {
      t += dt; beat += dt * (bpm / 60);
      const ph = beat % 1, pump = ph < 0.15 ? Math.sin(ph / 0.15 * Math.PI) * 0.09 : ph < 0.3 ? Math.sin((ph - 0.15) / 0.15 * Math.PI) * 0.05 : 0;
      core.scale.setScalar(1 + pump); shell.material.opacity = 0.07 + pump * 1.2;
      ecg.rotation.y = -t * 0.6;
      for (const p of pulses) { p.t = (p.t + dt * 0.33) % 1; const a = p.t * Math.PI * 2; p.m.position.set(Math.cos(a) * 1.35, -0.9, Math.sin(a) * 1.35); p.m.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), ecg.rotation.y); }
    },
  };
}

/* ---------------- JET ---------------- */
function buildJet() {
  const g = new THREE.Group();
  const fus = new THREE.CylinderGeometry(0.07, 0.16, 2.2, 12, 1); fus.rotateX(Math.PI / 2); fus.translate(0, 0, 0.1);
  g.add(edges(fus, 0.65, CYAN, 12));
  const nose = new THREE.ConeGeometry(0.07, 0.5, 12); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 1.45); g.add(edges(nose, 0.65, CYAN, 12));
  const wing = new THREE.Shape(); wing.moveTo(0, 0.4); wing.lineTo(1.25, -0.55); wing.lineTo(1.25, -0.75); wing.lineTo(0, -0.5); wing.lineTo(0, 0.4);
  for (const side of [1, -1]) {
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.03, bevelEnabled: false }); wg.rotateX(Math.PI / 2); wg.scale(side, 1, 1); wg.translate(0, -0.02, 0);
    g.add(edges(wg, 0.6, CYAN, 20));
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.45, -0.35); fin.lineTo(0.45, -0.5); fin.lineTo(0, -0.4);
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: false }); fg.rotateX(Math.PI / 2); fg.scale(side, 1, 1); fg.translate(0.05 * side, 0.0, -0.85);
    g.add(edges(fg, 0.6, CYAN, 20));
    const tail = new THREE.Shape(); tail.moveTo(0, 0); tail.lineTo(0.0, 0.55); tail.lineTo(0.35, 0.55); tail.lineTo(0.55, 0);
    const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.03, bevelEnabled: false }); tg.rotateY(-Math.PI / 2 + (side > 0 ? 0 : 0)); tg.rotateZ(side * 0.3); tg.translate(side * 0.12, 0.05, -0.75);
    g.add(edges(tg, 0.6, CYAN, 20));
    const eng = new THREE.CylinderGeometry(0.1, 0.12, 0.5, 12); eng.rotateX(Math.PI / 2); eng.translate(side * 0.12, -0.03, -1.05); g.add(edges(eng, 0.6, CYAN, 12));
  }
  const canopy = new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); canopy.scale(1, 0.9, 2.2); canopy.translate(0, 0.08, 0.7);
  g.add(edges(canopy, 0.5, AMBER, 12));
  // exhaust flames + radar sweep
  const flames = []; for (const side of [1, -1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 10, 1, true), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); f.rotation.x = -Math.PI / 2; f.position.set(side * 0.12, -0.03, -1.55); g.add(f); flames.push(f); }
  const sweep = line(circle(1.45), 0.2); g.add(sweep); const radar = line([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.45, 0, 0)], 0.6, 0x7cff6b); g.add(radar);
  g.rotation.y = -0.5; g.rotation.x = 0.25;
  let t = 0, thrust = 0.5;
  return {
    group: g, radius: 1.5, tiltLimit: 1.0,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => ({ STATION: p.z > 0.6 ? 'NOSE' : p.z < -0.7 ? 'AFT' : Math.abs(p.x) > 0.4 ? (p.x > 0 ? 'STBD WING' : 'PORT WING') : 'FUSELAGE', LOAD: `${(1 + Math.abs(p.x) * 2.5).toFixed(1)} g`, 'SKIN TEMP': `${(40 + p.z * 30).toFixed(0)} °C` }),
    setTime(k) { thrust = k; },
    update(dt) { t += dt; radar.rotation.y = t * 1.5; for (const f of flames) { f.scale.set(1, 0.6 + thrust * 1.2 + Math.random() * 0.25, 1); f.material.opacity = 0.2 + thrust * 0.4; } g.position.y = Math.sin(t * 1.3) * 0.04; },
  };
}

/* ---------------- SPACE STATION ---------------- */
function buildStation() {
  const g = new THREE.Group();
  const hub = new THREE.CylinderGeometry(0.18, 0.18, 1.6, 16); g.add(edges(hub, 0.6, CYAN, 15));
  const rings = [];
  for (const [r, y, tilt] of [[1.0, 0.35, 0], [1.0, -0.35, 0], [0.55, 0, 0]]) {
    const rg = new THREE.Group(); rg.position.y = y; rg.rotation.x = tilt;
    rg.add(edges(new THREE.TorusGeometry(r, 0.07, 8, 48).rotateX(Math.PI / 2), 0.55, CYAN, 25));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; rg.add(line([new THREE.Vector3(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18), new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)], 0.4)); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const w = dot(0.015, i % 3 ? CYAN : PINK); w.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); rg.add(w); }
    g.add(rg); rings.push({ rg, speed: 0.25 / r * (r < 0.6 ? -1 : 1) });
  }
  // solar arrays
  const panels = new THREE.Group();
  for (const side of [1, -1]) {
    const pg = new THREE.PlaneGeometry(1.1, 0.42, 6, 2); pg.translate(side * 0.95, 0, 0);
    panels.add(new THREE.LineSegments(new THREE.WireframeGeometry(pg), lineMat(0.45, AMBER)));
    panels.add(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  panels.position.y = 0.95; g.add(panels);
  const dish = new THREE.ConeGeometry(0.22, 0.12, 16, 1, true); dish.rotateX(Math.PI); dish.translate(0, -1.0, 0); const dishM = edges(dish, 0.6, CYAN, 20); g.add(dishM);
  const beacon = dot(0.03, PINK); beacon.position.y = -1.15; g.add(beacon);
  // docking shuttle on approach
  const shuttle = edges(new THREE.BoxGeometry(0.12, 0.08, 0.25), 0.8, 0x7cff6b); g.add(shuttle);
  let t = 0, speed = 1;
  return {
    group: g, radius: 1.35, tiltLimit: 1.2,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => ({ MODULE: Math.hypot(p.x, p.z) < 0.25 ? 'CORE HUB' : Math.abs(p.y) > 0.8 ? (p.y > 0 ? 'SOLAR TRUSS' : 'COMMS MAST') : 'HAB RING', PRESSURE: `${(98 + p.y * 2).toFixed(1)} kPa`, CREW: `${Math.abs(Math.round(p.x * 7))}` }),
    setTime(k) { speed = 0.2 + k * 2.4; },
    update(dt) { t += dt; for (const r of rings) r.rg.rotation.y += dt * r.speed * speed; panels.rotation.y = Math.sin(t * 0.2) * 0.4; beacon.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 4)); const a = -t * 0.4 * speed; shuttle.position.set(Math.cos(a) * 1.45, 0.1 + Math.sin(t * 0.7) * 0.1, Math.sin(a) * 1.45); shuttle.rotation.y = -a; },
  };
}

/* ---------------- ATOM ---------------- */
function buildAtom() {
  const g = new THREE.Group();
  const nucleus = new THREE.Group();
  for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), r = 0.12 * Math.cbrt(Math.random()); const m = dot(0.065, i % 2 ? PINK : CYAN, 0.9); m.position.set(r * Math.sin(b) * Math.cos(a), r * Math.sin(b) * Math.sin(a), r * Math.cos(b)); nucleus.add(m); }
  nucleus.add(fresnelSphere(0.3, CYAN, 2.5, 0.8)); g.add(nucleus);
  const orbits = [];
  for (let i = 0; i < 3; i++) {
    const og = new THREE.Group(); og.rotation.set(i * 1.05, i * 0.7, i * 0.4);
    const r = 1.1, pts = []; for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.45)); }
    og.add(line(pts, 0.5));
    const e = dot(0.045, 0xffffff); og.add(e);
    const trail = line(pts.slice(0, 14), 0.9, 0x7cff6b); og.add(trail);
    g.add(og); orbits.push({ og, e, trail, r, t: i / 3 });
  }
  const shell = line(circle(1.25), 0.15); shell.rotation.x = Math.PI / 2; g.add(shell);
  let energy = 1;
  return {
    group: g, radius: 1.25, tiltLimit: 1.5,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => { const r = p.length(); return { SHELL: r < 0.35 ? 'NUCLEUS' : r < 0.8 ? 'K' : 'L', 'E LEVEL': `${(-13.6 / Math.max(1, Math.round(r * 2)) ** 2).toFixed(2)} eV`, SPIN: p.y > 0 ? '+½' : '−½' }; },
    setTime(k) { energy = 0.3 + k * 2.2; },
    update(dt) {
      nucleus.rotation.y += dt * 0.5; nucleus.rotation.x += dt * 0.2;
      for (const o of orbits) { o.t = (o.t + dt * 0.35 * energy) % 1; const a = o.t * Math.PI * 2; o.e.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r * 0.45); const tp = []; for (let k = 0; k < 14; k++) { const aa = a - k * 0.06; tp.push(new THREE.Vector3(Math.cos(aa) * o.r, 0, Math.sin(aa) * o.r * 0.45)); } o.trail.geometry.setFromPoints(tp); }
    },
  };
}

/* ---------------- BIOFRAME (humanoid skeleton) ---------------- */
function buildBioframe() {
  const g = new THREE.Group();
  const J = { head: [0, 1.15, 0], neck: [0, 0.95, 0], chest: [0, 0.65, 0], pelvis: [0, 0.05, 0],
    lsho: [-0.32, 0.88, 0], rsho: [0.32, 0.88, 0], lelb: [-0.45, 0.45, 0.05], relb: [0.45, 0.45, 0.05], lwri: [-0.5, 0.05, 0.1], rwri: [0.5, 0.05, 0.1],
    lhip: [-0.16, 0.02, 0], rhip: [0.16, 0.02, 0], lkne: [-0.19, -0.6, 0.03], rkne: [0.19, -0.6, 0.03], lank: [-0.2, -1.2, 0], rank: [0.2, -1.2, 0], lfoot: [-0.2, -1.25, 0.18], rfoot: [0.2, -1.25, 0.18] };
  const V = (k) => new THREE.Vector3(...J[k]);
  const bones = [['head', 'neck'], ['neck', 'chest'], ['chest', 'pelvis'], ['neck', 'lsho'], ['neck', 'rsho'], ['lsho', 'lelb'], ['rsho', 'relb'], ['lelb', 'lwri'], ['relb', 'rwri'], ['pelvis', 'lhip'], ['pelvis', 'rhip'], ['lhip', 'lkne'], ['rhip', 'rkne'], ['lkne', 'lank'], ['rkne', 'rank'], ['lank', 'lfoot'], ['rank', 'rfoot']];
  for (const [a, b] of bones) {
    const pa = V(a), pb = V(b), len = pa.distanceTo(pb);
    const geo = new THREE.CylinderGeometry(0.035, 0.045, len, 8); const m = edges(geo, 0.55, CYAN, 15);
    m.position.lerpVectors(pa, pb, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize()); g.add(m);
  }
  for (const k of Object.keys(J)) { if (k === 'head') continue; const d = dot(0.04, k === 'chest' || k === 'pelvis' ? PINK : CYAN, 0.9); d.position.copy(V(k)); g.add(d); }
  g.add(edges(new THREE.SphereGeometry(0.17, 12, 10).translate(0, 1.2, 0), 0.6, CYAN, 20));
  // ribs
  const ribs = new THREE.Group();
  for (let i = 0; i < 6; i++) { const y = 0.85 - i * 0.08, w = 0.22 + Math.sin(i / 5 * Math.PI) * 0.1; const pts = []; for (let k = 0; k <= 24; k++) { const a = Math.PI * (k / 24); pts.push(new THREE.Vector3(Math.cos(a) * w, y - Math.sin(a) * 0.03, Math.sin(a) * 0.14 - 0.02)); } ribs.add(line(pts, 0.45)); }
  g.add(ribs);
  const pelvisR = line(circle(0.2, 24), 0.5); pelvisR.position.y = 0.05; pelvisR.scale.z = 0.6; g.add(pelvisR);
  // vitals: heart dot + scan bar
  const heart = dot(0.05, PINK); heart.position.set(0.06, 0.7, 0.08); g.add(heart);
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.01), new THREE.MeshBasicMaterial({ color: 0x7cff6b, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(scan);
  g.position.y = 0.05;
  let t = 0, speed = 1;
  return {
    group: g, radius: 1.45, tiltLimit: 0.6,
    toLocal: (h) => new THREE.Vector3(...h.pos),
    describe: (p) => ({ REGION: p.y > 1.0 ? 'CRANIUM' : p.y > 0.3 ? 'THORAX' : p.y > -0.2 ? 'PELVIS' : 'LOWER LIMB', SIDE: p.x < -0.05 ? 'LEFT' : p.x > 0.05 ? 'RIGHT' : 'MEDIAL', DENSITY: `${(1.1 + Math.abs(p.y) * 0.3).toFixed(2)} g/cm³` }),
    setTime(k) { speed = 0.3 + k * 2.5; },
    update(dt) { t += dt; heart.scale.setScalar(1 + Math.max(0, Math.sin(t * 6 * speed)) * 0.5); scan.position.y = -1.3 + ((t * 0.5 * speed) % 1) * 2.6; scan.material.opacity = 0.3 + 0.5 * Math.abs(Math.sin(t * 3)); },
  };
}

export const MODEL_BUILDERS_2 = { heart: buildHeart, jet: buildJet, station: buildStation, atom: buildAtom, bioframe: buildBioframe };
