"use client";

/**
 * @module useClaimList
 *
 * Data hook for the Claims tab (Feature 108, FR-16, FR-17). Reads the
 * project-wide claim list through the claims client, keeps the claims of a
 * resource in Trash out of the live list, derives each row's display through
 * `claim-display.ts`, applies the filters, and exposes retry, the unlock
 * prompt for a locked project (as `TrashView.tsx` does) and the open-claim
 * action. The tab lists, filters and opens only; it writes nothing.
 *
 * A failed list is a `failed` state, never an empty list
 * (`docs/standards/failure-visibility.md`). A resource whose annotations could
 * not be read is returned in `notRead`, beside the claims that were read.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { setSelectedResourceId } from "../../src/store/resourcesSlice";
import {
  checkWorkspaceLock,
  unlockWorkspace,
} from "../../src/store/cryptoSlice";
import { listClaims } from "../../src/lib/api/claims";
import { listTrash, type TrashListing } from "../../src/lib/api/trash";
import {
  fetchResourceContent,
  type ResourceContentResponse,
} from "../../src/lib/api/resources";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { isDetachedAnnotation } from "../../src/lib/models/excerpts";
import {
  applyClaimFilters,
  deriveClaimDisplay,
  describeActiveClaimFilters,
  describeEmptyClaimResult,
  NO_CLAIM_FILTERS,
  type ClaimDisplayModel,
  type ClaimFilters,
  type ClaimSourceFacts,
} from "../../src/lib/claim-display";
import type {
  ClaimListResult,
  ClaimPassageState,
  ClaimReadFailure,
} from "../../src/lib/models/claim-types";
import type { Annotation } from "../../src/lib/models/types";
import {
  useCitationFacts,
  type CitationFactsDeps,
  type CitationFactsResult,
} from "../Editor/Annotations/useAnnotationsPanel";
import {
  useDeclareUnlockPromptMounted,
  useSharingLimits,
} from "../Sharing/SharingLimitsContext";
import {
  isUnlockingLimited,
  isUnlockPromptAllowed,
} from "../Sharing/unlock-prompt-gate";
import { UNLOCK_AT_DESKTOP_MESSAGE } from "../Sharing/sharing-copy";

export type { ClaimPassageState };

/** What the hook asks the shell to do when a claim is opened. */
export interface OpenClaimRequest {
  resourceId: string;
  annotationId: string;
  /** `detached`: open the resource and show the detached state, not nothing. */
  passage: ClaimPassageState;
}

/** The reads the hook makes; injectable for tests. */
export interface ClaimListDeps {
  listClaims: (projectId: string) => Promise<ClaimListResult>;
  listTrash: (projectId: string) => Promise<TrashListing>;
  fetchContent: (
    projectId: string,
    resourceId: string,
  ) => Promise<ResourceContentResponse | null>;
  /** Passed to the Source-state read; defaults to the live reads. */
  citationFactsDeps?: CitationFactsDeps;
}

const LIVE_DEPS: ClaimListDeps = {
  listClaims,
  listTrash,
  fetchContent: fetchResourceContent,
};

/** One listed claim with its derived display. */
export interface ClaimRow {
  /** Unique across resources: `<resourceId>:<annotationId>`. */
  key: string;
  resourceId: string;
  resourceName: string;
  annotation: Annotation;
  display: ClaimDisplayModel;
  /** From the list read: is the passage marked in the saved document. */
  passage: ClaimPassageState;
}

export type ClaimListState =
  | { status: "loading" }
  | { status: "failed"; isLocked: boolean; message: string }
  | {
      status: "ready";
      /** Live claims only; a claim of a Trash resource is not here. */
      claims: ClaimRow[];
      /** Resources whose annotations could not be read. */
      notRead: ClaimReadFailure[];
      /** Claims left out because their resource is in Trash. */
      inTrashCount: number;
      /** False when Trash could not be read, so Trash claims could not be left out. */
      isTrashChecked: boolean;
    };

export interface ClaimUnlockPrompt {
  isPromptShown: boolean;
  /** Set when unlocking is limited for this device; shown as text. */
  refusal: string | null;
  isUnlocking: boolean;
  encryptedProjectCount: number;
  errorMessage: string | undefined;
  submit: (passphrase: string) => Promise<void>;
  decline: () => void;
}

