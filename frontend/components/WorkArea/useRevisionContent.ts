import React from "react";
import type { TipTapDocument } from "../../src/lib/models";
import {
  fetchResourceContent,
  fetchRevisionContent,
  type ResourceContentResponse,
} from "../../src/lib/api/resources";
import { plainTextToTiptap } from "../../src/lib/tiptap-text";

interface UseRevisionContentOptions {
  initialContent: string;
  selectedResourceId: string | null;
  /**
   * The active project's on-disk directory basename (see
   * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), NOT
   * `StoredProject.id`/`rootPath`. Sent as `projectId` to
   * `/api/project-resources` and `/api/resource/revision/*`
   * (ADR-017/018 tenant-route migration).
   */
  projectId: string | null;
  currentRevisionId: string | null;
  currentRevisionContent: string | null;
}

/**
 * Whether the selected resource's content actually loaded.
 *
 * `"error"` is distinct from "loaded and empty". Both transports collapse a
 * failed read and an absent value into `null` (`fetchContent`,
 * `fetchRevisionContent`), and this hook used to return early on either — so a
 * failed read left the editor showing `initialContent` with no error, no
 * retry, and nothing to tell a writer that the document they were looking at
 * was not the document on disk. The first keystroke then autosaved that empty
 * editor over real content.
 *
 * `"loading"` is distinct from `"loaded"` for the same reason, and was
 * declared here but never returned. Measured before this fix, with the
 * resource read held deliberately unresolved:
 *
 *     in-flight :: loadState = "loaded" | content = "" | tipTapDoc = null
 *
 * So for the whole duration of every read — initial load and retry alike —
 * the hook reported a loaded, empty document, and `EditView` rendered a
 * typeable editor over it. That is the same shape as the failure case above,
 * reached by a different route. It also made
 * `useRevisionContent-load-failure`'s retry test race the fetch, since
 * `waitFor(loadState === "loaded")` was satisfied immediately by the
 * in-flight state; that test was misdiagnosed as slow and given a longer
 * timeout in #225, which changed nothing, and it failed in CI.
 */
export type RevisionContentLoadState = "idle" | "loading" | "loaded" | "error";

interface UseRevisionContentResult {
  content: string;
  tipTapDoc: TipTapDocument | null;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  setTipTapDoc: React.Dispatch<React.SetStateAction<TipTapDocument | null>>;
  parseTipTapRevisionContent: (value: string) => TipTapDocument | null;
  /** Whether the load succeeded; see {@link RevisionContentLoadState}. */
  loadState: RevisionContentLoadState;
  /** Re-runs the load for the current resource. */
  retryLoad: () => void;
}

