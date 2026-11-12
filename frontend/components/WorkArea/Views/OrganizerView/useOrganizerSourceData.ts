"use client";

import React from "react";
import { shallowEqual } from "react-redux";
import type { AnyResource } from "../../../../src/lib/models/types";
import useAppSelector from "../../../../src/store/hooks";
import {
  selectFolders,
  selectResources,
} from "../../../../src/store/resourcesSlice";
import { useFolderRowMetadata } from "../../../../src/hooks/useFolderRowMetadata";
import type { FolderRowMetadata } from "../../../../src/lib/folder-data-rows";
import type { OrganizerSource } from "../../../../src/lib/models/organizer-grid-types";
import { listChildrenSource, resolveOrganizerSource } from "./organizerSource";
import { withFolderFieldValues } from "./organizerFolderChildren";
import {
  useOrganizerSmartFolderCards,
  type OrganizerSmartFolderState,
} from "./useOrganizerSmartFolderCards";

/**
 * @module useOrganizerSourceData
 * The cards the Organizer's source resolves to and the folder sidecar data
 * they need (Feature 109, FR-3; Feature 102 FR-14): resolution of a folder or
 * smart-folder source, the browsed folder's full sibling list, one folder
 * metadata read for every folder card, and values written by a folder drop
 * until the next read replaces them. A failed read is reported, never dropped.
 */

/** A source that cannot show cards, with the text to say so (FR-3). */
export interface SourceProblem {
  kind: "loading" | "failed" | "deleted" | "missing";
  message: string;
  retry?: () => void;
}

function describeSourceProblem(
  source: OrganizerSource,
  smart: OrganizerSmartFolderState,
  isFolderMissing: boolean,
): SourceProblem | null {
  if (source.kind === "folder") {
    return isFolderMissing && source.folderId !== ""
      ? { kind: "missing", message: "This folder no longer exists." }
      : null;
  }
  switch (smart.status) {
    case "ready":
      return null;
    case "failed":
      return {
        kind: "failed",
        message: `The smart folder could not be read: ${smart.message}`,
        retry: smart.retry,
      };
    case "deleted":
      return {
        kind: "deleted",
        message: "This smart folder no longer exists. Choose another source.",
      };
    default:
      return { kind: "loading", message: "Loading the smart folder…" };
  }
}

export interface OrganizerSourceData {
  smartFolder: ReturnType<typeof useOrganizerSmartFolderCards>;
  /** The source's cards, before filters. */
  allChildren: AnyResource[];
  /** The browsed folder's full, unfiltered direct children (what a reorder rewrites). */
  siblingCards: AnyResource[];
  /** Same ids and order as `allChildren`; folders carry their field values. */
  filterableChildren: AnyResource[];
  folderMetadataById: Record<string, FolderRowMetadata> | undefined;
  /** The folder sidecar read's failure text, or `null` when it did not fail. */
  folderReadError: string | null;
  childFolderIdsKey: string;
  /** Records the stored values of a folder written by a drop. */
  recordFolderSaved: (folderId: string, value: FolderRowMetadata) => void;
  sourceProblem: SourceProblem | null;
}

export function useOrganizerSourceData(options: {
  source: OrganizerSource;
  browsedFolderId: string | null;
  projectId: string | null;
}): OrganizerSourceData {
  const { source, browsedFolderId, projectId } = options;
  const resources = useAppSelector(
    (s) => selectResources(s.resources),
    shallowEqual,
  );
  const folders = useAppSelector(
    (s) => selectFolders(s.resources),
    shallowEqual,
  );
  const smartFolder = useOrganizerSmartFolderCards(
    source.kind === "smart-folder" ? source.queryId : null,
  );
  // Everything in `folders` is a folder, so it is tagged as one for the
  // source model, which tells folders from documents by `type`.
  const allItems: AnyResource[] = React.useMemo(
    () => [
      ...folders.map((f) =>
        f.type === "folder" ? f : { ...f, type: "folder" as const },
      ),
      ...resources,
    ],
    [folders, resources],
  );
  const resolvedSource = React.useMemo(
    () =>
      resolveOrganizerSource(
        source,
        allItems,
        smartFolder.state.status === "ready"
          ? smartFolder.state.ids
          : undefined,
      ),
    [source, allItems, smartFolder.state],
  );
  const allChildren: AnyResource[] = resolvedSource.cards;
  const siblingCards = React.useMemo(
    () =>
      browsedFolderId
        ? listChildrenSource(browsedFolderId, allItems).cards
        : [],
    [browsedFolderId, allItems],
  );

  // Read for every folder card of the source (not only the shown ones),
  // since the filters and the axis values need them (OQ-18 allows one read
  // per folder). No request without a project directory or folder cards.
  const childFolderIdsKey = projectId
    ? allChildren
        .filter((c) => c.type === "folder")
        .map((c) => c.id)
        .join(",")
    : "";
  const childFolderIds = React.useMemo(
    () => (childFolderIdsKey === "" ? [] : childFolderIdsKey.split(",")),
    [childFolderIdsKey],
  );
  const folderMetadata = useFolderRowMetadata(projectId ?? "", childFolderIds);
  // Folder values written by a drop, until the next folder read replaces them.
  const [folderSaved, setFolderSaved] = React.useState<{
    key: string;
    byId: Record<string, FolderRowMetadata>;
  }>({ key: "", byId: {} });
  const recordFolderSaved = React.useCallback(
    (folderId: string, value: FolderRowMetadata): void =>
      setFolderSaved((prev) => ({
        key: childFolderIdsKey,
        byId: {
          ...(prev.key === childFolderIdsKey ? prev.byId : {}),
          [folderId]: value,
        },
      })),
    [childFolderIdsKey],
  );
  const folderMetadataById = React.useMemo(
    () =>
      folderMetadata.status === "ready"
        ? {
            ...folderMetadata.byId,
            ...(folderSaved.key === childFolderIdsKey ? folderSaved.byId : {}),
          }
        : undefined,
    [folderMetadata, folderSaved, childFolderIdsKey],
  );
  const filterableChildren = withFolderFieldValues(
    allChildren,
    folderMetadataById,
  );
  // Why the source shows nothing: never read as an empty source, never
  // replaced by another source.
  const sourceProblem = describeSourceProblem(
    source,
    smartFolder.state,
    resolvedSource.missingIds.length > 0,
  );

  return {
    smartFolder,
    allChildren,
    siblingCards,
    filterableChildren,
    folderMetadataById,
    folderReadError:
      folderMetadata.status === "failed" ? folderMetadata.message : null,
    childFolderIdsKey,
    recordFolderSaved,
    sourceProblem,
  };
}
