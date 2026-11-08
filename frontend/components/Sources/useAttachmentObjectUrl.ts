"use client";

import React from "react";
import { readAttachmentBytes } from "../../src/lib/api/source-attachment-bytes";
import { isLockedAccessError } from "../../src/lib/models/locked-access";

const LOCKED_MESSAGE = "This project is locked. Unlock it, then try again.";
const UNSUPPORTED_MESSAGE =
  "This device can't show or play attachments here: it cannot create the object URL the preview needs.";

/** What the preview knows about one attachment's bytes. */
export type AttachmentObjectUrlState =
  | { status: "loading" }
  | { status: "ready"; url: string; kind: "image" | "audio" }
  | { status: "error"; message: string };

function failureMessage(error: unknown): string {
  if (isLockedAccessError(error)) return LOCKED_MESSAGE;
  const detail =
    error instanceof Error && error.message
      ? error.message
      : "The attachment could not be read.";
  return `Couldn't load the attachment. ${detail}`;
}

/**
 * Reads one attachment's bytes through the Task 19 client and exposes them as
 * a Blob object URL. The kind is the one the client reports, not the file
 * name's. The URL is revoked when the component unmounts or the attachment
 * changes; a read that resolves after either creates no URL.
 */
export function useAttachmentObjectUrl(
  projectId: string,
  resourceId: string,
  attachmentId: string,
): AttachmentObjectUrlState {
  const [state, setState] = React.useState<AttachmentObjectUrlState>({
    status: "loading",
  });

  React.useEffect(() => {
    let isStale = false;
    let createdUrl: string | null = null;
    setState({ status: "loading" });
    readAttachmentBytes(projectId, resourceId, attachmentId).then(
      (result) => {
        if (isStale) return;
        if (typeof URL.createObjectURL !== "function") {
          setState({ status: "error", message: UNSUPPORTED_MESSAGE });
          return;
        }
        try {
          createdUrl = URL.createObjectURL(
            new Blob([result.bytes as BlobPart], { type: result.mime }),
          );
        } catch (error: unknown) {
          setState({ status: "error", message: failureMessage(error) });
          return;
        }
        setState({ status: "ready", url: createdUrl, kind: result.kind });
      },
      (error: unknown) => {
        if (!isStale) {
          setState({ status: "error", message: failureMessage(error) });
        }
      },
    );
    return () => {
      isStale = true;
      if (createdUrl !== null) URL.revokeObjectURL(createdUrl);
    };
  }, [projectId, resourceId, attachmentId]);

  return state;
}
