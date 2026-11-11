import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { HAND_CONNECTIONS } from './gestures.js';
import { clamp, dist } from './util.js';

const P = { cyan: '#00e5ff', green: '#7cff6b', pink: '#ff3d71', amber: '#ffb300' };
const WHITE = '#ffffff';
const F = FaceLandmarker;
const CONTOURS = () => [
  [F.FACE_LANDMARKS_FACE_OVAL, P.cyan, 0.55, 1.4],
  [F.FACE_LANDMARKS_LEFT_EYE, P.green, 0.95, 1.4], [F.FACE_LANDMARKS_RIGHT_EYE, P.green, 0.95, 1.4],
  [F.FACE_LANDMARKS_LEFT_EYEBROW, P.cyan, 0.6, 1], [F.FACE_LANDMARKS_RIGHT_EYEBROW, P.cyan, 0.6, 1],
  [F.FACE_LANDMARKS_LIPS, P.pink, 0.8, 1.2],
];
const TIP_LABELS = { 4: 'T', 8: 'I', 12: 'M', 16: 'R', 20: 'P' };

export function createHUD(canvas) {
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const el = {
    cam: $('st-cam'), hand: $('st-hand'), face: $('st-face'), fps: $('st-fps'),
    gesture: $('g-name'), rot: $('g-rot'), zoom: $('g-zoom'), model: $('g-model'),
    yaw: $('b-yaw'), pitch: $('b-pitch'), eyeL: $('b-eyel'), eyeR: $('b-eyer'), mouth: $('b-mouth'), hands: $('b-hands'), blink: $('b-blink'),
  };
  function resize() { const dpr = Math.min(window.devicePixelRatio, 2); canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  window.addEventListener('resize', resize); resize();

  let fpsAcc = 0, fpsN = 0, fpsLast = performance.now();
  const idCard = $('idcard');
  const idEl = { status: $('id-status'), bar: $('id-bar'), yaw: $('id-yaw'), expr: $('id-expr') };
  let gazeActive = false;
  const alertEl = $('alert');
  function alert(msg) { alertEl.querySelector('span').textContent = msg; alertEl.classList.remove('hidden'); alertEl.classList.remove('go'); void alertEl.offsetWidth; alertEl.classList.add('go'); setTimeout(() => alertEl.classList.add('hidden'), 2200); }
  let t = 0;

  const setStatus = (key, on) => { el[key].classList.toggle('on', on); el[key].textContent = el[key].textContent.replace(/[○●]/, on ? '●' : '○'); };
  const text = (s, x, y, col, size = 10, align = 'left') => { ctx.font = `${size}px "JetBrains Mono", Menlo, monospace`; ctx.fillStyle = col; ctx.textAlign = align; ctx.fillText(s, x, y); };
  function glowStroke(col, w = 1.5, blur = 8, alpha = 0.9) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.shadowColor = col; ctx.shadowBlur = blur; ctx.globalAlpha = alpha; }
  function callout(x, y, label, col, dirX = 1, len = 48, dy = -26) {
    // small leader line from a feature point to a label
    ctx.save(); glowStroke(col, 1, 6, 0.9);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dirX * 14, y + dy); ctx.lineTo(x + dirX * (14 + len), y + dy); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    text(label, x + dirX * 16, y + dy - 4, col, 9, dirX > 0 ? 'left' : 'right');
    ctx.restore();
  }
  function bracket(x, y, w, h, col, L = 16, lw = 1.5) {
    ctx.save(); glowStroke(col, lw, 6, 0.9); ctx.beginPath();
    ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
    ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h); ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
    ctx.stroke(); ctx.restore();
  }

  /* ------------ trails & sparks ------------ */
  const trails = [[], []]; const sparks = []; const prevType = ['none', 'none'];
  function updateTrails(hands, dt) {
    for (let i = 0; i < 2; i++) {
      const h = hands.find((x) => x.slot === i); const tr = trails[i];
      if (h) {
        const p = h.type === 'pinch' ? h.pinch : h.tip;
        if (!tr.length || dist(tr[tr.length - 1], p) > 3) tr.push({ x: p.x, y: p.y, t: 1 });
        if (h.type !== prevType[i] && (h.type === 'pinch' || h.type === 'fist')) for (let k = 0; k < 14; k++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220; sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 1, col: h.type === 'pinch' ? P.amber : P.pink }); }
        prevType[i] = h.type;
      } else prevType[i] = 'none';
      for (const q of tr) q.t -= dt * 1.6;
      while (tr.length && tr[0].t <= 0) tr.shift();
      if (tr.length > 40) tr.splice(0, tr.length - 40);
    }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.9; s.vy = s.vy * 0.9 + 300 * dt; s.t -= dt * 1.8; if (s.t <= 0) sparks.splice(i, 1); }
  }
  function drawTrails() {
    for (const tr of trails) {
      if (tr.length < 2) continue;
      ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = P.cyan; ctx.shadowBlur = 10;
      for (let i = 1; i < tr.length; i++) { ctx.strokeStyle = P.cyan; ctx.globalAlpha = tr[i].t * 0.7; ctx.lineWidth = 1 + tr[i].t * 3; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke(); }
      ctx.restore();
    }
    if (sparks.length) { ctx.save(); for (const s of sparks) { ctx.globalAlpha = s.t; ctx.fillStyle = s.col; ctx.shadowColor = s.col; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(s.x, s.y, 1.5 + s.t * 2, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
  }

  /* ------------ HAND ------------ */
  function drawHand(h) {
    const col = h.type === 'pinch' ? P.amber : h.type === 'fist' ? P.pink : h.type === 'open' ? WHITE : h.type === 'peace' ? P.cyan : P.green;
    const K = h.points;
    ctx.save(); glowStroke(col, 1.6, 10, 0.85);
    ctx.beginPath(); for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(K[a].x, K[a].y); ctx.lineTo(K[b].x, K[b].y); } ctx.stroke();
    // palm web
    ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(K[0].x, K[0].y); for (const i of [5, 9, 13, 17]) ctx.lineTo(K[i].x, K[i].y); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.shadowBlur = 6;
    for (let i = 0; i < K.length; i++) {
      const tip = i in TIP_LABELS; ctx.fillStyle = tip ? WHITE : col;
      ctx.beginPath(); ctx.arc(K[i].x, K[i].y, tip ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
      if (tip) { ctx.beginPath(); ctx.arc(K[i].x, K[i].y, 7, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); text(TIP_LABELS[i], K[i].x + 9, K[i].y - 6, col, 9); }
    }
    ctx.restore();
    // bounding bracket + label
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of K) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    bracket(minX - 14, minY - 14, maxX - minX + 28, maxY - minY + 28, col, 12, 1);
    ctx.save(); text(`${h.label === 'Left' ? 'R' : 'L'}.HAND · ${h.type.toUpperCase()}`, minX - 14, minY - 20, col, 10); ctx.restore();
    // pinch meter between thumb and index
    const d = dist(K[4], K[8]), ref = dist(K[0], K[9]) || 1, pct = clamp(1 - d / (ref * 0.9), 0, 1);
    ctx.save(); glowStroke(h.type === 'pinch' ? P.amber : col, 1, 4, 0.7); ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(K[4].x, K[4].y); ctx.lineTo(K[8].x, K[8].y); ctx.stroke(); ctx.setLineDash([]);
    const mx = (K[4].x + K[8].x) / 2, my = (K[4].y + K[8].y) / 2;
    text(`${Math.round(pct * 100)}%`, mx + 8, my - 6, h.type === 'pinch' ? P.amber : col, 9);
    ctx.restore();
    // palm ring
    ctx.save(); glowStroke(col, 1, 6, 0.5); ctx.beginPath(); ctx.arc(K[9].x, K[9].y, ref * 0.55, t * 2, t * 2 + Math.PI * 1.4); ctx.stroke(); ctx.restore();
  }

  /* ------------ FACE ------------ */
  function drawFace(face, toScreen, m) {
    const S = (i) => toScreen(face[i].x, face[i].y);
    // faint tesselation
    ctx.save(); ctx.strokeStyle = P.cyan; ctx.globalAlpha = 0.08; ctx.lineWidth = 0.5; ctx.beginPath();
    const tess = F.FACE_LANDMARKS_TESSELATION; for (let i = 0; i < tess.length; i += 3) { const a = S(tess[i].start), b = S(tess[i].end); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke(); ctx.restore();
    // contours
    for (const [conns, col, alpha, lw] of CONTOURS()) {
      ctx.save(); glowStroke(col, lw, 8, alpha); ctx.beginPath();
      for (const c of conns) { const a = S(c.start), b = S(c.end); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke(); ctx.restore();
    }
    // irises
    for (const [c, e] of [[468, 469], [473, 474]]) {
      if (!face[c]) continue;
      const p = S(c), r = Math.max(3, dist(p, S(e)));
      ctx.save(); glowStroke(WHITE, 1.2, 10, 0.95); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, t * 3, t * 3 + Math.PI); ctx.strokeStyle = P.green; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - r - 8, p.y); ctx.lineTo(p.x - r - 2, p.y); ctx.moveTo(p.x + r + 2, p.y); ctx.lineTo(p.x + r + 8, p.y);
      ctx.moveTo(p.x, p.y - r - 8); ctx.lineTo(p.x, p.y - r - 2); ctx.moveTo(p.x, p.y + r + 2); ctx.lineTo(p.x, p.y + r + 8); ctx.stroke();
      ctx.restore();
    }
    // bounding bracket
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const c of F.FACE_LANDMARKS_FACE_OVAL) { const p = S(c.start); minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const pad = 22; bracket(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, P.cyan, 24, 2);
    ctx.save();
    ctx.fillStyle = P.cyan; ctx.globalAlpha = 0.18; ctx.fillRect(minX - pad, minY - pad - 24, 190, 20);
    ctx.globalAlpha = 1; text(`FACE LOCKED · 478 PTS`, minX - pad + 6, minY - pad - 10, P.cyan, 11);
    text(`YAW ${(m.yaw * 45).toFixed(0).padStart(3)}°  PITCH ${(m.pitch * 30).toFixed(0).padStart(3)}°`, minX - pad, maxY + pad + 16, P.cyan, 10);
    ctx.restore();
    // callouts (mirrored: user's right eye = landmark 263 appears on screen-left)
    const eR = S(263), eL = S(33), nose = S(1), lip = S(14);
    callout(eR.x, eR.y, `R.EYE ${Math.round(m.eyeR * 100)}%`, P.green, -1, 70, -30);
    callout(eL.x, eL.y, `L.EYE ${Math.round(m.eyeL * 100)}%`, P.green, 1, 70, -30);
    callout(nose.x, nose.y, 'NOSE · PARALLAX REF', P.cyan, 1, 90, 18);
    callout(lip.x, lip.y, `MOUTH ${Math.round(m.mouth * 100)}%`, P.pink, -1, 60, 26);
    // tracking cross on the forehead
    const fh = S(10); ctx.save(); glowStroke(P.cyan, 1, 4, 0.7); ctx.beginPath(); ctx.moveTo(fh.x - 8, fh.y - 10); ctx.lineTo(fh.x + 8, fh.y - 10); ctx.moveTo(fh.x, fh.y - 18); ctx.lineTo(fh.x, fh.y - 2); ctx.stroke(); ctx.restore();
    // operator ID card beside the face (screen-right of the bracket)
    const card = idCard, cw = 196, right = maxX + pad + 26 + cw < window.innerWidth;
    card.style.left = `${right ? maxX + pad + 26 : minX - pad - 26 - cw}px`; card.style.top = `${minY - pad}px`; card.classList.remove('hidden');
    const idProg = clamp(m.lockedMs / 2200, 0, 1);
    if (idProg < 1) { card.classList.add('scanning'); idEl.status.textContent = `IDENTIFYING… ${Math.round(idProg * 100)}%`; idEl.bar.style.width = `${idProg * 100}%`; }
    else { card.classList.remove('scanning'); idEl.status.textContent = 'AUTHENTICATED'; idEl.bar.style.width = '100%'; }
    idEl.yaw.textContent = `${m.yaw >= 0 ? 'L' : 'R'}${Math.abs(m.yaw * 45).toFixed(0)}° / ${m.pitch >= 0 ? 'U' : 'D'}${Math.abs(m.pitch * 30).toFixed(0)}°`;
    idEl.expr.textContent = m.mouth > 0.55 ? 'VOCAL' : m.browRaise ? 'ALERT' : (m.eyeL < 0.25 && m.eyeR < 0.25) ? 'BLINK' : 'NEUTRAL';
    ctx.save(); glowStroke(P.cyan, 1, 4, 0.6); ctx.setLineDash([4, 4]); ctx.beginPath();
    ctx.moveTo(right ? maxX + pad : minX - pad, minY - pad + 12); ctx.lineTo(right ? maxX + pad + 26 : minX - pad - 26, minY - pad + 12); ctx.stroke(); ctx.restore();
    // gaze reticle
    if (m.gaze) {
      const g = m.gaze; ctx.save(); glowStroke(gazeActive ? WHITE : P.cyan, 1, 8, gazeActive ? 0.9 : 0.45);
      ctx.beginPath(); ctx.arc(g.x, g.y, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g.x - 26, g.y); ctx.lineTo(g.x - 10, g.y); ctx.moveTo(g.x + 10, g.y); ctx.lineTo(g.x + 26, g.y); ctx.moveTo(g.x, g.y - 26); ctx.lineTo(g.x, g.y - 10); ctx.moveTo(g.x, g.y + 10); ctx.lineTo(g.x, g.y + 26); ctx.stroke();
      text(gazeActive ? 'GAZE · ACTIVE' : 'GAZE', g.x + 24, g.y - 22, gazeActive ? WHITE : P.cyan, 9); ctx.restore();
    }
    return m;
  }

  function drawCursor(c) {
    ctx.save();
    const col = c.hover ? WHITE : c.active ? P.pink : P.cyan;
    glowStroke(col, 2, 12, 1); ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2); ctx.globalAlpha = 0.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.globalAlpha = 1; ctx.fill();
    ctx.beginPath(); ctx.arc(c.x, c.y, 22, -t * 1.5, -t * 1.5 + 0.8); ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke();
    if (c.progress > 0) {
      ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.progress); ctx.stroke();
      text(c.label || (c.progress < 1 ? 'SCANNING' : 'LOCK'), c.x + 28, c.y + 4, col, 10);
    }
    ctx.restore();
  }

  function drawHint(h) {
    // floating label near the palm for grab / reset / slice
    ctx.save(); glowStroke(P.amber, 1.5, 8, 0.9);
    ctx.beginPath(); ctx.arc(h.x, h.y, 30, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.stroke();
    if (h.progress) { ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(h.x, h.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h.progress); ctx.stroke(); }
    ctx.globalAlpha = 1; text(h.label, h.x, h.y - 40, P.amber, 11, 'center');
    ctx.restore();
  }

  function draw({ hands, face, fm, toScreen, cursor, zoomLine, hint, dt }) {
    t += dt || 0.016;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let m = null;
    if (face && fm?.present) m = drawFace(face, toScreen, fm); else idCard.classList.add('hidden');
    updateTrails(hands, dt || 0.016); drawTrails();
    for (const h of hands) drawHand(h);
    if (zoomLine) {
      ctx.save(); glowStroke(P.amber, 1.5, 6, 0.8); ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(zoomLine[0].x, zoomLine[0].y); ctx.lineTo(zoomLine[1].x, zoomLine[1].y); ctx.stroke(); ctx.setLineDash([]);
      text(`${Math.round(dist(zoomLine[0], zoomLine[1]))} px`, (zoomLine[0].x + zoomLine[1].x) / 2, (zoomLine[0].y + zoomLine[1].y) / 2 - 8, P.amber, 10, 'center');
      ctx.restore();
    }
    if (cursor) drawCursor(cursor);
    if (hint) drawHint(hint);

    // Biometrics panel
    if (m) {
      el.yaw.textContent = `${m.yaw >= 0 ? 'L' : 'R'} ${Math.abs(m.yaw * 45).toFixed(0)}°`;
      el.pitch.textContent = `${m.pitch >= 0 ? 'UP' : 'DN'} ${Math.abs(m.pitch * 30).toFixed(0)}°`;
      el.eyeL.style.width = `${m.eyeL * 100}%`; el.eyeR.style.width = `${m.eyeR * 100}%`; el.mouth.style.width = `${m.mouth * 100}%`;
      el.blink.textContent = String(m.blinkCount).padStart(3, '0');
    }
    el.hands.textContent = hands.length ? hands.map((h) => `${h.label === 'Left' ? 'R' : 'L'}:${h.type.toUpperCase()}`).join('  ') : '— NONE —';

    const now = performance.now(); fpsN++; fpsAcc += now - fpsLast; fpsLast = now;
    if (fpsAcc > 500) { el.fps.textContent = `FPS ${Math.round(1000 / (fpsAcc / fpsN))}`; fpsAcc = 0; fpsN = 0; }
  }

  const setGesture = (name) => (el.gesture.textContent = name);
  const setRot = (x, y) => { const d = (r) => String(Math.round(((r * 180) / Math.PI) % 360 + 360) % 360).padStart(3, '0'); el.rot.textContent = `X ${d(x)}° Y ${d(y)}°`; };
  const setZoom = (s) => (el.zoom.textContent = `${s.toFixed(2)}x`);
  const setModel = (name) => (el.model.textContent = name);
  const exEl = $('g-explode');
  const setExplode = (v) => { if (exEl) exEl.textContent = `${Math.round(v * 100)}%`; };
  const setTheme = (t) => Object.assign(P, t);
  return { draw, setStatus, setGesture, setRot, setZoom, setModel, setExplode, alert, setTheme, setGazeActive: (v) => (gazeActive = v) };
}
