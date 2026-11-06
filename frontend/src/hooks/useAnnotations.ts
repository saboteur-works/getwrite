"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  addAnnotation,
  deleteAnnotation,
  listAnnotations,
  reattachAnnotation,
  updateAnnotation,
} from "../lib/api/annotations";
import {
  addAnnotationFlow,
  reattachAnnotationFlow,
  removeAnnotationFlow,
  type AddAnnotationResult,
  type AnnotationFlowApi,
  type AnnotationRange,
  type AnnotationReattachApi,
  type ReattachAnnotationResult,
  type RemoveAnnotationResult,
} from "../lib/annotation-flows";
import { isLockedAccessError } from "../lib/models/locked-access";
import type { Annotation } from "../lib/models/types";

/**
 * @module useAnnotations
 *
 * Read state and explicit writes for one text resource's annotations
 * (Feature 101, FR-12, FR-14, FR-15, FR-22). A hook rather than a slice: the
 * list is local to the open resource and shared only by components that
 * receive this hook's result.
 *
 * - `loading`, then `ok` with the list (`[]` means none), or `failed` with
 *   the error message. A failed read is never `ok` with `[]`; `retry` reads
 *   again. A locked-access error is rethrown during render.
 * - Re-attach (FR-16) is an add-like write: the new quote is stored first, the
 *   same-id mark is applied after.
 * - Writes are non-optimistic: the list changes only after the transport
 *   resolved. After a delete whose body write succeeded the annotation leaves
 *   the list even if the mark step failed (the body is gone). After an add
 *   whose mark step failed the stored annotation is listed (detached).
 * - A response for a previous resource or read is discarded.
 */

export type AnnotationsState =
  | { status: "loading" }
  | { status: "ok"; annotations: Annotation[] }
  | { status: "failed"; message: string };

type UpdateAnnotationResult = { ok: true } | { ok: false; message: string };

export interface AnnotationsHandle {
  state: AnnotationsState;
  retry: () => void;
  add: (body: string, range: AnnotationRange) => Promise<AddAnnotationResult>;
  update: (
    annotationId: string,
    body: string,
  ) => Promise<UpdateAnnotationResult>;
  /** Re-attach a detached annotation to `range` (same id, new quote). */
  reattach: (
    annotationId: string,
    range: AnnotationRange,
  ) => Promise<ReattachAnnotationResult>;
  remove: (annotationId: string) => Promise<RemoveAnnotationResult>;
}

const API: AnnotationFlowApi = { add: addAnnotation, remove: deleteAnnotation };
const REATTACH_API: AnnotationReattachApi = { reattach: reattachAnnotation };

type Settled =
  | { key: string; state: AnnotationsState }
  | { key: string; locked: unknown };

export function useAnnotations(
  projectId: string | undefined,
  resourceId: string | undefined,
  editor: Editor | null,
): AnnotationsHandle {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const isReading = projectId !== undefined && resourceId !== undefined;
  const key = `${projectId ?? ""}/${resourceId ?? ""}#${attempt}`;

  useEffect(() => {
    if (projectId === undefined || resourceId === undefined) return;
    let isCurrent = true;
    listAnnotations(projectId, resourceId).then(
      (annotations) => {
        if (isCurrent)
          setSettled({ key, state: { status: "ok", annotations } });
      },
      (error: unknown) => {
        if (!isCurrent) return;
        if (isLockedAccessError(error)) setSettled({ key, locked: error });
        else
          setSettled({
            key,
            state: {
              status: "failed",
              message:
                error instanceof Error && error.message
                  ? error.message
                  : "The annotations could not be read.",
            },
          });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, resourceId, key]);

  const change = useCallback(
    (apply: (list: Annotation[]) => Annotation[]) => {
      setSettled((prev) =>
        prev &&
        prev.key === key &&
        "state" in prev &&
        prev.state.status === "ok"
          ? {
              key,
              state: {
                status: "ok",
                annotations: apply(prev.state.annotations),
              },
            }
          : prev,
      );
    },
    [key],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const add = useCallback(
    async (body: string, range: AnnotationRange) => {
      if (!isReading || !editor)
        return {
          ok: false,
          stage: "write",
          message: "Annotations are not available here.",
        } satisfies AddAnnotationResult;
      const result = await addAnnotationFlow(API, {
        editor,
        projectId,
        resourceId,
        body,
        range,
      });
      if (result.ok || result.stage === "mark") {
        const added = result.annotation;
        change((list) => [...list.filter((a) => a.id !== added.id), added]);
      }
      return result;
    },
    [isReading, editor, projectId, resourceId, change],
  );

  const update = useCallback(
    async (annotationId: string, body: string) => {
      if (!isReading)
        return {
          ok: false,
          message: "Annotations are not available here.",
        } as const;
      try {
        const stored = await updateAnnotation(
          projectId,
          resourceId,
          annotationId,
          body,
        );
        change((list) => list.map((a) => (a.id === stored.id ? stored : a)));
        return { ok: true } as const;
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error && error.message
              ? error.message
              : "The note could not be updated.",
        } as const;
      }
    },
    [isReading, projectId, resourceId, change],
  );

  const reattach = useCallback(
    async (annotationId: string, range: AnnotationRange) => {
      if (!isReading || !editor)
        return {
          ok: false,
          stage: "write",
          message: "Annotations are not available here.",
        } satisfies ReattachAnnotationResult;
      const result = await reattachAnnotationFlow(REATTACH_API, {
        editor,
        projectId,
        resourceId,
        annotationId,
        range,
      });
      if (result.ok || result.stage === "mark") {
        const stored = result.annotation;
        change((list) => list.map((a) => (a.id === stored.id ? stored : a)));
      }
      return result;
    },
    [isReading, editor, projectId, resourceId, change],
  );

  const remove = useCallback(
    async (annotationId: string) => {
      if (!isReading)
        return {
          ok: false,
          stage: "body",
          message: "Annotations are not available here.",
        } satisfies RemoveAnnotationResult;
      const result = await removeAnnotationFlow(API, {
        editor,
        projectId,
        resourceId,
        annotationId,
      });
      if (result.ok || result.stage === "mark")
        change((list) => list.filter((a) => a.id !== annotationId));
      return result;
    },
    [isReading, editor, projectId, resourceId, change],
  );

  let state: AnnotationsState = { status: "loading" };
  if (settled && settled.key === key) {
    if ("locked" in settled) throw settled.locked;
    state = settled.state;
  }
  return { state, retry, add, update, reattach, remove };
}
