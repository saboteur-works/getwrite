"use client";

import { useCallback, useRef, useState } from "react";
import { useStore } from "react-redux";
import { updateFolderMetadata } from "../../../../src/lib/api/folder-metadata";
import type { FolderSidecarValue } from "../../../../src/lib/api/folder-metadata";
import { setOrganizerFields } from "../../../../src/lib/api/organizer-field-write";
import type { OrganizerFieldWriteOutcome } from "../../../../src/lib/api/organizer-field-write";
import type {
  OrganizerFieldChange,
  OrganizerFieldWriteInput,
} from "../../../../src/lib/models/organizer-grid-types";
import type { AnyResource } from "../../../../src/lib/models";
import type { MetadataValue } from "../../../../src/lib/models/types";
import { toastService } from "../../../../src/lib/toast-service";
import { updateResource } from "../../../../src/store/resourcesSlice";
import type { AppDispatch, RootState } from "../../../../src/store/store";
import type { OrganizerDropPlan } from "./organizerDropModel";

/**
 * @module useOrganizerFieldDrop
 *
 * **Feature 109, Task 22 (FR-7, FR-13; OQ-6, OQ-19).** Performs one Organizer
 * field drop: ONE write per drop, non-optimistic. The card stays where it is
 * (Redux is untouched) until the write succeeds.
 *
 * - Resource card: one `setOrganizerFields` call carrying every change. Not
 *   the page's `updateResource` closure (two writes in one handler lose a
 *   field, and a page-local sidecar copy can restore stale values; Task 1,
 *   FR-1 (b)).
 * - Folder card: one `updateFolderMetadata` call; a clear goes in
 *   `clearFieldKeys`, a subtype clear is `resourceSubtype: null`. Folder
 *   values are not in Redux, so the caller's `onFolderSaved` refreshes them.
 *
 * Outcomes (`state`, mirrored as `announcement` for an `aria-live` region):
 * `saved`, `refused` (message, no call for a model refusal), `gone` (the
 * document no longer exists; `onGone` re-reads), `failed` (text, toast and
 * `retry`). A failed or rejected write is never `saved`
 * (`docs/standards/failure-visibility.md`). The hook writes no writing-log
 * entry and makes no revision call.
 */
interface OrganizerDropCardInfo {
  id: string;
  kind: "resource" | "folder";
  /** Display name, used in the live-region text. */
  name: string;
}

export interface OrganizerDropRequest {
  plan: OrganizerDropPlan;
  card: OrganizerDropCardInfo;
  /** Text naming the destination cell, e.g. "Published / Act 1". */
  destinationLabel: string;
}

type OrganizerFieldDropState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; message: string }
  | { status: "refused"; message: string }
  | { status: "gone"; message: string }
  | { status: "failed"; message: string };

export interface UseOrganizerFieldDropOptions {
  /** The project's on-disk directory basename. */
  projectId: string;
  /** Called after a gone result so the caller re-reads the project. */
  onGone?: () => void;
  /** Called after a folder write succeeds, with the stored folder values. */
  onFolderSaved?: (folderId: string, value: FolderSidecarValue) => void;
}

export interface UseOrganizerFieldDropResult {
  state: OrganizerFieldDropState;
  /** The live-region text for `state`; empty for idle and saving. */
  announcement: string;
  drop: (request: OrganizerDropRequest) => Promise<void>;
  /** Repeats the last failed drop; a no-op when there is none. */
  retry: () => Promise<void>;
}

const IDLE: OrganizerFieldDropState = { status: "idle" };

function failureText(name: string): string {
  return `Couldn't save the change to ${name}. It stays in its original cell. Try again.`;
}

/** The folder-metadata payload for the changes; only the keys it needs. */
function folderPayload(
  changes: readonly OrganizerFieldChange[],
): Record<string, unknown> {
  const fieldValues: Record<string, MetadataValue> = {};
  const clearFieldKeys: string[] = [];
  const payload: Record<string, unknown> = {};
  for (const change of changes) {
    const { target } = change;
    if (target.kind === "subtype") {
      payload.resourceSubtype = change.op === "set" ? change.value : null;
    } else if (target.kind === "field") {
      if (change.op === "set") fieldValues[target.key] = change.value;
      else clearFieldKeys.push(target.key);
    }
  }
  if (Object.keys(fieldValues).length > 0) payload.fieldValues = fieldValues;
  if (clearFieldKeys.length > 0) payload.clearFieldKeys = clearFieldKeys;
  return payload;
}

