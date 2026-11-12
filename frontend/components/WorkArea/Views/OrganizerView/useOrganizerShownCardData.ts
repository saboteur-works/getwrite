"use client";

import { useEffect, useState } from "react";
import { fetchResourceExcerpts } from "../../../../src/lib/api/resource-excerpts";
import {
  useFolderRowMetadata,
  type FolderRowMetadataState,
} from "../../../../src/hooks/useFolderRowMetadata";
import type { OrganizerSource } from "../../../../src/lib/models/organizer-grid-types";

/**
 * @module useOrganizerShownCardData
 *
 * **Feature 109, Task 16 (FR-12, OQ-18).** Reads the data cards need beyond
 * the sidecars already in Redux, for the cards that are shown after the cap
 * and the filters, and for no others:
 *
 * - text excerpts through `fetchResourceExcerpts`, for the shown text ids;
 * - folder sidecars through `useFolderRowMetadata`, for the shown folder
 *   cards, and only when folder cards are in the source (a folder source with
 *   the `children` scope). Descendants and smart-folder sources hold none.
 *
 * Neither state is ever "ready" for a failed read: a rejected read is
 * `failed` with a message, so a caller can say so instead of rendering an
 * empty body or dropping the card (`docs/standards/failure-visibility.md`).
 * A result for an earlier shown set is discarded. Writes nothing to Redux.
 */
export type OrganizerExcerptsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; byId: Record<string, string> }
  | { status: "failed"; message: string };

export interface UseOrganizerShownCardDataInput {
  /** The project's on-disk directory basename; empty means none open. */
  projectId: string;
  source: OrganizerSource;
  /** Ids of the shown text resources, after cap and filters. */
  shownTextIds: readonly string[];
  /** Ids of the shown folder cards, after cap and filters. */
  shownFolderIds: readonly string[];
  /** False when card bodies are hidden or not in text-excerpt mode. */
  isExcerptWanted: boolean;
  excerptLength: number;
}

export interface UseOrganizerShownCardDataResult {
  excerpts: OrganizerExcerptsState;
  folders: FolderRowMetadataState;
}

const SEPARATOR = "\u0000";
const IDLE: OrganizerExcerptsState = { status: "idle" };
const LOADING: OrganizerExcerptsState = { status: "loading" };
const NO_FOLDER_IDS: readonly string[] = [];

/** True when the source lists direct children, so folders are cards. */
function hasFolderCards(source: OrganizerSource): boolean {
  return source.kind === "folder" && source.scope === "children";
}

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Unable to read card excerpts.";
}

export function useOrganizerShownCardData(
  input: UseOrganizerShownCardDataInput,
): UseOrganizerShownCardDataResult {
  const { projectId, source, isExcerptWanted, excerptLength } = input;
  const textKey = input.shownTextIds.join(SEPARATOR);
  const isExcerptRequested =
    isExcerptWanted && projectId !== "" && textKey !== "";
  const requestKey = isExcerptRequested
    ? `${projectId}${SEPARATOR}${excerptLength}${SEPARATOR}${textKey}`
    : "";

  const [result, setResult] = useState<{
    key: string;
    state: OrganizerExcerptsState;
  }>({ key: "", state: LOADING });

  useEffect(() => {
    if (requestKey === "") return;
    let isCurrent = true;
    fetchResourceExcerpts(
      projectId,
      textKey.split(SEPARATOR),
      excerptLength,
    ).then(
      (byId) => {
        if (isCurrent) {
          setResult({ key: requestKey, state: { status: "ready", byId } });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setResult({
            key: requestKey,
            state: { status: "failed", message: failureMessage(error) },
          });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, textKey, excerptLength, requestKey]);

  const folders = useFolderRowMetadata(
    projectId,
    hasFolderCards(source) ? input.shownFolderIds : NO_FOLDER_IDS,
  );

  let excerpts: OrganizerExcerptsState;
  if (requestKey === "") excerpts = IDLE;
  else excerpts = result.key === requestKey ? result.state : LOADING;
  return { excerpts, folders };
}
