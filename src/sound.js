// Tiny synthesized UI sounds (no audio files).
export function createSound() {
  let ctx = null;
  const ensure = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };

  function tone(freq, dur, type = 'sine', gain = 0.08, slide = 0) {
    try {
      const c = ensure(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    } catch { /* audio blocked; ignore */ }
  }
  return {
    unlock: ensure,
    tick: () => tone(1400, 0.05, 'square', 0.03),
    hover: () => tone(900, 0.08, 'sine', 0.05, 300),
    confirm: () => { tone(620, 0.12, 'triangle', 0.09, 500); setTimeout(() => tone(1240, 0.18, 'sine', 0.07), 90); },
    close: () => tone(500, 0.15, 'sawtooth', 0.04, -250),
    boot: () => tone(220, 0.5, 'sine', 0.06, 660),
  };
}
