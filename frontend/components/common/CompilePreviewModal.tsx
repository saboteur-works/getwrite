import React, { useEffect, useMemo, useState } from "react";
import type { AnyResource } from "../../src/lib/models/types";

export interface CompilePreviewModalProps {
    isOpen: boolean;
    projectId?: string;
    resources?: AnyResource[];
    preview?: string;
    onClose?: () => void;
    /** Called with selected resource ids to include in the package. */
    onConfirmCompile?: (selectedIds: string[]) => void;
}

export default function CompilePreviewModal(
    props: CompilePreviewModalProps & {
        resource?: AnyResource;
        onConfirm?: () => void;
    },
): JSX.Element | null {
    const {
        isOpen,
        projectId,
        resources = [],
        onClose,
        onConfirmCompile,
        resource,
        onConfirm,
    } = props;
    const [scope, setScope] = useState<"project" | "folder" | "resource">(
        "project",
    );
    // Determine folder-like resources by checking which resources act as parents
    const parentIds = new Set<string>();
    resources.forEach((r) => {
        const parent = (r as any).parentId ?? r.folderId;
        if (parent) parentIds.add(parent);
    });
    const folderOptions = resources.filter((r) => parentIds.has(r.id));
    const [selectedFolder, setSelectedFolder] = useState<string | "">("");
    const [selectedResource, setSelectedResource] = useState<string | "">("");
    const [selectedIds, setSelectedIds] = useState<string[]>(
        resources.map((r) => r.id),
    );
    const [preview, setPreview] = useState<string>("");

    // If a preview prop is supplied (from callers like AppShell), use it
    // as the initial/controlled preview state so older callers that pass
    // a generated preview string render correctly.
    useEffect(() => {
        if (typeof props.preview === "string") {
            setPreview(props.preview);
        }
    }, [props.preview]);

    // Backwards compatible: if a single `resource` prop was provided by older
    // callers, pre-select it and generate a preview automatically.
    useEffect(() => {
        if (isOpen) {
            setScope("project");
            setSelectedFolder("");
            setSelectedResource("");
            setSelectedIds(resources.map((r) => r.id));
            setPreview("");
        }
    }, [isOpen, resources]);

    // If a legacy single `resource` prop was passed, auto-populate preview
    // so older callers/tests that expect immediate content continue to work.
    useEffect(() => {
        if (isOpen && resource) {
            setScope("resource");
            setSelectedResource(resource.id);
            setSelectedIds([resource.id]);
            const rtitle =
                (resource as any).title ?? resource.name ?? "Untitled";
            const text = `Compiled package for project ${projectId ?? "(unknown project)"}\n\nIncluded resources:\n- ${rtitle} (${resource.type})`;
            setPreview(text);
        }
    }, [isOpen, resource, projectId]);

    // Build parent->children map for descendant lookup
    const childrenMap = useMemo(() => {
        const map = new Map<string, string[]>();
        resources.forEach((r) => {
            const parent = (r as any).parentId ?? r.folderId;
            if (parent) {
                const arr = map.get(parent) ?? [];
                arr.push(r.id);
                map.set(parent, arr);
            }
        });
        return map;
    }, [resources]);

    const getDescendants = (id: string) => {
        const out: string[] = [];
        const walk = (cur: string) => {
            const kids = childrenMap.get(cur) ?? [];
            kids.forEach((k) => {
                out.push(k);
                walk(k);
            });
        };
        walk(id);
        return out;
    };

    const generatePreview = () => {
        let ids: string[] = [];
        if (scope === "project") {
            ids = resources.map((r) => r.id);
        } else if (scope === "folder") {
            if (selectedFolder)
                ids = [selectedFolder, ...getDescendants(selectedFolder)];
            else ids = [];
        } else if (scope === "resource") {
            ids = selectedResource ? [selectedResource] : [];
        }

        const included = resources.filter((r) => ids.includes(r.id));
        const text = `Compiled package for project ${projectId ?? "(unknown project)"}\n\nIncluded resources:\n${included
            .map((r) => {
                const rtitle = (r as any).title ?? r.name ?? "Untitled";
                return `- ${rtitle} (${r.type})`;
            })
            .join("\n")}`;
        setSelectedIds(ids);
        setPreview(text);
    };

    // Legacy compatibility: accept a single `resource` prop and an `onConfirm`
    // callback. If `resource` is provided, auto-select it and generate
    // preview so older tests/components keep working.

    if (!isOpen) return null;

    return (
        <div className="compile-modal-root">
            <div
                className="compile-modal-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="compile-modal-panel">
                <h3 className="compile-modal-title">Compile Preview</h3>
                <p className="compile-modal-description">
                    Choose a scope and generate a visual-only compiled package
                    preview.
                </p>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="compile-modal-label">Scope</label>
                        <select
                            value={scope}
                            onChange={(e) => setScope(e.target.value as any)}
                            className="compile-modal-select"
                            aria-label="compile-scope"
                        >
                            <option value="project">Entire project</option>
                            <option value="folder">Folder</option>
                            <option value="resource">Single resource</option>
                        </select>
                    </div>

                    {scope === "folder" ? (
                        <div>
                            <label className="compile-modal-label">
                                Folder
                            </label>
                            <select
                                value={selectedFolder}
                                onChange={(e) =>
                                    setSelectedFolder(e.target.value)
                                }
                                className="compile-modal-select"
                                aria-label="compile-folder"
                            >
                                <option value="">(select folder)</option>
                                {folderOptions.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {(f as any).title ?? f.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}

                    {scope === "resource" ? (
                        <div>
                            <label className="compile-modal-label">
                                Resource
                            </label>
                            <select
                                value={selectedResource}
                                onChange={(e) =>
                                    setSelectedResource(e.target.value)
                                }
                                className="compile-modal-select"
                                aria-label="compile-resource"
                            >
                                <option value="">(select resource)</option>
                                {resources.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {(r as any).title ?? r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}
                </div>

                <div className="mt-4">
                    <button
                        type="button"
                        onClick={generatePreview}
                        className="compile-modal-generate-button"
                    >
                        Generate preview
                    </button>
                </div>

                <div className="mt-4">
                    <textarea
                        readOnly
                        value={preview}
                        className="compile-modal-textarea"
                        aria-label="compile-preview"
                    />
                </div>

                <div className="mt-4 flex justify-between items-center">
                    <div className="compile-modal-meta-text">
                        {selectedIds.length} resource(s) selected
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="compile-modal-close"
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onConfirmCompile?.(selectedIds);
                                onConfirm?.();
                                onClose?.();
                            }}
                            className="compile-modal-confirm"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
