"use client";

import { useEffect, useMemo, useState } from "react";
import { X, PackageCheck } from "lucide-react";
import type { AnyResource } from "../../src/lib/models/types";
import CompileResourceTree from "./CompileResourceTree";
import {
    buildCompileTree,
    initAllChecked,
    getDescendantLeafIds,
    ROOT_ITEM_ID,
} from "./compileSelection";

export interface CompileOptions {
    includeHeaders: boolean;
    format: "txt" | "pdf" | "docx";
    compilationName: string;
}

export interface CompilePreviewModalProps {
    isOpen: boolean;
    projectId?: string;
    resources?: AnyResource[];
    preview?: string;
    onClose?: () => void;
    /** Called with tree-ordered selected resource ids and compile options. */
    onConfirmCompile?: (selectedIds: string[], options: CompileOptions) => void;
}

export default function CompilePreviewModal(
    props: CompilePreviewModalProps & {
        resource?: AnyResource;
        onConfirm?: () => void;
    },
): JSX.Element | null {
    const {
        isOpen,
        resources = [],
        onClose,
        onConfirmCompile,
        resource,
        onConfirm,
    } = props;

    const tree = useMemo(() => buildCompileTree(resources), [resources]);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(() =>
        initAllChecked(tree),
    );
    const [includeHeaders, setIncludeHeaders] = useState(true);
    const [compileAs, setCompileAs] = useState<"txt" | "pdf" | "docx">("txt");
    const [compilationName, setCompilationName] = useState("");

    // Reset selection when modal opens or resource list changes.
    useEffect(() => {
        if (isOpen) {
            const t = buildCompileTree(resources);
            setCheckedIds(initAllChecked(t));
            setCompileAs("txt");
            setCompilationName("");
        }
    }, [isOpen, resources]);

    // Legacy: if a single `resource` prop is passed, pre-select only that resource.
    useEffect(() => {
        if (isOpen && resource) {
            setCheckedIds(new Set([resource.id]));
        }
    }, [isOpen, resource]);

    if (!isOpen) return null;

    return (
        <div className="compile-modal-root" data-testid="compile-preview-modal">
            <div
                className="compile-modal-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="compile-modal-panel">
                <h3 className="compile-modal-title">Compile Project</h3>
                <p className="compile-modal-description">
                    Select which resources to include in the compiled output.
                </p>

                <div className="flex gap-2 mb-2">
                    <button
                        type="button"
                        onClick={() => setCheckedIds(initAllChecked(tree))}
                        className="compile-modal-generate-button"
                    >
                        Select All
                    </button>
                    <button
                        type="button"
                        onClick={() => setCheckedIds(new Set())}
                        className="compile-modal-generate-button"
                    >
                        Select None
                    </button>
                </div>

                <CompileResourceTree
                    resources={resources}
                    checkedIds={checkedIds}
                    onChange={setCheckedIds}
                />

                <div className="compile-modal-meta-text mt-2 text-right">
                    {checkedIds.size} resource(s) selected
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <input
                        id="compile-include-headers"
                        type="checkbox"
                        checked={includeHeaders}
                        onChange={(e) => setIncludeHeaders(e.target.checked)}
                        className="cursor-pointer"
                    />
                    <label
                        htmlFor="compile-include-headers"
                        className="compile-modal-meta-text cursor-pointer select-none"
                    >
                        Include section headers
                    </label>
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <label
                        htmlFor="compile-as"
                        className="compile-modal-label mb-0"
                    >
                        Compile as
                    </label>
                    <select
                        id="compile-as"
                        value={compileAs}
                        onChange={(e) =>
                            setCompileAs(
                                e.target.value as "txt" | "pdf" | "docx",
                            )
                        }
                        className="compile-modal-select w-auto"
                    >
                        <option value="txt">txt</option>
                        <option value="pdf">pdf</option>
                        <option value="docx">docx</option>
                    </select>
                </div>

                <div className="mt-3">
                    <input
                        id="compile-name"
                        type="text"
                        value={compilationName}
                        onChange={(e) => setCompilationName(e.target.value)}
                        placeholder="Enter a name for your compiled output..."
                        className="compile-modal-textarea"
                        style={{ height: "auto", padding: "8px 12px" }}
                    />
                </div>

                <div className="mt-4 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="compile-modal-close"
                    >
                        <X size={14} aria-hidden="true" />
                        Close
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const orderedIds = getDescendantLeafIds(
                                ROOT_ITEM_ID,
                                tree,
                            ).filter((id) => checkedIds.has(id));
                            onConfirmCompile?.(orderedIds, {
                                includeHeaders,
                                format: compileAs,
                                compilationName,
                            });
                            onConfirm?.();
                            onClose?.();
                        }}
                        disabled={checkedIds.size === 0}
                        className="border border-gw-primary text-gw-primary bg-transparent rounded-md font-mono text-[10px] uppercase tracking-[0.16em] px-4 py-2 hover:bg-gw-chrome2 transition-colors duration-150 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <PackageCheck size={14} aria-hidden="true" />
                        Compile ({checkedIds.size})
                    </button>
                </div>
            </div>
        </div>
    );
}
