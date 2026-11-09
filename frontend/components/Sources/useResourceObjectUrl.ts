"use client";

import React from "react";
import { readResourceBytes } from "../../src/lib/api/resource-bytes";
import { isLockedAccessError } from "../../src/lib/models/locked-access";

/** Shown when the project is locked (same wording as the attachment preview). */
export const RESOURCE_LOCKED_MESSAGE =
  "This project is locked. Unlock it, then try again.";
/** Shown for any read failure that is not a size refusal or a lock. */
export const RESOURCE_READ_FAILED_MESSAGE = "This file cannot be shown.";

/** What the viewer knows about one media resource's bytes. */
export type ResourceObjectUrlState =
  | { status: "loading" }
  | { status: "ready"; url: string; kind: "image" | "audio" }
  | { status: "refused"; message: string }
  | { status: "locked"; message: string }
  | { status: "failed"; message: string };

const FAILED: ResourceObjectUrlState = {
  status: "failed",
  message: RESOURCE_READ_FAILED_MESSAGE,
};

/**
 * The core's refusal is told apart by `name`, not `instanceof`: the core
 * module pulls in `node:*` and must not be imported by client code.
 */
function isTooLargeRefusal(error: unknown): error is Error {
  return error instanceof Error && error.name === "ResourceBytesTooLargeError";
}

function errorState(error: unknown): ResourceObjectUrlState {
  if (isLockedAccessError(error)) {
    return { status: "locked", message: RESOURCE_LOCKED_MESSAGE };
  }
  if (isTooLargeRefusal(error)) {
    return { status: "refused", message: error.message };
  }
  return FAILED;
}

/**
 * Native only. Reads one image or audio resource's bytes in process and
 * exposes them as a Blob object URL. The URL is revoked on unmount and when
 * the resource changes; a read that resolves after either creates no URL.
 * Every failure ends in a message state, never in loading or an empty URL.
 */
export function useResourceObjectUrl(
  projectId: string,
  resourceId: string,
): ResourceObjectUrlState {
  const [state, setState] = React.useState<ResourceObjectUrlState>({
    status: "loading",
  });

  React.useEffect(() => {
    let isStale = false;
    let createdUrl: string | null = null;
    setState({ status: "loading" });
    readResourceBytes(projectId, resourceId).then(
      (result) => {
        if (isStale) return;
        if (
          typeof URL.createObjectURL !== "function" ||
          result.bytes.byteLength === 0
        ) {
          setState(FAILED);
          return;
        }
        try {
          createdUrl = URL.createObjectURL(
            new Blob([result.bytes as BlobPart], { type: result.mime }),
          );
        } catch {
          setState(FAILED);
          return;
        }
        setState({ status: "ready", url: createdUrl, kind: result.kind });
      },
      (error: unknown) => {
        if (!isStale) setState(errorState(error));
      },
    );
    return () => {
      isStale = true;
      if (createdUrl !== null) URL.revokeObjectURL(createdUrl);
    };
  }, [projectId, resourceId]);

  return state;
}
