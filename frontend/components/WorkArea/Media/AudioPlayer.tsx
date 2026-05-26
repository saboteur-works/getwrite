"use client";

import React from "react";
import { Play, Pause, AlertCircle } from "lucide-react";
import Button from "../../common/UI/Button/Button";
import Slider from "../../common/UI/Slider/Slider";
import { cn } from "../../common/UI/utils";

export interface AudioPlayerProps {
  /** URL the audio is loaded from. */
  src: string;
  /**
   * Known duration in seconds (e.g. from sidecar metadata). Shown before the
   * audio element reports its own duration via `loadedmetadata`.
   */
  durationSeconds?: number;
  className?: string;
}

/** Formats seconds as `m:ss` (or `h:mm:ss` past an hour). */
function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/**
 * Custom, brand-styled audio player with play/pause, a draggable scrub bar
 * (Radix Slider), and current-time / total-duration display. Pure
 * presentational component — it takes a `src` and owns no data-fetching.
 *
 * A failed load renders an error state instead of dead controls.
 */
export default function AudioPlayer({
  src,
  durationSeconds,
  className = "",
}: AudioPlayerProps): JSX.Element {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [loadedDuration, setLoadedDuration] = React.useState<number | null>(
    null,
  );
  // While the user drags the scrubber we show the dragged value instead of the
  // element's currentTime, then commit the seek on release.
  const [scrubValue, setScrubValue] = React.useState<number | null>(null);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setLoadedDuration(null);
    setScrubValue(null);
    setHasError(false);
  }, [src]);

  const duration =
    loadedDuration ??
    (durationSeconds != null && Number.isFinite(durationSeconds)
      ? durationSeconds
      : 0);
  const displayTime = scrubValue ?? currentTime;

  const togglePlay = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setHasError(true));
    } else {
      audio.pause();
    }
  };

  const handleSeekChange = (values: number[]): void => {
    setScrubValue(values[0]);
  };

  const handleSeekCommit = (values: number[]): void => {
    const audio = audioRef.current;
    const target = values[0];
    if (audio && Number.isFinite(target)) {
      audio.currentTime = target;
      setCurrentTime(target);
    }
    setScrubValue(null);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full items-center justify-center bg-gw-chrome2",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setLoadedDuration(d);
        }}
        onTimeUpdate={(e) => {
          if (scrubValue == null) setCurrentTime(e.currentTarget.currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setHasError(true)}
      />
      {hasError ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 text-gw-secondary"
        >
          <AlertCircle size={32} aria-hidden="true" />
          <p className="text-sm">Unable to load audio.</p>
        </div>
      ) : (
        <div className="flex w-full max-w-xl items-center gap-3 px-4">
          <Button
            variant="icon"
            onClick={togglePlay}
            disabled={duration === 0}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
          </Button>
          <span className="w-12 shrink-0 text-right font-mono text-gw-nano tabular-nums text-gw-secondary">
            {formatTime(displayTime)}
          </span>
          <Slider
            aria-label="Seek"
            min={0}
            max={duration || 1}
            step={0.1}
            value={[Math.min(displayTime, duration || 1)]}
            onValueChange={handleSeekChange}
            onValueCommit={handleSeekCommit}
            disabled={duration === 0}
            className="flex-1"
          />
          <span className="w-12 shrink-0 font-mono text-gw-nano tabular-nums text-gw-secondary">
            {formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
