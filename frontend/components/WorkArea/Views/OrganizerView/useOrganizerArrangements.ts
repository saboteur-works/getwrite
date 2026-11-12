"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "react-redux";
import useAppSelector from "../../../../src/store/hooks";
import {
  selectActiveProjectDirectoryId,
  selectActiveProjectOrganizerArrangements,
  selectProject,
  setProject,
} from "../../../../src/store/projectsSlice";
import { selectQueryState } from "../../../../src/store/querySlice";
import {
  addOrganizerArrangement,
  deleteOrganizerArrangement,
  renameOrganizerArrangement,
} from "../../../../src/lib/api/organizer-arrangements";
import {
  clearLastOrganizerArrangementId,
  organizerArrangementStorageKey,
  readLastOrganizerArrangementId,
  writeLastOrganizerArrangementId,
} from "../../../../src/lib/organizer-arrangement-preference";
import type {
  OrganizerArrangement,
  OrganizerArrangementAvailability,
  OrganizerAxis,
  OrganizerSource,
} from "../../../../src/lib/models/organizer-grid-types";
import {
  getArrangementAvailability,
  type ArrangementAvailabilityInputs,
  type AvailabilityField,
} from "./organizerArrangementAvailability";

/** The three picks an arrangement carries; filters are never part of it. */
export interface OrganizerPicks {
  source: OrganizerSource;
  rows: OrganizerAxis;
  columns: OrganizerAxis;
}

/**
 * Availability as the hook reports it: the model's result plus `failed`,
 * used when the saved-query list could not be loaded and the arrangement
 * names a smart folder. A failed load is neither available nor unavailable.
 */
type HookArrangementAvailability =
  | OrganizerArrangementAvailability
  | { status: "failed"; message: string };

/** Outcome of save, rename or delete. A failure always carries text. */
export type OrganizerArrangementOutcome =
  | { ok: true; id: string }
  | { ok: false; message: string };

/** Outcome of an apply request. */
type OrganizerApplyOutcome = { ok: true } | { ok: false; message: string };

export interface UseOrganizerArrangementsOptions {
  /** The grid's current source, rows and columns (the caller owns them). */
  current: OrganizerPicks;
  /** The picks the "Default" arrangement stands for. */
  defaultPicks: OrganizerPicks;
  /** Called with source, rows and columns only; the caller keeps its filters. */
  onApply: (picks: OrganizerPicks) => void;
}

export interface UseOrganizerArrangementsResult {
  /** The active project's saved arrangements (the config selector's list). */
  arrangements: OrganizerArrangement[];
  /** Id of the applied arrangement; `null` means Default. */
  appliedId: string | null;
  /** Availability per arrangement id. */
  availability: Record<string, HookArrangementAvailability>;
  /** True when the current picks differ from the applied arrangement (or Default). */
  isChanged: boolean;
  /** Why the remembered arrangement was not applied on open, or `null`. */
  notice: string | null;
  /** Message of the latest failed operation, or `null`. */
  error: string | null;
  /** True while a save, rename or delete is in flight. */
  isBusy: boolean;
  /** Applies an arrangement (`null` = Default). Refuses one that is not available. */
  apply: (id: string | null) => OrganizerApplyOutcome;
  save: (name: string) => Promise<OrganizerArrangementOutcome>;
  rename: (id: string, name: string) => Promise<OrganizerArrangementOutcome>;
  remove: (id: string) => Promise<OrganizerArrangementOutcome>;
}

const FAILED_QUERIES_MESSAGE =
  "Could not check this arrangement because the smart folders did not load.";
const REMEMBERED_MISSING_MESSAGE =
  "The arrangement you used last no longer exists. Showing the default arrangement.";
const REMEMBERED_UNREADABLE_MESSAGE =
  "The arrangement you used last could not be read on this device. Showing the default arrangement.";
const REMEMBERED_UNAVAILABLE_PREFIX =
  "The arrangement you used last cannot be applied. Showing the default arrangement. ";
const OPERATION_FAILED_MESSAGE = "The arrangement operation failed.";
const PENDING_APPLY_MESSAGE =
  "This arrangement cannot be applied until the project has finished loading.";
const NOT_FOUND_APPLY_MESSAGE = "This arrangement no longer exists.";

/** JSON with object keys sorted, so key order never decides equality. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function picksKey(picks: OrganizerPicks): string {
  return canonical({
    source: picks.source,
    rows: picks.rows,
    columns: picks.columns,
  });
}

function picksOf(arrangement: OrganizerArrangement): OrganizerPicks {
  return {
    source: arrangement.source,
    rows: arrangement.rows,
    columns: arrangement.columns,
  };
}

type Remembered =
  | { kind: "none" }
  | { kind: "id"; id: string }
  | { kind: "unreadable" };

/**
 * Reads the remembered id. The preference module returns null for missing,
 * malformed and unreadable alike, so a second read-only probe of the same key
 * tells them apart. Nothing is written.
 */
