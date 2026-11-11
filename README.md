# HOLO-INTERFACE

Gesture-driven holographic console in the browser. Your webcam feed sits in the
background, a holographic model floats in front of you, and you control it with
your hands. A model library on the left holds ten live wireframe models
(planet, arcology city, vehicle, galaxy, DNA helix, beating heart, fighter jet,
space station, gold atom, skeletal bioframe) plus any .glb you drop in; point
at one to load it on the main stage. All tracking runs on your device; nothing
is uploaded (the optional LIVE layer fetches public ISS / USGS feeds).

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
| ✊ Fist and move | Grab and move the hologram |
| 🖐 Open palm, quick swipe left/right | Previous / next model |
| 🖐 Open palm, hold still 1.2 s | Reset view |
| 🖐🖐 Two open palms, move apart / together | Explode / reassemble the model |
| 🖐🖐 Two open palms, twist | Roll (Z rotation) |
| ✌️ Two fingers, move up / down | Slice plane (cross-section) at hand height |
| ☝️ Point in DRAW mode (TOOLS panel) | Annotate the surface |
| 🙂 Move your head | Parallax |

Keyboard: `1–5` models, `←/→` previous/next, `E` explode, `S` slice (`↑/↓` height),
`Q/W` roll, `Esc` reset, `V` voice. Mouse: drag rotate, shift-drag move, wheel zoom,
alt-wheel explode.

## Content tools

- **⬆ LOAD .GLB** (or drag a .glb/.gltf onto the page): the mesh is converted to
  a glowing wireframe, auto-tagged with a few nodes and added to the library.
- **◉ LIVE** (globe): tracks the ISS in real time (wheretheiss.at) and plots
  the last 24 h of M2.5+ earthquakes (USGS) as touchable nodes with real data.
- **⏱ TIME**: a timeline scrubber (slider, `[`/`]`, or pinch-drag left/right in
  TIME mode). Each model reacts: heart rate, jet thrust, station spin, electron
  energy, city day/night, car speed, galaxy age, DNA unzipping, globe traffic.

## System

- **📸 SNAP** (`P`) saves a PNG of the composited camera + hologram + tracking
  layers; **● REC** (`R`) records a WebM until pressed again.
- **⚠ ALERT** (`A`, or “red alert”): an incoming-signal event turns the HUD red,
  marks one node hostile and times you until you point-and-hold it. Random
  alerts can be enabled in settings.
- **⚙ SETTINGS** (`,`): dwell time, rotation sensitivity, swipe threshold,
  grain, voice volume, HUD scale, render quality, mirror, trails, hints;
  saved in the browser.
- **Multi-user:** up to two faces and four hands. The largest face is
  OPERATOR-01 (ID card, biometrics); a second face is tagged as a guest and
  its hands are coloured differently.
- **Mobile:** touch controls (drag rotate, pinch zoom, tap to scan), a compact
  layout, and 🔄 CAMERA (`K`) to switch between front and rear cameras.

## Visual FX

✦ FX (key `F`) toggles bloom glow, film grain, vignette and random hologram
glitches; panel text scrambles into place. ◐ THEME (key `C`, or “theme amber”)
cycles CYAN / AMBER / MATRIX / ALERT / ICE across the HUD and the 3D models.
✋ OCCLUDE (key `O`) loads a selfie-segmentation model: bring a hand close to
the camera and it is composited over the hologram, so it passes in front.
Finger trails and pinch sparks are drawn on the tracking layer.

## Face & eyes

An operator ID card locks onto your face (IDENTIFYING… → AUTHENTICATED) and a
gaze reticle estimates where you look from the irises. `G` / the ◎ GAZE tool
makes the reticle the pointer when no hand is visible. Double-blink selects at
the current cursor, holding your mouth open fires an alert, raising your
eyebrows zooms in a step.

## Voice

Press `V` or the 🎤 VOICE tool (Chrome/Edge). Commands: “open galaxy”, “show the
car”, “next model”, “scan Tokyo”, “scan the sensor dome” (switches model if
needed), “zoom in/out”, “explode” / “assemble”, “slice” / “heal”, “draw” /
“clear”, “stop spinning”, “reset”, “status”, “help”, “mute”. The system
answers aloud with speech synthesis and reads out any node you open.

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

## Performance

Hand/face tracking runs in a Web Worker (`public/tracker-worker.js`) on a
downscaled frame, so the render loop never waits for MediaPipe; results are
interpolated between detections. An adaptive quality controller (settings →
QUALITY, default AUTO) watches the frame rate and steps render resolution,
face-mesh detail, bloom/grain, trails and library-preview rate up or down.
The settings panel shows live timings (fps · tracking · 3D · HUD · library).
If it still feels slow: set QUALITY to LOW, turn off FX, close other tabs
using the GPU, and make sure the browser has hardware acceleration enabled.

## Stack

- [Three.js](https://threejs.org) — hologram rendering
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) — hand + face landmarks
- [Vite](https://vitejs.dev) — dev server and bundler