export interface ClaimListHandle {
  state: ClaimListState;
  retry: () => void;
  filters: ClaimFilters;
  setFilters: (filters: ClaimFilters) => void;
  /** Claims matching the filters. */
  visibleClaims: ClaimRow[];
  filtersText: string;
  /** Text for an empty visible list; null while not ready or when rows show. */
  emptyMessage: string | null;
  open: (row: ClaimRow) => Promise<void>;
  unlock: ClaimUnlockPrompt;
}

export interface UseClaimListOptions {
  /** Asks the shell to open the resource and focus (or show detached) the claim. */
  openClaim: (request: OpenClaimRequest) => void;
  deps?: ClaimListDeps;
}

interface RawLoad {
  list: ClaimListResult;
  trashedIds: ReadonlySet<string> | null;
}

function trashedResourceIds(listing: TrashListing): Set<string> {
  const ids = new Set<string>();
  for (const r of listing.resources) ids.add(r.id);
  for (const f of listing.folders) {
    for (const d of f.descendants) ids.add(d.id);
  }
  return ids;
}

function hasAnnotationMark(node: unknown, id: string): boolean {
  if (typeof node !== "object" || node === null) return false;
  const n = node as { marks?: unknown; content?: unknown };
  if (Array.isArray(n.marks)) {
    for (const m of n.marks) {
      const mark = m as { type?: unknown; attrs?: { id?: unknown } };
      if (mark.type === "annotation" && mark.attrs?.id === id) return true;
    }
  }
  return Array.isArray(n.content)
    ? n.content.some((child) => hasAnnotationMark(child, id))
    : false;
}

function toSourceFacts(
  result: CitationFactsResult | undefined,
): ClaimSourceFacts | undefined {
  if (result === undefined || result.status === "checking") return undefined;
  return result.status === "known" ? result.facts : "unreadable";
}

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The claims could not be read.";
}

