import { OneEuro2, dist } from './util.js';

// Landmark indices (MediaPipe hand)
const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_PIP = 6, INDEX_TIP = 8, MIDDLE_MCP = 9;
const FINGERS = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]]; // mcp, pip, tip

function fingerExtended(lm, [mcp, pip, tip]) {
  // Extended when tip is further from wrist than pip is, with margin.
  return dist(lm[tip], lm[WRIST]) > dist(lm[pip], lm[WRIST]) * 1.12;
}

function classifyRaw(lm) {
  const size = dist(lm[WRIST], lm[MIDDLE_MCP]) || 1e-3;
  const pinchD = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / size;
  const ext = FINGERS.map((f) => fingerExtended(lm, f));
  const extCount = ext.filter(Boolean).length;

  if (pinchD < 0.42) return 'pinch';
  if (ext[0] && !ext[1] && !ext[2] && !ext[3]) return 'point';
  if (extCount === 0) return 'fist';
  if (extCount >= 3) return 'open';
  return 'none';
}

// Tracks up to 2 hands; smooths key points and debounces gesture changes.
export class GestureEngine {
  constructor(toScreen) {
    this.toScreen = toScreen;
    this.slots = [0, 1].map(() => ({
      tipF: new OneEuro2(1.0, 0.015), pinchF: new OneEuro2(1.0, 0.015), palmF: new OneEuro2(0.8, 0.01),
      type: 'none', candidate: 'none', candidateFrames: 0,
    }));
  }

  // hands: [{landmarks,label}] in video coords. Returns array of hand states in screen px.
  update(hands, now) {
    const out = [];
    // Keep slot assignment stable: sort by wrist x so left-most hand is slot 0.
    const sorted = [...hands].sort((a, b) => b.landmarks[WRIST].x - a.landmarks[WRIST].x);
    for (let i = 0; i < 2; i++) {
      const slot = this.slots[i];
      const h = sorted[i];
      if (!h) {
        slot.tipF.reset(); slot.pinchF.reset(); slot.palmF.reset();
        slot.type = 'none'; slot.candidate = 'none'; slot.candidateFrames = 0;
        continue;
      }
      const lm = h.landmarks;
      const raw = classifyRaw(lm);
      // Debounce: switch only after 3 consistent frames (pinch/fist release is instant-ish).
      if (raw === slot.candidate) slot.candidateFrames++;
      else { slot.candidate = raw; slot.candidateFrames = 1; }
      const need = raw === 'none' ? 2 : 3;
      if (slot.candidateFrames >= need) slot.type = raw;

      const tipS = this.toScreen(lm[INDEX_TIP].x, lm[INDEX_TIP].y);
      const pinchMid = { x: (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2, y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2 };
      const pinchS = this.toScreen(pinchMid.x, pinchMid.y);
      const palmS = this.toScreen(lm[MIDDLE_MCP].x, lm[MIDDLE_MCP].y);

      out.push({
        slot: i,
        label: h.label,
        type: slot.type,
        tip: slot.tipF.filter(tipS, now),
        pinch: slot.pinchF.filter(pinchS, now),
        palm: slot.palmF.filter(palmS, now),
        points: lm.map((p) => this.toScreen(p.x, p.y)), // raw, for drawing
      });
    }
    return out;
  }
}

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
