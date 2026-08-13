"use client";

import { useEffect, useRef, useState } from "react";

interface LiveCameraProps {
  onCapture: (file: File) => void;
}

export function LiveCamera({ onCapture }: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setDenied(true);
      }
    }

    void open();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], "sos.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85,
    );
  }

  if (denied) {
    return (
      <div>
        <p className="alert" role="alert">
          Kailangan ng camera para makapagpadala ng SOS. Buksan ang camera
          permission, o kumuha ng larawan gamit ang camera ng telepono.
        </p>
        <input
          className="field-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onCapture(file);
          }}
        />
      </div>
    );
  }

  return (
    <div className="camera">
      <video ref={videoRef} className="camera-view" playsInline muted />
      <button
        type="button"
        className="btn"
        onClick={capture}
        disabled={!ready}
        style={{ marginTop: 12 }}
      >
        {ready ? "Kumuha ng larawan" : "Binubuksan ang camera..."}
      </button>
    </div>
  );
}
