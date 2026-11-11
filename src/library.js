import * as THREE from 'three';
import { instantiate } from './scene.js';
import { Q } from './quality.js';

// Left-hand model library: DOM slots with live 3D minis rendered via scissor viewports.
export function createLibrary({ scene, container, defs, sound, targets }) {
  const slots = [];
  container.innerHTML = `<div class="lib-title">◈ MODEL LIBRARY <span>${defs.length} UNITS</span></div>`;
  function addSlot(def) {
    const i = slots.length;
    const el = document.createElement('div');
    el.className = 'lib-slot'; el.dataset.index = i;
    el.innerHTML = `<div class="lib-view"></div><div class="lib-meta"><div class="lib-name">${def.name}</div><div class="lib-tag">${def.tag}</div></div><div class="lib-idx">0${i + 1}</div><div class="lib-prog"><div></div></div>`;
    container.appendChild(el);
    const mini = instantiate(def, false);
    const sc = new THREE.Scene(); sc.add(mini.group);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    cam.position.set(0, mini.radius * 0.55, mini.radius * 3.6); cam.lookAt(0, 0, 0);
    slots.push({ def, el, view: el.querySelector('.lib-view'), prog: el.querySelector('.lib-prog div'), mini, sc, cam, spin: 0 });
    targets.register(el, () => select(i), { progressEl: el.querySelector('.lib-prog div') });
    container.querySelector('.lib-title span').textContent = `${slots.length} UNITS`;
  }
  defs.forEach(addSlot);

  let selected = -1;
  function select(i) {
    if (i === selected) return;
    if (!scene.select(slots[i].def.id)) return;
    selected = i; sound.confirm();
    slots.forEach((s, k) => s.el.classList.toggle('selected', k === i));
  }
  scene.onModelChange((def) => { selected = defs.indexOf(def); slots.forEach((s, k) => s.el.classList.toggle('selected', k === selected)); });

  function step(dir) { const n = slots.length; select((((selected < 0 ? 0 : selected) + dir) % n + n) % n); }

  // Layout rects are cached (getBoundingClientRect every frame forces layout).
  let rects = [], rectsAt = 0, cursor = 0;
  function refreshRects() { rects = slots.map((s) => s.view.getBoundingClientRect()); rectsAt = performance.now(); }
  window.addEventListener('resize', () => (rectsAt = 0));
  function render(dt) {
    if (performance.now() - rectsAt > 1500 || rects.length !== slots.length) refreshRects();
    const r = scene.renderer, H = window.innerHeight;
    // every mini keeps spinning in state, but only a few are drawn per frame (round-robin);
    // selected/hovered ones are always redrawn so they feel live.
    const budget = Q.minisPerFrame, toDraw = new Set();
    for (let k = 0; k < budget && slots.length; k++) { toDraw.add(cursor % slots.length); cursor++; }
    slots.forEach((s, i) => { if (i === selected || s.el.classList.contains('hover')) toDraw.add(i); });
    r.setScissorTest(true);
    for (const i of toDraw) {
      const s = slots[i], rect = rects[i]; if (!rect || rect.width < 4) continue;
      s.spin += dt * (i === selected || s.el.classList.contains('hover') ? 1.6 : 0.5) * (slots.length / Math.max(1, budget));
      s.mini.group.rotation.y = s.spin; s.mini.update(dt * (slots.length / Math.max(1, budget)));
      r.setViewport(rect.left, H - rect.bottom, rect.width, rect.height);
      r.setScissor(rect.left, H - rect.bottom, rect.width, rect.height);
      s.cam.aspect = rect.width / rect.height; s.cam.updateProjectionMatrix();
      r.render(s.sc, s.cam);
    }
    r.setScissorTest(false);
  }

  const forEachScene = (fn) => slots.forEach((s) => fn(s.sc));
  return { select, step, render, addSlot, forEachScene, get selected() { return selected; } };
}
