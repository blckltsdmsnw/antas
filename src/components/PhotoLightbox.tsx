"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCopy } from "@/lib/i18n/context";
import {
  clampOffset,
  clampScale,
  distance,
  pinchScale,
  MIN_SCALE,
  type Point,
} from "@/lib/photo/zoom";

interface PhotoLightboxProps {
  src: string;
  alt: string;
  /** Shown under the image - depth and time, so context survives the zoom. */
  caption?: string;
  onClose: () => void;
}

/** How far past 1x a double-tap jumps. Enough to read a kerb or a doorway. */
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Full-screen photo with pinch, double-tap and drag.
 *
 * A flood photo at 46dvh on a five-inch screen is not enough to judge depth
 * against a kerb or a parked car, which is the entire reason the photo is there.
 */
export function PhotoLightbox({ src, alt, caption, onClose }: PhotoLightboxProps) {
  const copy = useCopy();
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const surface = useRef<HTMLDivElement>(null);

  // document does not exist during server rendering, so the portal can only be
  // created after the first client render.
  useEffect(() => setMounted(true), []);

  /** Live pointers, keyed by id, so pinch and drag share one event path. */
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ startDistance: number; startScale: number } | null>(null);
  const dragFrom = useRef<{ pointer: Point; offset: Point } | null>(null);

  const viewport = () => ({
    width: surface.current?.clientWidth ?? window.innerWidth,
    height: surface.current?.clientHeight ?? window.innerHeight,
  });

  const reset = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Escape closes. A full-screen overlay with no keyboard exit is a trap for
  // anyone not using touch.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The map behind must not scroll or pan while this is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function onPointerDown(event: React.PointerEvent) {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = [...pointers.current.values()];
    if (points.length === 2) {
      gesture.current = {
        startDistance: distance(points[0], points[1]),
        startScale: scale,
      };
      dragFrom.current = null;
    } else if (points.length === 1 && scale > MIN_SCALE) {
      dragFrom.current = { pointer: points[0], offset };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = [...pointers.current.values()];

    if (points.length === 2 && gesture.current) {
      const next = pinchScale(
        gesture.current.startScale,
        gesture.current.startDistance,
        distance(points[0], points[1]),
      );
      setScale(next);
      setOffset((current) => clampOffset(current, next, viewport()));
      return;
    }

    if (points.length === 1 && dragFrom.current) {
      const { pointer, offset: from } = dragFrom.current;
      setOffset(
        clampOffset(
          {
            x: from.x + (points[0].x - pointer.x),
            y: from.y + (points[0].y - pointer.y),
          },
          scale,
          viewport(),
        ),
      );
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) dragFrom.current = null;
  }

  /** Double-tap toggles between fitted and zoomed. */
  function onDoubleClick() {
    if (scale > MIN_SCALE) {
      reset();
      return;
    }
    setScale(DOUBLE_TAP_SCALE);
  }

  function onWheel(event: React.WheelEvent) {
    const next = clampScale(scale - event.deltaY * 0.002);
    setScale(next);
    setOffset((current) => clampOffset(current, next, viewport()));
  }

  if (!mounted) return null;

  /**
   * Portalled to the body deliberately.
   *
   * Rendered in place, this sits inside `.detail-sheet`, which is positioned
   * with a z-index and therefore opens its own stacking context - so the
   * overlay's z-index only competes with the sheet's siblings, and the header
   * (z-index 20, in the root context) painted straight over the top of it.
   * Raising the number here would not have helped; escaping the context does.
   */
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt}>
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label={copy.screens.closePhoto}
      >
        &times;
      </button>

      <div
        ref={surface}
        className="lightbox-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      >
        <img
          className="lightbox-image"
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > MIN_SCALE ? "grab" : "zoom-in",
          }}
        />
      </div>

      <p className="lightbox-caption">
        {caption}
        <span className="lightbox-hint">
          {scale > MIN_SCALE
            ? "I-drag para igalaw · i-double tap para bumalik"
            : "I-double tap o mag-pinch para mag-zoom"}
        </span>
      </p>
    </div>,
    document.body,
  );
}
