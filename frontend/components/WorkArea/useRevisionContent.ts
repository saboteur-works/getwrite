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
  const [loadState, setLoadState] =
    React.useState<RevisionContentLoadState>("idle");
  // Bumped by `retryLoad` to re-run the load effect for the same resource.
  const [reloadToken, setReloadToken] = React.useState(0);

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
      setLoadState("loading");

      const resourceData = await loadResourceContent();
      if (isCancelled) return;
      if (!resourceData) {
        // The effect only runs with a resource and project selected, so a
        // null here is a failed read — not "nothing selected".
        setLoadState("error");
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
        setLoadState("loaded");
        return;
      }

      const canonicalContent = await fetchCanonicalRevisionContent(
        canonicalRevision.id,
      );

      if (isCancelled) return;
      if (!canonicalContent) {
        // The canonical revision is the authoritative document. Failing to
        // read one that the resource says exists is an error, however
        // readable the resource files were.
        setLoadState("error");
        return;
      }

      const parsedTipTapDoc = parseTipTapRevisionContent(canonicalContent);
      if (parsedTipTapDoc) {
        setTipTapDoc(parsedTipTapDoc);
        setContent(canonicalContent);
        setLoadState("loaded");
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
      setLoadState("loaded");
    };

    if (selectedResourceId && projectId) {
      void loadResourceAndCanonicalRevision();
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
