"use client";

import React from "react";
import { useAttachmentObjectUrl } from "./useAttachmentObjectUrl";

interface AttachmentMediaProps {
  projectId: string;
  resourceId: string;
  attachmentId: string;
  /** The attachment's original file name, used for the accessible name. */
  name: string;
}

/**
 * Shows one attachment: an `<img>` for an image, a native `<audio controls>`
 * for audio. The kind comes from the byte-read client (the stored entry and
 * the magic-byte check), never from the file name. A failed read, a locked
 * project, a platform without object URLs and a media element that errors
 * each show a message in an alert; none renders as an empty attachment.
 * Mounting starts the read, so mount it only when a preview is wanted.
 */
export default function AttachmentMedia({
  projectId,
  resourceId,
  attachmentId,
  name,
}: AttachmentMediaProps): JSX.Element {
  const state = useAttachmentObjectUrl(projectId, resourceId, attachmentId);
  const [hasElementFailed, setHasElementFailed] = React.useState(false);

  React.useEffect(() => {
    setHasElementFailed(false);
  }, [attachmentId]);

  if (state.status === "loading") {
    return (
      <p role="status" className="mt-2 text-gw-label text-gw-secondary">
        {`Loading ${name}…`}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-2 text-gw-label text-gw-primary">
        {`Error: ${state.message}`}
      </p>
    );
  }
  if (hasElementFailed) {
    return (
      <p role="alert" className="mt-2 text-gw-label text-gw-primary">
        {state.kind === "image"
          ? `Error: ${name} couldn't be shown on this device.`
          : `Error: ${name} couldn't be played on this device.`}
      </p>
    );
  }
  if (state.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a Blob URL, not an optimisable asset
      <img
        src={state.url}
        alt={name}
        className="mt-2 max-h-64 max-w-full"
        onError={() => setHasElementFailed(true)}
      />
    );
  }
  return (
    <audio
      src={state.url}
      controls
      aria-label={`Audio: ${name}`}
      className="mt-2 w-full"
      onError={() => setHasElementFailed(true)}
    />
  );
}
