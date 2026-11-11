# HOLO-INTERFACE

Gesture-driven holographic console in the browser. Your webcam feed sits in the
background, a wireframe globe floats in front of you, and you control it with
your hands. All tracking runs on your device; nothing is uploaded.

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
| ☝️ Index finger pointing, hold 0.8 s on the globe | Touch: ripple + info panel |
| 🤏 Pinch (thumb + index) and drag | Rotate the globe (with inertia) |
| 🤏🤏 Pinch with both hands, move apart / together | Zoom |
| ✊ Fist, hold 0.5 s | Reset view, close panel |
| 🙂 Move your head | Parallax |

Mouse fallback: drag to rotate, wheel to zoom, click to touch, Esc to reset.

## Edit the data

`public/data/hotspots.json` holds every node on the globe (lat/lon, title,
rows shown in the panel). Edit it and reload.

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
