import React from "react";
import ConfirmDialog from "./ConfirmDialog";

export interface ExportPreviewModalProps {
    isOpen: boolean;
    resourceTitle?: string;
    /** IDs of the leaf resources that will be exported. */
    resourceIds?: string[];
    /** Full resource list used to look up display names in the preview. */
    allResources?: Array<{ id: string; name: string }>;
    onClose?: () => void;
    onConfirmExport?: () => void;
    onShowCompile?: () => void;
}

function buildDescription(
    resourceIds: string[] | undefined,
    allResources: Array<{ id: string; name: string }> | undefined,
): string {
    if (!resourceIds || resourceIds.length === 0) {
        return "No resources selected for export.";
    }
    const nameMap = new Map((allResources ?? []).map((r) => [r.id, r.name]));
    const lines = resourceIds.map((id) => `• ${nameMap.get(id) ?? id}`);
    const label = resourceIds.length === 1 ? "resource" : "resources";
    return `Exporting ${resourceIds.length} ${label}:\n\n${lines.join("\n")}`;
}

export default function ExportPreviewModal({
    isOpen,
    resourceTitle,
    resourceIds,
    allResources,
    onClose,
    onConfirmExport,
    onShowCompile,
}: ExportPreviewModalProps): JSX.Element | null {
    if (!isOpen) return null;

    return (
        <>
            <ConfirmDialog
                isOpen={isOpen}
                title={resourceTitle ? `Export ${resourceTitle}` : "Export"}
                description={buildDescription(resourceIds, allResources)}
                confirmLabel="Export"
                cancelLabel="Cancel"
                onConfirm={() => {
                    onConfirmExport?.();
                    onClose?.();
                }}
                onCancel={onClose ?? (() => {})}
            />

            {onShowCompile ? (
                <div className="fixed bottom-6 right-6 z-[60]">
                    <button
                        type="button"
                        className="px-3 py-2 rounded-md border border-gw-primary text-gw-primary bg-transparent hover:bg-gw-chrome2 transition-colors duration-150"
                        onClick={() => onShowCompile()}
                    >
                        View compiled
                    </button>
                </div>
            ) : null}
        </>
    );
}
