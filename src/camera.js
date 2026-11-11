// Starts the webcam and resolves once the video has real dimensions.
export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((res) => {
    if (video.readyState >= 2) return res();
    video.onloadeddata = () => res();
  });
  await video.play();
  return stream;
}