/** The Claims tab's data, filters, open action and unlock prompt. */
export function useClaimList(options: UseClaimListOptions): ClaimListHandle {
  const deps = options.deps ?? LIVE_DEPS;
  const { openClaim } = options;
  const dispatch = useAppDispatch();
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const {
    state: limitsState,
    hasDesktopBridge,
    refresh: refreshLimits,
  } = useSharingLimits();
  const limitsStateRef = useRef(limitsState);
  limitsStateRef.current = limitsState;

  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<RawLoad | null>(null);
  const [failure, setFailure] = useState<{
    isLocked: boolean;
    message: string;
  } | null>(null);
  const [filters, setFilters] = useState<ClaimFilters>(NO_CLAIM_FILTERS);

  const [isUnlockPromptOpen, setIsUnlockPromptOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const encryptedProjectCount = useAppSelector(
    (s) => s.crypto?.encryptedProjectIds.length ?? 0,
  );
  const isUnlocking = useAppSelector((s) => s.crypto?.isUnlocking ?? false);
  const unlockErrorMessage = useAppSelector((s) => s.crypto?.errorMessage);
  const isPromptShown =
    isUnlockPromptOpen && isUnlockPromptAllowed(limitsState, hasDesktopBridge);
  useDeclareUnlockPromptMounted(isPromptShown);

  useEffect(() => {
    if (projectId === null) {
      setLoad(null);
      setFailure({
        isLocked: false,
        message: "No project is open, so the claims cannot be read.",
      });
      return;
    }
    let isCurrent = true;
    setLoad(null);
    setFailure(null);
    setRefusal(null);
    // Trash is read alongside; a failed Trash read does not fail the list.
    const trash = deps.listTrash(projectId).then(
      (listing) => trashedResourceIds(listing),
      (error: unknown) => {
        if (isLockedAccessError(error)) throw error;
        return null;
      },
    );
    Promise.all([deps.listClaims(projectId), trash]).then(
      ([list, trashedIds]) => {
        if (isCurrent) setLoad({ list, trashedIds });
      },
      (error: unknown) => {
        if (!isCurrent) return;
        if (isLockedAccessError(error)) {
          void dispatch(checkWorkspaceLock());
          if (isUnlockingLimited(limitsStateRef.current)) {
            setRefusal(UNLOCK_AT_DESKTOP_MESSAGE);
          } else {
            setIsUnlockPromptOpen(true);
          }
          setFailure({
            isLocked: true,
            message: "The project is locked. Unlock it to read the claims.",
          });
          return;
        }
        setFailure({ isLocked: false, message: failureMessage(error) });
      },
    );
    return () => {
      isCurrent = false;
    };
    // `deps` is a stable injection point; `attempt` re-reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, attempt, dispatch]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const submit = useCallback(
    async (passphrase: string): Promise<void> => {
      const fresh = await refreshLimits();
      if (!isUnlockPromptAllowed(fresh, hasDesktopBridge)) return;
      try {
        await dispatch(unlockWorkspace(passphrase)).unwrap();
      } catch {
        // The failure text is in the crypto slice and shown by the prompt,
        // which stays open for another attempt.
        return;
      }
      setIsUnlockPromptOpen(false);
      setAttempt((n) => n + 1);
    },
    [dispatch, hasDesktopBridge, refreshLimits],
  );
  const decline = useCallback(() => setIsUnlockPromptOpen(false), []);

  const live = useMemo(() => {
    if (load === null) return null;
    const trashed = load.trashedIds;
    const kept = load.list.claims.filter(
      (c) => trashed === null || !trashed.has(c.resourceId),
    );
    return {
      kept,
      inTrashCount: load.list.claims.length - kept.length,
      isTrashChecked: trashed !== null,
      notRead: load.list.failures,
    };
  }, [load]);

  const annotations = useMemo(
    () => (live ? live.kept.map((c) => c.annotation) : []),
    [live],
  );
  const facts = useCitationFacts(annotations, deps.citationFactsDeps);

  const state = useMemo<ClaimListState>(() => {
    if (failure) return { status: "failed", ...failure };
    if (live === null) return { status: "loading" };
    const claims: ClaimRow[] = [];
    const notRead = [...live.notRead];
    for (const entry of live.kept) {
      const display = deriveClaimDisplay(entry.annotation, {
        moduleEnabled: true,
        sourceFacts: toSourceFacts(facts.get(entry.annotation.id)),
      });
      if (display.kind !== "claim") {
        // Never dropped silently: an entry with no claim data is named.
        notRead.push({
          resourceId: entry.resourceId,
          resourceName: entry.resourceName,
          message: "A listed entry has no claim data.",
        });
        continue;
      }
      claims.push({
        key: `${entry.resourceId}:${entry.annotation.id}`,
        resourceId: entry.resourceId,
        resourceName: entry.resourceName,
        annotation: entry.annotation,
        display,
        passage: entry.passage,
      });
    }
    return {
      status: "ready",
      claims,
      notRead,
      inTrashCount: live.inTrashCount,
      isTrashChecked: live.isTrashChecked,
    };
  }, [failure, live, facts]);

  const visibleClaims = useMemo(() => {
    if (state.status !== "ready") return [];
    const shown = new Set(
      applyClaimFilters(
        state.claims.map((c) => c.display),
        filters,
      ),
    );
    return state.claims.filter((c) => shown.has(c.display));
  }, [state, filters]);

  const emptyMessage =
    state.status === "ready" && visibleClaims.length === 0
      ? describeEmptyClaimResult(filters, state.claims.length)
      : null;

  const open = useCallback(
    async (row: ClaimRow): Promise<void> => {
      let passage: ClaimPassageState = "unknown";
      if (projectId !== null) {
        const content = await deps.fetchContent(projectId, row.resourceId);
        const doc = content?.resourceContent?.tipTapContent;
        if (doc !== undefined && doc !== null) {
          const hasMark = hasAnnotationMark(doc, row.annotation.id);
          passage = isDetachedAnnotation(row.annotation, hasMark)
            ? "detached"
            : "present";
        }
      }
      dispatch(setSelectedResourceId(row.resourceId));
      openClaim({
        resourceId: row.resourceId,
        annotationId: row.annotation.id,
        passage,
      });
    },
    [projectId, deps, dispatch, openClaim],
  );

  return {
    state,
    retry,
    filters,
    setFilters,
    visibleClaims,
    filtersText: describeActiveClaimFilters(filters),
    emptyMessage,
    open,
    unlock: {
      isPromptShown,
      refusal,
      isUnlocking,
      encryptedProjectCount,
      errorMessage: unlockErrorMessage,
      submit,
      decline,
    },
  };
}
