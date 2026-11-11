// Live data layer for the globe: ISS position (wheretheiss.at) and recent earthquakes (USGS).
import * as THREE from 'three';
import { latLonToVec3, AMBER } from './models.js';

const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
const QUAKE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

export function createLive({ scene, sound, hud }) {
  let on = false, issTimer = null, quakeTimer = null, layer = null, iss = null, trail = [], trailLine = null, quakes = [];
  const statusEl = document.getElementById('live-status');

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }
  function ensureLayer() {
    const cur = scene.current; if (!cur || cur.def.id !== 'globe') return null;
    if (layer && layer.parent === cur.group) return layer;
    layer = new THREE.Group(); cur.group.add(layer);
    iss = new THREE.Group();
    iss.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    iss.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.01, 0.04)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })));
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    iss.add(hit); iss.visible = false; layer.add(iss);
    trail = []; trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })); layer.add(trailLine);
    cur.hotspots.push({ data: { title: 'ISS · ZARYA', subtitle: 'LIVE ORBIT · wheretheiss.at', level: 100, data: {} }, group: iss, core: iss.children[0], ring: { scale: new THREE.Vector3(), material: { color: new THREE.Color() } }, hit, local: new THREE.Vector3(), live: true });
    return layer;
  }

  async function pollISS() {
    if (!on) return;
    try {
      const r = await fetch(ISS_URL); const d = await r.json();
      const L = ensureLayer(); if (!L) return;
      const p = latLonToVec3(d.latitude, d.longitude, 1 + d.altitude / 6371 * 4); // altitude exaggerated ×4 for visibility
      iss.position.copy(p); iss.lookAt(p.clone().multiplyScalar(2)); iss.visible = true;
      const hs = scene.current.hotspots.find((h) => h.live && h.group === iss);
      if (hs) { hs.local.copy(p); hs.data.data = { LAT: `${d.latitude.toFixed(2)}°`, LON: `${d.longitude.toFixed(2)}°`, ALT: `${d.altitude.toFixed(0)} km`, VELOCITY: `${d.velocity.toFixed(0)} km/h`, VISIBILITY: d.visibility.toUpperCase(), UPDATED: new Date(d.timestamp * 1000).toLocaleTimeString() }; }
      trail.push(p.clone()); if (trail.length > 60) trail.shift(); trailLine.geometry.setFromPoints(trail);
      setStatus(`LIVE ● ISS ${d.latitude.toFixed(1)}°, ${d.longitude.toFixed(1)}° · ${quakes.length} QUAKES`);
    } catch (e) { setStatus('LIVE ○ ISS FEED UNAVAILABLE'); }
    issTimer = setTimeout(pollISS, 5000);
  }

  async function pollQuakes() {
    if (!on) return;
    try {
      const r = await fetch(QUAKE_URL); const d = await r.json();
      const L = ensureLayer(); if (!L) return;
      for (const q of quakes) { L.remove(q.group); const i = scene.current.hotspots.indexOf(q.hs); if (i >= 0) scene.current.hotspots.splice(i, 1); }
      quakes = [];
      for (const f of d.features.slice(0, 40)) {
        const [lon, lat, depth] = f.geometry.coordinates, mag = f.properties.mag || 0;
        const p = latLonToVec3(lat, lon, 1.005);
        const g = new THREE.Group(); g.position.copy(p); g.lookAt(p.clone().multiplyScalar(2));
        const r = 0.02 + mag * 0.012;
        g.add(new THREE.Mesh(new THREE.RingGeometry(r * 0.7, r, 24), new THREE.MeshBasicMaterial({ color: mag >= 5 ? 0xff3d71 : AMBER, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })));
        const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.06, r * 1.4), 8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })); g.add(hit);
        L.add(g);
        const hs = { data: { title: `M${mag.toFixed(1)} · ${(f.properties.place || 'UNKNOWN').toUpperCase().slice(0, 26)}`, subtitle: 'LIVE SEISMIC EVENT · USGS', level: Math.min(100, mag * 15), data: { MAGNITUDE: mag.toFixed(1), DEPTH: `${depth.toFixed(0)} km`, TIME: new Date(f.properties.time).toLocaleString(), TSUNAMI: f.properties.tsunami ? 'WARNING' : 'NONE', FELT: String(f.properties.felt ?? 0) } }, group: g, core: g.children[0], ring: g.children[0], hit, local: p, live: true, mag };
        scene.current.hotspots.push(hs); quakes.push({ group: g, hs });
      }
      setStatus(`LIVE ● ${quakes.length} QUAKES (M2.5+ / 24h)${iss?.visible ? ' · ISS TRACKED' : ''}`);
    } catch (e) { setStatus('LIVE ○ USGS FEED UNAVAILABLE'); }
    quakeTimer = setTimeout(pollQuakes, 120000);
  }

  function start() { if (on) return; on = true; setStatus('LIVE ◌ CONNECTING…'); pollISS(); pollQuakes(); }
  function stop() {
    on = false; clearTimeout(issTimer); clearTimeout(quakeTimer);
    const cur = scene.current;
    if (layer && cur) { cur.group.remove(layer); for (let i = cur.hotspots.length - 1; i >= 0; i--) if (cur.hotspots[i].live) cur.hotspots.splice(i, 1); }
    layer = null; quakes = []; setStatus('');
  }
  scene.onModelChange(() => { layer = null; quakes = []; if (on) { pollISS(); pollQuakes(); clearTimeout(issTimer); clearTimeout(quakeTimer); } });
  let t = 0;
  function update(dt) { t += dt; for (const q of quakes) { const s = 1 + Math.sin(t * 4 + q.mag) * 0.2; q.group.children[0].scale.setScalar(s); } }
  return { start, stop, toggle: () => (on ? stop() : start(), on), update, get active() { return on; } };
}
