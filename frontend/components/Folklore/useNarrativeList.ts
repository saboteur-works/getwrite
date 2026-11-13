"use client";

/**
 * @module useNarrativeList
 *
 * Data hook for the Narratives tab (Feature 110, FR-7). Lists the project's
 * Narrative folders by name with their variant count (`folklore-narratives.ts`).
 * Each folder's subtype is read from its folder sidecar through
 * `getFolderMetadata`, the transport `useFolderRowMetadata` uses, but one read
 * per folder and settled separately, so one unreadable folder is named in
 * `notRead` while the narratives that were read are still returned.
 *
 * A locked project becomes a failed state with `isLocked`, and the hook opens
 * the unlock prompt as `useClaimList.ts` does. A failed read is never an empty
 * list (`docs/standards/failure-visibility.md`). The hook writes nothing.
 *
 * Near-miss line: when no folder carries Narrative, `nearMiss` names the other
 * subtypes the folders carry. If a folder read failed in that case the names
 * may be incomplete, so `nearMiss` is `failed`, never omitted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { selectFolders, selectResources } from "../../src/store/resourcesSlice";
import {
  checkWorkspaceLock,
  unlockWorkspace,
} from "../../src/store/cryptoSlice";
import { getFolderMetadata } from "../../src/lib/api/folder-metadata";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { normalizeSubtypeLabel } from "../../src/lib/models/field-subtype-scope";
import {
  listNarrativeFolders,
  resolveNarrativeScope,
  type FolderSubtypeRead,
} from "../../src/lib/models/folklore-narratives";
import { NARRATIVE_SUBTYPE } from "../../src/lib/models/folklore-types";
import type { AnyResource } from "../../src/lib/models/types";
import type { FolderSidecarValue } from "../../src/lib/models/sidecar";
import {
  useDeclareUnlockPromptMounted,
  useSharingLimits,
} from "../Sharing/SharingLimitsContext";
import {
  isUnlockingLimited,
  isUnlockPromptAllowed,
} from "../Sharing/unlock-prompt-gate";
import { UNLOCK_AT_DESKTOP_MESSAGE } from "../Sharing/sharing-copy";

/** The read the hook makes; injectable for tests. */
export interface NarrativeListDeps {
  getFolderMetadata: (
    projectId: string,
    folderId: string,
  ) => Promise<FolderSidecarValue>;
}

const LIVE_DEPS: NarrativeListDeps = { getFolderMetadata };

/** One listed Narrative folder. */
export interface NarrativeRow {
  folderId: string;
  name: string;
  /** Sources in its scope; `null` when a folder inside it was not read. */
  variantCount: number | null;
}

/** A folder whose subtype could not be read. */
export interface NarrativeNotRead {
  folderId: string;
  name: string;
  reason: string;
}

/** The line naming subtypes other than Narrative (FR-7). */
export type NearMissState =
  | { status: "none" }
  | { status: "names"; names: string[] }
  | { status: "failed"; names: string[]; message: string };

export type NarrativeListState =
  | { status: "loading" }
  | { status: "failed"; isLocked: boolean; message: string }
  | {
      status: "ready";
      narratives: NarrativeRow[];
      notRead: NarrativeNotRead[];
      nearMiss: NearMissState;
    };

interface NarrativeUnlockPrompt {
  isPromptShown: boolean;
  /** Set when unlocking is limited for this device; shown as text. */
  refusal: string | null;
  isUnlocking: boolean;
  encryptedProjectCount: number;
  errorMessage: string | undefined;
  submit: (passphrase: string) => Promise<void>;
  decline: () => void;
}

export interface NarrativeListHandle {
  state: NarrativeListState;
  retry: () => void;
  unlock: NarrativeUnlockPrompt;
}

export interface UseNarrativeListOptions {
  deps?: NarrativeListDeps;
}

type ReadSettled =
  | { kind: "reads"; key: string; reads: Map<string, FolderSubtypeRead> }
  | { kind: "locked"; key: string }
  | { kind: "failed"; key: string; message: string };

function reasonOf(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The folder details could not be read.";
}

function otherSubtypeNames(
  reads: ReadonlyMap<string, FolderSubtypeRead>,
): string[] {
  const seen = new Map<string, string>();
  const narrative = normalizeSubtypeLabel(NARRATIVE_SUBTYPE);
  for (const read of reads.values()) {
    if (read.kind !== "ok" || read.subtype === null) continue;
    const key = normalizeSubtypeLabel(read.subtype);
    if (key === "" || key === narrative || seen.has(key)) continue;
    seen.set(key, read.subtype.trim());
  }
  return [...seen.values()];
}

