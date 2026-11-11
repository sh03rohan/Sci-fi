import * as THREE from 'three';
import { instantiate } from './scene.js';

// Left-hand model library: DOM slots with live 3D minis rendered via scissor viewports.
export function createLibrary({ scene, container, defs, sound }) {
  const slots = [];
  container.innerHTML = `<div class="lib-title">◈ MODEL LIBRARY <span>${defs.length} UNITS</span></div>`;
  defs.forEach((def, i) => {
    const el = document.createElement('div');
    el.className = 'lib-slot'; el.dataset.index = i;
    el.innerHTML = `<div class="lib-view"></div><div class="lib-meta"><div class="lib-name">${def.name}</div><div class="lib-tag">${def.tag}</div></div><div class="lib-idx">0${i + 1}</div><div class="lib-prog"><div></div></div>`;
    container.appendChild(el);
    const mini = instantiate(def, false);
    const sc = new THREE.Scene(); sc.add(mini.group);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    cam.position.set(0, mini.radius * 0.55, mini.radius * 3.6); cam.lookAt(0, 0, 0);
    slots.push({ def, el, view: el.querySelector('.lib-view'), prog: el.querySelector('.lib-prog div'), mini, sc, cam, spin: 0 });
    el.addEventListener('click', () => select(i));
  });

  let selected = -1, hover = -1;
  function select(i) {
    if (i === selected) return;
    if (!scene.select(slots[i].def.id)) return;
    selected = i; sound.confirm();
    slots.forEach((s, k) => s.el.classList.toggle('selected', k === i));
  }
  scene.onModelChange((def) => { selected = defs.indexOf(def); slots.forEach((s, k) => s.el.classList.toggle('selected', k === selected)); });

  function hitTest(x, y) {
    for (let i = 0; i < slots.length; i++) { const r = slots[i].el.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i; }
    return -1;
  }
  function setHover(i, progress = 0) {
    if (i !== hover) { slots.forEach((s, k) => s.el.classList.toggle('hover', k === i)); if (i >= 0) sound.tick(); hover = i; }
    slots.forEach((s, k) => (s.prog.style.width = k === i ? `${progress * 100}%` : '0%'));
  }

  function render(dt) {
    const r = scene.renderer, H = window.innerHeight, dpr = r.getPixelRatio();
    r.setScissorTest(true);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i], rect = s.view.getBoundingClientRect();
      if (rect.width < 4) continue;
      s.spin += dt * (i === selected || i === hover ? 1.6 : 0.5);
      s.mini.group.rotation.y = s.spin; s.mini.update(dt);
      const x = rect.left * dpr, y = (H - rect.bottom) * dpr, w = rect.width * dpr, h = rect.height * dpr;
      // setViewport/setScissor take CSS px when the renderer manages pixel ratio.
      r.setViewport(rect.left, H - rect.bottom, rect.width, rect.height);
      r.setScissor(rect.left, H - rect.bottom, rect.width, rect.height);
      s.cam.aspect = w / h; s.cam.updateProjectionMatrix();
      r.render(s.sc, s.cam);
    }
    r.setScissorTest(false);
  }

  return { select, hitTest, setHover, render, get selected() { return selected; } };
}
