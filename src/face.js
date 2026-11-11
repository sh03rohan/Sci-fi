// Face metrics + events derived from MediaPipe face landmarks (478 pts):
// eye openness, mouth, head yaw/pitch, gaze estimate, double-blink / mouth-open / brow-raise events.
import { OneEuro2, clamp, dist } from './util.js';

const L = { eyeTop: 159, eyeBot: 145, eyeOut: 33, eyeIn: 133, iris: 468, brow: 105 };
const R = { eyeTop: 386, eyeBot: 374, eyeOut: 263, eyeIn: 362, iris: 473, brow: 334 };

export function createFaceState() {
  const gazeF = new OneEuro2(0.9, 0.01);
  let eyesClosed = false, lastBlinkUp = 0, blinkCount = 0;
  let mouthSince = 0, mouthFired = false;
  let browBase = null, browRaised = false, browSince = 0;
  let lockedSince = 0;

  function update(face, toScreen, now) {
    const events = [];
    if (!face) { eyesClosed = false; lockedSince = 0; return { present: false, events }; }
    if (!lockedSince) lockedSince = now;
    const S = (i) => toScreen(face[i].x, face[i].y);
    const faceH = dist(S(10), S(152)) || 1;

    const ear = (e) => dist(S(e.eyeTop), S(e.eyeBot)) / (dist(S(e.eyeOut), S(e.eyeIn)) || 1);
    const eyeL = clamp((ear(L) - 0.08) / 0.25, 0, 1);
    const eyeR = clamp((ear(R) - 0.08) / 0.25, 0, 1);
    const mouth = clamp((dist(S(13), S(14)) / (dist(S(61), S(291)) || 1) - 0.02) / 0.6, 0, 1);
    const yaw = clamp(((face[1].x - face[234].x) / ((face[454].x - face[234].x) || 1e-3) - 0.5) * -2, -1, 1);
    const pitch = clamp(((face[1].y - face[10].y) / ((face[152].y - face[10].y) || 1e-3) - 0.55) * -3, -1, 1);

    // gaze: iris position inside the eye box (0..1), both eyes averaged, plus head pose
    const gazeEye = (e) => {
      if (!face[e.iris]) return null;
      const a = S(e.eyeOut), b = S(e.eyeIn), ir = S(e.iris);
      const w = dist(a, b) || 1;
      const t = ((ir.x - a.x) * (b.x - a.x) + (ir.y - a.y) * (b.y - a.y)) / (w * w); // projection along the eye axis
      const v = (ir.y - (S(e.eyeTop).y + S(e.eyeBot).y) / 2) / (dist(S(e.eyeTop), S(e.eyeBot)) || 1);
      return { t: e === L ? t : 1 - t, v }; // t: 0 = toward nose side? normalised below
    };
    const gl = gazeEye(L), gr = gazeEye(R);
    let gaze = null;
    if (gl && gr) {
      // On the mirrored screen, iris toward the user's nose for the left eye means looking right.
      const hx = ((gl.t + gr.t) / 2 - 0.5) * 2;      // -1..1 horizontal
      const vy = ((gl.v + gr.v) / 2) * 2;            // -1..1 vertical
      const nose = S(1);
      const raw = {
        x: clamp(nose.x + (-hx * 1.6 - yaw * 0.9) * window.innerWidth * 0.45, 0, window.innerWidth),
        y: clamp(nose.y + (vy * 1.4 - pitch * 0.6) * window.innerHeight * 0.45, 0, window.innerHeight),
      };
      gaze = gazeF.filter(raw, now);
    }

    // --- events ---
    const closed = eyeL < 0.25 && eyeR < 0.25;
    if (closed && !eyesClosed) eyesClosed = true;
    else if (!closed && eyesClosed) {
      eyesClosed = false; blinkCount++;
      if (now - lastBlinkUp < 650) { events.push('doubleBlink'); lastBlinkUp = 0; } else lastBlinkUp = now;
    }
    if (mouth > 0.55) { if (!mouthSince) mouthSince = now; if (!mouthFired && now - mouthSince > 500) { mouthFired = true; events.push('mouthOpen'); } }
    else { mouthSince = 0; mouthFired = false; }

    const browD = ((dist(S(L.brow), S(L.eyeTop)) + dist(S(R.brow), S(R.eyeTop))) / 2) / faceH;
    if (browBase === null) browBase = browD;
    const raised = browD > browBase * 1.22;
    if (!raised) { browBase = browBase * 0.98 + browD * 0.02; browRaised = false; browSince = 0; }
    else { if (!browSince) browSince = now; if (!browRaised && now - browSince > 250) { browRaised = true; events.push('browRaise'); } }

    return { present: true, eyeL, eyeR, mouth, yaw, pitch, gaze, browRaise: raised, blinkCount, lockedMs: now - lockedSince, events };
  }
  return { update };
}
