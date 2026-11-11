// Starts the webcam and resolves once the video has real dimensions.
export async function startCamera(video, facing = 'user') {
  if (video.srcObject) { for (const t of video.srcObject.getTracks()) t.stop(); video.srcObject = null; }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((res) => { video.onloadeddata = () => res(); if (video.readyState >= 2 && video.videoWidth) res(); });
  await video.play();
  return stream;
}
