"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

/**
 * Camera QR scanner — decodes a bodycam's on-screen registration QR from a live video
 * frame and hands the payload back to the registry. Pure client-side (getUserMedia + jsQR);
 * requires a secure context (https or localhost).
 */
export function DeviceQrScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const v = videoRef.current;
      if (cancelled || !v || !ctx) return;
      if (v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
        if (result?.data) {
          onDetectedRef.current(result.data);
          return; // stop the loop on first detection
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("no camera api");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        raf = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setError("Camera unavailable or permission denied. Paste the code instead.");
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="dev-scanner" role="dialog" aria-label="Scan device QR">
      <div className="dev-scanner__panel">
        <div className="dev-scanner__head">
          <strong>Scan bodycam QR</strong>
          <button type="button" className="dev-scanner__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {error ? (
          <p className="dev-scanner__error">{error}</p>
        ) : (
          <div className="dev-scanner__viewport">
            <video ref={videoRef} className="dev-scanner__video" muted playsInline />
            <span className="dev-scanner__reticle" aria-hidden />
          </div>
        )}
        <p className="dev-scanner__hint">Point the camera at the device&apos;s registration QR.</p>
      </div>
    </div>
  );
}
