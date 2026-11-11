"use client";

import React from "react";
import type { Editor } from "@tiptap/core";
import { ReactReduxContext } from "react-redux";
import type { AnnotationsToolbarControl } from "../MenuBar/AnnotationsToolbarButton";
import { listAnnotations } from "../../../src/lib/api/annotations";
import { listAttachments } from "../../../src/lib/api/source-attachments";
import { listTrash, type TrashListing } from "../../../src/lib/api/trash";
import type { CitationTargetFacts } from "../../../src/lib/models/citation-target-state";
import type {
  Annotation,
  AnnotationTarget,
  AnyResource,
} from "../../../src/lib/models/types";
import {
  selectActiveProjectDirectoryId,
  selectActiveProjectModules,
} from "../../../src/store/projectsSlice";
import { isModuleEnabled } from "../../../src/lib/models/modules/registry";
import { ModulesOverrideContext } from "../../Modules/ModulesContext";
import {
  updateClaimStatementFlow,
  updateClaimStatusFlow,
  updateClaimTargetFlow,
  type ClaimFlowApi,
  type UpdateClaimResult,
} from "../../../src/lib/claim-flows";
import type { ClaimStatus } from "../../../src/lib/models/claim-types";

import {
  clearAnnotationsPanelRequest,
  getAnnotationsPanelRequest,
  subscribeAnnotationsPanelRequest,
} from "./annotationsPanelRequest";

/** DOM id of the annotations panel region. */
export const ANNOTATIONS_PANEL_ID = "editor-annotations-panel";

/** The selection captured when the writer chose "Add note". */
export interface PendingAnnotationAdd {
  from: number;
  to: number;
  /** The selected text at that moment (becomes the annotation's quote). */
  quote: string;
}

/** The row the panel brings into view after an outside request opened it. */
export interface AnnotationsPanelFocus {
  annotationId: string;
  /** The claim's passage was not found in the saved document. */
  isPassageMissing: boolean;
}

interface AnnotationsPanelController {
  isOpen: boolean;
  /** Set when the Claims tab asked for a row; the panel clears it when handled. */
  focus: AnnotationsPanelFocus | null;
  clearFocus: () => void;
  /** Set between choosing "Add note" and saving or cancelling the form. */
  pendingAdd: PendingAnnotationAdd | null;
  /** Ends the add form (saved or cancelled). */
  clearAdd: () => void;
  /** Closes the panel and returns focus to the toolbar button. */
  close: () => void;
  /** Props for the toolbar button. */
  control: AnnotationsToolbarControl;
}

/**
 * Open state of the annotations panel and the focus return to its opener
 * (Feature 101, FR-14), plus the add control (FR-12): `canAdd` follows a
 * non-empty selection in an editable editor, and `onAdd` captures that
 * selection and opens the panel's add form. `resetKey` closes the panel and
 * drops a pending add when the document changes.
 */
