"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PackageCheck } from "lucide-react";
import type { AnyResource } from "../../src/lib/models/types";
import CompileResourceTree from "./CompileResourceTree";
import EntityCompileResourceList, {
  type EntityCompileEntry,
} from "./EntityCompileResourceList";
import {
  buildCompileTree,
  excludeMergedDocuments,
  initAllChecked,
  getDescendantLeafIds,
  ROOT_ITEM_ID,
} from "./compileSelection";
import Button from "./UI/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "./UI/Dialog";
import Checkbox from "./UI/Checkbox/Checkbox";
import Select from "./UI/Select/Select";
import SavedDefaultsPanel from "./SavedDefaultsPanel";
import { resolveInitialSelection } from "./compile-defaults-selection";
import { useSavedDefaults, type SavedDefaultsReader } from "./useSavedDefaults";
import {
  useSaveDefaultsAction,
  type SavedDefaultsSetter,
} from "./useSaveDefaultsAction";
import CitationCheckDialog from "./CitationCheckDialog";
import { checkCitations } from "../../src/lib/api/citations-check";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { readCompileDefaults } from "../../src/lib/api/saved-defaults-read";
import { setCompileDefaults } from "../../src/lib/api/compile-defaults";
import {
  BUNDLED_CITATION_STYLES,
  CITATIONS_FORMAT_UNAVAILABLE_REASON,
  CITATIONS_OPEN_PROJECT_REASON,
  type CitationCheckResult,
  type CompileCitationsOption,
} from "../../src/lib/models/citations-types";

export type { EntityCompileEntry };

/**
 * Prop-driven entity mode (FR-1/FR-3/FR-11). When present, this modal swaps
 * its user-editable checkbox tree and Select All/None controls for the
 * read-only, pre-ordered `EntityCompileResourceList`, and the Compile
 * button's confirmed id list becomes `orderedResourceIds` directly rather
 * than a tree/checkbox derivation. The output-option controls (format,
 * headers, name) and the `onConfirmCompile` contract are unchanged.
 */
export interface EntityCompileMode {
  entries: EntityCompileEntry[];
  orderedResourceIds: string[];
}

export type CompileFormat = "txt" | "md" | "pdf" | "docx";

export interface CompileOptions {
  includeHeaders: boolean;
  format: CompileFormat;
  compilationName: string;
  /** Feature 116 (FR-9): present only when the writer turned citations on. */
  citations?: CompileCitationsOption;
}

/**
 * Whether citations can be turned on at all (FR-23). `unknown` is never
 * treated as off: it disables the switch with the open-the-project reason.
 */
export type CitationsAvailability = "available" | "unavailable" | "unknown";

export interface CompilePreviewModalProps {
  isOpen: boolean;
  /**
   * The project's on-disk directory id (`selectActiveProjectDirectoryId`), as
   * the saved-defaults reader and setter need; not `project.id`.
   */
  projectId?: string;
  /** Reads the saved compile exclusions. Defaults to `readCompileDefaults`. */
  readSavedDefaults?: SavedDefaultsReader;
  /** Saves or clears them. Defaults to `setCompileDefaults`. */
  saveDefaults?: SavedDefaultsSetter;
  resources?: AnyResource[];
  preview?: string;
  onClose?: () => void;
  /** Called with tree-ordered selected resource ids and compile options. */
  onConfirmCompile?: (selectedIds: string[], options: CompileOptions) => void;
  /**
   * Whether the source project is encrypted.
   *
   * When it is, this output leaves the project's protection behind: the file
   * written is plaintext, wherever it lands (FR27). The user is told before it
   * happens, not after.
   */
  isSourceEncrypted?: boolean;
  /**
   * When set, swaps the checkbox tree / Select All / Select None controls
   * for the read-only, pre-ordered entity-scoped list (FR-1/FR-3/FR-11).
   * See `EntityCompileMode`.
   */
  entityMode?: EntityCompileMode;
  /**
   * Feature 116: the Citations module is on. The controls show when this is
   * true, or when `citationsAvailability` is not "available" (a disabled
   * switch with its reason). Never shown in entity mode.
   */
  citationsModuleEnabled?: boolean;
  /** Defaults to "available". See `CitationsAvailability`. */
  citationsAvailability?: CitationsAvailability;
  /** Native Android runtime: the switch is disabled (FR-19). */
  isAndroidRuntime?: boolean;
  /**
   * Runs the pre-run citation check (FR-15). Defaults to `checkCitations`. It
   * may throw the locked-access error, which reaches the existing locked path.
   */
  runCitationCheck?: (
    projectId: string,
    resourceIds: readonly string[],
  ) => Promise<CitationCheckResult>;
}

