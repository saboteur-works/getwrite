"use client";

import React from "react";
import type { Project, AnyResource, Folder } from "../../src/lib/models/types";
import WordCountProgressBar from "./WordCountProgressBar";
import ResourceListItem from "./ResourceListItem";
import FolderListItem from "./FolderListItem";
import type { FolderRow } from "../../src/lib/folder-data-rows";
import StubResourcesSection from "./StubResourcesSection";
import ResourceBreakdown, { type ResourceGroup } from "./ResourceBreakdown";
import StatusRollup from "./StatusRollup";
import {
  computeInboxSubtree,
  isInInbox,
} from "../../src/lib/models/inbox-membership";
import CollapsibleSection from "../common/UI/CollapsibleSection/CollapsibleSection";
import {
  useFilteredGoalTotal,
  type FilteredGoalTotal,
} from "../../src/hooks/useFilteredGoalTotal";

const GOAL_FILTER_LABEL = "Counting selected documents";
const GOAL_FILTER_NO_MATCH = "No documents match your goal filter";
const GOAL_TOTAL_UNAVAILABLE = "Total word count is unavailable";

const LOADING_TOTAL: FilteredGoalTotal = {
  state: { status: "loading" },
  isFiltered: true,
  isLoading: true,
  isNoMatch: false,
  isUnavailable: false,
};

/**
 * Wraps `useFilteredGoalTotal` so a figure read for an earlier filter (or
 * project) is never shown. When the filter turns on, or the project changes
 * while it is on, the first render reports `loading` instead of the hook's
 * previous result (the hook resets to loading only in its effect).
 */
export function useDataViewFilteredTotal(
  projectId: string,
  isFilterSet: boolean,
): FilteredGoalTotal {
  const total = useFilteredGoalTotal(projectId, isFilterSet);
  const readKey = isFilterSet ? projectId : null;
  const lastReadKeyRef = React.useRef<string | null>(readKey);
  const isNewRead = readKey !== null && readKey !== lastReadKeyRef.current;
  React.useEffect(() => {
    lastReadKeyRef.current = readKey;
  });
  return isNewRead ? LOADING_TOTAL : total;
}

function FilteredGoalBar({
  filteredGoalTotal,
  goal,
}: {
  filteredGoalTotal: FilteredGoalTotal;
  goal: number;
}): JSX.Element {
  if (filteredGoalTotal.isUnavailable) {
    return (
      <p role="alert" className="font-mono text-[10px] text-gw-secondary">
        {GOAL_TOTAL_UNAVAILABLE}
      </p>
    );
  }
  const { state } = filteredGoalTotal;
  if (state.status !== "total" && state.status !== "no-match") {
    return (
      <p role="status" className="font-mono text-[10px] text-gw-secondary">
        Loading word count…
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] text-gw-secondary">
        {GOAL_FILTER_LABEL}
      </p>
      <WordCountProgressBar current={state.total} goal={goal} />
      {filteredGoalTotal.isNoMatch ? (
        <p role="status" className="font-mono text-[10px] text-gw-secondary">
          {GOAL_FILTER_NO_MATCH}
        </p>
      ) : null}
    </div>
  );
}

const STUB_WORD_THRESHOLD = 50;

type ResourceWithWordCount = AnyResource & {
  userMetadata?: { wordCount?: number };
  wordCount?: number;
};

function getWordCount(r: AnyResource): number {
  const rc = r as ResourceWithWordCount;
  return rc.userMetadata?.wordCount ?? rc.wordCount ?? 0;
}

