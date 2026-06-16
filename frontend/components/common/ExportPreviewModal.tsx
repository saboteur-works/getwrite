import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

/** Output formats offered by the single-resource export flow. */
export type ExportFormat = "txt" | "md";

export interface ExportPreviewModalProps {
  isOpen: boolean;
  resourceTitle?: string;
  /** Pre-resolved display names of the resources that will be exported. */
  resourceNames?: string[];
  onClose?: () => void;
  onConfirmExport?: (format: ExportFormat) => void;
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
  const [format, setFormat] = useState<ExportFormat>("txt");

  if (!isOpen) return null;

  const formatPicker = (
    <label className="flex items-center gap-2 text-sm">
      <span>Format</span>
      <select
        className="rounded border border-gw-chrome2 bg-transparent px-2 py-1"
        value={format}
        onChange={(e) => setFormat(e.target.value as ExportFormat)}
        aria-label="Export format"
      >
        <option value="txt">Plain text (.txt)</option>
        <option value="md">Markdown (.md)</option>
      </select>
    </label>
  );

  return (
    <>
      <ConfirmDialog
        isOpen={isOpen}
        title={resourceTitle ? `Export ${resourceTitle}` : "Export"}
        description={buildDescription(resourceNames)}
        details={formatPicker}
        confirmLabel="Export"
        cancelLabel="Cancel"
        onConfirm={() => {
          onConfirmExport?.(format);
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
