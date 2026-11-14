"use client";

/**
 * Feature 110 (folklore variants), Task 20 (FR-6, FR-7, FR-8, FR-12, FR-19,
 * FR-22): the "Narratives" Work Area tab. It wires the narrative list
 * (`useNarrativeList`), the picked narrative's variants (`useVariantList`),
 * `VariantList` and `ComparisonView`. It lists, compares and opens only; no
 * control here writes a variant, field, tag, list or subtype. The one write is
 * the per-device remembered selection, made by a checkbox in the list or the
 * narrative picker when the writer changes them.
 *
 * Selection (Task 36): variants are chosen only in `VariantList`. A "Compare
 * (N)" button, enabled at two or more, switches the tab to `ComparisonView` at
 * the tab's full width; "Back to list" returns with the ticks kept. Focus
 * moves to the comparison heading on open and back to the Compare button on
 * return. The comparison mode is not remembered, only ticks and narrative.
 */
import React from "react";
import { shallowEqual } from "react-redux";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import {
  selectFolders,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
  readFolkloreSelection,
  resolveFolkloreNarrative,
  resolveFolkloreSelection,
  writeFolkloreSelection,
} from "../../src/lib/folklore-selection-preference";
import type { FolderSubtypeRead } from "../../src/lib/models/folklore-narratives";
import {
  COMPARISON_PHONE_MESSAGE,
  FOLKLORE_VIEW_LABEL,
} from "../../src/lib/models/folklore-types";
import useViewportTier from "../../src/lib/hooks/useViewportTier";
import Button from "../common/UI/Button/Button";
import UnlockModal from "../common/UnlockModal";
import ComparisonView, {
  lostMessage,
  type ComparisonVariant,
} from "./ComparisonView";
import VariantList, { type VariantListItem } from "./VariantList";
import {
  useNarrativeList,
  type NarrativeListDeps,
  type NarrativeListHandle,
  type NarrativeNotRead,
  type NarrativeRow,
  type NearMissState,
} from "./useNarrativeList";
import { useVariantList, type VariantListRow } from "./useVariantList";
import type { VariantTextsDeps } from "./useVariantTexts";

export interface NarrativesViewProps {
  /** Opens a variant in the editor; the registry host passes its own. */
  openInEditor: (resourceId: string) => void;
  /** Test seams for the reads. */
  deps?: { narratives?: NarrativeListDeps; texts?: VariantTextsDeps };
}

const NOT_COUNTED = "variant count unavailable";

function countText(count: number | null): string {
  if (count === null) return NOT_COUNTED;
  return count === 1 ? "1 variant" : `${count} variants`;
}

/** Maps the hook's row kinds onto the list component's (integration fact 1). */
export function toListItems(
  rows: readonly VariantListRow[],
): VariantListItem[] {
  return rows.map((row): VariantListItem => {
    if (row.kind === "variant") {
      return {
        id: row.id,
        name: row.name,
        kind: "variant",
        fields: row.fields,
      };
    }
    if (row.kind === "not-variant") {
      return { id: row.id, name: row.name, kind: "not-a-variant", fields: [] };
    }
    return {
      id: row.id,
      name: row.name,
      kind: "unreadable",
      reason: row.reason,
      fields: [],
    };
  });
}

/** Rows that can be chosen for comparison: everything but an unreadable row. */
export function toComparisonVariants(
  rows: readonly VariantListRow[],
): ComparisonVariant[] {
  const out: ComparisonVariant[] = [];
  for (const row of rows) {
    if (row.kind === "variant") {
      out.push({ id: row.id, name: row.name, fields: row.fields });
    } else if (row.kind === "not-variant") {
      out.push({ id: row.id, name: row.name, fields: [] });
    }
  }
  return out;
}

/**
 * The subtype reads `useVariantList` needs, rebuilt from the list state. A
 * listed narrative reads as Narrative, a folder named in `notRead` as failed,
 * every other folder as read with no subtype (the scope walk only tells
 * Narrative from not-Narrative).
 */
