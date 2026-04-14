"use client";

import { useEffect, useMemo, useState } from "react";
import { X, PackageCheck } from "lucide-react";
import type { AnyResource } from "../../src/lib/models/types";
import CompileResourceTree from "./CompileResourceTree";
import { buildCompileTree, initAllChecked } from "./compileSelection";

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

    // Reset selection when modal opens or resource list changes.
    useEffect(() => {
        if (isOpen) {
            const t = buildCompileTree(resources);
            setCheckedIds(initAllChecked(t));
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

                <CompileResourceTree
                    resources={resources}
                    checkedIds={checkedIds}
                    onChange={setCheckedIds}
                />

                <div className="compile-modal-meta-text mt-2 text-right">
                    {checkedIds.size} resource(s) selected
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
                            onConfirmCompile?.([...checkedIds]);
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
