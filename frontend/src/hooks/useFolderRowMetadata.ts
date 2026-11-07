"use client";

import { useEffect, useState } from "react";
import { getFolderMetadata } from "../lib/api/folder-metadata";
import type { FolderRowMetadata } from "../lib/folder-data-rows";

/**
 * @module useFolderRowMetadata
 *
 * **Feature 102, Task 16 (FR-14).** Reads each listed folder's metadata
 * through the folder-metadata transport for the Data view's folder rows.
 *
 * - No folder ids: `idle`, no request.
 * - Otherwise `loading`, then `ready` with every folder read, or `failed`
 *   with the message when any read rejects. A failed read is never `ready`
 *   with fewer folders (`docs/standards/failure-visibility.md`).
 * - A result for an earlier id list or project is discarded.
 *
 * Writes nothing to the Redux store.
 */
export type FolderRowMetadataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; byId: Record<string, FolderRowMetadata> }
  | { status: "failed"; message: string };

const IDLE: FolderRowMetadataState = { status: "idle" };
const LOADING: FolderRowMetadataState = { status: "loading" };

export function useFolderRowMetadata(
  projectId: string,
  folderIds: readonly string[],
): FolderRowMetadataState {
  const key = folderIds.join("\u0000");
  const [result, setResult] = useState<{
    key: string;
    state: FolderRowMetadataState;
  }>({ key: "", state: LOADING });

  useEffect(() => {
    if (key === "") return;
    let isCurrent = true;
    const ids = key.split("\u0000");
    Promise.all(
      ids.map(
        async (id) => [id, await getFolderMetadata(projectId, id)] as const,
      ),
    ).then(
      (entries) => {
        if (isCurrent) {
          setResult({
            key,
            state: { status: "ready", byId: Object.fromEntries(entries) },
          });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setResult({
            key,
            state: {
              status: "failed",
              message:
                error instanceof Error && error.message.trim()
                  ? error.message
                  : "Unable to read folder details.",
            },
          });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, key]);

  if (key === "") return IDLE;
  return result.key === key ? result.state : LOADING;
}
