"use client";

import React from "react";
import { ZoomIn, ZoomOut, Maximize, ImageOff } from "lucide-react";
import Button from "../../common/UI/Button/Button";
import { cn } from "../../common/UI/utils";

export interface ImageViewerProps {
  /** URL the image is loaded from. */
  src: string;
  /** Accessible description of the image. */
  alt: string;
  className?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.25;
const PAN_KEY_STEP = 40;

/**
 * Displays an image scaled to fit its container (preserving aspect ratio) with
 * zoom (in/out/reset) and panning of the zoomed image. Pure presentational
 * component — it takes a `src`/`alt` and owns no data-fetching.
 *
 * Panning works via pointer drag or arrow keys while zoomed, and a failed load
 * renders an error state instead of a broken-image element.
 */
export default function ImageViewer({
  src,
  alt,
  className = "",
}: ImageViewerProps): JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const dragOrigin = React.useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Reset the view whenever the source changes.
  React.useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setHasError(false);
  }, [src]);

  // Keeps the pan offset within bounds so the image can't be dragged fully out
  // of view. Approximates the pannable range as container size × (scale − 1).
  const clampOffset = React.useCallback(
    (next: { x: number; y: number }, atScale: number) => {
      const el = containerRef.current;
      if (!el) return next;
      const maxX = (el.clientWidth * (atScale - 1)) / 2;
      const maxY = (el.clientHeight * (atScale - 1)) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      };
    },
    [],
  );

  const applyScale = (nextScale: number): void => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    setScale(clamped);
    setOffset((prev) =>
      clamped === 1 ? { x: 0, y: 0 } : clampOffset(prev, clamped),
    );
  };

  const resetView = (): void => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>): void => {
    if (scale <= 1) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragOrigin.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>): void => {
    const origin = dragOrigin.current;
    if (!origin) return;
    setOffset(
      clampOffset(
        {
          x: origin.offsetX + (e.clientX - origin.pointerX),
          y: origin.offsetY + (e.clientY - origin.pointerY),
        },
        scale,
      ),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLImageElement>): void => {
    if (!dragOrigin.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragOrigin.current = null;
    setIsDragging(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLImageElement>): void => {
    if (scale <= 1) return;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = PAN_KEY_STEP;
    else if (e.key === "ArrowRight") dx = -PAN_KEY_STEP;
    else if (e.key === "ArrowUp") dy = PAN_KEY_STEP;
    else if (e.key === "ArrowDown") dy = -PAN_KEY_STEP;
    else return;
    e.preventDefault();
    setOffset((prev) => clampOffset({ x: prev.x + dx, y: prev.y + dy }, scale));
  };

  const isPristine = scale === 1 && offset.x === 0 && offset.y === 0;

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      <div
        role="toolbar"
        aria-label="Image controls"
        className="flex shrink-0 items-center gap-2 border-b-hairline border-gw-border px-4 py-2"
      >
        <Button
          variant="icon"
          onClick={() => applyScale(scale / ZOOM_STEP)}
          disabled={scale <= MIN_SCALE || hasError}
          aria-label="Zoom out"
        >
          <ZoomOut size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          onClick={() => applyScale(scale * ZOOM_STEP)}
          disabled={scale >= MAX_SCALE || hasError}
          aria-label="Zoom in"
        >
          <ZoomIn size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          onClick={resetView}
          disabled={isPristine || hasError}
          aria-label="Reset zoom"
        >
          <Maximize size={16} aria-hidden="true" />
        </Button>
        <span
          className="font-mono text-gw-nano uppercase tracking-label text-gw-secondary"
          aria-live="polite"
        >
          {Math.round(scale * 100)}%
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-gw-chrome2"
      >
        {hasError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-2 text-gw-secondary"
          >
            <ImageOff size={32} aria-hidden="true" />
            <p className="text-sm">Unable to load image.</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            tabIndex={0}
            draggable={false}
            onError={() => setHasError(true)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={handleKeyDown}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transition: isDragging ? "none" : "transform 120ms ease-out",
            }}
            className={cn(
              "max-h-full max-w-full select-none object-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-border",
              scale > 1 && (isDragging ? "cursor-grabbing" : "cursor-grab"),
            )}
          />
        )}
      </div>
    </div>
  );
}
