import React from "react";
import type {
  AnyResource,
  Folder,
  MetadataField,
  ResourceRef,
} from "../../../../src/lib/models/types";
import OrganizerCard from "./OrganizerCard";
import OrganizerFilterBar from "./OrganizerFilterBar";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import {
  selectFolders,
  selectResources,
  setSelectedResourceId,
} from "../../../../src/store/resourcesSlice";
import {
  selectActiveProjectStatuses,
  selectActiveProjectOrganizerCardBody,
  selectActiveProjectDirectoryId,
  selectActiveProjectMetadataSchema,
  selectNotesEnabled,
} from "../../../../src/store/projectsSlice";
import { Eye, EyeClosed } from "lucide-react";
import { shallowEqual } from "react-redux";
import Button from "../../../common/UI/Button";
import {
  resolveOrganizerCardBody,
  DEFAULT_CARD_EXCERPT_LENGTH,
} from "./cardBody";
import { fetchResourceExcerpts } from "../../../../src/lib/api/resource-excerpts";
import {
  organizerFilterReducer,
  initialOrganizerFilterState,
  filterChildren,
} from "./organizerFilters";

/** Narrows a `MetadataValue` entry to a `ResourceRef`'s `name`, if it is one. */
function asResourceRefName(value: unknown): string | undefined {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "name" in (value as Record<string, unknown>)
  ) {
    return (value as ResourceRef).name;
  }
  return undefined;
}

export interface OrganizerViewProps {
  /** Whether to show the body/content of each resource */
  showBody?: boolean;
  /** Callback when the user toggles body visibility */
  onToggleBody?: (show: boolean) => void;
  /** Optional className for outer container */
  className?: string;
}

/**
 * `OrganizerView` renders a flat grid of cards for the direct children
 * (files and subfolders) of the currently selected folder. Clicking a
 * card's Open button selects that item, allowing navigation into subfolders.
 */
