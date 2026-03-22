import React from "react";
import type { TipTapDocument } from "../../src/lib/models";

interface ResourceContentResponse {
    resourceContent?: {
        tipTapContent?: TipTapDocument | null;
        plaintextContent?: string | null;
    };
    revisions?: Array<{
        id: string;
        isCanonical: boolean;
    }>;
}

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
    const [tipTapDoc, setTipTapDoc] = React.useState<TipTapDocument | null>(
        null,
    );

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

    const fetchResourceContent =
        React.useCallback(async (): Promise<ResourceContentResponse | null> => {
            if (!selectedResourceId || !projectRootPath) {
                return null;
            }

            const response = await fetch("/api/project-resources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectPath: projectRootPath,
                    resourceId: selectedResourceId,
                }),
            });

            if (!response.ok) {
                return null;
            }

            return (await response.json()) as ResourceContentResponse;
        }, [projectRootPath, selectedResourceId]);

    const fetchCanonicalRevisionContent = React.useCallback(
        async (revisionId: string): Promise<string | null> => {
            if (!selectedResourceId || !projectRootPath) {
                return null;
            }

            const params = new URLSearchParams({
                projectPath: projectRootPath,
                revisionId,
            });

            const response = await fetch(
                `/api/resource/revision/${selectedResourceId}?${params.toString()}`,
            );

            if (!response.ok) {
                return null;
            }

            const payload = (await response.json()) as { content?: unknown };
            return typeof payload.content === "string" ? payload.content : null;
        },
        [projectRootPath, selectedResourceId],
    );

    React.useEffect(() => {
        let isCancelled = false;

        const loadResourceAndCanonicalRevision = async () => {
            setContent(initialContent);
            setTipTapDoc(null);

            const resourceData = await fetchResourceContent();
            if (!resourceData || isCancelled) {
                return;
            }

            if (
                resourceData.resourceContent?.tipTapContent &&
                Object.keys(resourceData.resourceContent.tipTapContent).length >
                    0
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

            const parsedTipTapDoc =
                parseTipTapRevisionContent(canonicalContent);
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
        fetchResourceContent,
        initialContent,
        parseTipTapRevisionContent,
        projectRootPath,
        selectedResourceId,
    ]);

    React.useEffect(() => {
        if (!currentRevisionId || currentRevisionContent === null) {
            return;
        }

        const parsedTipTapDoc = parseTipTapRevisionContent(
            currentRevisionContent,
        );

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
        parseTipTapRevisionContent,
    };
}
