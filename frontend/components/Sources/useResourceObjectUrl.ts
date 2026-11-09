"use client";

import React from "react";
import { readResourceBytes } from "../../src/lib/api/resource-bytes";
import {
  RESOURCE_FAILED_STATE,
  RESOURCE_LOCKED_MESSAGE,
  RESOURCE_READ_FAILED_MESSAGE,
  resourceErrorState,
  type ResourceObjectUrlState,
} from "../../src/lib/resource-object-url-state";

export {
  RESOURCE_LOCKED_MESSAGE,
  RESOURCE_READ_FAILED_MESSAGE,
  type ResourceObjectUrlState,
};

const FAILED: ResourceObjectUrlState = RESOURCE_FAILED_STATE;

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
        if (!isStale) setState(resourceErrorState(error));
      },
    );
    return () => {
      isStale = true;
      if (createdUrl !== null) URL.revokeObjectURL(createdUrl);
    };
  }, [projectId, resourceId]);

  return state;
}