/** The Narratives tab's list, not-read folders, near-miss line and unlock prompt. */
export function useNarrativeList(
  options: UseNarrativeListOptions = {},
): NarrativeListHandle {
  const deps = options.deps ?? LIVE_DEPS;
  const dispatch = useAppDispatch();
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resources = useAppSelector(
    (s) => selectResources(s.resources),
    shallowEqual,
  );
  const folders = useAppSelector(
    (s) => selectFolders(s.resources),
    shallowEqual,
  );
  const {
    state: limitsState,
    hasDesktopBridge,
    refresh: refreshLimits,
  } = useSharingLimits();
  const limitsStateRef = useRef(limitsState);
  limitsStateRef.current = limitsState;

  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<ReadSettled | null>(null);
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

  const folderIdsKey = folders.map((f) => f.id).join("\u0000");
  const readKey = `${projectId ?? ""}|${attempt}|${folderIdsKey}`;

  useEffect(() => {
    if (projectId === null) return;
    let isCurrent = true;
    setRefusal(null);
    const ids = folderIdsKey === "" ? [] : folderIdsKey.split("\u0000");
    Promise.allSettled(
      ids.map((id) => deps.getFolderMetadata(projectId, id)),
    ).then((results) => {
      if (!isCurrent) return;
      const isLocked = results.some(
        (r) => r.status === "rejected" && isLockedAccessError(r.reason),
      );
      if (isLocked) {
        void dispatch(checkWorkspaceLock());
        if (isUnlockingLimited(limitsStateRef.current)) {
          setRefusal(UNLOCK_AT_DESKTOP_MESSAGE);
        } else {
          setIsUnlockPromptOpen(true);
        }
        setSettled({ kind: "locked", key: readKey });
        return;
      }
      const reads = new Map<string, FolderSubtypeRead>();
      results.forEach((r, i) => {
        reads.set(
          ids[i],
          r.status === "fulfilled"
            ? { kind: "ok", subtype: r.value.resourceSubtype ?? null }
            : { kind: "failed", reason: reasonOf(r.reason) },
        );
      });
      setSettled({ kind: "reads", key: readKey, reads });
    });
    return () => {
      isCurrent = false;
    };
    // `deps` is a stable injection point; `readKey` carries project, retry and folders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKey, dispatch]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const submit = useCallback(
    async (passphrase: string): Promise<void> => {
      const fresh = await refreshLimits();
      if (!isUnlockPromptAllowed(fresh, hasDesktopBridge)) return;
      try {
        await dispatch(unlockWorkspace(passphrase)).unwrap();
      } catch {
        // The failure text is in the crypto slice and shown by the prompt.
        return;
      }
      setIsUnlockPromptOpen(false);
      setAttempt((n) => n + 1);
    },
    [dispatch, hasDesktopBridge, refreshLimits],
  );
  const decline = useCallback(() => setIsUnlockPromptOpen(false), []);

  const state = useMemo<NarrativeListState>(() => {
    if (projectId === null) {
      return {
        status: "failed",
        isLocked: false,
        message: "No project is open, so the narratives cannot be read.",
      };
    }
    if (settled === null || settled.key !== readKey) {
      return { status: "loading" };
    }
    if (settled.kind === "locked") {
      return {
        status: "failed",
        isLocked: true,
        message: "The project is locked. Unlock it to read the narratives.",
      };
    }
    if (settled.kind === "failed") {
      return { status: "failed", isLocked: false, message: settled.message };
    }
    return deriveReady(folders, resources, settled.reads);
  }, [projectId, settled, readKey, folders, resources]);

  return {
    state,
    retry,
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

function deriveReady(
  folders: readonly { id: string; name: string; type?: string }[],
  resources: readonly AnyResource[],
  reads: ReadonlyMap<string, FolderSubtypeRead>,
): NarrativeListState {
  // Everything in `folders` is a folder; tag it so the scope model sees it.
  const all = [
    ...folders.map((f) =>
      f.type === "folder" ? f : { ...f, type: "folder" as const },
    ),
    ...resources,
  ] as AnyResource[];

  const notRead: NarrativeNotRead[] = [];
  // A failed read stands in as "not a Narrative" only for the listing call;
  // the folder is reported in `notRead` and never counted as read.
  const listable = new Map<string, FolderSubtypeRead>();
  for (const f of folders) {
    const read = reads.get(f.id);
    if (read === undefined || read.kind === "failed") {
      notRead.push({
        folderId: f.id,
        name: f.name,
        reason:
          read === undefined
            ? "The folder details were not read."
            : read.reason,
      });
      listable.set(f.id, { kind: "ok", subtype: null });
    } else {
      listable.set(f.id, read);
    }
  }

  const listed = listNarrativeFolders(all, listable);
  const narrativeFolders = listed.kind === "ok" ? listed.narratives : [];
  const narratives: NarrativeRow[] = narrativeFolders.map((f) => {
    const scope = resolveNarrativeScope(f.id, all, reads);
    return {
      folderId: f.id,
      name: f.name,
      variantCount: scope.kind === "scope" ? scope.variants.length : null,
    };
  });

  return {
    status: "ready",
    narratives,
    notRead,
    nearMiss: deriveNearMiss(narratives.length, reads, notRead.length),
  };
}

function deriveNearMiss(
  narrativeCount: number,
  reads: ReadonlyMap<string, FolderSubtypeRead>,
  notReadCount: number,
): NearMissState {
  if (narrativeCount > 0) return { status: "none" };
  const names = otherSubtypeNames(reads);
  if (notReadCount > 0) {
    return {
      status: "failed",
      names,
      message:
        "The subtypes of some folders could not be read, so the other subtypes in use may be incomplete.",
    };
  }
  return names.length > 0 ? { status: "names", names } : { status: "none" };
}