export interface DataViewProps {
  /** Optional list of projects to show aggregate statistics for */
  projects?: Project[];
  /** The single project to display statistics for (used when `projects` is not provided) */
  project?: Project;
  /** Optional adapter view from `buildProjectView` (canonical models). */
  view?: { project: Project; folders: AnyResource[]; resources: AnyResource[] };
  /** Optional override flat list of resources to render (uses project(s).resources by default) */
  resources?: AnyResource[];
  /**
   * Full project resource list feeding the "By status" roll-up, independent of
   * any smart-folder narrowing applied to `resources`. Falls back to the
   * resolved `resources` list when omitted.
   */
  statusRollupResources?: AnyResource[];
  /**
   * The project's configured statuses for the "By status" roll-up. Takes
   * precedence over `project.config.statuses`, which the page-built project
   * shape does not carry (statuses live in the Redux store).
   */
  statuses?: string[];
  /** Folder list used to group resources in the Breakdown section. */
  folders?: Folder[];
  /** Called when the user clicks the jump button on a breakdown group row. */
  onSelectFolder?: (folderId: string) => void;
  /** When provided, resource list items become clickable and call this with the resource ID. */
  onResourceClick?: (id: string) => void;
  /** When true, shows an evaluating banner above the resource list. */
  isEvaluating?: boolean;
  /**
   * Filtered goal total (Feature 98). When `isFiltered`, the Writing Goal
   * section shows it instead of the total of `resources`; every other figure
   * is unchanged. Omit, or pass a not-filtered state, for the current behaviour.
   */
  filteredGoalTotal?: FilteredGoalTotal;
  /**
   * Folder rows from a smart folder whose query names `type = folder`
   * (Feature 102, FR-14): name, subtype and the chosen field columns. Omit or
   * pass an empty list and the view is unchanged.
   */
  folderRows?: FolderRow[];
  /**
   * Set when reading the folders' metadata failed. Shown as an alert in place
   * of the folder list, never as a project with no folders.
   */
  folderRowsError?: string;
  /**
   * Set when the active smart-folder query failed to evaluate. Shown as an
   * alert in place of every result row, never as stale or empty results.
   */
  evaluationError?: string;
  /**
   * Inbox folder id from the store's active project. `project` can be an
   * older copy that predates the first capture, so this wins when set.
   */
  inboxFolderId?: string;
  className?: string;
}

type SortOrder = "lastEdited" | "name";

/**
 * `DataView` renders statistics scoped to a single project and a simple
 * resource list. When `project` is omitted a placeholder project is used so
 * the component remains usable in isolation.
 */
