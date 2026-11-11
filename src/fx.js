// Visual effects: bloom (CSS drop-shadow on the GL canvas), film grain + vignette,
// random hologram glitches, text scramble on panels, and colour themes.
import * as THREE from 'three';

export const THEMES = {
  cyan:  { name: 'CYAN',  primary: '#00e5ff', accent: '#ff3d71', tert: '#ffb300', green: '#7cff6b', bg: '#05080c' },
  amber: { name: 'AMBER', primary: '#ffb300', accent: '#ff3d3d', tert: '#00e5ff', green: '#ffe27a', bg: '#0c0804' },
  green: { name: 'MATRIX', primary: '#3dff6b', accent: '#ffffff', tert: '#b6ff3d', green: '#9bff8a', bg: '#030a05' },
  red:   { name: 'ALERT', primary: '#ff2d55', accent: '#ffd23d', tert: '#ff8c3d', green: '#ff9bb0', bg: '#0c0305' },
  ice:   { name: 'ICE',   primary: '#cfe9ff', accent: '#5ab0ff', tert: '#ffffff', green: '#b8ffe9', bg: '#05070c' },
};
const ORDER = Object.keys(THEMES);

export function createFX({ scene, library, hud, sound }) {
  const gl = document.getElementById('gl'), hudEl = document.getElementById('hud'), grain = document.getElementById('grain');
  const state = { fx: true, theme: 'cyan' };
  const base = { primary: new THREE.Color('#00e5ff'), accent: new THREE.Color('#ff3d71'), tert: new THREE.Color('#ffb300') };

  /* ---------- glitch scheduler ---------- */
  let glitchTimer = null;
  function glitchOnce(heavy = Math.random() < 0.25) {
    if (!state.fx) return;
    gl.classList.add(heavy ? 'glitch-heavy' : 'glitch'); hudEl.classList.add('glitch-text');
    if (heavy) sound.tick();
    setTimeout(() => { gl.classList.remove('glitch', 'glitch-heavy'); hudEl.classList.remove('glitch-text'); }, heavy ? 260 : 120);
  }
  function schedule() { clearTimeout(glitchTimer); glitchTimer = setTimeout(() => { glitchOnce(); schedule(); }, 4000 + Math.random() * 7000); }

  /* ---------- text scramble ---------- */
  const CHARS = '█▓▒░#%&@$01<>/\\|';
  function scramble(el, duration = 450) {
    const final = el.textContent; const start = performance.now();
    (function step() {
      const k = Math.min(1, (performance.now() - start) / duration);
      el.textContent = [...final].map((c, i) => (c === ' ' || i / final.length < k ? c : CHARS[Math.floor(Math.random() * CHARS.length)])).join('');
      if (k < 1) requestAnimationFrame(step); else el.textContent = final;
    })();
  }
  function scramblePanel() {
    if (!state.fx) return;
    scramble(document.getElementById('p-title'), 500);
    document.querySelectorAll('#p-rows .row span:last-child').forEach((s, i) => setTimeout(() => scramble(s, 350), 60 * i));
  }

  /* ---------- themes ---------- */
  function recolor(obj, th) {
    obj.traverse((o) => {
      const mats = o.material ? [].concat(o.material) : [];
      for (const m of mats) {
        if (!m.color) { if (m.uniforms?.uColor) { const u = m.uniforms.uColor; if (!u.orig) u.orig = u.value.clone(); u.value.copy(mapColor(u.orig, th)); } continue; }
        if (!m.userData.orig) m.userData.orig = m.color.clone();
        m.color.copy(mapColor(m.userData.orig, th));
      }
    });
  }
  const near = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 0.08;
  function mapColor(orig, th) {
    if (near(orig, base.primary)) return new THREE.Color(th.primary);
    if (near(orig, base.accent)) return new THREE.Color(th.accent);
    if (near(orig, base.tert)) return new THREE.Color(th.tert);
    return orig;
  }
  function applyTheme(key) {
    const th = THEMES[key] || THEMES.cyan; state.theme = key;
    const r = document.documentElement.style;
    r.setProperty('--cyan', th.primary); r.setProperty('--pink', th.accent); r.setProperty('--amber', th.tert); r.setProperty('--green', th.green); r.setProperty('--bg', th.bg);
    r.setProperty('--cyan-dim', hexA(th.primary, 0.35));
    hud.setTheme?.({ cyan: th.primary, pink: th.accent, amber: th.tert, green: th.green });
    scene.setTheme?.(th, (o) => recolor(o, th));
    library.forEachScene?.((sc) => recolor(sc, th));
    document.getElementById('g-theme') && (document.getElementById('g-theme').textContent = th.name);
    return th;
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; }
  function cycleTheme(dir = 1) { const i = (ORDER.indexOf(state.theme) + dir + ORDER.length) % ORDER.length; applyTheme(ORDER[i]); sound.confirm(); return THEMES[ORDER[i]]; }
  function themeFromWords(t) { return ORDER.find((k) => t.includes(k) || t.includes(THEMES[k].name.toLowerCase())); }

  /* ---------- fx toggle ---------- */
  function setFX(on) {
    state.fx = on; document.body.classList.toggle('fx', on); grain.classList.toggle('hidden', !on);
    if (on) schedule(); else clearTimeout(glitchTimer);
  }
  // re-theme freshly mounted models
  scene.onModelChange(() => { if (state.theme !== 'cyan') applyTheme(state.theme); });
  setFX(true);
  return { state, setFX, glitchOnce, scramblePanel, applyTheme, cycleTheme, themeFromWords, THEMES };
}
