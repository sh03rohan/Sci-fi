import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

// Loads MediaPipe hand + face landmarkers from local assets (no CDN at runtime).
export async function createTracker(onLog = () => {}) {
  onLog('loading vision runtime…');
  const vision = await FilesetResolver.forVisionTasks(`${BASE}wasm`);

  onLog('loading hand landmarker…');
  const hand = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 4,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });

  onLog('loading face landmarker…');
  const face = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${BASE}models/face_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 2,
    outputFaceBlendshapes: false,
  });

  let lastVideoTime = -1;
  let frame = 0;
  let faceResult = null, faces = [];

  return {
    // Returns { hands: [{landmarks, label}], face: landmarks|null } in video-normalized coords.
    detect(video) {
      const now = performance.now();
      if (video.currentTime === lastVideoTime) return null;
      lastVideoTime = video.currentTime;
      frame++;

      const h = hand.detectForVideo(video, now);
      const hands = (h.landmarks || []).map((lm, i) => ({
        landmarks: lm,
        label: h.handedness?.[i]?.[0]?.categoryName || 'Unknown',
      }));

      // Face every other frame: it is heavier and only drives parallax + a frame.
      if (frame % 2 === 0) {
        const f = face.detectForVideo(video, now);
        faces = f.faceLandmarks || [];
        // primary operator = largest face
        const size = (lm) => Math.abs(lm[454].x - lm[234].x);
        faces = [...faces].sort((a, b) => size(b) - size(a));
        faceResult = faces[0] || null;
      }
      return { hands, face: faceResult, faces };
    },
  };
}