export default function DataView({
  projects,
  project,
  inboxFolderId: inboxFolderIdProp,
  view,
  resources,
  statusRollupResources,
  statuses,
  folders,
  onSelectFolder,
  onResourceClick,
  isEvaluating = false,
  filteredGoalTotal,
  folderRows,
  folderRowsError,
  evaluationError,
  className = "",
}: DataViewProps): JSX.Element {
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("lastEdited");

  const flatResources = React.useMemo(() => {
    if (resources) return resources;
    if (view && view.resources) return view.resources;
    if (projects && projects.length > 0)
      return projects.flatMap(
        (p) => (p as Project & { resources?: AnyResource[] }).resources ?? [],
      );
    if (
      project &&
      (project as Project & { resources?: AnyResource[] }).resources
    )
      return (project as Project & { resources?: AnyResource[] })
        .resources as AnyResource[];
    return [] as AnyResource[];
  }, [resources, view, projects, project]);

  const sortedResources = React.useMemo(() => {
    return [...flatResources].sort((a, b) => {
      if (sortOrder === "name") {
        return (a.name ?? "").localeCompare(b.name ?? "");
      }
      const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "");
      const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "");
      const aSafe = Number.isNaN(aTime) ? 0 : aTime;
      const bSafe = Number.isNaN(bTime) ? 0 : bTime;
      return bSafe - aSafe;
    });
  }, [flatResources, sortOrder]);

  const wordCountGoal = project?.config?.wordCountGoal;

  const stubResources = React.useMemo(
    () => sortedResources.filter((r) => getWordCount(r) <= STUB_WORD_THRESHOLD),
    [sortedResources],
  );

  const contentResources = React.useMemo(
    () => sortedResources.filter((r) => getWordCount(r) > STUB_WORD_THRESHOLD),
    [sortedResources],
  );

  const folderMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const f of folders ?? []) {
      map.set(f.id, f.name ?? "Unnamed");
    }
    return map;
  }, [folders]);

  const resourceGroups = React.useMemo<ResourceGroup[]>(() => {
    const byFolder = new Map<string, AnyResource[]>();
    for (const r of flatResources) {
      const knownFolder = r.folderId && folderMap.has(r.folderId);
      const key = knownFolder ? r.folderId! : "__ungrouped__";
      const existing = byFolder.get(key);
      if (existing) {
        existing.push(r);
      } else {
        byFolder.set(key, [r]);
      }
    }
    const groups: ResourceGroup[] = Array.from(byFolder.entries()).map(
      ([fid, rs]) => ({
        label:
          fid === "__ungrouped__"
            ? "Ungrouped"
            : (folderMap.get(fid) ?? "Unknown"),
        folderId: fid === "__ungrouped__" ? null : fid,
        resourceCount: rs.length,
        wordCount: rs.reduce((acc, r) => acc + getWordCount(r), 0),
      }),
    );
    groups.sort((a, b) => {
      if (a.label === "Ungrouped") return 1;
      if (b.label === "Ungrouped") return -1;
      return a.label.localeCompare(b.label);
    });
    return groups;
  }, [flatResources, folderMap]);

  const totalResources = flatResources.length;
  const totalWords = flatResources.reduce(
    (acc: number, r: AnyResource) => acc + getWordCount(r),
    0,
  );

  // Owner decision, 2026-11-07 (Feature 102, FR-28): with no goal filter the
  // project goal total leaves out Sources. A goal filter that selects Sources
  // counts them through `filteredGoalTotal`; "Total words" above is unchanged.
  //
  // Feature 106 FR-7: with no goal filter it also leaves out resources in the
  // Inbox subtree, found by a `parentId` walk over the store's folders (no
  // request of its own). With a filter set, `filteredGoalTotal` alone decides.
  // Malformed folder data (a parent cycle) makes the figure `null`, shown as
  // unavailable, never as 0.
  const inboxFolderId = inboxFolderIdProp ?? project?.config?.inboxFolderId;
  const goalWords: number | null = React.useMemo(() => {
    const computed = computeInboxSubtree(folders ?? [], inboxFolderId);
    if (!computed.ok) return null;
    return flatResources.reduce(
      (acc: number, r: AnyResource) =>
        r.type === "source" || isInInbox(computed.subtree, r)
          ? acc
          : acc + getWordCount(r),
      0,
    );
  }, [flatResources, folders, inboxFolderId]);

  return (
    <div className={`mt-4 space-y-6 px-4 ${className}`}>
      <CollapsibleSection
        title={`${project?.name ?? "No Project"} Overview`}
        defaultOpen
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border-hairline border-gw-border p-4">
            <div className="font-mono text-gw-nano tracking-label uppercase text-gw-secondary mt-1">
              Resources
            </div>
            <div className="text-gw-h1 font-bold">{totalResources}</div>
          </div>
          <div className="border-hairline border-gw-border p-4">
            <div className="font-mono text-gw-nano tracking-label uppercase text-gw-secondary mt-1">
              Total words
            </div>
            <div className="text-gw-h1 font-bold">{totalWords}</div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="By status">
        <StatusRollup
          resources={statusRollupResources ?? flatResources}
          statuses={statuses ?? project?.config?.statuses ?? []}
        />
      </CollapsibleSection>

      {wordCountGoal && wordCountGoal > 0 ? (
        <CollapsibleSection title="Writing Goal">
          {filteredGoalTotal?.isFiltered ? (
            <FilteredGoalBar
              filteredGoalTotal={filteredGoalTotal}
              goal={wordCountGoal}
            />
          ) : goalWords === null ? (
            <p role="alert" className="font-mono text-[10px] text-gw-secondary">
              {GOAL_TOTAL_UNAVAILABLE}
            </p>
          ) : (
            <WordCountProgressBar current={goalWords} goal={wordCountGoal} />
          )}
        </CollapsibleSection>
      ) : null}

      {resourceGroups.length >= 2 ? (
        <CollapsibleSection title="Breakdown">
          <div className="max-h-60 overflow-y-auto">
            <ResourceBreakdown
              groups={resourceGroups}
              onSelectFolder={onSelectFolder}
            />
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        title="Resources"
        actions={
          <div className="flex gap-3">
            {(["lastEdited", "name"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortOrder(key)}
                className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-150 ${
                  sortOrder === key
                    ? "text-gw-primary"
                    : "text-gw-secondary hover:text-gw-primary"
                }`}
              >
                {key === "lastEdited" ? "Last Edited" : "Name"}
              </button>
            ))}
          </div>
        }
      >
        {isEvaluating && (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gw-dim px-1 pb-2">
            Evaluating query…
          </p>
        )}
        {evaluationError ? (
          <p role="alert" className="font-mono text-[10px] text-gw-secondary">
            {evaluationError}
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {folderRowsError ? (
              <p
                role="alert"
                className="font-mono text-[10px] text-gw-secondary"
              >
                Folder details could not be loaded: {folderRowsError}
              </p>
            ) : folderRows && folderRows.length > 0 ? (
              <ul className="workarea-list" aria-label="Folders">
                {folderRows.map((row) => (
                  <FolderListItem
                    key={row.id}
                    row={row}
                    onSelect={onSelectFolder}
                  />
                ))}
              </ul>
            ) : null}
            <StubResourcesSection
              resources={stubResources}
              onResourceClick={onResourceClick}
            />
            <ul className="workarea-list">
              {contentResources.map((r: AnyResource) => (
                <ResourceListItem
                  key={r.id}
                  name={r.name ?? r.id}
                  type={r.type}
                  wordCount={getWordCount(r)}
                  lastEditedAt={r.updatedAt ?? r.createdAt}
                  onClick={
                    onResourceClick ? () => onResourceClick(r.id) : undefined
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