export default function OrganizerView({
  showBody = true,
  onToggleBody,
  className = "",
}: OrganizerViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const resources = useAppSelector(
    (s) => selectResources(s.resources),
    shallowEqual,
  );
  const folders = useAppSelector(
    (s) => selectFolders(s.resources),
    shallowEqual,
  );
  const selectedResourceId = useAppSelector(
    (s) => s.resources.selectedResourceId,
  );
  const statuses = useAppSelector(
    (s) => selectActiveProjectStatuses(s),
    shallowEqual,
  );
  const defaultStatus = statuses[0] ?? "";
  // Card body source is project-configured (field / text-excerpt / none); the
  // Notes flag only drives the back-compat default when no config is set.
  const cardBodyConfig = useAppSelector(selectActiveProjectOrganizerCardBody);
  const isNotesEnabled = useAppSelector(selectNotesEnabled);
  const metadataSchema = useAppSelector(
    (s) => selectActiveProjectMetadataSchema(s),
    shallowEqual,
  );
  // Directory basename, not `project.id` (project.json's independently
  // generated internal id) — see `selectActiveProjectDirectoryId`'s doc
  // comment in `projectsSlice.ts`.
  const projectId = useAppSelector(selectActiveProjectDirectoryId);

  const [isShowingBody, setIsShowingBody] = React.useState(showBody);
  // Text content for `text-excerpt` cards, fetched on demand for the visible
  // folder children only (store resources don't carry their content).
  const [excerpts, setExcerpts] = React.useState<Record<string, string>>({});

  const handleToggle = React.useCallback(() => {
    setIsShowingBody((prev) => {
      const isNextShowing = !prev;
      if (onToggleBody) onToggleBody(isNextShowing);
      return isNextShowing;
    });
  }, [onToggleBody]);

  const getEffectiveFolderParentId = (folder: Folder) =>
    folder.parentId ?? folder.folderId ?? null;

  const selectedFolder =
    folders.find((f) => f.id === selectedResourceId) ?? null;

  const childFolders = selectedFolder
    ? folders
        .filter((f) => getEffectiveFolderParentId(f) === selectedFolder.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  const childResources = selectedFolder
    ? resources
        .filter((r) => r.folderId === selectedFolder.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  const allChildren: AnyResource[] = [...childFolders, ...childResources];

  const [filterState, dispatchFilter] = React.useReducer(
    organizerFilterReducer,
    initialOrganizerFilterState,
  );

  // Reset filters whenever the selected folder changes, so a filter set on
  // one folder never silently narrows a different folder's contents (FR-10).
  React.useEffect(() => {
    dispatchFilter({ type: "reset" });
  }, [selectedFolder?.id]);

  // FR-5: every resource-ref/multi-resource-ref field defined anywhere in
  // the active project's metadata schema, across all groups.
  const refFields: MetadataField[] = React.useMemo(
    () =>
      metadataSchema.groups
        .flatMap((group) => group.fields)
        .filter(
          (field) =>
            field.type === "resource-ref" ||
            field.type === "multi-resource-ref",
        ),
    [metadataSchema],
  );

  // FR-5: distinct values (by referenced resource name) present among the
  // *unfiltered* set of the currently selected folder's direct children, one
  // list per ref field. Deliberately derived from `allChildren`, not
  // `visibleChildren`, so narrowing one filter never shrinks another
  // filter's own option list out from under the writer.
  const refFieldValues: Record<string, string[]> = React.useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const field of refFields) {
      const distinct = new Set<string>();
      for (const child of allChildren) {
        const rawValue = child.userMetadata?.[field.key];
        const refs: unknown[] = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const entry of refs) {
          const name = asResourceRefName(entry);
          if (name !== undefined) {
            distinct.add(name);
          }
        }
      }
      result[field.key] = Array.from(distinct).sort((a, b) =>
        a.localeCompare(b),
      );
    }
    return result;
  }, [refFields, allChildren]);

  const visibleChildren = filterChildren(
    allChildren,
    filterState,
    refFields,
    defaultStatus,
  );

  // FR-9: whether any filter is currently active, used to distinguish a
  // genuinely empty folder from one filtered down to zero visible cards.
  const isAnyFilterActive =
    filterState.status !== undefined ||
    filterState.wordCountMin !== undefined ||
    filterState.wordCountMax !== undefined ||
    Object.values(filterState.refFilters).some(
      (value) => value !== undefined && value !== "",
    );

  // Only text resources have content.txt to excerpt. Keyed as a stable string
  // so the effect re-runs only when the visible set actually changes.
  const cardBodySource = cardBodyConfig?.source;
  const excerptLength = cardBodyConfig?.excerptLength;
  const textIdsKey = childResources
    .filter((r) => r.type === "text")
    .map((r) => r.id)
    .join(",");

  React.useEffect(() => {
    // Skip the fetch entirely when bodies are hidden, not text-excerpt mode, or
    // there's nothing to read — the excerpts would never be displayed.
    if (
      !isShowingBody ||
      cardBodySource !== "text-excerpt" ||
      !projectId ||
      textIdsKey === ""
    ) {
      setExcerpts({});
      return;
    }
    let isCancelled = false;
    void fetchResourceExcerpts(
      projectId,
      textIdsKey.split(","),
      excerptLength ?? DEFAULT_CARD_EXCERPT_LENGTH,
    ).then((result) => {
      if (!isCancelled) setExcerpts(result);
    });
    return () => {
      isCancelled = true;
    };
  }, [isShowingBody, cardBodySource, excerptLength, projectId, textIdsKey]);

  const handleOpen = (id: string) => dispatch(setSelectedResourceId(id));

  return (
    <div className={`p-4 overflow-y-scroll h-[calc(100vh-12rem)] ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gw-h2 font-semibold text-gw-secondary">
          {selectedFolder ? selectedFolder.name : "Organizer"}
        </h2>
        <Button variant="secondary" onClick={handleToggle}>
          {isShowingBody ? (
            <EyeClosed
              size={16}
              className="inline-block mr-1 text-gw-secondary"
            />
          ) : (
            <Eye size={16} className="inline-block mr-1 text-gw-secondary" />
          )}{" "}
          {isShowingBody ? "Hide bodies" : "Show bodies"}
        </Button>
      </div>

      {selectedFolder && allChildren.length > 0 && (
        <OrganizerFilterBar
          filterState={filterState}
          dispatchFilter={dispatchFilter}
          statuses={statuses}
          refFields={refFields}
          refFieldValues={refFieldValues}
        />
      )}

      {!selectedFolder ? (
        <p className="text-sm text-gw-secondary">
          Select a folder to view its contents.
        </p>
      ) : allChildren.length === 0 ? (
        <p className="text-sm text-gw-secondary">This folder is empty.</p>
      ) : isAnyFilterActive && visibleChildren.length === 0 ? (
        <p className="text-sm text-gw-secondary">
          No cards match the current filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleChildren.map((child) => (
            <OrganizerCard
              key={child.id}
              resource={child}
              showBody={isShowingBody}
              body={resolveOrganizerCardBody(child, cardBodyConfig, {
                notesEnabled: isNotesEnabled,
                textExcerpt: excerpts[child.id],
              })}
              defaultStatus={defaultStatus}
              onOpen={() => handleOpen(child.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
