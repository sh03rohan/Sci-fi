// Alert mode: an incoming-signal event marks one node hostile; touching it resolves the alert.
export function createAlerts({ scene, panel, hud, sound, voice, fx, settings }) {
  const el = document.getElementById('alert-banner');
  let active = null, timer = null, siren = null, t = 0;

  function schedule() {
    clearTimeout(timer);
    if (!settings.s.alerts) return;
    timer = setTimeout(() => { if (!active && !document.hidden) trigger(); schedule(); }, (settings.s.alertEvery * (0.7 + Math.random() * 0.6)) * 1000);
  }
  function trigger(reason = 'INCOMING SIGNAL') {
    const cur = scene.current; if (!cur || active) return;
    const pool = cur.hotspots.filter((h) => !h.live); if (!pool.length) return;
    const hs = pool[Math.floor(Math.random() * pool.length)];
    active = { hs, prevTheme: fx.state.theme, started: performance.now(), code: Math.floor(1000 + Math.random() * 9000) };
    hs.alert = true;
    document.body.classList.add('alert-mode'); el.classList.remove('hidden');
    el.innerHTML = `<div class="ab-title">⚠ ${reason} · CODE ${active.code}</div><div class="ab-sub">HOSTILE SIGNATURE AT <b>${hs.data.title}</b> — POINT &amp; HOLD TO NEUTRALISE</div><div class="ab-timer">00:00</div>`;
    fx.applyTheme('red'); fx.glitchOnce(true);
    siren = setInterval(() => sound.hover(), 900); sound.confirm();
    scene.state.autoSpin = false; scene.pulse(hs.local);
    voice?.say?.(`Alert. ${reason.toLowerCase()} detected at ${hs.data.title.replace(/·/g, ',')}. Neutralise the node.`, { priority: true });
  }
  function resolve() {
    if (!active) return;
    const { hs, prevTheme, started } = active; hs.alert = false;
    clearInterval(siren); document.body.classList.remove('alert-mode'); el.classList.add('hidden');
    fx.applyTheme(prevTheme); hud.alert(`✔ THREAT NEUTRALISED · ${((performance.now() - started) / 1000).toFixed(1)} s`); sound.confirm();
    voice?.say?.('Threat neutralised. Systems nominal.');
    active = null;
  }
  // resolve when the hostile node is opened
  panel.onOpen = (info) => { if (active && info === active.hs.data) resolve(); };
  scene.onModelChange(() => { if (active) { clearInterval(siren); document.body.classList.remove('alert-mode'); el.classList.add('hidden'); fx.applyTheme(active.prevTheme); active = null; } });

  function update(dt) {
    t += dt;
    if (!active) return;
    const s = Math.floor((performance.now() - active.started) / 1000);
    const tm = el.querySelector('.ab-timer'); if (tm) tm.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    active.hs.ring.scale?.setScalar?.(1.6 + Math.sin(t * 10) * 0.6);
    active.hs.core.material.color?.set?.(Math.sin(t * 10) > 0 ? '#ffffff' : '#ff2d55');
  }
  settings.onSettings?.(() => schedule()); schedule();
  return { trigger, resolve, update, schedule, get active() { return !!active; } };
}
