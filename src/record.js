// Screenshot (PNG) and screen recording (WebM) of the composited layers.
export function createRecorder({ video, layers, sound, hud, mirror = () => true }) {
  const comp = document.createElement('canvas'); const cctx = comp.getContext('2d');
  let recorder = null, chunks = [], stream = null, raf = 0, startedAt = 0;
  const statusEl = document.getElementById('rec-status');

  function drawFrame() {
    const W = window.innerWidth, H = window.innerHeight;
    if (comp.width !== W || comp.height !== H) { comp.width = W; comp.height = H; }
    cctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#05080c'; cctx.fillRect(0, 0, W, H);
    // camera (cover + mirror + tint), then each transparent layer
    if (video.videoWidth) {
      const va = video.videoWidth / video.videoHeight, sa = W / H; let dw, dh, ox, oy;
      if (sa > va) { dw = W; dh = W / va; ox = 0; oy = (H - dh) / 2; } else { dh = H; dw = H * va; oy = 0; ox = (W - dw) / 2; }
      cctx.save(); cctx.filter = 'brightness(0.55) contrast(1.15) saturate(0.4)';
      if (mirror()) { cctx.translate(ox + dw, oy); cctx.scale(-1, 1); cctx.drawImage(video, 0, 0, dw, dh); } else cctx.drawImage(video, ox, oy, dw, dh);
      cctx.restore();
      cctx.fillStyle = 'rgba(0,0,0,0.35)'; cctx.fillRect(0, 0, W, H);
    }
    for (const c of layers()) { try { cctx.drawImage(c, 0, 0, W, H); } catch {} }
    // minimal HUD stamp (DOM HUD is not rasterised)
    cctx.save(); cctx.font = '12px monospace'; cctx.fillStyle = '#00e5ff'; cctx.globalAlpha = 0.8;
    cctx.fillText(`HOLO-INTERFACE · ${document.getElementById('g-model')?.textContent || ''} · ${new Date().toLocaleTimeString()}`, 18, H - 16); cctx.restore();
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  function screenshot() {
    drawFrame(); sound.confirm(); hud.alert('📸 FRAME CAPTURED');
    document.body.classList.add('flash'); setTimeout(() => document.body.classList.remove('flash'), 180);
    comp.toBlob((b) => download(b, `holo-${Date.now()}.png`), 'image/png');
  }
  function start() {
    if (recorder) return;
    drawFrame(); stream = comp.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined); chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { download(new Blob(chunks, { type: 'video/webm' }), `holo-${Date.now()}.webm`); recorder = null; stream = null; statusEl.classList.add('hidden'); };
    recorder.start(250); startedAt = performance.now(); sound.confirm(); statusEl.classList.remove('hidden');
    (function loop() { if (!recorder) return; drawFrame(); const s = Math.floor((performance.now() - startedAt) / 1000); statusEl.textContent = `● REC ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; raf = requestAnimationFrame(loop); })();
  }
  function stop() { if (!recorder) return; cancelAnimationFrame(raf); recorder.stop(); sound.close(); }
  return { screenshot, start, stop, toggle: () => (recorder ? stop() : start()), get recording() { return !!recorder; } };
}