export function useRevisionContent({
  initialContent,
  selectedResourceId,
  projectId,
  currentRevisionId,
  currentRevisionContent,
}: UseRevisionContentOptions): UseRevisionContentResult {
  const [content, setContent] = React.useState<string>(initialContent);
  const [tipTapDoc, setTipTapDoc] = React.useState<TipTapDocument | null>(null);
  // Whether the last load attempt hit a failed read. Kept separate from
  // `loadState` because a failed read only MATTERS when it leaves nothing to
  // show: `EditView` also receives content from Redux (`currentRevisionContent`,
  // the effect below), so a resource whose document arrived by another route is
  // not in trouble just because one fetch failed.
  const [hasReadFailed, setHasReadFailed] = React.useState(false);
  // Bumped by `retryLoad` to re-run the load effect for the same resource.
  const [reloadToken, setReloadToken] = React.useState(0);
  // The load this hook has actually finished, as an opaque key. Compared
  // against the key the current props imply, this makes "a read is in flight"
  // DERIVED rather than a flag an effect has to set — so the very first render
  // after a resource is selected already reports "loading", instead of a frame
  // of "loaded" with an empty document before the effect runs.
  const [settledLoadKey, setSettledLoadKey] = React.useState<string | null>(
    null,
  );
  const loadKey =
    selectedResourceId && projectId
      ? `${projectId}\u0000${selectedResourceId}\u0000${reloadToken}`
      : null;

  const retryLoad = React.useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const parseTipTapRevisionContent = React.useCallback(
    (value: string): TipTapDocument | null => {
      const trimmed = value.trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return null;
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          "type" in parsed &&
          (parsed as { type?: unknown }).type === "doc"
        ) {
          return parsed as TipTapDocument;
        }
      } catch {
        return null;
      }

      return null;
    },
    [],
  );

  const loadResourceContent =
    React.useCallback(async (): Promise<ResourceContentResponse | null> => {
      if (!selectedResourceId || !projectId) return null;
      return fetchResourceContent(projectId, selectedResourceId);
    }, [projectId, selectedResourceId]);

  const fetchCanonicalRevisionContent = React.useCallback(
    async (revisionId: string): Promise<string | null> => {
      if (!selectedResourceId || !projectId) return null;
      return fetchRevisionContent(selectedResourceId, projectId, revisionId);
    },
    [projectId, selectedResourceId],
  );

  React.useEffect(() => {
    let isCancelled = false;

    const loadResourceAndCanonicalRevision = async () => {
      setContent(initialContent);
      setTipTapDoc(null);
      setHasReadFailed(false);

      const resourceData = await loadResourceContent();
      if (isCancelled) return;
      if (!resourceData) {
        // The effect only runs with a resource and project selected, so a
        // null here is a failed read — not "nothing selected".
        setHasReadFailed(true);
        return;
      }

      if (
        resourceData.resourceContent?.tipTapContent &&
        Object.keys(resourceData.resourceContent.tipTapContent).length > 0
      ) {
        setTipTapDoc(resourceData.resourceContent.tipTapContent);
      }

      if (
        resourceData.resourceContent?.plaintextContent &&
        resourceData.resourceContent.plaintextContent !== ""
      ) {
        setContent(resourceData.resourceContent.plaintextContent);
      }

      const canonicalRevision = resourceData.revisions?.find(
        (revision) => revision.isCanonical,
      );

      if (!canonicalRevision?.id) {
        // A resource with no canonical revision is an ordinary state, not a
        // failure: what the resource files hold is all there is.
        return;
      }

      const canonicalContent = await fetchCanonicalRevisionContent(
        canonicalRevision.id,
      );

      if (isCancelled) return;
      if (canonicalContent === null) {
        setHasReadFailed(true);
        // The canonical revision is the authoritative document. Failing to
        // read one that the resource says exists is an error, however
        // readable the resource files were.
        //
        // Compared against `null` specifically, NOT falsiness: `""` is a
        // legitimately EMPTY document — a resource whose first revision holds
        // nothing yet — and treating it as a failure would put an error in
        // front of a writer whose document is simply blank.
        return;
      }

      const parsedTipTapDoc = parseTipTapRevisionContent(canonicalContent);
      if (parsedTipTapDoc) {
        setTipTapDoc(parsedTipTapDoc);
        setContent(canonicalContent);
        return;
      }

      // A canonical revision whose payload is plain text rather than a
      // serialized document (written by `createResourceCore` and
      // `createProjectFromType` for a new resource's first revision). Convert
      // it instead of clearing the document: `EditView` passes
      // `tipTapDoc ?? content` to the editor, and a bare string reaches Tiptap
      // as HTML, where every newline collapses — silently flattening the
      // resource to one paragraph, which the canonical autosave then persists.
      setTipTapDoc(plainTextToTiptap(canonicalContent));
      setContent(canonicalContent);
    };

    if (selectedResourceId && projectId) {
      // `finally` rather than a call after each `return`: the function has
      // five exit paths and a missed one would leave the view loading
      // forever. A cancelled effect deliberately does NOT settle — its key is
      // already stale, and the effect that superseded it owns the state.
      void loadResourceAndCanonicalRevision().finally(() => {
        if (!isCancelled) setSettledLoadKey(loadKey);
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [
    fetchCanonicalRevisionContent,
    loadResourceContent,
    initialContent,
    parseTipTapRevisionContent,
    projectId,
    selectedResourceId,
    reloadToken,
    loadKey,
  ]);

  React.useEffect(() => {
    if (!currentRevisionId || currentRevisionContent === null) {
      return;
    }

    const parsedTipTapDoc = parseTipTapRevisionContent(currentRevisionContent);

    if (parsedTipTapDoc) {
      setTipTapDoc(parsedTipTapDoc);
      setContent(currentRevisionContent);
      return;
    }

    // Same plain-text payload case as the canonical load above: convert
    // rather than clear, so viewing an older plain-text revision keeps its
    // paragraphs instead of collapsing into one.
    setTipTapDoc(plainTextToTiptap(currentRevisionContent));
    setContent(currentRevisionContent);
  }, [currentRevisionContent, currentRevisionId, parseTipTapRevisionContent]);

  // "idle" first: with nothing selected there is no read to be waiting on.
  //
  // "loading" is reported only while a read is in flight AND there is nothing
  // to show meanwhile — the same reasoning as "error" below, since they are
  // one hazard reached at different times: an in-flight read, like a failed
  // one, only endangers a writer when it leaves an empty editor to type into,
  // whose first keystroke autosaves over content that is still on disk. A
  // document that arrived by another route (`initialContent` from the store,
  // or `currentRevisionContent`) is right there on screen, and withholding
  // the editor would flicker it away for no gain.
  //
  // Being permissive here is safe precisely because it cannot mask a failure:
  // if the read then fails, "error" still fires on its own, stricter
  // condition, which is left exactly as it shipped.
  const hasNothingToShowMeanwhile = tipTapDoc === null && content === "";
  const loadState: RevisionContentLoadState =
    loadKey === null
      ? "idle"
      : settledLoadKey !== loadKey && hasNothingToShowMeanwhile
        ? "loading"
        : hasReadFailed && tipTapDoc === null
          ? "error"
          : "loaded";

  return {
    content,
    tipTapDoc,
    setContent,
    setTipTapDoc,
    parseTipTapRevisionContent,
    loadState,
    retryLoad,
  };
}