function buildFolderReads(
  folderIds: readonly string[],
  narratives: readonly NarrativeRow[],
  notRead: readonly NarrativeNotRead[],
): Map<string, FolderSubtypeRead> {
  const reads = new Map<string, FolderSubtypeRead>();
  for (const id of folderIds) reads.set(id, { kind: "ok", subtype: null });
  for (const n of narratives) {
    reads.set(n.folderId, { kind: "ok", subtype: "Narrative" });
  }
  for (const f of notRead) {
    reads.set(f.folderId, { kind: "failed", reason: f.reason });
  }
  return reads;
}

interface RestoredSelection {
  ids: string[];
  lostCount: number;
}

function rememberedSelection(
  projectId: string | null,
  narrativeId: string,
  variantIds: readonly string[],
): RestoredSelection {
  if (projectId === null || typeof window === "undefined") {
    return { ids: [], lostCount: 0 };
  }
  const read = readFolkloreSelection(projectId);
  if (read.status !== "stored" || read.selection.narrativeId !== narrativeId) {
    return { ids: [], lostCount: 0 };
  }
  const resolved = resolveFolkloreSelection(read.selection, variantIds);
  return {
    ids: resolved.selection.variantIds,
    lostCount: resolved.lostVariantIds.length,
  };
}

function NearMissLine({
  nearMiss,
}: {
  nearMiss: NearMissState;
}): React.ReactElement | null {
  if (nearMiss.status === "none") return null;
  if (nearMiss.status === "failed") {
    return (
      <p role="alert" className="text-gw-label text-gw-primary">
        {nearMiss.names.length > 0
          ? `${nearMiss.message} Subtypes found: ${nearMiss.names.join(", ")}.`
          : nearMiss.message}
      </p>
    );
  }
  return (
    <p className="text-gw-label text-gw-secondary">
      {`No folder has the subtype Narrative. Folders here have other subtypes: ${nearMiss.names.join(", ")}.`}
    </p>
  );
}