export function useAnnotationsPanel(
  resetKey: string | undefined,
  editor: Editor | null = null,
): AnnotationsPanelController {
  const [isOpen, setIsOpen] = React.useState(false);
  const [pendingAdd, setPendingAdd] =
    React.useState<PendingAnnotationAdd | null>(null);
  const [canAdd, setCanAdd] = React.useState(false);
  const [focus, setFocus] = React.useState<AnnotationsPanelFocus | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const request = React.useSyncExternalStore(
    subscribeAnnotationsPanelRequest,
    getAnnotationsPanelRequest,
    () => null,
  );

  React.useEffect(() => {
    setIsOpen(false);
    setPendingAdd(null);
    setFocus(null);
  }, [resetKey]);

  // Declared after the reset above, so a request for the resource that was
  // just opened is applied after the reset, not wiped by it.
  React.useEffect(() => {
    if (request === null || request.resourceId !== resetKey) return;
    setPendingAdd(null);
    setIsOpen(true);
    setFocus({
      annotationId: request.annotationId,
      isPassageMissing: request.isPassageMissing,
    });
    clearAnnotationsPanelRequest(request.token);
  }, [request, resetKey]);

  const clearFocus = React.useCallback(() => setFocus(null), []);

  React.useEffect(() => {
    if (!editor) {
      setCanAdd(false);
      return;
    }
    const update = (): void =>
      setCanAdd(editor.isEditable && !editor.state.selection.empty);
    update();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  const onAdd = React.useCallback(() => {
    if (!editor || editor.state.selection.empty) return;
    const { from, to } = editor.state.selection;
    setPendingAdd({
      from,
      to,
      quote: editor.state.doc.textBetween(from, to, "\n"),
    });
    setIsOpen(true);
  }, [editor]);

  const clearAdd = React.useCallback(() => setPendingAdd(null), []);

  const close = React.useCallback(() => {
    setIsOpen(false);
    setPendingAdd(null);
    setFocus(null);
    buttonRef.current?.focus();
  }, []);

  const control: AnnotationsToolbarControl = {
    isOpen,
    onToggle: () => (isOpen ? close() : setIsOpen(true)),
    buttonRef,
    panelId: ANNOTATIONS_PANEL_ID,
    canAdd,
    onAdd: editor ? onAdd : undefined,
  };
  return { isOpen, focus, clearFocus, pendingAdd, clearAdd, close, control };
}

/**
 * What the panel knows about a citation's target (Feature 103, FR-27).
 * `unknown` means a read failed or there is no project to read from: it is
 * shown as "could not be checked", never as removed and never as present.
 */
export type CitationFactsResult =
  | { status: "checking" }
  | { status: "known"; facts: CitationTargetFacts }
  | { status: "unknown" };

/** The existing reads the facts come from; injectable for tests. */
export interface CitationFactsDeps {
  listTrash: (projectId: string) => Promise<TrashListing>;
  listAttachments: (
    projectId: string,
    sourceId: string,
  ) => Promise<readonly { id: string }[]>;
  listAnnotations: (
    projectId: string,
    sourceId: string,
  ) => Promise<readonly Pick<Annotation, "id">[]>;
}

/** A Source in the loaded project, from the resources in the store. */
export interface LoadedSourceRef {
  id: string;
  name: string;
}

const LIVE_DEPS: CitationFactsDeps = {
  listTrash,
  listAttachments,
  listAnnotations,
};

function isInTrash(listing: TrashListing, sourceId: string): boolean {
  return (
    listing.resources.some((r) => r.id === sourceId) ||
    listing.folders.some((f) => f.descendants.some((d) => d.id === sourceId))
  );
}

/**
 * A reader of citation-target facts for one project that shares each read
 * between the targets it is asked about. A Source in the loaded resources is
 * present; one that is not is looked up in Trash (in Trash, else purged).
 * Attachments and excerpts are read from the Source only while it is present.
 * Any failed read resolves `unknown`.
 */
function createCitationFactsReader(
  deps: CitationFactsDeps,
  projectId: string,
  sources: readonly LoadedSourceRef[],
): (target: AnnotationTarget) => Promise<CitationFactsResult> {
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, read: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit) return hit as Promise<T>;
    const started = read();
    cache.set(key, started);
    return started;
  };
  return async (target) => {
    try {
      const loaded = sources.find((s) => s.id === target.sourceId);
      if (!loaded) {
        const listing = await once("trash", () => deps.listTrash(projectId));
        return {
          status: "known",
          facts: {
            source: isInTrash(listing, target.sourceId) ? "in-trash" : "absent",
          },
        };
      }
      const facts: CitationTargetFacts = {
        source: "present",
        currentSourceName: loaded.name,
      };
      if (target.attachmentId !== undefined) {
        const list = await once(`att:${target.sourceId}`, () =>
          deps.listAttachments(projectId, target.sourceId),
        );
        facts.attachment = list.some((a) => a.id === target.attachmentId)
          ? "present"
          : "removed";
      }
      if (target.excerptId !== undefined) {
        const list = await once(`exc:${target.sourceId}`, () =>
          deps.listAnnotations(projectId, target.sourceId),
        );
        facts.excerpt = list.some((a) => a.id === target.excerptId)
          ? "present"
          : "removed";
      }
      return { status: "known", facts };
    } catch {
      return { status: "unknown" };
    }
  };
}

const NO_SOURCES: readonly AnyResource[] = [];
const noopSubscribe = (): (() => void) => () => undefined;