/** FR-17: the dialog's statement of the merged-away rule (owner reviews wording). */
const COMPILE_MERGED_NOTICE =
  "Documents merged into another document are left out of every compile.";

/** Why the citations switch is disabled, or undefined when it is usable. */
function citationsDisabledReason(
  availability: CitationsAvailability,
  format: CompileFormat,
  isAndroidRuntime: boolean,
): string | undefined {
  if (availability !== "available") return CITATIONS_OPEN_PROJECT_REASON;
  if (isAndroidRuntime || format === "txt" || format === "md") {
    return CITATIONS_FORMAT_UNAVAILABLE_REASON;
  }
  return undefined;
}

export default function CompilePreviewModal(
  props: CompilePreviewModalProps & {
    resource?: AnyResource;
    onConfirm?: () => void;
  },
): JSX.Element {
  const { isOpen, onClose } = props;
  // Held here so it survives a close and reopen, as it did before the body
  // was split out. The body itself mounts only while open, so every open
  // reads the saved defaults afresh.
  const [shouldIncludeHeaders, setShouldIncludeHeaders] = useState(true);
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      {isOpen ? (
        <CompileModalBody
          {...props}
          shouldIncludeHeaders={shouldIncludeHeaders}
          setShouldIncludeHeaders={setShouldIncludeHeaders}
        />
      ) : null}
    </Dialog>
  );
}

