"use client";

/**
 * Feature 110 (folklore variants), Task 20 (FR-6, FR-7, FR-8, FR-12, FR-19,
 * FR-22): the "Narratives" Work Area tab. It wires the narrative list
 * (`useNarrativeList`), the picked narrative's variants (`useVariantList`),
 * `VariantList` and `ComparisonView`. It lists, compares and opens only; no
 * control here writes a variant, field, tag, list or subtype. The one write is
 * the per-device remembered selection, made by `ComparisonView` or by a
 * checkbox in the list when the writer changes the selection.
 *
 * Selection (decision for integration fact 2): `ComparisonView` owns a
 * "Variants to compare" group and cannot be controlled, and `VariantList` has
 * its own checkbox per row. Both stay, mirrored: a change in the comparison is
 * copied to the list through `onSelectionChange`; a change in the list is
 * written to the remembered selection here and the comparison is re-mounted,
 * which restores from that selection. So the two always show the same choice.
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
  resolveFolkloreSelection,
  writeFolkloreSelection,
} from "../../src/lib/folklore-selection-preference";
import type { FolderSubtypeRead } from "../../src/lib/models/folklore-narratives";
import { FOLKLORE_VIEW_LABEL } from "../../src/lib/models/folklore-types";
import Button from "../common/UI/Button/Button";
import UnlockModal from "../common/UnlockModal";
import ComparisonView, { type ComparisonVariant } from "./ComparisonView";
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

function rememberedSelection(
  projectId: string | null,
  narrativeId: string,
  variantIds: readonly string[],
): string[] {
  if (projectId === null || typeof window === "undefined") return [];
  const read = readFolkloreSelection(projectId);
  if (read.status !== "stored" || read.selection.narrativeId !== narrativeId) {
    return [];
  }
  return resolveFolkloreSelection(read.selection, variantIds).selection
    .variantIds;
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
  const comparableKey = comparable.map((v) => v.id).join("\u0000");
  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    rememberedSelection(
      projectId,
      narrative.folderId,
      comparable.map((v) => v.id),
    ),
  );
  const [remountKey, setRemountKey] = React.useState(0);

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
    setRemountKey((k) => k + 1);
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
  return (
    <div className="flex min-w-0 flex-col gap-3">
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
      <ComparisonView
        key={`${narrative.folderId}:${comparableKey}:${remountKey}`}
        projectId={projectId}
        narrativeId={narrative.folderId}
        variants={comparable}
        onSelectionChange={(ids) => setSelectedIds([...ids])}
        deps={textsDeps}
      />
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
  const pickedRow =
    readyState === null
      ? null
      : (readyState.narratives.find((n) => n.folderId === picked) ??
        readyState.narratives[0] ??
        null);
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
    <section aria-labelledby="narratives-view-heading" className="p-4">
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
                onPick={setPicked}
              />
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
