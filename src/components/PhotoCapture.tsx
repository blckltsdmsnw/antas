"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PhotoCaptureProps {
  /** Fired once the photo is confirmed, never on the shutter itself. */
  onCapture: (file: File) => void;
  /** Headline on the resting card, before any permission is requested. */
  prompt: string;
  /** Second line - used for the public-visibility notice on depth reports. */
  note?: string;
  /** Label on the resting card's button. */
  openLabel?: string;
  /** Offered on the resting card when a photo is genuinely optional. */
  onSkip?: () => void;
  skipLabel?: string;
  /**
   * "secondary" where the photo is optional and something else on the page is
   * the real action. Two full-width blue buttons stacked on one screen make
   * neither of them the primary one.
   */
  variant?: "primary" | "secondary";
}

type Stage = "resting" | "opening" | "live" | "preview" | "denied";

const JPEG_QUALITY = 0.85;

/**
 * Camera capture that asks first.
 *
 * The previous version called getUserMedia from a mount effect, so opening the
 * page threw a permission prompt and a live viewfinder at you before you had
 * agreed to anything. That is startling on a page you may have opened by
 * accident, it burns battery, and on a shared phone it puts a live camera on
 * screen with no warning. Nothing is requested here until a deliberate tap.
 *
 * The shutter does not commit either: a blurred frame of your own thumb is the
 * normal first attempt, so the photo goes to a preview and only reaches
 * `onCapture` once it is accepted.
 */
export function PhotoCapture({
  onCapture,
  prompt,
  note,
  openLabel = "Buksan ang camera",
  onSkip,
  skipLabel,
  variant = "primary",
}: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("resting");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

  const closeStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  /**
   * Attach the stream *after* the live stage has rendered.
   *
   * Doing this inline in `open()` - even deferred to a microtask - runs before
   * React commits the new stage, so `videoRef.current` is still null and the
   * assignment lands nowhere. The failure is silent and looks fine: the card
   * renders, the camera light comes on, and the viewfinder stays black while
   * the shutter quietly captures a zero-by-zero frame.
   */
  useEffect(() => {
    if (stage !== "live" || !stream || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = stream;

    // play() returns a Promise in browsers but `undefined` in jsdom, and can
    // reject outright under autoplay policy. Assuming a thenable here throws
    // inside the effect and takes the whole viewfinder down with it.
    try {
      const played: unknown = video.play();
      if (played instanceof Promise) played.catch(() => {});
    } catch {
      // Left paused. The shutter's zero-size guard already covers this.
    }
  }, [stage, stream]);

  // The camera indicator light staying on after you leave the page reads as
  // spyware, whatever the truth is. Release on unmount, always.
  useEffect(() => closeStream, [closeStream]);

  // Revoking on replacement rather than on every render: an object URL held by
  // an <img> that is still on screen must outlive the render that made it.
  useEffect(() => {
    const url = shot?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shot?.url]);

  async function open() {
    setStage("opening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setStream(stream);
      setStage("live");
    } catch {
      setStage("denied");
    }
  }

  function capture() {
    const video = videoRef.current;
    // A frame with no dimensions yields a blank JPEG. Better to do nothing
    // visible than to attach an empty photo to a real report.
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "antas.jpg", { type: "image/jpeg" });
        setShot({ file, url: URL.createObjectURL(file) });
        closeStream();
        setStage("preview");
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  if (stage === "denied") {
    return (
      <div className="capture-card">
        <p className="alert" role="alert">
          Hindi mabuksan ang camera. Payagan ang camera sa settings ng browser,
          o kumuha ng larawan gamit ang camera ng telepono.
        </p>
        <label className="capture-file">
          <span>Pumili ng larawan</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCapture(file);
            }}
          />
        </label>
      </div>
    );
  }

  if (stage === "preview" && shot) {
    return (
      <figure className="capture-card capture-card--shot">
        <img className="capture-shot" src={shot.url} alt="Ang larawang kinuha mo" />
        <figcaption className="capture-actions">
          <button type="button" className="btn" onClick={() => onCapture(shot.file)}>
            Gamitin ang larawang ito
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setShot(null);
              void open();
            }}
          >
            Kumuha ulit
          </button>
        </figcaption>
      </figure>
    );
  }

  if (stage === "live") {
    return (
      <div className="capture-card capture-card--live">
        <video ref={videoRef} className="capture-view" playsInline muted />
        <div className="capture-actions">
          <button
            type="button"
            className="shutter"
            onClick={capture}
            aria-label="Kumuha ng larawan"
          />
          <button
            type="button"
            className="quiet-link"
            onClick={() => {
              closeStream();
              setStage("resting");
            }}
          >
            Isara ang camera
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="capture-card capture-card--resting">
      <span className="capture-glyph" aria-hidden="true" />
      <p className="capture-prompt">{prompt}</p>
      {note && <p className="capture-note">{note}</p>}
      <button
        type="button"
        className={variant === "secondary" ? "btn btn-quiet" : "btn"}
        onClick={() => void open()}
        disabled={stage === "opening"}
      >
        {stage === "opening" ? "Binubuksan ang camera..." : openLabel}
      </button>
      {onSkip && (
        <button type="button" className="quiet-link" onClick={onSkip}>
          {skipLabel ?? "Laktawan"}
        </button>
      )}
    </div>
  );
}
