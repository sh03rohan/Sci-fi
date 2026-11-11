// Settings panel (gear) with persistent tunables shared by the other modules.
const KEY = 'holo.settings.v1';
export const DEFAULTS = {
  dwellMs: 800, rotSens: 1.0, swipeVx: 1400, resetMs: 1200, mirror: true, trails: true,
  grain: 0.14, voiceVolume: 0.9, alerts: false, alertEvery: 90, hudScale: 1.0, pixelRatio: 2, showHints: true,
};
export function createSettings({ container, targets, sound, onChange = () => {} }) {
  const s = { ...DEFAULTS };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const fields = [
    ['dwellMs', 'DWELL TIME', 300, 1600, 50, 'ms'],
    ['rotSens', 'ROTATE SENSITIVITY', 0.3, 2.5, 0.1, '×'],
    ['swipeVx', 'SWIPE THRESHOLD', 600, 3000, 100, 'px/s'],
    ['resetMs', 'HOLD-TO-RESET', 600, 2500, 100, 'ms'],
    ['grain', 'FILM GRAIN', 0, 0.4, 0.02, ''],
    ['voiceVolume', 'VOICE VOLUME', 0, 1, 0.05, ''],
    ['alertEvery', 'ALERT INTERVAL', 30, 300, 10, 's'],
    ['hudScale', 'HUD SCALE', 0.8, 1.3, 0.05, '×'],
    ['pixelRatio', 'RENDER QUALITY', 1, 2, 0.25, 'dpr'],
  ];
  const toggles = [['mirror', 'MIRROR CAMERA'], ['trails', 'FINGER TRAILS'], ['alerts', 'RANDOM ALERTS'], ['showHints', 'GESTURE HINTS']];

  container.innerHTML = `<div class="set-head"><span>◈ SETTINGS</span><button id="set-close">✕</button></div>
    <div class="set-body">
      ${fields.map(([k, l, min, max, step, unit]) => `<label class="set-row"><span>${l}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"/><b data-v="${k}">${fmt(s[k], unit)}</b></label>`).join('')}
      <div class="set-toggles">${toggles.map(([k, l]) => `<div class="set-toggle${s[k] ? ' on' : ''}" data-t="${k}"><i></i>${l}</div>`).join('')}</div>
      <div class="set-foot"><div class="tb-btn" id="set-reset"><span>↺ DEFAULTS</span></div><div class="set-note">Settings are saved in this browser.</div></div>
    </div>`;
  function fmt(v, unit) { return `${Number.isInteger(+v) ? v : (+v).toFixed(2)}${unit ? ' ' + unit : ''}`; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} onChange(s); }
  container.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.k; s[k] = parseFloat(inp.value); container.querySelector(`[data-v="${k}"]`).textContent = fmt(s[k], fields.find((f) => f[0] === k)[5]); save();
  }));
  container.querySelectorAll('.set-toggle').forEach((el) => targets.register(el, () => { const k = el.dataset.t; s[k] = !s[k]; el.classList.toggle('on', s[k]); sound.tick(); save(); }));
  targets.register(container.querySelector('#set-reset'), () => { Object.assign(s, DEFAULTS); save(); sound.close(); refresh(); });
  function refresh() {
    container.querySelectorAll('input[type=range]').forEach((inp) => { inp.value = s[inp.dataset.k]; container.querySelector(`[data-v="${inp.dataset.k}"]`).textContent = fmt(s[inp.dataset.k], fields.find((f) => f[0] === inp.dataset.k)[5]); });
    container.querySelectorAll('.set-toggle').forEach((el) => el.classList.toggle('on', !!s[el.dataset.t]));
  }
  const open = () => { container.classList.remove('hidden'); refresh(); };
  const close = () => container.classList.add('hidden');
  targets.register(container.querySelector('#set-close'), close);
  onChange(s);
  return { s, open, close, toggle: () => (container.classList.contains('hidden') ? open() : close()), get isOpen() { return !container.classList.contains('hidden'); } };
}
