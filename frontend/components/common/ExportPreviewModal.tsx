import React from "react";
import ConfirmDialog from "./ConfirmDialog";

export interface ExportPreviewModalProps {
    isOpen: boolean;
    resourceTitle?: string;
    /** Pre-resolved display names of the resources that will be exported. */
    resourceNames?: string[];
    onClose?: () => void;
    onConfirmExport?: () => void;
    onShowCompile?: () => void;
}

function buildDescription(resourceNames: string[] | undefined): string {
    if (!resourceNames || resourceNames.length === 0) {
        return "No resources selected for export.";
    }
    const label = resourceNames.length === 1 ? "resource" : "resources";
    return `Exporting ${resourceNames.length} ${label}:\n\n${resourceNames.map((n) => `• ${n}`).join("\n")}`;
}

export default function ExportPreviewModal({
    isOpen,
    resourceTitle,
    resourceNames,
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
                description={buildDescription(resourceNames)}
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
