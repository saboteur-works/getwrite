import React, { useEffect } from "react";
import TipTapEditor from "../TipTapEditor";
import { TipTapDocument } from "../../src/lib/models";
import useAppSelector from "../../src/store/hooks";
import { shallowEqual } from "react-redux";
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

    const fetchResourceContent = async () => {
        if (selectedResource) {
            const response = await fetch("/api/project-resources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectPath: project?.rootPath,
                    resourceId: selectedResource.id,
                }),
            });
            const data = await response.json();
            return data;
        }
    };

    // On mount or when resourceId / initialContent changes, fetch the resource
    // content if a resource ID is provided. If no resourceId is provided, keep
    // the `initialContent` prop so tests and consumers can render initial text.
    useEffect(() => {
        console.log("fetching resource content for", selectedResource);
        setContent(initialContent);
        setTipTapDoc(null);
        if (selectedResource) {
            fetchResourceContent().then((res) => {
                // When loading TipTap content, we need to make sure the shape is valid before
                // we set it.
                if (
                    res.resourceContent.tipTapContent &&
                    Object.keys(res.resourceContent.tipTapContent).length > 0
                ) {
                    setTipTapDoc(res.resourceContent.tipTapContent);
                }

                // If plaintext content is also available, use it as a fallback. This allows
                // us to support resources that may not have been saved in TipTap format yet.
                if (
                    res.resourceContent.plaintextContent &&
                    res.resourceContent.plaintextContent !== ""
                ) {
                    setContent(res.resourceContent.plaintextContent);
                }
            });
        }
    }, [selectedResource, initialContent]);

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

    return (
        <div className="flex flex-col">
            <RevisionControl />
            <div className="flex overflow-x-scroll p-2 ">
                <TipTapEditor
                    id="editview-editor"
                    value={tipTapDoc ?? content} // prefer loaded doc, fallback to initial/plain content
                    onChange={handleChange}
                    readonly={false}
                />
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
