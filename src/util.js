// One-Euro filter: smooths jittery tracking points without adding much lag.
export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = 0; this.t = null;
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max((t - this.t) / 1000, 1e-3); this.t = t;
    const dxRaw = (v - this.x) / dt;
    const aD = OneEuro.alpha(this.dCutoff, dt);
    this.dx = aD * dxRaw + (1 - aD) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cutoff, dt);
    this.x = a * v + (1 - a) * this.x;
    return this.x;
  }
  reset() { this.x = null; this.dx = 0; this.t = null; }
}

export class OneEuro2 {
  constructor(...args) { this.fx = new OneEuro(...args); this.fy = new OneEuro(...args); }
  filter(p, t) { return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) }; }
  reset() { this.fx.reset(); this.fy.reset(); }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Maps video-normalized coords (0..1, un-mirrored) to screen pixels,
// matching a mirrored <video> with object-fit: cover.
export function makeVideoMapper(video) {
  return function toScreen(u, v) {
    const W = window.innerWidth, H = window.innerHeight;
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const va = vw / vh, sa = W / H;
    let sw, sh, ox, oy;
    if (sa > va) { sw = W; sh = W / va; ox = 0; oy = (H - sh) / 2; }
    else { sh = H; sw = H * va; oy = 0; ox = (W - sw) / 2; }
    return { x: ox + (1 - u) * sw, y: oy + v * sh };
  };
}