/**
 * Citation facts for the annotations that carry a `target`, keyed by
 * annotation id. Reads through the existing Trash, attachment and annotation
 * reads; builds no index. Without a store or an active project the result is
 * `unknown`, not an empty or removed state.
 */
export function useCitationFacts(
  annotations: readonly Annotation[],
  deps: CitationFactsDeps = LIVE_DEPS,
): ReadonlyMap<string, CitationFactsResult> {
  const store = React.useContext(ReactReduxContext)?.store;
  const subscribe = store ? store.subscribe : noopSubscribe;
  const projectId = React.useSyncExternalStore(
    subscribe,
    () => (store ? selectActiveProjectDirectoryId(store.getState()) : null),
    () => null,
  );
  const resources = React.useSyncExternalStore(
    subscribe,
    () =>
      (
        store?.getState() as
          | { resources?: { resources?: readonly AnyResource[] } }
          | undefined
      )?.resources?.resources ?? NO_SOURCES,
    () => NO_SOURCES,
  );
  const sources = React.useMemo<LoadedSourceRef[]>(
    () =>
      resources
        .filter((r) => r.type === "source")
        .map((r) => ({ id: r.id, name: r.name })),
    [resources],
  );
  const targeted = React.useMemo(
    () => annotations.filter((a) => a.target !== undefined),
    [annotations],
  );
  const key = `${projectId ?? ""}|${sources
    .map((s) => `${s.id}=${s.name}`)
    .join(
      ",",
    )}|${targeted.map((a) => `${a.id}:${JSON.stringify(a.target)}`).join(";")}`;
  const [settled, setSettled] = React.useState<{
    key: string;
    results: ReadonlyMap<string, CitationFactsResult>;
  } | null>(null);

  React.useEffect(() => {
    if (targeted.length === 0 || projectId === null) return;
    let isCurrent = true;
    const read = createCitationFactsReader(deps, projectId, sources);
    void Promise.all(
      targeted.map(
        async (a) => [a.id, await read(a.target as AnnotationTarget)] as const,
      ),
    ).then((entries) => {
      if (isCurrent) setSettled({ key, results: new Map(entries) });
    });
    return () => {
      isCurrent = false;
    };
    // `key` covers projectId, sources and targeted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, deps]);

  return React.useMemo(() => {
    if (targeted.length === 0) return new Map();
    if (projectId === null) {
      return new Map(
        targeted.map((a) => [
          a.id,
          { status: "unknown" } as CitationFactsResult,
        ]),
      );
    }
    if (settled && settled.key === key) return settled.results;
    return new Map(
      targeted.map((a) => [
        a.id,
        { status: "checking" } as CitationFactsResult,
      ]),
    );
  }, [targeted, projectId, settled, key]);
}

/** The store reads the panel's claim wiring needs; each is absent without a store. */
export interface PanelScope {
  projectId: string | null;
  /** The resource open in the work area; the fallback when no id is passed. */
  selectedResourceId: string | null;
  /** Sources in the loaded project, for the Source picker. */
  sources: readonly LoadedSourceRef[];
}

/**
 * The active project id, the selected resource id and the loaded Sources.
 * Like `useCitationFacts` it tolerates a missing store (Storybook, tests).
 */
export function usePanelScope(): PanelScope {
  const store = React.useContext(ReactReduxContext)?.store;
  const subscribe = store ? store.subscribe : noopSubscribe;
  const projectId = React.useSyncExternalStore(
    subscribe,
    () => (store ? selectActiveProjectDirectoryId(store.getState()) : null),
    () => null,
  );
  const selectedResourceId = React.useSyncExternalStore(
    subscribe,
    () =>
      (
        store?.getState() as
          | { resources?: { selectedResourceId?: string | null } }
          | undefined
      )?.resources?.selectedResourceId ?? null,
    () => null,
  );
  const resources = React.useSyncExternalStore(
    subscribe,
    () =>
      (
        store?.getState() as
          | { resources?: { resources?: readonly AnyResource[] } }
          | undefined
      )?.resources?.resources ?? NO_SOURCES,
    () => NO_SOURCES,
  );
  const sources = React.useMemo<LoadedSourceRef[]>(
    () =>
      resources
        .filter((r) => r.type === "source")
        .map((r) => ({ id: r.id, name: r.name })),
    [resources],
  );
  return { projectId, selectedResourceId, sources };
}

/**
 * Whether a module is on for the active project: the same rule and the same
 * `ModulesOverrideContext` as `useModuleEnabled`, but tolerant of a missing
 * store (the panel's existing tests mount it without a Provider). With no
 * store and no override the module's own default applies.
 */
export function useModuleSwitch(moduleId: string): boolean {
  const override = React.useContext(ModulesOverrideContext);
  const store = React.useContext(ReactReduxContext)?.store;
  const subscribe = store ? store.subscribe : noopSubscribe;
  const stored = React.useSyncExternalStore(
    subscribe,
    () => (store ? selectActiveProjectModules(store.getState()) : undefined),
    () => undefined,
  );
  return isModuleEnabled({ modules: override ?? stored }, moduleId);
}

/** The result of one claim write, as the row and the panel read it. */
type ClaimActionResult = { ok: true } | { ok: false; message: string };

export interface ClaimActions {
  /** The list with each stored write laid over the entry it replaced. */
  annotations: Annotation[];
  setStatus: (id: string, status: ClaimStatus) => Promise<ClaimActionResult>;
  setStatement: (id: string, statement: string) => Promise<ClaimActionResult>;
  /** A `null` target clears the Source link. */
  setTarget: (
    id: string,
    target: AnnotationTarget | null,
  ) => Promise<ClaimActionResult>;
}

interface StoredOverride {
  /** The list entry the write was made against. */
  base: Annotation;
  stored: Annotation;
}

const UNAVAILABLE: ClaimActionResult = {
  ok: false,
  message: "Claims cannot be changed here.",
};

/**
 * Non-optimistic claim writes through the injected `ClaimFlowApi` (Feature
 * 108, FR-11, FR-15). The annotations handle has no claim update, so a stored
 * result is laid over the entry it was written against; once the handle
 * replaces that entry (a reload, a re-attach) the override is dropped and the
 * handle's value, which is the later read, shows. A failed write changes
 * nothing and returns its message.
 */
export function useClaimActions(
  annotations: readonly Annotation[],
  scope: {
    projectId: string | null;
    resourceId: string | undefined;
    api: ClaimFlowApi;
  },
): ClaimActions {
  const { projectId, resourceId, api } = scope;
  const [overrides, setOverrides] = React.useState<
    ReadonlyMap<string, StoredOverride>
  >(new Map());
  const listRef = React.useRef(annotations);
  listRef.current = annotations;

  const run = React.useCallback(
    async (
      id: string,
      write: (base: {
        projectId: string;
        resourceId: string;
        annotationId: string;
      }) => Promise<UpdateClaimResult>,
    ): Promise<ClaimActionResult> => {
      if (projectId === null || resourceId === undefined) return UNAVAILABLE;
      const base = listRef.current.find((a) => a.id === id);
      if (!base) return UNAVAILABLE;
      const result = await write({ projectId, resourceId, annotationId: id });
      if (!result.ok) return { ok: false, message: result.message };
      const stored = result.annotation;
      setOverrides((prev) => new Map(prev).set(id, { base, stored }));
      return { ok: true };
    },
    [projectId, resourceId],
  );

  const setStatus = React.useCallback(
    (id: string, status: ClaimStatus) =>
      run(id, (base) => updateClaimStatusFlow(api, { ...base, status })),
    [run, api],
  );
  const setStatement = React.useCallback(
    (id: string, statement: string) =>
      run(id, (base) => updateClaimStatementFlow(api, { ...base, statement })),
    [run, api],
  );
  const setTarget = React.useCallback(
    (id: string, target: AnnotationTarget | null) =>
      run(id, (base) => updateClaimTargetFlow(api, { ...base, target })),
    [run, api],
  );

  const merged = React.useMemo(
    () =>
      annotations.map((a) => {
        const hit = overrides.get(a.id);
        return hit && hit.base === a ? hit.stored : a;
      }),
    [annotations, overrides],
  );
  return { annotations: merged, setStatus, setStatement, setTarget };
}
