// Hand-in-front occlusion: when a hand is close to the camera (large on screen) the
// person's pixels around it are composited over the hologram, so the hand "covers" it.
// Uses MediaPipe selfie segmentation for the person mask.
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { dist } from './util.js';

const BASE = import.meta.env.BASE_URL;
const NEAR = 0.17;   // hand size (wrist→middle knuckle) as a fraction of screen height that counts as "near"

export async function createOcclusion({ video, canvas, toScreen, onLog = () => {} }) {
  const ctx = canvas.getContext('2d');
  const maskCanvas = document.createElement('canvas'); const mctx = maskCanvas.getContext('2d');
  let seg = null, enabled = false, frame = 0, lastT = -1, maskReady = false, imgData = null;
  let w = 0, h = 0;

  function resize() { const dpr = Math.min(window.devicePixelRatio, 2); canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  window.addEventListener('resize', resize); resize();

  async function init() {
    if (seg) return true;
    onLog('loading segmentation model…');
    const vision = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
    seg = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${BASE}models/selfie_segmenter.tflite`, delegate: 'GPU' },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    onLog('occlusion layer online', 'ok');
    return true;
  }

  function segment(now) {
    if (!seg || video.readyState < 2 || video.currentTime === lastT) return;
    lastT = video.currentTime; frame++;
    if (frame % 2) return;
    const res = seg.segmentForVideo(video, now);
    const m = res.confidenceMasks?.[0]; if (!m) return;
    if (w !== m.width || h !== m.height) { w = m.width; h = m.height; maskCanvas.width = w; maskCanvas.height = h; imgData = mctx.createImageData(w, h); }
    const f = m.getAsFloat32Array(), d = imgData.data;
    for (let i = 0; i < f.length; i++) { const v = f[i] > 0.5 ? 255 : f[i] > 0.3 ? (f[i] - 0.3) * 1275 : 0; d[i * 4 + 3] = v; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; }
    mctx.putImageData(imgData, 0, 0); maskReady = true;
    res.close?.();
  }

  // Draw the mirrored, cover-fitted video (or mask) into screen space.
  function drawCover(src, sw, sh) {
    const W = window.innerWidth, H = window.innerHeight, va = sw / sh, sa = W / H;
    let dw, dh, ox, oy;
    if (sa > va) { dw = W; dh = W / va; ox = 0; oy = (H - dh) / 2; } else { dh = H; dw = H * va; oy = 0; ox = (W - dw) / 2; }
    ctx.save(); ctx.translate(ox + dw, oy); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, dw, dh); ctx.restore();
  }

  function update(hands, now) {
    if (!enabled || !seg) { if (canvas.dataset.dirty) { ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); delete canvas.dataset.dirty; } return []; }
    segment(now);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const near = hands.filter((hd) => dist(hd.points[0], hd.points[9]) / window.innerHeight > NEAR);
    if (!near.length || !maskReady) return [];
    canvas.dataset.dirty = '1';
    // 1) soft discs around each near hand
    for (const hd of near) {
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const p of hd.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, r = Math.max(maxX - minX, maxY - minY) * 0.95 + 40;
      const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    // 2) keep only person pixels
    ctx.globalCompositeOperation = 'destination-in'; drawCover(maskCanvas, w, h);
    // 3) paint the camera image there, tinted like the background feed
    ctx.globalCompositeOperation = 'source-in'; ctx.filter = 'brightness(0.62) contrast(1.15) saturate(0.45)';
    drawCover(video, video.videoWidth, video.videoHeight); ctx.filter = 'none';
    // 4) edge glow so the occluding hand reads as "in front"
    ctx.globalCompositeOperation = 'source-over';
    return near.map((hd) => ({ x: hd.points[9].x, y: hd.points[9].y }));
  }

  return {
    init, update,
    async setEnabled(v) { if (v) { try { await init(); enabled = true; } catch (e) { onLog(`segmentation failed: ${e.message}`, 'err'); enabled = false; } } else { enabled = false; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); } return enabled; },
    get enabled() { return enabled; },
  };
}
