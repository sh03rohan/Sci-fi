// Quality tiers + adaptive controller. Everything expensive reads from Q.
export const Q = {
  tier: 'auto', level: 2,              // 0 low · 1 medium · 2 high
  pixelRatio: 1.25, overlayDpr: 1, trackW: 384, faceEvery: 3, handEvery: 1,
  faceDetail: false, trails: true, minisPerFrame: 2, bloom: false, grain: false,
};
const TIERS = [
  { pixelRatio: 1.0, overlayDpr: 1, trackW: 320, faceEvery: 4, handEvery: 1, faceDetail: false, trails: false, minisPerFrame: 0, bloom: false, grain: false },
  { pixelRatio: 1.0, overlayDpr: 1, trackW: 384, faceEvery: 3, handEvery: 1, faceDetail: false, trails: false, minisPerFrame: 1, bloom: false, grain: false },
  { pixelRatio: Math.min(1.5, window.devicePixelRatio), overlayDpr: Math.min(1.5, window.devicePixelRatio), trackW: 512, faceEvery: 2, handEvery: 1, faceDetail: true, trails: true, minisPerFrame: 3, bloom: true, grain: true },
];
const listeners = [];
export function setLevel(n) { n = Math.max(0, Math.min(2, n)); Object.assign(Q, TIERS[n], { level: n }); for (const f of listeners) f(Q); }
export function onQuality(fn) { listeners.push(fn); }
export function setTier(t) { Q.tier = t; if (t !== 'auto') setLevel({ low: 0, medium: 1, high: 2 }[t]); else setLevel(0); }

// Adaptive: watch smoothed FPS, step down fast and up slowly.
let acc = 0, n = 0, last = performance.now(), lowStreak = 0, highStreak = 0, lastChange = 0;
export function tick() {
  const now = performance.now(); acc += now - last; n++; last = now;
  if (acc < 1000) return;
  const fps = 1000 / (acc / n); acc = 0; n = 0;
  Q.fps = fps;
  if (Q.tier !== 'auto') return;
  if (fps < 30) { lowStreak++; highStreak = 0; } else if (fps > 55) { highStreak++; lowStreak = 0; } else { lowStreak = 0; highStreak = 0; }
  if (lowStreak >= 2 && Q.level > 0 && now - lastChange > 3000) { setLevel(Q.level - 1); lastChange = now; lowStreak = 0; }
  if (highStreak >= 8 && Q.level < 2 && now - lastChange > 8000) { setLevel(Q.level + 1); lastChange = now; highStreak = 0; }
}
setLevel(0);
