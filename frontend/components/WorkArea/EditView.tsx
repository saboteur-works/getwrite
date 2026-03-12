import React, { useEffect } from "react";
import TipTapEditor from "../TipTapEditor";
import { TipTapDocument } from "../../src/lib/models";
import useAppSelector from "../../src/store/hooks";
import { shallowEqual } from "react-redux";
import {
    selectCurrentRevisionContent,
    selectCurrentRevisionId,
} from "../../src/store/revisionsSlice";
import { selectResource } from "../../src/store/resourcesSlice";
import RevisionControl from "../Editor/RevisionControl/RevisionControl";

export interface EditViewProps {
    /** Initial editor content (HTML or plain text) */
    initialContent?: string;
    /** Called when content changes */
    onChange?: (content: string, doc: TipTapDocument) => void;
}

/**
 * `EditView` provides a simple editing surface using `TipTapEditor` and a
 * footer that displays lightweight stats such as word count and a last-saved
 * timestamp (placeholder only).
 *
 * It is intentionally presentational — saving is not implemented.
 */
export default function EditView({
    initialContent = "",
    onChange,
}: EditViewProps): JSX.Element {
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

    const currentRevisionId = useAppSelector(selectCurrentRevisionId);
    const currentRevisionContent = useAppSelector(selectCurrentRevisionContent);
    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );
    const [content, setContent] = React.useState<string>(initialContent);
    const [tipTapDoc, setTipTapDoc] = React.useState<TipTapDocument | null>(
        null,
    );
    const projectId = useAppSelector(
        (state) => state.projects.selectedProjectId,
        shallowEqual,
    );
    const project = useAppSelector(
        (state) => (projectId ? state.projects.projects[projectId] : null),
        shallowEqual,
    );

    const fetchResourceContent =
        async (): Promise<ResourceContentResponse | null> => {
            if (!selectedResource || !project?.rootPath) {
                return null;
            }

            const response = await fetch("/api/project-resources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectPath: project.rootPath,
                    resourceId: selectedResource.id,
                }),
            });

            if (!response.ok) {
                return null;
            }

            return (await response.json()) as ResourceContentResponse;
        };

    const fetchCanonicalRevisionContent = async (
        revisionId: string,
    ): Promise<string | null> => {
        if (!selectedResource || !project?.rootPath) {
            return null;
        }

        const params = new URLSearchParams({
            projectPath: project.rootPath,
            revisionId,
        });

        const response = await fetch(
            `/api/resource/revision/${selectedResource.id}?${params.toString()}`,
        );

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as { content?: unknown };
        return typeof payload.content === "string" ? payload.content : null;
    };

    // On mount or when resourceId / initialContent changes, fetch the resource
    // content if a resource ID is provided. If no resourceId is provided, keep
    // the `initialContent` prop so tests and consumers can render initial text.
    useEffect(() => {
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

        if (selectedResource && project?.rootPath) {
            void loadResourceAndCanonicalRevision();
        }

        return () => {
            isCancelled = true;
        };
    }, [initialContent, project?.rootPath, selectedResource]);

    const handleChange = (next: string, doc: TipTapDocument) => {
        setContent(next);
        if (onChange) onChange(next, doc);
    };

    const wordCount = React.useMemo(() => {
        if (!content) return 0;
        // strip HTML tags if present, then count words
        const text = content
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        return text ? text.split(" ").length : 0;
    }, [content]);

    const lastSaved = React.useMemo(() => new Date().toLocaleString(), []);

    /**
     * Safely parses revision payloads that may be stored as TipTap JSON strings.
     *
     * @param value - Raw persisted revision content.
     * @returns Parsed TipTap document when available, otherwise `null`.
     */
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

    useEffect(() => {
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

    return (
        <div className="flex min-w-0 w-full flex-col overflow-hidden">
            <RevisionControl />
            <div className="w-full min-w-0 overflow-x-auto p-2">
                <div className="mx-auto w-full max-w-4xl">
                    <TipTapEditor
                        id="editview-editor"
                        value={tipTapDoc ?? content} // prefer loaded doc, fallback to initial/plain content
                        onChange={handleChange}
                        readonly={false}
                    />
                </div>
            </div>

            <div className="border-t px-4 py-2 bg-white text-sm flex items-center justify-between">
                <div className="text-slate-600">
                    Words: <strong>{wordCount}</strong>
                </div>
                <div className="text-slate-500">
                    Last saved: <span>{lastSaved}</span>
                </div>
            </div>
        </div>
    );
}
