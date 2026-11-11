// Classic (non-module) worker so MediaPipe can importScripts() its wasm loader.
// Runs hand + face landmarkers off the main thread; main posts downscaled ImageBitmaps.
self.exports = {}; self.module = { exports: self.exports };
let MP = null, hand = null, face = null, faceEvery = 3, frame = 0, faces = [], busy = false;

async function create(vision, Cls, opts) {
  try { return await Cls.createFromOptions(vision, Object.assign({}, opts, { baseOptions: Object.assign({}, opts.baseOptions, { delegate: 'GPU' }) })); }
  catch (e) {
    postMessage({ type: 'log', msg: 'worker GPU delegate unavailable (' + String(e && e.message || e).slice(0, 40) + '), using CPU' });
    return Cls.createFromOptions(vision, Object.assign({}, opts, { baseOptions: Object.assign({}, opts.baseOptions, { delegate: 'CPU' }) }));
  }
}

self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try {
      importScripts(d.bundle); MP = self.exports;
      const vision = await MP.FilesetResolver.forVisionTasks(d.wasm);
      postMessage({ type: 'log', msg: 'loading hand landmarker…' });
      hand = await create(vision, MP.HandLandmarker, { baseOptions: { modelAssetPath: d.handModel }, runningMode: 'VIDEO', numHands: d.multiUser ? 4 : 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 });
      postMessage({ type: 'log', msg: 'loading face landmarker…' });
      face = await create(vision, MP.FaceLandmarker, { baseOptions: { modelAssetPath: d.faceModel }, runningMode: 'VIDEO', numFaces: d.multiUser ? 2 : 1, outputFaceBlendshapes: false });
      postMessage({ type: 'ready' });
    } catch (err) { postMessage({ type: 'error', msg: String(err && err.message || err) }); }
    return;
  }
  if (d.type === 'config') { faceEvery = d.faceEvery || faceEvery; return; }
  if (d.type === 'frame') {
    const bmp = d.bitmap;
    if (!hand || busy) { bmp.close(); postMessage({ type: 'drop' }); return; }
    busy = true; frame++;
    const t0 = performance.now();
    try {
      const h = hand.detectForVideo(bmp, d.ts);
      const hands = (h.landmarks || []).map((lm, i) => ({ landmarks: lm, label: (h.handedness && h.handedness[i] && h.handedness[i][0] && h.handedness[i][0].categoryName) || 'Unknown' }));
      if (frame % faceEvery === 0) {
        const f = face.detectForVideo(bmp, d.ts);
        const size = (lm) => Math.abs(lm[454].x - lm[234].x);
        faces = (f.faceLandmarks || []).slice().sort((a, b) => size(b) - size(a));
      }
      postMessage({ type: 'result', hands, faces, ts: d.ts, cost: performance.now() - t0 });
    } catch (err) { postMessage({ type: 'error', msg: String(err && err.message || err) }); }
    finally { bmp.close(); busy = false; }
  }
};
