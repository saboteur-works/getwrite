"use client";
/**
 * @module Layout/UpdateNoticeBanner
 *
 * Presentational banner shown at the top of the app shell when a newer GetWrite
 * release is available (desktop only). It states the new version and offers four
 * actions: open the release notes, open the installer download, dismiss until a
 * newer version ships, or skip this version. The component is purely
 * data-and-callbacks; fetching, suppression, and gating live in its container.
 *
 * Per brand rules, red is reserved for position/canonical state — none of these
 * actions use it.
 */
import React from "react";
import { ArrowUpCircle, X } from "lucide-react";
import Button from "../common/UI/Button/Button";

export interface UpdateNoticeBannerProps {
  /** The newer version available (e.g. `0.3.0`). */
  latestVersion: string;
  /** URL of the GitHub Release page. */
  releaseUrl: string;
  /** URL of the installer asset (or the release page as a fallback). */
  downloadUrl: string;
  /** Hide until a newer version ships. */
  onDismiss: () => void;
  /** Permanently suppress the notice for this version. */
  onSkip: () => void;
}

const linkClassName =
  "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label-wide " +
  "border border-gw-border px-3 py-2 text-gw-secondary transition-colors " +
  "hover:border-gw-border-md hover:text-gw-primary " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gw-border";

/** Banner announcing an available update with release, download, and dismiss actions. */
export default function UpdateNoticeBanner({
  latestVersion,
  releaseUrl,
  downloadUrl,
  onDismiss,
  onSkip,
}: UpdateNoticeBannerProps): JSX.Element {
  return (
    <div
      role="status"
      aria-label="Update available"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gw-border bg-gw-chrome2 px-4 py-2"
    >
      <div className="flex items-center gap-2 text-gw-primary">
        <ArrowUpCircle size={16} aria-hidden="true" />
        <span className="text-gw-small">
          GetWrite{" "}
          <span className="font-mono font-semibold">{latestVersion}</span> is
          available.
        </span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <a
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          View release notes
        </a>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          Download
        </a>
        <Button variant="secondary" size="sm" onClick={onSkip}>
          Skip this version
        </Button>
        <Button
          variant="ghost"
          onClick={onDismiss}
          title="Dismiss"
          aria-label="Dismiss update notice"
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
