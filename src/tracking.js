import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { Q } from './quality.js';

const BASE = import.meta.env.BASE_URL;
const abs = (p) => new URL(BASE + p, location.href).href;

// Linear interpolation of landmark arrays, used to smooth between worker results.
function lerpLm(a, b, k) {
  if (!a || !b || a.length !== b.length) return b;
  const out = new Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = { x: a[i].x + (b[i].x - a[i].x) * k, y: a[i].y + (b[i].y - a[i].y) * k, z: b[i].z };
  return out;
}

/* ---------------- worker-backed tracker (preferred) ---------------- */
async function createWorkerTracker(onLog, opts) {
  const worker = new Worker(abs('tracker-worker.js')); // classic worker (MediaPipe needs importScripts)
  let prev = null, cur = null, inflight = false, lastSent = -1, lastCost = 0, sendAt = 0;
  const ready = new Promise((res, rej) => {
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'log') onLog(d.msg);
      else if (d.type === 'ready') res();
      else if (d.type === 'error') { if (!cur) rej(new Error(d.msg)); else console.warn('tracker:', d.msg); inflight = false; }
      else if (d.type === 'drop') inflight = false;
      else if (d.type === 'result') { inflight = false; lastCost = d.cost; prev = cur; cur = { ...d, at: performance.now() }; }
    };
    worker.onerror = (e) => rej(new Error(e.message || 'worker failed'));
  });
  worker.postMessage({ type: 'init', bundle: abs('wasm/mp_vision.js'), wasm: abs('wasm'), handModel: abs('models/hand_landmarker.task'), faceModel: abs('models/face_landmarker.task'), multiUser: !!opts.multiUser });
  await ready;
  onLog('tracking running on a worker thread', 'ok');

  let lastFaceEvery = 0;
  return {
    worker: true,
    detect(video) {
      const now = performance.now();
      if (Q.faceEvery !== lastFaceEvery) { lastFaceEvery = Q.faceEvery; worker.postMessage({ type: 'config', faceEvery: Q.faceEvery }); }
      // Send a new (downscaled) frame when the worker is free, at most ~30 Hz.
      if (!inflight && video.readyState >= 2 && video.currentTime !== lastSent && now - sendAt > 30) {
        inflight = true; lastSent = video.currentTime; sendAt = now;
        const w = Q.trackW, h = Math.max(1, Math.round(w * video.videoHeight / video.videoWidth));
        createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' })
          .then((bmp) => worker.postMessage({ type: 'frame', bitmap: bmp, ts: now }, [bmp]))
          .catch(() => { inflight = false; });
      }
      if (!cur) return null;
      // Interpolate towards the latest result so the overlay moves smoothly between detections.
      let hands = cur.hands, faces = cur.faces;
      if (prev && cur.at > prev.at) {
        const k = Math.min(1, (now - cur.at) / (cur.at - prev.at));
        hands = cur.hands.map((h, i) => { const p = prev.hands.find((q) => q.label === h.label) || prev.hands[i]; return p ? { ...h, landmarks: lerpLm(p.landmarks, h.landmarks, k) } : h; });
        faces = cur.faces.map((f, i) => lerpLm(prev.faces[i], f, k));
      }
      return { hands, face: faces[0] || null, faces, cost: lastCost };
    },
    get cost() { return lastCost; },
  };
}

/* ---------------- main-thread fallback ---------------- */
async function createInlineTracker(onLog, { multiUser = false } = {}) {
  onLog('loading vision runtime…');
  const vision = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  onLog('loading hand landmarker…');
  const hand = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: multiUser ? 4 : 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5,
  });
  onLog('loading face landmarker…');
  const face = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${BASE}models/face_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO', numFaces: multiUser ? 2 : 1, outputFaceBlendshapes: false,
  });
  let lastVideoTime = -1, frame = 0, faceResult = null, faces = [], hands = [], lastCost = 0;
  const small = document.createElement('canvas'); const sctx = small.getContext('2d');
  return {
    worker: false,
    detect(video) {
      const now = performance.now();
      if (video.currentTime === lastVideoTime) return null;
      lastVideoTime = video.currentTime; frame++;
      const t0 = performance.now();
      const tw = Q.trackW, th = Math.round(tw * (video.videoHeight / video.videoWidth)) || Math.round(tw * 9 / 16);
      if (small.width !== tw || small.height !== th) { small.width = tw; small.height = th; }
      sctx.drawImage(video, 0, 0, tw, th);
      const handEvery = lastCost > 22 ? Math.max(2, Q.handEvery) : Q.handEvery;
      if (frame % handEvery === 0) {
        const h = hand.detectForVideo(small, now);
        hands = (h.landmarks || []).map((lm, i) => ({ landmarks: lm, label: h.handedness?.[i]?.[0]?.categoryName || 'Unknown' }));
      }
      if (frame % Q.faceEvery === 0) {
        const f = face.detectForVideo(small, now);
        const size = (lm) => Math.abs(lm[454].x - lm[234].x);
        faces = [...(f.faceLandmarks || [])].sort((a, b) => size(b) - size(a));
        faceResult = faces[0] || null;
      }
      lastCost = performance.now() - t0;
      return { hands, face: faceResult, faces, cost: lastCost };
    },
    get cost() { return lastCost; },
  };
}

export async function createTracker(onLog = () => {}, opts = {}) {
  const canWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
  if (canWorker) {
    try { return await createWorkerTracker(onLog, opts); }
    catch (e) { console.warn('worker tracker failed, falling back:', e); onLog(`worker tracking unavailable (${(e.message || '').slice(0, 50)}) · using main thread`, 'err'); }
  }
  return createInlineTracker(onLog, opts);
}