function CompileModalBody(
  props: CompilePreviewModalProps & {
    resource?: AnyResource;
    onConfirm?: () => void;
    shouldIncludeHeaders: boolean;
    setShouldIncludeHeaders: (value: boolean) => void;
  },
): JSX.Element {
  const {
    isOpen,
    projectId,
    resources: allResources = [],
    onClose,
    onConfirmCompile,
    resource,
    onConfirm,
    entityMode,
    citationsModuleEnabled: isCitationsModuleOn = false,
    citationsAvailability = "available",
    isAndroidRuntime = false,
    runCitationCheck = checkCitations,
    readSavedDefaults = readCompileDefaults,
    saveDefaults = setCompileDefaults,
    shouldIncludeHeaders,
    setShouldIncludeHeaders,
  } = props;

  // FR-17: a document marked as merged is never offered, whatever the saved
  // defaults say and with no per-run override. Read from the mark each render.
  const resources = useMemo(
    () => excludeMergedDocuments(allResources),
    [allResources],
  );
  const hasMergedDocuments = resources.length !== allResources.length;
  const tree = useMemo(() => buildCompileTree(resources), [resources]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() =>
    initAllChecked(tree),
  );
  const [format, setFormat] = useState<CompileFormat>("txt");
  const [compilationName, setCompilationName] = useState("");
  // Off on every open: the body mounts only while open, and the reset below
  // covers a reopen without unmount.
  const [isCitationsOn, setIsCitationsOn] = useState(false);
  const [citationStyleId, setCitationStyleId] = useState(
    BUNDLED_CITATION_STYLES[0].id,
  );
  const shouldShowCitations =
    !entityMode &&
    (isCitationsModuleOn || citationsAvailability !== "available");
  const citationsReason = citationsDisabledReason(
    citationsAvailability,
    format,
    isAndroidRuntime,
  );
  const isCitationsActive =
    shouldShowCitations && isCitationsOn && !citationsReason;

  // Pre-run check (FR-15): `checking` while it runs, `warning` while the
  // writer decides. A locked project is rethrown during render, as
  // `useSavedDefaults` does, so it reaches the existing locked path.
  const [precheck, setPrecheck] = useState<
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "warning"; result: CitationCheckResult; orderedIds: string[] }
  >({ phase: "idle" });
  const [lockedError, setLockedError] = useState<unknown>(null);
  if (lockedError !== null) throw lockedError;
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Reset the choices each time the modal opens. A parent re-render while it
  // is open passes `resources` as a new array; that must not discard the
  // writer's format or selection (task_76229e5f).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setCheckedIds(initAllChecked(buildCompileTree(resources)));
      setFormat("txt");
      setCompilationName("");
      setIsCitationsOn(false);
      setCitationStyleId(BUNDLED_CITATION_STYLES[0].id);
    }
    wasOpen.current = isOpen;
  }, [isOpen, resources]);

  // Saved defaults (FR-4/FR-5). Entity mode reads nothing and applies none
  // (FR-6, OQ-4).
  const savedRead = useSavedDefaults(projectId, readSavedDefaults, {
    enabled: !entityMode,
  });
  const saveAction = useSaveDefaultsAction(projectId, saveDefaults);
  const leafIds = useMemo(() => [...initAllChecked(tree)], [tree]);
  const readIds =
    savedRead.state.status === "ok"
      ? savedRead.state.excludedResourceIds
      : undefined;
  const shownIds = saveAction.override
    ? saveAction.override.excludedResourceIds
    : readIds;
  const leftOutIds = useMemo(
    () => resolveInitialSelection(leafIds, shownIds).leftOutIds,
    [leafIds, shownIds],
  );
  const names = useMemo(
    () => new Map(resources.map((r) => [r.id, r.name])),
    [resources],
  );

  // Apply the saved exclusions once the read settles. A failed read leaves
  // everything selected. Keyed on the ids' contents, not array identity, so
  // a parent re-render does not undo a per-run change (task_76229e5f).
  const leafKey = leafIds.join("\n");
  const readKey = readIds?.join("\n");
  useEffect(() => {
    if (!isOpen || entityMode || resource) return;
    if (savedRead.state.status === "loading") return;
    setCheckedIds(resolveInitialSelection(leafIds, readIds).selectedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leafKey/readKey stand for leafIds/readIds
  }, [isOpen, entityMode, resource, savedRead.state.status, leafKey, readKey]);

  // Legacy: if a single `resource` prop is passed, pre-select only that resource.
  useEffect(() => {
    if (isOpen && resource) {
      setCheckedIds(new Set([resource.id]));
    }
  }, [isOpen, resource]);

  function confirmCompile(orderedIds: string[]): void {
    onConfirmCompile?.(orderedIds, {
      includeHeaders: shouldIncludeHeaders,
      format,
      compilationName,
      ...(isCitationsActive ? { citations: { styleId: citationStyleId } } : {}),
    });
    onConfirm?.();
    onClose?.();
  }

  return (
    <>
      <DialogContent
        maxWidth="max-w-[560px]"
        className="p-6"
        data-testid="compile-preview-modal"
        aria-describedby={undefined}
      >
        <DialogTitle asChild>
          <h3 className="compile-modal-title">
            {entityMode ? "Compile Entity Resources" : "Compile Project"}
          </h3>
        </DialogTitle>
        <p className="compile-modal-description">
          {entityMode
            ? // The entity-mode list is read-only (FR-11), so the whole-project
              // copy inviting a selection describes a control that isn't there.
              "Every resource associated with this entity, in resource-tree order."
            : "Select which resources to include in the compiled output."}
        </p>

        {hasMergedDocuments ? (
          <p
            className="compile-modal-meta-text mt-2"
            data-testid="compile-merged-notice"
          >
            {COMPILE_MERGED_NOTICE}
          </p>
        ) : null}

        {props.isSourceEncrypted ? (
          <p className="mt-2 text-[12px] leading-relaxed text-gw-primary">
            This project is encrypted. The compiled file will not be — it is
            readable by anyone who can open it.
          </p>
        ) : null}

        {entityMode ? (
          <EntityCompileResourceList entries={entityMode.entries} />
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setCheckedIds(initAllChecked(tree))}
              >
                Select All
              </Button>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setCheckedIds(new Set())}
              >
                Select None
              </Button>
            </div>

            <CompileResourceTree
              resources={resources}
              checkedIds={checkedIds}
              onChange={setCheckedIds}
            />

            <div className="compile-modal-meta-text mt-2 text-right">
              {checkedIds.size} resource(s) selected
            </div>

            {projectId !== undefined ? (
              <SavedDefaultsPanel
                noun="compile"
                readStatus={savedRead.state.status}
                onRetry={savedRead.retry}
                savedCount={leftOutIds.length}
                leftOut={leftOutIds.map((id) => ({
                  id,
                  name: names.get(id) ?? id,
                  isIncludedThisRun: checkedIds.has(id),
                }))}
                result={saveAction.result}
                isBusy={saveAction.isBusy}
                onSave={() =>
                  saveAction.save(leafIds.filter((id) => !checkedIds.has(id)))
                }
                onClear={saveAction.clear}
              />
            ) : null}
          </>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Checkbox
            id="compile-include-headers"
            checked={shouldIncludeHeaders}
            onChange={(e) => setShouldIncludeHeaders(e.target.checked)}
            aria-label="Include section headers"
          />
          <label
            htmlFor="compile-include-headers"
            className="compile-modal-meta-text cursor-pointer select-none"
          >
            Include section headers
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="compile-as" className="compile-modal-label mb-0">
            Compile as
          </label>
          <Select
            id="compile-as"
            value={format}
            onChange={(e) => setFormat(e.target.value as CompileFormat)}
            className="w-auto"
          >
            <option value="txt">txt</option>
            <option value="md">md</option>
            <option value="pdf">pdf</option>
            <option value="docx">docx</option>
          </Select>
        </div>

        {shouldShowCitations ? (
          <div className="mt-3" data-testid="compile-citations-controls">
            <div className="flex items-center gap-2">
              <Checkbox
                id="compile-citations"
                checked={isCitationsActive}
                disabled={citationsReason !== undefined}
                onChange={(e) => setIsCitationsOn(e.target.checked)}
                aria-describedby="compile-citations-status"
              />
              <label
                htmlFor="compile-citations"
                className="compile-modal-meta-text cursor-pointer select-none"
              >
                Citations
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label
                htmlFor="compile-citation-style"
                className="compile-modal-label mb-0"
              >
                Citation style
              </label>
              <Select
                id="compile-citation-style"
                value={citationStyleId}
                onChange={(e) => setCitationStyleId(e.target.value)}
                disabled={!isCitationsActive}
                className="w-auto"
              >
                {BUNDLED_CITATION_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}, {style.locale}
                  </option>
                ))}
              </Select>
            </div>
            <p
              id="compile-citations-status"
              role="status"
              className="compile-modal-meta-text mt-1"
            >
              {citationsReason ?? ""}
            </p>
          </div>
        ) : null}

        <div className="mt-3">
          <input
            spellCheck={false}
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
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="default"
            onClick={() => {
              const orderedIds = entityMode
                ? entityMode.orderedResourceIds
                : getDescendantLeafIds(ROOT_ITEM_ID, tree).filter((id) =>
                    checkedIds.has(id),
                  );
              if (!isCitationsActive || projectId === undefined) {
                confirmCompile(orderedIds);
                return;
              }
              setPrecheck({ phase: "checking" });
              runCitationCheck(projectId, orderedIds).then(
                (result) => {
                  if (!isMounted.current) return;
                  if (result.status === "ok" && result.gaps.length === 0) {
                    setPrecheck({ phase: "idle" });
                    confirmCompile(orderedIds);
                  } else {
                    setPrecheck({ phase: "warning", result, orderedIds });
                  }
                },
                (error: unknown) => {
                  if (!isMounted.current) return;
                  setPrecheck({ phase: "idle" });
                  if (isLockedAccessError(error)) setLockedError(error);
                  else
                    setPrecheck({
                      phase: "warning",
                      orderedIds,
                      result: {
                        status: "failed",
                        failure: "read-failed",
                        message: "The citation check could not be run.",
                      },
                    });
                },
              );
            }}
            disabled={
              entityMode
                ? entityMode.orderedResourceIds.length === 0
                : checkedIds.size === 0 ||
                  savedRead.state.status === "loading" ||
                  precheck.phase === "checking"
            }
          >
            <PackageCheck size={14} aria-hidden="true" />
            Compile (
            {entityMode
              ? entityMode.orderedResourceIds.length
              : checkedIds.size}
            )
          </Button>
        </div>
      </DialogContent>
      {precheck.phase === "warning" ? (
        <CitationCheckDialog
          isOpen
          result={precheck.result}
          onProceed={() => {
            const { orderedIds } = precheck;
            setPrecheck({ phase: "idle" });
            confirmCompile(orderedIds);
          }}
          onCancel={() => setPrecheck({ phase: "idle" })}
        />
      ) : null}
    </>
  );
}