/** The Redux patch for a saved resource write; unrelated keys are untouched. */
function resourcePatch(
  current: AnyResource,
  changes: readonly OrganizerFieldChange[],
): Partial<AnyResource> & { id: string } {
  const userMetadata: Record<string, MetadataValue> = {
    ...(current.userMetadata ?? {}),
  };
  const patch: Record<string, unknown> = { id: current.id };
  for (const change of changes) {
    const { target } = change;
    if (target.kind === "subtype") {
      // An explicit `undefined` key: the reducer merges with a shallow spread.
      patch.resourceSubtype = change.op === "set" ? change.value : undefined;
      continue;
    }
    const key = target.kind === "status" ? "status" : target.key;
    if (change.op === "set") userMetadata[key] = change.value;
    else delete userMetadata[key];
  }
  patch.userMetadata = userMetadata;
  return patch as Partial<AnyResource> & { id: string };
}

export function useOrganizerFieldDrop(
  options: UseOrganizerFieldDropOptions,
): UseOrganizerFieldDropResult {
  const { projectId, onGone, onFolderSaved } = options;
  const store = useStore<RootState>();
  const [state, setState] = useState<OrganizerFieldDropState>(IDLE);
  const isSaving = useRef(false);
  const lastFailed = useRef<OrganizerDropRequest | null>(null);

  const applySaved = useCallback(
    (input: OrganizerFieldWriteInput) => {
      const current = store
        .getState()
        .resources.resources.find((r) => r.id === input.resourceId);
      if (!current) return;
      (store.dispatch as AppDispatch)(
        updateResource(resourcePatch(current, input.changes)),
      );
    },
    [store],
  );

  const fail = useCallback((request: OrganizerDropRequest, detail: string) => {
    const message = failureText(request.card.name);
    lastFailed.current = request;
    toastService.error("Couldn't save the change", detail || message);
    setState({ status: "failed", message });
  }, []);

  const writeResource = useCallback(
    async (
      request: OrganizerDropRequest,
      input: OrganizerFieldWriteInput,
    ): Promise<void> => {
      let outcome: OrganizerFieldWriteOutcome;
      try {
        outcome = await setOrganizerFields(projectId, input);
      } catch (error) {
        fail(request, error instanceof Error ? error.message : "");
        return;
      }
      if (outcome.status === "done") {
        applySaved(input);
        setState({
          status: "saved",
          message: `${request.card.name} moved to ${request.destinationLabel}.`,
        });
      } else if (outcome.status === "refused") {
        setState({ status: "refused", message: outcome.message });
      } else if (outcome.status === "gone") {
        const message = `${request.card.name} no longer exists. Refreshing the Organizer.`;
        setState({ status: "gone", message });
        onGone?.();
      } else {
        fail(request, outcome.message);
      }
    },
    [projectId, applySaved, fail, onGone],
  );

  const writeFolder = useCallback(
    async (
      request: OrganizerDropRequest,
      input: OrganizerFieldWriteInput,
    ): Promise<void> => {
      try {
        const saved = await updateFolderMetadata(
          projectId,
          input.resourceId,
          folderPayload(input.changes),
        );
        onFolderSaved?.(input.resourceId, saved);
        setState({
          status: "saved",
          message: `${request.card.name} moved to ${request.destinationLabel}.`,
        });
      } catch (error) {
        fail(request, error instanceof Error ? error.message : "");
      }
    },
    [projectId, onFolderSaved, fail],
  );

  const drop = useCallback(
    async (request: OrganizerDropRequest): Promise<void> => {
      const { plan } = request;
      if (plan.kind === "noop") return;
      if (plan.kind === "refused") {
        setState({ status: "refused", message: plan.message });
        return;
      }
      if (isSaving.current) return;
      isSaving.current = true;
      lastFailed.current = null;
      setState({ status: "saving" });
      try {
        if (request.card.kind === "folder") {
          await writeFolder(request, plan.input);
        } else {
          await writeResource(request, plan.input);
        }
      } finally {
        isSaving.current = false;
      }
    },
    [writeFolder, writeResource],
  );

  const retry = useCallback(async (): Promise<void> => {
    const request = lastFailed.current;
    if (request) await drop(request);
  }, [drop]);

  const announcement =
    state.status === "idle" || state.status === "saving" ? "" : state.message;
  return { state, announcement, drop, retry };
}
