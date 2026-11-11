// Target-shooting mini game. Aim with the index finger, fire by flicking the thumb down
// (finger-gun). Targets are cheap DOM elements; flashes/bursts are drawn on the HUD canvas.
import { dist } from './util.js';

const ROUND_S = 60, MAX_TARGETS = 3, LIFE_MS = 2600;

export function createGame({ sound, hud, voice }) {
  const root = document.getElementById('game'), layer = document.getElementById('g-targets');
  const ui = { score: document.getElementById('g-score'), time: document.getElementById('g-time'), combo: document.getElementById('g-combo'), acc: document.getElementById('g-acc'), over: document.getElementById('g-over'), overText: document.getElementById('g-over-text') };
  let active = false, startAt = 0, score = 0, shots = 0, hits = 0, combo = 0, best = +localStorage.getItem('holo.best') || 0;
  let targets = [], fx = [], aim = null, lastSpawn = 0, nextId = 1;

  function safeSpot() {
    // keep clear of the tool strip (right) and the top bar
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < 20; i++) {
      const x = W * (0.1 + Math.random() * 0.7), y = H * (0.24 + Math.random() * 0.62);
      if (targets.every((t) => dist(t, { x, y }) > 140)) return { x, y };
    }
    return { x: W * 0.5, y: H * 0.5 };
  }
  function spawn() {
    const { x, y } = safeSpot();
    const r = 26 + Math.random() * 22, type = Math.random() < 0.15 ? 'bonus' : 'normal';
    const el = document.createElement('div'); el.className = `target ${type}`; el.style.cssText = `left:${x}px;top:${y}px;width:${r * 2}px;height:${r * 2}px;`;
    el.innerHTML = '<i></i><i></i><i></i>';
    layer.appendChild(el);
    targets.push({ id: nextId++, x, y, r, el, born: performance.now(), type, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 40 });
  }
  function kill(t, hit) {
    targets = targets.filter((q) => q !== t);
    t.el.classList.add(hit ? 'hit' : 'miss'); setTimeout(() => t.el.remove(), 350);
    if (!hit) combo = 0;
  }

  function start() {
    if (active) return;
    active = true; startAt = performance.now(); score = 0; shots = 0; hits = 0; combo = 0; fx = []; targets.forEach((t) => t.el.remove()); targets = [];
    root.classList.remove('hidden'); ui.over.classList.add('hidden'); document.body.classList.add('in-game');
    sound.confirm(); voice?.say?.('Target practice. Aim with your finger, flick your thumb to fire.', { priority: true });
    for (let i = 0; i < 2; i++) spawn();
  }
  function stop(showResults = true) {
    if (!active) return;
    active = false; targets.forEach((t) => t.el.remove()); targets = []; document.body.classList.remove('in-game');
    if (showResults) {
      const acc = shots ? Math.round((hits / shots) * 100) : 0;
      if (score > best) { best = score; localStorage.setItem('holo.best', best); }
      ui.overText.innerHTML = `SCORE <b>${score}</b> · HITS ${hits}/${shots} (${acc}%) · BEST ${best}<br><span>press G, say “play again”, or hold the GAME button</span>`;
      ui.over.classList.remove('hidden'); sound.close();
      voice?.say?.(`Round over. Score ${score}, accuracy ${acc} percent.`);
      setTimeout(() => { if (!active) root.classList.add('hidden'); }, 6000);
    } else root.classList.add('hidden');
  }
  const toggle = () => (active ? stop() : start());

  // Fire at a screen point. Returns true on hit.
  function shoot(p) {
    if (!active) return false;
    shots++; sound.tick();
    fx.push({ kind: 'flash', x: p.x, y: p.y, t: 0 });
    const t = targets.find((q) => dist(q, p) <= q.r + 12);
    if (!t) { combo = 0; return false; }
    hits++; combo++;
    const pts = (t.type === 'bonus' ? 50 : 10) + Math.min(combo - 1, 5) * 5 + Math.round(Math.max(0, 1 - dist(t, p) / t.r) * 10);
    score += pts; kill(t, true); sound.confirm();
    for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260; fx.push({ kind: 'spark', x: t.x, y: t.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, col: t.type === 'bonus' ? '#ffb300' : '#ff3d71' }); }
    fx.push({ kind: 'score', x: t.x, y: t.y - 30, t: 0, text: `+${pts}${combo > 1 ? ` ×${combo}` : ''}` });
    return true;
  }

  function update(dt, now) {
    if (!active) return;
    const left = Math.max(0, ROUND_S - (now - startAt) / 1000);
    ui.score.textContent = String(score).padStart(4, '0'); ui.time.textContent = left.toFixed(1); ui.combo.textContent = combo > 1 ? `×${combo}` : '—'; ui.acc.textContent = shots ? `${Math.round((hits / shots) * 100)}%` : '—';
    if (left <= 0) { stop(); return; }
    // move + expire
    for (const t of [...targets]) {
      t.x += t.vx * dt; t.y += t.vy * dt;
      if (t.x < 60 || t.x > window.innerWidth - 60) t.vx *= -1; if (t.y < 80 || t.y > window.innerHeight - 80) t.vy *= -1;
      t.el.style.left = `${t.x}px`; t.el.style.top = `${t.y}px`;
      const age = now - t.born; if (age > LIFE_MS) kill(t, false);
      else if (age > LIFE_MS * 0.7) t.el.classList.add('fading');
    }
    const difficulty = 1 + (now - startAt) / 30000;
    if (targets.length < MAX_TARGETS && now - lastSpawn > 700 / difficulty) { spawn(); lastSpawn = now; }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; if (f.kind === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy = f.vy * 0.9 + 400 * dt; } if (f.t > (f.kind === 'score' ? 0.9 : 0.4)) fx.splice(i, 1); }
  }

  // Draw crosshair + effects on the HUD canvas (called by hud.draw).
  function render(ctx) {
    if (!active) return;
    if (aim) {
      ctx.save(); ctx.strokeStyle = '#7cff6b'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(aim.x, aim.y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(aim.x + dx * 8, aim.y + dy * 8); ctx.lineTo(aim.x + dx * 24, aim.y + dy * 24); } ctx.stroke();
      ctx.fillStyle = '#7cff6b'; ctx.beginPath(); ctx.arc(aim.x, aim.y, 2, 0, Math.PI * 2); ctx.fill();
      if (aim.armed) { ctx.font = '10px monospace'; ctx.fillText('ARMED', aim.x + 20, aim.y - 20); }
      ctx.restore();
    }
    for (const f of fx) {
      ctx.save();
      if (f.kind === 'flash') { const k = f.t / 0.4; ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + k * 40, 0, Math.PI * 2); ctx.stroke(); }
      else if (f.kind === 'spark') { ctx.fillStyle = f.col; ctx.globalAlpha = 1 - f.t / 0.4; ctx.beginPath(); ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'score') { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1 - f.t / 0.9; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y - f.t * 40); }
      ctx.restore();
    }
  }

  return { start, stop, toggle, shoot, update, render, setAim: (p) => (aim = p), get active() { return active; } };
}
