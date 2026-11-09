import type { AnyResource } from "../../src/lib/models/types";

export interface CapturedSectionProps {
  resource: AnyResource;
}

/** True only for an absolute http or https URL; anything else is shown as text. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** The locale-formatted time, or the stored value as is when it is not a date. */
function formatCapturedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Read-only "Captured" block for an item made by the Capture box (Feature 106,
 * FR-22). Shows `capturedAt` and `capturedLink`; renders nothing when the
 * resource has neither. There is no input or button: both keys are written only
 * by the capture core. The time carries the stored ISO value as `dateTime` and
 * `title`. An http(s) link is an anchor (`noopener noreferrer`, nothing is
 * fetched on render); any other value, such as a `javascript:` URL, is plain text.
 */
export default function CapturedSection({
  resource,
}: CapturedSectionProps): JSX.Element | null {
  const { capturedAt, capturedLink } = resource;
  if (!capturedAt && !capturedLink) return null;

  return (
    <div
      role="group"
      aria-label="Captured"
      className="mb-4 flex flex-col gap-1 text-gw-small text-gw-primary"
    >
      <span className="font-mono text-gw-small uppercase tracking-[0.12em] text-gw-secondary">
        Captured
      </span>
      {capturedAt && (
        <time dateTime={capturedAt} title={capturedAt}>
          {formatCapturedAt(capturedAt)}
        </time>
      )}
      {capturedLink &&
        (isHttpUrl(capturedLink) ? (
          <a
            href={capturedLink}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline"
          >
            {capturedLink}
          </a>
        ) : (
          <span className="break-all">{capturedLink}</span>
        ))}
    </div>
  );
}
