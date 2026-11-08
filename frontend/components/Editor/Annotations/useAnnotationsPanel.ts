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
import { selectActiveProjectDirectoryId } from "../../../src/store/projectsSlice";

/** DOM id of the annotations panel region. */
export const ANNOTATIONS_PANEL_ID = "editor-annotations-panel";

/** The selection captured when the writer chose "Add note". */
export interface PendingAnnotationAdd {
  from: number;
  to: number;
  /** The selected text at that moment (becomes the annotation's quote). */
  quote: string;
}

interface AnnotationsPanelController {
  isOpen: boolean;
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
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    setIsOpen(false);
    setPendingAdd(null);
  }, [resetKey]);

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
  return { isOpen, pendingAdd, clearAdd, close, control };
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
interface LoadedSourceRef {
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
