import { Show, createSignal, onCleanup, onMount } from "solid-js";
import jsQR from "jsqr";

type QrScannerModalProps = {
  readonly onDetected: (text: string) => void;
  readonly onClose: () => void;
};

export const QrScannerModal = (props: QrScannerModalProps) => {
  const [error, setError] = createSignal("");
  const [ready, setReady] = createSignal(false);
  let videoRef: HTMLVideoElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let stream: MediaStream | null = null;
  let rafId = 0;

  const stopStream = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
  };

  const scanFrame = () => {
    if (!videoRef || !canvasRef) return;
    if (videoRef.readyState < 2) {
      rafId = requestAnimationFrame(scanFrame);
      return;
    }
    const width = videoRef.videoWidth;
    const height = videoRef.videoHeight;
    if (width === 0 || height === 0) {
      rafId = requestAnimationFrame(scanFrame);
      return;
    }

    canvasRef.width = width;
    canvasRef.height = height;
    const ctx = canvasRef.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafId = requestAnimationFrame(scanFrame);
      return;
    }
    ctx.drawImage(videoRef, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const decoded = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    });

    if (decoded?.data) {
      stopStream();
      props.onDetected(decoded.data);
      return;
    }

    rafId = requestAnimationFrame(scanFrame);
  };

  onMount(() => {
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!videoRef) return;
        videoRef.srcObject = stream;
        await videoRef.play();
        setReady(true);
        rafId = requestAnimationFrame(scanFrame);
      } catch {
        setError("Camera access failed. Check permissions and try again.");
      }
    })();
  });

  onCleanup(() => {
    stopStream();
  });

  return (
    <div class="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div class="w-full max-w-md rounded-lg border border-tg-border bg-tg-sidebar p-3 space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold text-tg-text">Scan Join Code</h4>
          <button
            class="text-tg-text-dim hover:text-tg-text text-xl leading-none p-1 cursor-pointer"
            onClick={() => {
              stopStream();
              props.onClose();
            }}
          >
            &times;
          </button>
        </div>
        <Show when={!error()} fallback={<div class="text-xs text-tg-danger">{error()}</div>}>
          <div class="rounded border border-tg-border overflow-hidden bg-black">
            <video ref={videoRef} class="w-full h-auto block" playsinline muted />
          </div>
          <Show when={!ready()}>
            <div class="text-xs text-tg-text-dim">Starting camera...</div>
          </Show>
          <div class="text-[10px] text-tg-text-dim">Point your camera at the invite QR code.</div>
        </Show>
        <canvas ref={canvasRef} class="hidden" />
      </div>
    </div>
  );
};
