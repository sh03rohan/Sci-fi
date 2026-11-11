import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { HAND_CONNECTIONS } from './gestures.js';
import { clamp, dist } from './util.js';

const CYAN = '#00e5ff', GREEN = '#7cff6b', PINK = '#ff3d71', AMBER = '#ffb300', WHITE = '#ffffff';
const F = FaceLandmarker;
const CONTOURS = [
  [F.FACE_LANDMARKS_FACE_OVAL, CYAN, 0.55, 1.4],
  [F.FACE_LANDMARKS_LEFT_EYE, GREEN, 0.95, 1.4], [F.FACE_LANDMARKS_RIGHT_EYE, GREEN, 0.95, 1.4],
  [F.FACE_LANDMARKS_LEFT_EYEBROW, CYAN, 0.6, 1], [F.FACE_LANDMARKS_RIGHT_EYEBROW, CYAN, 0.6, 1],
  [F.FACE_LANDMARKS_LIPS, PINK, 0.8, 1.2],
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

  let fpsAcc = 0, fpsN = 0, fpsLast = performance.now(), blinkCount = 0, eyesWereClosed = false;
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

  /* ------------ HAND ------------ */
  function drawHand(h) {
    const col = h.type === 'pinch' ? AMBER : h.type === 'fist' ? PINK : h.type === 'open' ? WHITE : h.type === 'peace' ? CYAN : GREEN;
    const P = h.points;
    ctx.save(); glowStroke(col, 1.6, 10, 0.85);
    ctx.beginPath(); for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); } ctx.stroke();
    // palm web
    ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (const i of [5, 9, 13, 17]) ctx.lineTo(P[i].x, P[i].y); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.shadowBlur = 6;
    for (let i = 0; i < P.length; i++) {
      const tip = i in TIP_LABELS; ctx.fillStyle = tip ? WHITE : col;
      ctx.beginPath(); ctx.arc(P[i].x, P[i].y, tip ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
      if (tip) { ctx.beginPath(); ctx.arc(P[i].x, P[i].y, 7, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); text(TIP_LABELS[i], P[i].x + 9, P[i].y - 6, col, 9); }
    }
    ctx.restore();
    // bounding bracket + label
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of P) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    bracket(minX - 14, minY - 14, maxX - minX + 28, maxY - minY + 28, col, 12, 1);
    ctx.save(); text(`${h.label === 'Left' ? 'R' : 'L'}.HAND · ${h.type.toUpperCase()}`, minX - 14, minY - 20, col, 10); ctx.restore();
    // pinch meter between thumb and index
    const d = dist(P[4], P[8]), ref = dist(P[0], P[9]) || 1, pct = clamp(1 - d / (ref * 0.9), 0, 1);
    ctx.save(); glowStroke(h.type === 'pinch' ? AMBER : col, 1, 4, 0.7); ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(P[4].x, P[4].y); ctx.lineTo(P[8].x, P[8].y); ctx.stroke(); ctx.setLineDash([]);
    const mx = (P[4].x + P[8].x) / 2, my = (P[4].y + P[8].y) / 2;
    text(`${Math.round(pct * 100)}%`, mx + 8, my - 6, h.type === 'pinch' ? AMBER : col, 9);
    ctx.restore();
    // palm ring
    ctx.save(); glowStroke(col, 1, 6, 0.5); ctx.beginPath(); ctx.arc(P[9].x, P[9].y, ref * 0.55, t * 2, t * 2 + Math.PI * 1.4); ctx.stroke(); ctx.restore();
  }

  /* ------------ FACE ------------ */
  function faceMetrics(f, toScreen) {
    const S = (i) => toScreen(f[i].x, f[i].y);
    const ear = (top, bot, outer, inner) => dist(S(top), S(bot)) / (dist(S(outer), S(inner)) || 1);
    const eyeL = clamp((ear(159, 145, 33, 133) - 0.08) / 0.25, 0, 1);   // user's left eye (appears right on mirrored screen)
    const eyeR = clamp((ear(386, 374, 263, 362) - 0.08) / 0.25, 0, 1);
    const mouth = clamp((dist(S(13), S(14)) / (dist(S(61), S(291)) || 1) - 0.02) / 0.6, 0, 1);
    const yaw = clamp(((f[1].x - f[234].x) / ((f[454].x - f[234].x) || 1e-3) - 0.5) * -2, -1, 1);
    const pitch = clamp(((f[1].y - f[10].y) / ((f[152].y - f[10].y) || 1e-3) - 0.55) * -3, -1, 1);
    return { eyeL, eyeR, mouth, yaw, pitch };
  }
  function drawFace(face, toScreen) {
    const S = (i) => toScreen(face[i].x, face[i].y);
    // faint tesselation
    ctx.save(); ctx.strokeStyle = CYAN; ctx.globalAlpha = 0.08; ctx.lineWidth = 0.5; ctx.beginPath();
    const tess = F.FACE_LANDMARKS_TESSELATION; for (let i = 0; i < tess.length; i += 3) { const a = S(tess[i].start), b = S(tess[i].end); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke(); ctx.restore();
    // contours
    for (const [conns, col, alpha, lw] of CONTOURS) {
      ctx.save(); glowStroke(col, lw, 8, alpha); ctx.beginPath();
      for (const c of conns) { const a = S(c.start), b = S(c.end); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke(); ctx.restore();
    }
    // irises
    for (const [c, e] of [[468, 469], [473, 474]]) {
      if (!face[c]) continue;
      const p = S(c), r = Math.max(3, dist(p, S(e)));
      ctx.save(); glowStroke(WHITE, 1.2, 10, 0.95); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, t * 3, t * 3 + Math.PI); ctx.strokeStyle = GREEN; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - r - 8, p.y); ctx.lineTo(p.x - r - 2, p.y); ctx.moveTo(p.x + r + 2, p.y); ctx.lineTo(p.x + r + 8, p.y);
      ctx.moveTo(p.x, p.y - r - 8); ctx.lineTo(p.x, p.y - r - 2); ctx.moveTo(p.x, p.y + r + 2); ctx.lineTo(p.x, p.y + r + 8); ctx.stroke();
      ctx.restore();
    }
    // bounding bracket
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const c of F.FACE_LANDMARKS_FACE_OVAL) { const p = S(c.start); minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const pad = 22; bracket(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, CYAN, 24, 2);
    const m = faceMetrics(face, toScreen);
    ctx.save();
    ctx.fillStyle = CYAN; ctx.globalAlpha = 0.18; ctx.fillRect(minX - pad, minY - pad - 24, 190, 20);
    ctx.globalAlpha = 1; text(`FACE LOCKED · 478 PTS`, minX - pad + 6, minY - pad - 10, CYAN, 11);
    text(`YAW ${(m.yaw * 45).toFixed(0).padStart(3)}°  PITCH ${(m.pitch * 30).toFixed(0).padStart(3)}°`, minX - pad, maxY + pad + 16, CYAN, 10);
    ctx.restore();
    // callouts (mirrored: user's right eye = landmark 263 appears on screen-left)
    const eR = S(263), eL = S(33), nose = S(1), lip = S(14);
    callout(eR.x, eR.y, `R.EYE ${Math.round(m.eyeR * 100)}%`, GREEN, -1, 70, -30);
    callout(eL.x, eL.y, `L.EYE ${Math.round(m.eyeL * 100)}%`, GREEN, 1, 70, -30);
    callout(nose.x, nose.y, 'NOSE · PARALLAX REF', CYAN, 1, 90, 18);
    callout(lip.x, lip.y, `MOUTH ${Math.round(m.mouth * 100)}%`, PINK, -1, 60, 26);
    // tracking cross on the forehead
    const fh = S(10); ctx.save(); glowStroke(CYAN, 1, 4, 0.7); ctx.beginPath(); ctx.moveTo(fh.x - 8, fh.y - 10); ctx.lineTo(fh.x + 8, fh.y - 10); ctx.moveTo(fh.x, fh.y - 18); ctx.lineTo(fh.x, fh.y - 2); ctx.stroke(); ctx.restore();
    return m;
  }

  function drawCursor(c) {
    ctx.save();
    const col = c.hover ? WHITE : c.active ? PINK : CYAN;
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
    ctx.save(); glowStroke(AMBER, 1.5, 8, 0.9);
    ctx.beginPath(); ctx.arc(h.x, h.y, 30, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.stroke();
    if (h.progress) { ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(h.x, h.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h.progress); ctx.stroke(); }
    ctx.globalAlpha = 1; text(h.label, h.x, h.y - 40, AMBER, 11, 'center');
    ctx.restore();
  }

  function draw({ hands, face, toScreen, cursor, zoomLine, hint, dt }) {
    t += dt || 0.016;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let m = null;
    if (face) m = drawFace(face, toScreen);
    for (const h of hands) drawHand(h);
    if (zoomLine) {
      ctx.save(); glowStroke(AMBER, 1.5, 6, 0.8); ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(zoomLine[0].x, zoomLine[0].y); ctx.lineTo(zoomLine[1].x, zoomLine[1].y); ctx.stroke(); ctx.setLineDash([]);
      text(`${Math.round(dist(zoomLine[0], zoomLine[1]))} px`, (zoomLine[0].x + zoomLine[1].x) / 2, (zoomLine[0].y + zoomLine[1].y) / 2 - 8, AMBER, 10, 'center');
      ctx.restore();
    }
    if (cursor) drawCursor(cursor);
    if (hint) drawHint(hint);

    // Biometrics panel
    if (m) {
      const closed = m.eyeL < 0.25 && m.eyeR < 0.25;
      if (closed && !eyesWereClosed) blinkCount++;
      eyesWereClosed = closed;
      el.yaw.textContent = `${m.yaw >= 0 ? 'L' : 'R'} ${Math.abs(m.yaw * 45).toFixed(0)}°`;
      el.pitch.textContent = `${m.pitch >= 0 ? 'UP' : 'DN'} ${Math.abs(m.pitch * 30).toFixed(0)}°`;
      el.eyeL.style.width = `${m.eyeL * 100}%`; el.eyeR.style.width = `${m.eyeR * 100}%`; el.mouth.style.width = `${m.mouth * 100}%`;
      el.blink.textContent = String(blinkCount).padStart(3, '0');
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
  return { draw, setStatus, setGesture, setRot, setZoom, setModel, setExplode };
}
