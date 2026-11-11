# HOLO-INTERFACE

Gesture-driven holographic console in the browser. Your webcam feed sits in the
background, a holographic model floats in front of you, and you control it with
your hands. A model library on the left holds five live wireframe models
(planet, arcology city, vehicle schematic, galaxy, DNA helix); point at one to
load it on the main stage. All tracking runs on your device; nothing is uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173) in Chrome or Edge and
click **START SYSTEM**. Allow camera access when asked.

## Gestures

| Gesture | Action |
|---|---|
| ☝️ Index finger pointing, hold 0.8 s on the model | Touch: ripple + info panel |
| ☝️ Point and hold 0.8 s on a library slot | Load that model |
| 🤏 Pinch (thumb + index) and drag | Rotate the globe (with inertia) |
| 🤏🤏 Pinch with both hands, move apart / together | Zoom |
| ✊ Fist, hold 0.5 s | Reset view, close panel |
| 🙂 Move your head | Parallax |

Mouse fallback: drag to rotate, wheel to zoom, click to touch, click a library slot (or keys 1–5) to switch model, Esc to reset.

## Edit the data

`public/data/models.json` holds every model's info nodes (lat/lon for the
globe, local `pos` for the others, title, rows shown in the panel). Edit it and
reload. The model geometry itself is procedural, in `src/models.js`; add a new
builder there and a matching entry in the JSON to add a model to the library.

## Tracking overlay

Face: full mesh contours (oval, eyes, brows, lips), iris reticles, eye-open and
mouth-open meters, head yaw/pitch, blink counter. Hands: 21-point skeleton with
fingertip labels, pinch meter, gesture label. Readouts live in the BIOMETRICS
panel on the right.

## Build / deploy

```bash
npm run build
```

Upload the `dist/` folder to any static host (Netlify, Vercel, GitHub Pages).
The site must be served over HTTPS (or localhost) or the browser will not
allow camera access. The MediaPipe runtime and models are bundled in
`public/wasm` and `public/models`, so no CDN is needed at runtime.

## Stack

- [Three.js](https://threejs.org) — hologram rendering
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) — hand + face landmarks
- [Vite](https://vitejs.dev) — dev server and bundler
