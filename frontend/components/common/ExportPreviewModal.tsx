import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import Checkbox from "./UI/Checkbox/Checkbox";
import SavedDefaultsPanel from "./SavedDefaultsPanel";
import { resolveInitialSelection } from "./compile-defaults-selection";
import { useSavedDefaults, type SavedDefaultsReader } from "./useSavedDefaults";
import {
  useSaveDefaultsAction,
  type SavedDefaultsSetter,
} from "./useSaveDefaultsAction";
import { readExportDefaults } from "../../src/lib/api/saved-defaults-read";
import { setExportDefaults } from "../../src/lib/api/export-defaults";

/** Output formats offered by the single-resource export flow. */
export type ExportFormat = "txt" | "md";

export interface ExportPreviewModalProps {
  isOpen: boolean;
  resourceTitle?: string;
  /** Pre-resolved display names of the resources that will be exported. */
  resourceNames?: string[];
  /**
   * Ids parallel to `resourceNames`. With `projectId` they turn the list into
   * a selection that starts from the project's saved export defaults; without
   * either the list stays read-only, as before.
   */
  resourceIds?: string[];
  /**
   * The project's on-disk directory id (`selectActiveProjectDirectoryId`), as
   * the saved-defaults reader and setter need; not `project.id`.
   */
  projectId?: string;
  /** Reads the saved export exclusions. Defaults to `readExportDefaults`. */
  readSavedDefaults?: SavedDefaultsReader;
  /** Saves or clears them. Defaults to `setExportDefaults`. */
  saveDefaults?: SavedDefaultsSetter;
  onClose?: () => void;
  /**
   * Called with the chosen format and, when the selection is shown, the
   * selected ids in list order (otherwise `undefined`).
   */
  onConfirmExport?: (format: ExportFormat, selectedIds?: string[]) => void;
  onShowCompile?: () => void;
  /**
   * Whether the source project is encrypted.
   *
   * When it is, this output leaves the project's protection behind: the file
   * written is plaintext, wherever it lands (FR27). The user is told before it
   * happens, not after.
   */
  isSourceEncrypted?: boolean;
}

/** Lead summary line for the export dialog (kept newline-free for HTML). */
function buildDescription(names: string[]): string {
  if (names.length === 0) {
    return "No resources selected for export.";
  }
  const label = names.length === 1 ? "resource" : "resources";
  return `Exporting ${names.length} ${label}:`;
}

export default function ExportPreviewModal(
  props: ExportPreviewModalProps,
): JSX.Element | null {
  // Held here so it survives a close and reopen. The body mounts only while
  // open, so every open reads the saved defaults afresh.
  const [format, setFormat] = useState<ExportFormat>("txt");
  if (!props.isOpen) return null;
  return <ExportModalBody {...props} format={format} setFormat={setFormat} />;
}

function ExportModalBody({
  isOpen,
  resourceTitle,
  resourceNames,
  resourceIds,
  projectId,
  readSavedDefaults = readExportDefaults,
  saveDefaults = setExportDefaults,
  onClose,
  onConfirmExport,
  onShowCompile,
  isSourceEncrypted = false,
  format,
  setFormat,
}: ExportPreviewModalProps & {
  format: ExportFormat;
  setFormat: (format: ExportFormat) => void;
}): JSX.Element {
  const names = useMemo(() => resourceNames ?? [], [resourceNames]);
  const hasSelection =
    projectId !== undefined &&
    resourceIds !== undefined &&
    resourceIds.length === names.length;
  const ids = useMemo(
    () => (hasSelection ? (resourceIds ?? []) : []),
    [hasSelection, resourceIds],
  );

  const savedRead = useSavedDefaults(projectId, readSavedDefaults, {
    enabled: hasSelection,
  });
  const saveAction = useSaveDefaultsAction(
    hasSelection ? projectId : undefined,
    saveDefaults,
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(ids));
  const readIds =
    savedRead.state.status === "ok"
      ? savedRead.state.excludedResourceIds
      : undefined;
  const shownIds = saveAction.override
    ? saveAction.override.excludedResourceIds
    : readIds;
  const leftOutIds = useMemo(
    () => resolveInitialSelection(ids, shownIds).leftOutIds,
    [ids, shownIds],
  );
  const nameById = useMemo(
    () => new Map(ids.map((id, i) => [id, names[i] ?? id])),
    [ids, names],
  );

  // Apply the saved exclusions once the read settles. A failed read leaves
  // everything selected.
  useEffect(() => {
    if (!hasSelection) return;
    if (savedRead.state.status === "loading") return;
    setCheckedIds(resolveInitialSelection(ids, readIds).selectedIds);
  }, [hasSelection, savedRead.state.status, ids, readIds]);

  const selectedIds = ids.filter((id) => checkedIds.has(id));
  const shownNames = hasSelection
    ? selectedIds.map((id) => nameById.get(id) ?? id)
    : names;

  // The resource list and the format picker render in the dialog's details
  // slot as real markup. (A newline-joined string in `description` collapses to
  // a single run-on line because the dialog body has no `white-space` styling.)
  const details = (
    <div className="space-y-3 text-sm text-gw-secondary">
      {isSourceEncrypted ? (
        <p className="text-gw-primary">
          This project is encrypted. The file this produces will not be — it is
          readable by anyone who can open it.
        </p>
      ) : null}
      {hasSelection ? (
        <ul className="space-y-1" aria-label="Resources to export">
          {ids.map((id, index) => (
            <li key={id} className="flex items-center gap-2">
              <Checkbox
                id={`export-select-${id}`}
                checked={checkedIds.has(id)}
                onChange={(e) => {
                  const next = new Set(checkedIds);
                  if (e.target.checked) next.add(id);
                  else next.delete(id);
                  setCheckedIds(next);
                }}
                aria-label={names[index]}
              />
              <label
                htmlFor={`export-select-${id}`}
                className="cursor-pointer select-none"
              >
                {names[index]}
              </label>
            </li>
          ))}
        </ul>
      ) : names.length > 0 ? (
        <ul
          className="list-disc space-y-1 pl-5"
          aria-label="Resources to export"
        >
          {names.map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
        </ul>
      ) : null}
      {hasSelection ? (
        <SavedDefaultsPanel
          noun="export"
          readStatus={savedRead.state.status}
          onRetry={savedRead.retry}
          savedCount={leftOutIds.length}
          leftOut={leftOutIds.map((id) => ({
            id,
            name: nameById.get(id) ?? id,
            isIncludedThisRun: checkedIds.has(id),
          }))}
          result={saveAction.result}
          isBusy={saveAction.isBusy}
          onSave={() =>
            saveAction.save(ids.filter((id) => !checkedIds.has(id)))
          }
          onClear={saveAction.clear}
        />
      ) : null}
      <label className="flex items-center gap-2">
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
    </div>
  );

  return (
    <>
      <ConfirmDialog
        isOpen={isOpen}
        title={resourceTitle ? `Export ${resourceTitle}` : "Export"}
        description={buildDescription(shownNames)}
        details={details}
        confirmLabel="Export"
        cancelLabel="Cancel"
        isConfirmDisabled={
          hasSelection &&
          (selectedIds.length === 0 || savedRead.state.status === "loading")
        }
        onConfirm={() => {
          onConfirmExport?.(format, hasSelection ? selectedIds : undefined);
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
