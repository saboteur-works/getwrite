import React from "react";
import type { TipTapDocument } from "../../src/lib/models";
import {
  fetchResourceContent,
  fetchRevisionContent,
  type ResourceContentResponse,
} from "../../src/lib/api/resources";

interface UseRevisionContentOptions {
  initialContent: string;
  selectedResourceId: string | null;
  projectRootPath: string | null;
  currentRevisionId: string | null;
  currentRevisionContent: string | null;
}

interface UseRevisionContentResult {
  content: string;
  tipTapDoc: TipTapDocument | null;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  setTipTapDoc: React.Dispatch<React.SetStateAction<TipTapDocument | null>>;
  parseTipTapRevisionContent: (value: string) => TipTapDocument | null;
}

export function useRevisionContent({
  initialContent,
  selectedResourceId,
  projectRootPath,
  currentRevisionId,
  currentRevisionContent,
}: UseRevisionContentOptions): UseRevisionContentResult {
  const [content, setContent] = React.useState<string>(initialContent);
  const [tipTapDoc, setTipTapDoc] = React.useState<TipTapDocument | null>(null);

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
      if (!selectedResourceId || !projectRootPath) return null;
      return fetchResourceContent(projectRootPath, selectedResourceId);
    }, [projectRootPath, selectedResourceId]);

  const fetchCanonicalRevisionContent = React.useCallback(
    async (revisionId: string): Promise<string | null> => {
      if (!selectedResourceId || !projectRootPath) return null;
      return fetchRevisionContent(
        selectedResourceId,
        projectRootPath,
        revisionId,
      );
    },
    [projectRootPath, selectedResourceId],
  );

  React.useEffect(() => {
    let isCancelled = false;

    const loadResourceAndCanonicalRevision = async () => {
      setContent(initialContent);
      setTipTapDoc(null);

      const resourceData = await loadResourceContent();
      if (!resourceData || isCancelled) {
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
        return;
      }

      const canonicalContent = await fetchCanonicalRevisionContent(
        canonicalRevision.id,
      );

      if (!canonicalContent || isCancelled) {
        return;
      }

      const parsedTipTapDoc = parseTipTapRevisionContent(canonicalContent);
      if (parsedTipTapDoc) {
        setTipTapDoc(parsedTipTapDoc);
        setContent(canonicalContent);
        return;
      }

      setTipTapDoc(null);
      setContent(canonicalContent);
    };

    if (selectedResourceId && projectRootPath) {
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
    projectRootPath,
    selectedResourceId,
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

    setTipTapDoc(null);
    setContent(currentRevisionContent);
  }, [currentRevisionContent, currentRevisionId, parseTipTapRevisionContent]);

  return {
    content,
    tipTapDoc,
    setContent,
    setTipTapDoc,
    parseTipTapRevisionContent,
  };
}
