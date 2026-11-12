"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useAppSelector from "../../../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../../../src/store/projectsSlice";
import { selectQueryState } from "../../../../src/store/querySlice";
import { evaluateQueryAst } from "../../../../src/store/query-transport-service";

/** Fallback when the evaluation rejects with something that is not an Error. */
const EVALUATION_FAILED_MESSAGE = "Unable to read the smart folder.";

/**
 * What the grid knows about a smart-folder source. `ready.ids` are the
 * matching resource ids exactly as the transport returned them (no order
 * is promised); `organizerSource.ts` puts them in tree order.
 */
export type OrganizerSmartFolderState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed"; message: string; retry: () => void }
  | { status: "deleted" }
  | { status: "ready"; ids: readonly string[] };

export interface UseOrganizerSmartFolderCardsResult {
  state: OrganizerSmartFolderState;
  /** Re-evaluates the smart folder (shows loading until it settles). */
  refresh: () => void;
}

/** The inputs one evaluation ran for; a result is shown only while they match. */
interface EvaluationInputs {
  queryId: string;
  directoryId: string;
  nonce: number;
  savedQueries: object;
}

type Evaluation = EvaluationInputs &
  (
    | { outcome: "ready"; ids: readonly string[] }
    | { outcome: "failed"; message: string }
  );

function sameInputs(a: EvaluationInputs, b: EvaluationInputs): boolean {
  return (
    a.queryId === b.queryId &&
    a.directoryId === b.directoryId &&
    a.nonce === b.nonce &&
    a.savedQueries === b.savedQueries
  );
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : EVALUATION_FAILED_MESSAGE;
}

/**
 * Evaluates a smart-folder source into this hook's own local state.
 *
 * It calls the transport function `evaluateQueryAst` directly, never the
 * `evaluateQuery` thunk, so `activeQueryIds`, `activeQueryDefinition` and the
 * shell's active smart folder are left alone. "Deleted" is reported only when
 * the saved-query list has loaded for the selected project and the id is
 * absent; an unloaded list is loading, and a failed list load is failed.
 * It does not load the list itself (AppShell does).
 */
export function useOrganizerSmartFolderCards(
  queryId: string | null,
): UseOrganizerSmartFolderCardsResult {
  const directoryId = useAppSelector(selectActiveProjectDirectoryId);
  const selectedProjectId = useAppSelector(
    (state) => state.projects.selectedProjectId,
  );
  const queryState = useAppSelector(selectQueryState);
  const [nonce, setNonce] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  const isListLoaded =
    selectedProjectId !== null &&
    queryState.projectId === selectedProjectId &&
    !queryState.isLoadingQueries;
  const savedQueries = isListLoaded ? queryState.savedQueries : null;
  const isPresent =
    queryId !== null && savedQueries !== null && queryId in savedQueries;
  const hasListFailed =
    !isListLoaded &&
    !queryState.isLoadingQueries &&
    queryState.errorMessage !== "";

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const inputs = useMemo<EvaluationInputs | null>(
    () =>
      isPresent && queryId !== null && directoryId !== null && savedQueries
        ? { queryId, directoryId, nonce, savedQueries }
        : null,
    [isPresent, queryId, directoryId, nonce, savedQueries],
  );

  useEffect(() => {
    if (inputs === null) return;
    let isStale = false;
    evaluateQueryAst(
      { projectId: inputs.directoryId },
      { op: "ref", id: inputs.queryId },
    ).then(
      (data) => {
        if (!isStale) {
          setEvaluation({ ...inputs, outcome: "ready", ids: data.ids });
        }
      },
      (error: unknown) => {
        if (!isStale) {
          setEvaluation({
            ...inputs,
            outcome: "failed",
            message: errorMessageOf(error),
          });
        }
      },
    );
    return () => {
      isStale = true;
    };
  }, [inputs]);

  const state = useMemo<OrganizerSmartFolderState>(() => {
    if (queryId === null) return { status: "idle" };
    if (hasListFailed) {
      return {
        status: "failed",
        message: queryState.errorMessage,
        retry: refresh,
      };
    }
    if (!isListLoaded) return { status: "loading" };
    if (!isPresent) return { status: "deleted" };
    if (
      inputs === null ||
      evaluation === null ||
      !sameInputs(evaluation, inputs)
    ) {
      return { status: "loading" };
    }
    if (evaluation.outcome === "failed") {
      return { status: "failed", message: evaluation.message, retry: refresh };
    }
    return { status: "ready", ids: evaluation.ids };
  }, [
    queryId,
    hasListFailed,
    isListLoaded,
    isPresent,
    inputs,
    evaluation,
    queryState.errorMessage,
    refresh,
  ]);

  return { state, refresh };
}
