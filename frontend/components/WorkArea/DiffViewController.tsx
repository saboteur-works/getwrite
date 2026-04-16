import { diffWords } from "diff";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import {
    fetchRevisionContentForSelectedResource,
    loadRevisionsForSelectedResource,
    selectCurrentRevisionContent,
    selectCurrentRevisionId,
    selectFetchingRevisionId,
    selectIsLoadingRevisions,
    selectVisibleRevisions,
    setCurrentRevisionId,
} from "../../src/store/revisionsSlice";
import { selectResource } from "../../src/store/resourcesSlice";
import DiffView from "./DiffView";

/**
 * Recursively extracts plain text from a TipTap JSON document node.
 * If the content is not a TipTap JSON object it is returned as-is.
 */
function extractPlainText(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return raw;
    }

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (
            parsed &&
            typeof parsed === "object" &&
            "type" in parsed &&
            (parsed as { type?: unknown }).type === "doc"
        ) {
            return collectText(parsed as Record<string, unknown>);
        }
    } catch {
        // fall through — return raw
    }

    return raw;
}

const BLOCK_TYPES = new Set([
    "paragraph",
    "heading",
    "blockquote",
    "listItem",
    "bulletList",
    "orderedList",
    "codeBlock",
]);

function collectText(node: Record<string, unknown>): string {
    if (node.type === "hardBreak") return "\n";
    if (node.type === "text" && typeof node.text === "string") {
        return node.text;
    }

    const content = node.content;
    if (!Array.isArray(content)) return "";

    const text = (content as Record<string, unknown>[])
        .map((child) => collectText(child))
        .join("");

    return BLOCK_TYPES.has(node.type as string) ? text + "\n\n" : text;
}

/**
 * Redux-connected container for the DiffView.
 *
 * Manages:
 * - Loading the revision list for the selected resource
 * - Fetching and storing canonical revision content (local state)
 * - Fetching selected revision content (Redux currentRevisionContent)
 * - Computing word-level diff chunks
 */
export default function DiffViewController() {
    const dispatch = useAppDispatch();

    const project = useAppSelector(
        (state) =>
            state.projects.projects[state.projects.selectedProjectId ?? ""],
        shallowEqual,
    );
    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );

    const revisionItems = useAppSelector(selectVisibleRevisions, shallowEqual);
    const isLoadingRevisions = useAppSelector(selectIsLoadingRevisions);
    const fetchingRevisionId = useAppSelector(selectFetchingRevisionId);
    const currentRevisionId = useAppSelector(selectCurrentRevisionId);
    const currentRevisionContent = useAppSelector(selectCurrentRevisionContent);

    const [canonicalContent, setCanonicalContent] = useState<string | null>(
        null,
    );
    const [canonicalRevisionId, setCanonicalRevisionId] = useState<
        string | null
    >(null);
    const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
        null,
    );

    const pendingFetchPurpose = useRef<"canonical" | "selected" | null>(null);

    const canInteract = useMemo(
        () => !!project?.rootPath && !!selectedResource?.id,
        [project?.rootPath, selectedResource?.id],
    );

    // Reset all local state when the selected resource changes.
    useEffect(() => {
        setCanonicalContent(null);
        setCanonicalRevisionId(null);
        setSelectedRevisionId(null);
        pendingFetchPurpose.current = null;
    }, [selectedResource?.id]);

    // Load revisions whenever the selected resource or project changes.
    useEffect(() => {
        if (!canInteract || !selectedResource?.id) return;
        void dispatch(
            loadRevisionsForSelectedResource({ resourceId: selectedResource.id }),
        );
    }, [canInteract, dispatch, project?.rootPath, selectedResource?.id]);

    // Once revisions are loaded, fetch the canonical revision content.
    useEffect(() => {
        if (!canInteract || !selectedResource?.id) return;
        if (canonicalContent !== null) return;
        if (pendingFetchPurpose.current === "canonical") return;

        const canonical = revisionItems.find((r) => r.isCanonical);
        if (!canonical) return;

        setCanonicalRevisionId(canonical.id);
        pendingFetchPurpose.current = "canonical";
        void dispatch(
            fetchRevisionContentForSelectedResource({
                resourceId: selectedResource.id,
                revisionId: canonical.id,
            }),
        );
    }, [canInteract, revisionItems, canonicalContent, selectedResource?.id, dispatch]);

    // Consume currentRevisionContent from Redux when a fetch completes.
    useEffect(() => {
        if (currentRevisionContent === null || currentRevisionId === null) return;

        if (
            pendingFetchPurpose.current === "canonical" &&
            currentRevisionId === canonicalRevisionId
        ) {
            setCanonicalContent(currentRevisionContent);
            pendingFetchPurpose.current = null;
            dispatch(setCurrentRevisionId(null));
        }
        // If purpose === "selected", leave content in Redux for the render below.
    }, [currentRevisionContent, currentRevisionId, canonicalRevisionId, dispatch]);

    const handleSelectRevision = useCallback(
        (revisionId: string) => {
            if (!selectedResource?.id) return;
            setSelectedRevisionId(revisionId);
            pendingFetchPurpose.current = "selected";
            void dispatch(
                fetchRevisionContentForSelectedResource({
                    resourceId: selectedResource.id,
                    revisionId,
                }),
            );
        },
        [dispatch, selectedResource?.id],
    );

    const canonicalPlain = canonicalContent
        ? extractPlainText(canonicalContent)
        : null;

    const selectedPlain =
        pendingFetchPurpose.current !== "canonical" && currentRevisionContent
            ? extractPlainText(currentRevisionContent)
            : null;

    const diffChunks = useMemo(() => {
        if (!canonicalPlain || !selectedPlain) return undefined;
        if (!selectedRevisionId) return undefined;
        return diffWords(canonicalPlain, selectedPlain);
    }, [canonicalPlain, selectedPlain, selectedRevisionId]);

    const isLoadingCanonical =
        isLoadingRevisions ||
        (pendingFetchPurpose.current === "canonical" &&
            fetchingRevisionId === canonicalRevisionId);

    const isFetchingRevision =
        pendingFetchPurpose.current === "selected" &&
        fetchingRevisionId !== null;

    return (
        <DiffView
            canonicalContent={canonicalPlain ?? ""}
            selectedContent={selectedPlain ?? undefined}
            diffChunks={diffChunks}
            revisions={revisionItems}
            selectedRevisionId={selectedRevisionId}
            onSelectRevision={handleSelectRevision}
            isLoadingCanonical={isLoadingCanonical}
            isLoadingRevisions={isLoadingRevisions}
            isFetchingRevision={isFetchingRevision}
        />
    );
}