function readRemembered(directoryId: string): Remembered {
  const id = readLastOrganizerArrangementId(directoryId);
  if (id !== null) return { kind: "id", id };
  try {
    const raw = window.localStorage.getItem(
      organizerArrangementStorageKey(directoryId),
    );
    return raw === null ? { kind: "none" } : { kind: "unreadable" };
  } catch {
    return { kind: "unreadable" };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : OPERATION_FAILED_MESSAGE;
}

/**
 * Holds the saved-arrangement list, runs the operations, applies an
 * arrangement and falls back to Default with a message (Feature 109,
 * FR-14, FR-15, FR-16, FR-19).
 *
 * The list is the config selector's; after a write succeeds the stored
 * project is updated through `setProject` from the transport result (the
 * result carries only the id, so the entry is built from the request and the
 * returned id). A failure leaves the list as shown. Folders come from the
 * stored project, the metadata schema from the stored project, and saved
 * queries from the query slice, which AppShell loads; this hook loads
 * nothing.
 */
export function useOrganizerArrangements(
  options: UseOrganizerArrangementsOptions,
): UseOrganizerArrangementsResult {
  const { current, defaultPicks } = options;
  const store = useStore();
  const directoryId = useAppSelector(selectActiveProjectDirectoryId);
  const selectedProjectId = useAppSelector(
    (state) => state.projects.selectedProjectId,
  );
  const arrangements = useAppSelector(selectActiveProjectOrganizerArrangements);
  const project = useAppSelector((state) =>
    selectedProjectId ? selectProject(state, selectedProjectId) : null,
  );
  const queryState = useAppSelector(selectQueryState);

  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCount, setBusyCount] = useState(0);

  const onApplyRef = useRef(options.onApply);
  onApplyRef.current = options.onApply;
  const defaultPicksRef = useRef(defaultPicks);
  defaultPicksRef.current = defaultPicks;
  const resolvedFor = useRef<string | null>(null);

  const isQueriesLoaded =
    selectedProjectId !== null &&
    queryState.projectId === selectedProjectId &&
    !queryState.isLoadingQueries;
  const isQueriesFailed =
    !isQueriesLoaded &&
    !queryState.isLoadingQueries &&
    queryState.errorMessage !== "";

  const inputs = useMemo<ArrangementAvailabilityInputs>(() => {
    const folders = project
      ? {
          state: "loaded" as const,
          ids: (project.folders ?? []).map((f) => f.id),
        }
      : { state: "loading" as const };
    const fields: AvailabilityField[] = project?.metadataSchema
      ? project.metadataSchema.groups.flatMap((g) => g.fields)
      : [];
    const schema = project
      ? { state: "loaded" as const, fields }
      : { state: "loading" as const };
    const queries = isQueriesLoaded
      ? { state: "loaded" as const, ids: Object.keys(queryState.savedQueries) }
      : isQueriesFailed
        ? { state: "loaded" as const, ids: [] }
        : { state: "loading" as const };
    return { folders, queries, schema };
  }, [project, isQueriesLoaded, isQueriesFailed, queryState.savedQueries]);

  const availability = useMemo(() => {
    const result: Record<string, HookArrangementAvailability> = {};
    for (const arrangement of arrangements) {
      result[arrangement.id] =
        isQueriesFailed && arrangement.source.kind === "smart-folder"
          ? { status: "failed", message: FAILED_QUERIES_MESSAGE }
          : getArrangementAvailability(arrangement, inputs);
    }
    return result;
  }, [arrangements, inputs, isQueriesFailed]);

  // Reset per-project state when the open project changes.
  useEffect(() => {
    setAppliedId(null);
    setNotice(null);
    setError(null);
    resolvedFor.current = null;
  }, [directoryId]);

  const applyPicks = useCallback((arrangement: OrganizerArrangement) => {
    onApplyRef.current(picksOf(arrangement));
    setAppliedId(arrangement.id);
    setNotice(null);
  }, []);

  // Apply the remembered arrangement once per opened project.
  useEffect(() => {
    if (directoryId === null || resolvedFor.current === directoryId) return;
    const remembered = readRemembered(directoryId);
    if (remembered.kind === "none") {
      resolvedFor.current = directoryId;
      return;
    }
    if (remembered.kind === "unreadable") {
      resolvedFor.current = directoryId;
      setNotice(REMEMBERED_UNREADABLE_MESSAGE);
      return;
    }
    const arrangement = arrangements.find((a) => a.id === remembered.id);
    if (!arrangement) {
      resolvedFor.current = directoryId;
      setNotice(REMEMBERED_MISSING_MESSAGE);
      return;
    }
    const state = availability[arrangement.id];
    if (!state || state.status === "pending") return;
    if (state.status === "failed") {
      setNotice(state.message);
      return;
    }
    resolvedFor.current = directoryId;
    if (state.status === "unavailable") {
      setNotice(`${REMEMBERED_UNAVAILABLE_PREFIX}${state.message}`);
      return;
    }
    applyPicks(arrangement);
  }, [directoryId, arrangements, availability, applyPicks]);

  const apply = useCallback(
    (id: string | null): OrganizerApplyOutcome => {
      if (id === null) {
        onApplyRef.current(defaultPicksRef.current);
        setAppliedId(null);
        setNotice(null);
        // Reopening the Organizer shows the default, not the last arrangement.
        if (directoryId !== null) clearLastOrganizerArrangementId(directoryId);
        return { ok: true };
      }
      const arrangement = arrangements.find((a) => a.id === id);
      if (!arrangement) {
        return { ok: false, message: NOT_FOUND_APPLY_MESSAGE };
      }
      const state = availability[id];
      if (!state || state.status === "pending") {
        return { ok: false, message: PENDING_APPLY_MESSAGE };
      }
      if (state.status === "failed" || state.status === "unavailable") {
        return { ok: false, message: state.message };
      }
      applyPicks(arrangement);
      if (directoryId !== null) {
        writeLastOrganizerArrangementId(directoryId, id);
      }
      return { ok: true };
    },
    [arrangements, availability, applyPicks, directoryId],
  );

  /** Writes the new list into the stored project, from the latest state. */
  const commitList = useCallback(
    (build: (list: OrganizerArrangement[]) => OrganizerArrangement[]) => {
      if (selectedProjectId === null) return;
      const stored = selectProject(store.getState(), selectedProjectId);
      if (!stored) return;
      const next = build(stored.organizerArrangements ?? []);
      store.dispatch(setProject({ ...stored, organizerArrangements: next }));
    },
    [store, selectedProjectId],
  );

  const run = useCallback(
    async <R extends { ok: boolean }>(
      call: () => Promise<R>,
      onSuccess: (result: R & { ok: true }) => string,
    ): Promise<OrganizerArrangementOutcome> => {
      setBusyCount((n) => n + 1);
      setError(null);
      try {
        const result = await call();
        if (result.ok) {
          return { ok: true, id: onSuccess(result as R & { ok: true }) };
        }
        const message =
          (result as unknown as { message?: string }).message ||
          OPERATION_FAILED_MESSAGE;
        setError(message);
        return { ok: false, message };
      } catch (caught) {
        const message = errorText(caught);
        setError(message);
        return { ok: false, message };
      } finally {
        setBusyCount((n) => n - 1);
      }
    },
    [],
  );

  const save = useCallback(
    (name: string) => {
      if (directoryId === null) {
        const message = OPERATION_FAILED_MESSAGE;
        setError(message);
        return Promise.resolve<OrganizerArrangementOutcome>({
          ok: false,
          message,
        });
      }
      const picks = picksOf({ id: "", name: "", ...current });
      return run(
        () => addOrganizerArrangement(directoryId, { name, ...picks }),
        (result) => {
          const entry: OrganizerArrangement = {
            id: (result as { id: string }).id,
            name: name.trim(),
            ...picks,
          };
          commitList((list) => [...list, entry]);
          setAppliedId(entry.id);
          writeLastOrganizerArrangementId(directoryId, entry.id);
          return entry.id;
        },
      );
    },
    [directoryId, current, run, commitList],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      if (directoryId === null) {
        setError(OPERATION_FAILED_MESSAGE);
        return Promise.resolve<OrganizerArrangementOutcome>({
          ok: false,
          message: OPERATION_FAILED_MESSAGE,
        });
      }
      return run(
        () => renameOrganizerArrangement(directoryId, { id, name }),
        () => {
          commitList((list) =>
            list.map((a) => (a.id === id ? { ...a, name: name.trim() } : a)),
          );
          return id;
        },
      );
    },
    [directoryId, run, commitList],
  );

  const remove = useCallback(
    (id: string) => {
      if (directoryId === null) {
        setError(OPERATION_FAILED_MESSAGE);
        return Promise.resolve<OrganizerArrangementOutcome>({
          ok: false,
          message: OPERATION_FAILED_MESSAGE,
        });
      }
      return run(
        () => deleteOrganizerArrangement(directoryId, { id }),
        () => {
          commitList((list) => list.filter((a) => a.id !== id));
          setAppliedId((applied) => (applied === id ? null : applied));
          return id;
        },
      );
    },
    [directoryId, run, commitList],
  );

  const appliedArrangement =
    appliedId === null ? null : arrangements.find((a) => a.id === appliedId);
  const baseline =
    appliedArrangement !== null && appliedArrangement !== undefined
      ? picksOf(appliedArrangement)
      : defaultPicks;
  const isChanged = picksKey(current) !== picksKey(baseline);

  return {
    arrangements,
    appliedId,
    availability,
    isChanged,
    notice,
    error,
    isBusy: busyCount > 0,
    apply,
    save,
    rename,
    remove,
  };
}