function NotReadAlert({
  notRead,
  onRetry,
}: {
  notRead: readonly NarrativeNotRead[];
  onRetry: () => void;
}): React.ReactElement | null {
  if (notRead.length === 0) return null;
  return (
    <div role="alert" className="mb-3 text-gw-label text-gw-primary">
      <p className="mb-1">
        Some folders were not read, so their narratives may be missing:
      </p>
      <ul className="mb-2 list-disc pl-5">
        {notRead.map((f) => (
          <li key={f.folderId}>{`${f.name}: not read`}</li>
        ))}
      </ul>
      <Button variant="secondary" size="xs" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function Picker({
  narratives,
  pickedId,
  onPick,
}: {
  narratives: readonly NarrativeRow[];
  pickedId: string | null;
  onPick: (id: string) => void;
}): React.ReactElement {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm">
      <label htmlFor="narratives-picker">Narrative</label>
      <select
        id="narratives-picker"
        value={pickedId ?? ""}
        onChange={(e) => onPick(e.target.value)}
        className="border border-gw-border bg-transparent px-2 py-1"
      >
        {narratives.map((n) => (
          <option key={n.folderId} value={n.folderId}>
            {`${n.name} (${countText(n.variantCount)})`}
          </option>
        ))}
      </select>
    </div>
  );
}

interface PickedNarrativeProps {
  projectId: string | null;
  narrative: NarrativeRow;
  reads: ReadonlyMap<string, FolderSubtypeRead>;
  onRetry: () => void;
  openInEditor: (resourceId: string) => void;
  textsDeps?: VariantTextsDeps;
}

function PickedNarrative({
  projectId,
  narrative,
  reads,
  onRetry,
  openInEditor,
  textsDeps,
}: PickedNarrativeProps): React.ReactElement {
  const result = useVariantList(narrative.folderId, reads);
  const rows = React.useMemo(
    () => (result.kind === "scope" ? result.rows : []),
    [result],
  );
  const comparable = React.useMemo(() => toComparisonVariants(rows), [rows]);
  const [restored] = React.useState<RestoredSelection>(() =>
    rememberedSelection(
      projectId,
      narrative.folderId,
      comparable.map((v) => v.id),
    ),
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>(restored.ids);
  const [isComparing, setIsComparing] = React.useState(false);
  const compareRef = React.useRef<HTMLButtonElement>(null);
  const shouldRefocusCompare = React.useRef(false);
  const isPhone = useViewportTier() === "phone";

  React.useEffect(() => {
    if (!isComparing && shouldRefocusCompare.current) {
      shouldRefocusCompare.current = false;
      compareRef.current?.focus();
    }
  }, [isComparing]);

  const toggle = (id: string): void => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((s) => s !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    if (projectId !== null) {
      writeFolkloreSelection(projectId, {
        narrativeId: narrative.folderId,
        variantIds: next,
      });
    }
  };
  const comparableIds = new Set(comparable.map((v) => v.id));
  const compareCount = selectedIds.filter((id) => comparableIds.has(id)).length;
  const goBack = (): void => {
    shouldRefocusCompare.current = true;
    setIsComparing(false);
  };

  if (result.kind === "failed") {
    return (
      <div role="alert" className="text-gw-label text-gw-primary">
        <p className="mb-2">{`The variants of ${narrative.name} could not be listed. ${result.reason}`}</p>
        <Button variant="secondary" size="xs" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (result.kind !== "scope") {
    return (
      <p role="status" className="text-gw-label text-gw-secondary">
        This narrative is no longer in the project.
      </p>
    );
  }
  if (isComparing && !isPhone) {
    return (
      <ComparisonView
        projectId={projectId}
        variants={comparable}
        selectedIds={selectedIds}
        onBack={goBack}
        deps={textsDeps}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {restored.lostCount > 0 && (
        <p role="status">{lostMessage(restored.lostCount)}</p>
      )}
      {rows.length === 0 ? (
        <p className="text-gw-label text-gw-secondary">
          This narrative has no Sources yet.
        </p>
      ) : (
        <VariantList
          label={`Variants of ${narrative.name}`}
          items={toListItems(rows)}
          selectedIds={selectedIds}
          onOpen={openInEditor}
          onToggleSelect={toggle}
        />
      )}
      {isPhone ? (
        <p>{COMPARISON_PHONE_MESSAGE}</p>
      ) : (
        <div>
          <Button
            ref={compareRef}
            variant="secondary"
            size="xs"
            disabled={compareCount < 2}
            onClick={() => setIsComparing(true)}
          >
            {`Compare (${compareCount})`}
          </Button>
          {compareCount < 2 && (
            <p className="mt-1 text-gw-label text-gw-secondary">
              Tick two or more variants to compare them side by side.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function UnlockBlock({
  unlock,
}: {
  unlock: NarrativeListHandle["unlock"];
}): React.ReactElement {
  return (
    <>
      {unlock.refusal === null ? null : <p role="status">{unlock.refusal}</p>}
      {unlock.isPromptShown ? (
        <UnlockModal
          isOpen
          encryptedProjectCount={unlock.encryptedProjectCount}
          isBusy={unlock.isUnlocking}
          errorMessage={unlock.errorMessage}
          onUnlock={(passphrase: string) => void unlock.submit(passphrase)}
          onDecline={unlock.decline}
        />
      ) : null}
    </>
  );
}

function EmptyState({
  hasNotRead,
  nearMiss,
}: {
  hasNotRead: boolean;
  nearMiss: NearMissState;
}): React.ReactElement {
  return (
    <>
      <p className="text-gw-label text-gw-secondary">
        {hasNotRead
          ? "No narratives were read."
          : "There are no narratives yet. A narrative is a folder with the subtype Narrative; the Sources inside it are its variants, the different tellings of one story, which this tab lists and compares side by side."}
      </p>
      <NearMissLine nearMiss={nearMiss} />
    </>
  );
}

/** The project-scope Narratives tab. */
export default function NarrativesView({
  openInEditor,
  deps,
}: NarrativesViewProps): React.ReactElement {
  const handle = useNarrativeList({ deps: deps?.narratives });
  const { state, retry, unlock } = handle;
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const folders = useAppSelector(
    (s) => selectFolders(s.resources),
    shallowEqual,
  );
  const dispatch = useAppDispatch();
  const [picked, setPicked] = React.useState<string | null>(null);
  // Read once per project, never written here; a failed read is `unreadable`
  // and shows nothing lost.
  const remembered = React.useMemo(
    () =>
      projectId === null || typeof window === "undefined"
        ? null
        : readFolkloreSelection(projectId),
    [projectId],
  );
  const rememberedSelectionValue =
    remembered?.status === "stored" ? remembered.selection : null;
  const pickNarrative = (id: string): void => {
    setPicked(id);
    if (projectId === null) return;
    const keep =
      rememberedSelectionValue?.narrativeId === id
        ? rememberedSelectionValue.variantIds
        : [];
    writeFolkloreSelection(projectId, { narrativeId: id, variantIds: keep });
  };
  // The shell's `openInEditor` only switches the view, so the Source is
  // selected here first (as the Sources tab does).
  const openVariant = React.useCallback(
    (resourceId: string): void => {
      dispatch(setSelectedResourceId(resourceId));
      openInEditor(resourceId);
    },
    [dispatch, openInEditor],
  );

  const readyState = state.status === "ready" ? state : null;
  const resolvedNarrative =
    readyState === null || rememberedSelectionValue === null
      ? null
      : resolveFolkloreNarrative(
          rememberedSelectionValue,
          readyState.narratives.map((n) => n.folderId),
        );
  const wantedId = picked ?? resolvedNarrative?.narrativeId ?? null;
  const pickedRow =
    readyState === null
      ? null
      : (readyState.narratives.find((n) => n.folderId === wantedId) ??
        readyState.narratives[0] ??
        null);
  const isNarrativeLost =
    picked === null &&
    readyState !== null &&
    readyState.narratives.length > 0 &&
    resolvedNarrative?.narrativeLost === true;
  const reads = React.useMemo(
    () =>
      readyState === null
        ? new Map<string, FolderSubtypeRead>()
        : buildFolderReads(
            folders.map((f) => f.id),
            readyState.narratives,
            readyState.notRead,
          ),
    [readyState, folders],
  );

  return (
    <section
      aria-labelledby="narratives-view-heading"
      className="min-w-0 max-w-full p-4"
    >
      <h2
        id="narratives-view-heading"
        className="workarea-section-title mb-3 text-sm text-gw-primary"
      >
        {FOLKLORE_VIEW_LABEL}
      </h2>
      {state.status === "loading" && (
        <p role="status" className="text-gw-label text-gw-secondary">
          Loading narratives.
        </p>
      )}
      {state.status === "failed" && (
        <div role="alert" className="text-gw-label text-gw-primary">
          <p className="mb-2">
            {state.isLocked
              ? "This project is locked, so its narratives cannot be listed. Unlock it to see them."
              : `The narratives could not be listed. ${state.message}`}
          </p>
          <Button variant="secondary" size="xs" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {readyState !== null && (
        <>
          <NotReadAlert notRead={readyState.notRead} onRetry={retry} />
          {readyState.narratives.length === 0 ? (
            <EmptyState
              hasNotRead={readyState.notRead.length > 0}
              nearMiss={readyState.nearMiss}
            />
          ) : (
            <>
              <Picker
                narratives={readyState.narratives}
                pickedId={pickedRow?.folderId ?? null}
                onPick={pickNarrative}
              />
              {isNarrativeLost && (
                <p
                  role="status"
                  className="mb-3 text-gw-label text-gw-secondary"
                >
                  The narrative you chose before is no longer in the project, so
                  the first narrative is shown.
                </p>
              )}
              {pickedRow !== null && (
                <PickedNarrative
                  key={pickedRow.folderId}
                  projectId={projectId}
                  narrative={pickedRow}
                  reads={reads}
                  onRetry={retry}
                  openInEditor={openVariant}
                  textsDeps={deps?.texts}
                />
              )}
            </>
          )}
        </>
      )}
      <UnlockBlock unlock={unlock} />
    </section>
  );
}
