import { HAND_CONNECTIONS } from './gestures.js';

const CYAN = '#00e5ff', GREEN = '#7cff6b', PINK = '#ff3d71', AMBER = '#ffb300';

export function createHUD(canvas) {
  const ctx = canvas.getContext('2d');
  const el = {
    cam: document.getElementById('st-cam'), hand: document.getElementById('st-hand'),
    face: document.getElementById('st-face'), fps: document.getElementById('st-fps'),
    gesture: document.getElementById('g-name'), rot: document.getElementById('g-rot'), zoom: document.getElementById('g-zoom'),
  };
  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  let fpsAcc = 0, fpsN = 0, fpsLast = performance.now();

  function setStatus(key, on) { el[key].classList.toggle('on', on); el[key].textContent = el[key].textContent.replace(/[○●]/, on ? '●' : '○'); }

  function drawHand(h) {
    const col = h.type === 'pinch' ? AMBER : h.type === 'fist' ? PINK : h.type === 'open' ? '#ffffff' : h.type === 'peace' ? CYAN : GREEN;
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(h.points[a].x, h.points[a].y); ctx.lineTo(h.points[b].x, h.points[b].y); }
    ctx.stroke();
    ctx.fillStyle = col;
    for (let i = 0; i < h.points.length; i++) {
      const r = (i === 4 || i === 8) ? 4 : 2.5;
      ctx.beginPath(); ctx.arc(h.points[i].x, h.points[i].y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.font = '10px monospace'; ctx.fillStyle = col; ctx.globalAlpha = 0.8;
    ctx.fillText(`${h.label.toUpperCase()} · ${h.type.toUpperCase()}`, h.points[0].x + 10, h.points[0].y + 16);
    ctx.restore();
  }

  function drawFace(face, toScreen) {
    // Bounding box from landmarks + a few key points.
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of face) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
    const a = toScreen(maxX, minY), b = toScreen(minX, maxY); // mirrored
    const pad = 18, x = a.x - pad, y = a.y - pad, w = b.x - a.x + pad * 2, h = b.y - a.y + pad * 2, L = 22;
    ctx.save();
    ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.shadowColor = CYAN; ctx.shadowBlur = 8; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
    ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
    ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
    ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
    ctx.stroke();
    ctx.fillStyle = CYAN; ctx.globalAlpha = 0.9;
    for (const i of [1, 33, 263, 61, 291, 10, 152, 234, 454]) { const p = toScreen(face[i].x, face[i].y); ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 0.18; ctx.fillRect(x, y - 24, 150, 20);
    ctx.globalAlpha = 1; ctx.font = '11px monospace'; ctx.fillText('FACE LOCKED · PARALLAX', x + 6, y - 10);
    ctx.restore();
  }

  function drawCursor(c) {
    // c: {x,y,progress(0..1), active, hover}
    ctx.save();
    const col = c.hover ? '#ffffff' : c.active ? PINK : CYAN;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, 14, 0, Math.PI * 2); ctx.globalAlpha = 0.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.globalAlpha = 1; ctx.fill();
    if (c.progress > 0) {
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.progress); ctx.stroke();
      ctx.font = '10px monospace'; ctx.fillText(c.progress < 1 ? 'SCANNING' : 'LOCK', c.x + 26, c.y + 4);
    }
    ctx.restore();
  }

  function drawHint(h) {
    ctx.save(); ctx.strokeStyle = AMBER; ctx.fillStyle = AMBER; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(h.x, h.y, 30, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.stroke();
    if (h.progress) { ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(h.x, h.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h.progress); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillText(h.label, h.x, h.y - 40);
    ctx.restore();
  }

  function draw({ hands, face, toScreen, cursor, zoomLine, hint, extra }) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (face) drawFace(face, toScreen);
    for (const h of hands) drawHand(h);
    if (zoomLine) {
      ctx.save(); ctx.strokeStyle = AMBER; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(zoomLine[0].x, zoomLine[0].y); ctx.lineTo(zoomLine[1].x, zoomLine[1].y); ctx.stroke();
      ctx.restore();
    }
    if (cursor) drawCursor(cursor);
    if (hint) drawHint(hint);
    if (extra) extra(ctx);

    // FPS
    const now = performance.now(); fpsN++; fpsAcc += now - fpsLast; fpsLast = now;
    if (fpsAcc > 500) { el.fps.textContent = `FPS ${Math.round(1000 / (fpsAcc / fpsN))}`; fpsAcc = 0; fpsN = 0; }
  }

  function setGesture(name) { el.gesture.textContent = name; }
  function setRot(x, y) {
    const d = (r) => String(Math.round(((r * 180) / Math.PI) % 360 + 360) % 360).padStart(3, '0');
    el.rot.textContent = `X ${d(x)}° Y ${d(y)}°`;
  }
  function setZoom(s) { el.zoom.textContent = `${s.toFixed(2)}x`; }

  return { draw, setStatus, setGesture, setRot, setZoom };
}
