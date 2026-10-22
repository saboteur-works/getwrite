"use client";

/**
 * @module ProjectTypesManagerPage
 *
 * Slim orchestration shell for project type management.
 *
 * Responsibilities:
 * - Compose list + editor + draft state service.
 * - Resolve dark/light mode from selected project metadata.
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useAppSelector from "../../src/store/hooks";
import {
  selectProject,
  selectSelectedProjectId,
} from "../../src/store/projectsSlice";
import { resolvePreferredColorMode } from "../../src/lib/user-preferences";
import type { MetadataValue } from "../../src/lib/models/types";
import type {
  ProjectTypeDefinition,
  ProjectTypeTemplateFile,
} from "../../src/types/project-types";
import {
  projectTypeListNotice,
  resolveProjectTypesTransport,
  type ProjectTypesTransport,
} from "../../src/lib/api/project-types";
import Button from "../common/UI/Button/Button";
import ConfirmDialog from "../common/ConfirmDialog";
import ProjectTypeEditorForm from "./ProjectTypeEditorForm";
import { useRefusedFields } from "../typography/TypographyFields";
import ProjectTypeListPane from "./ProjectTypeListPane";
import UnsavedChangesPrompt from "./UnsavedChangesPrompt";
import {
  describeItemOrigin,
  isFormFieldKey,
  useProjectTypeDraftService,
  validateDraft,
  type DraftDeleteResult,
  type DraftOperationFailure,
  type DraftSaveResult,
} from "./ProjectTypeDraftService";
import { DialogTitle } from "../common/UI/Dialog/Dialog";

/**
 * Properties required by {@link ProjectTypesManagerPage}.
 */
interface ProjectTypesManagerPageProps {
  /**
   * Initial templates loaded from filesystem-backed project type JSON files.
   */
  initialTemplates: ProjectTypeTemplateFile[];
  /** Optional close handler used when rendered inside a modal. */
  onClose?: () => void;
  /** Renders without page-level shell wrapper when true. */
  renderInModal?: boolean;
  /**
   * One-line notice from the loader (unusable or unreadable saved files);
   * shown as an alert while non-empty. Replaced by the notice of each refresh.
   */
  listNotice?: string | null;
  /** Resolves the transport used to save, delete and re-read the list. */
  resolveTransport?: () => Promise<ProjectTypesTransport>;
  /**
   * Lets a host that owns the modal's own dismissal (Escape, outside click)
   * ask the manager first. The guard returns true when it has taken over the
   * dismissal by showing the unsaved-changes prompt; false when the host may
   * close. Called with null when the manager unmounts.
   */
  registerCloseGuard?: (guard: (() => boolean) | null) => void;
}

/** Where the writer was heading when the unsaved-changes prompt interrupted. */
type PendingExit =
  | { kind: "select"; key: string }
  | { kind: "close" }
  | { kind: "back" };

/** What a refused or failed action tells the writer, and where. */
interface ActionFeedback {
  /** The definition the action ran on; the message hides once it is edited. */
  definition: ProjectTypeDefinition;
  /** File of the item the action ran on; absent for an unsaved draft. */
  fileName: string | undefined;
  idMessage?: string;
  nameMessage?: string;
  /** Messages with no input in the form, listed in the action bar. */
  messages: string[];
  /** Messages for form inputs, keyed by schema path (see `isFormFieldKey`). */
  fieldErrors: Record<string, string>;
  /**
   * True for a refusal made by the client check: the keyed inputs are
   * re-checked as the writer edits, so fixing one clears only its message.
   * False for a server refusal, whose messages hide on the next edit.
   */
  recheck: boolean;
}

/** Splits keyed messages into those the form shows at an input and the rest. */
function splitByPlacement(keyed: Record<string, string>): {
  placed: Record<string, string>;
  unplaced: string[];
} {
  const placed: Record<string, string> = {};
  const unplaced: string[] = [];
  for (const [key, message] of Object.entries(keyed)) {
    if (isFormFieldKey(key)) placed[key] = message;
    else unplaced.push(message);
  }
  return { placed, unplaced };
}

/**
 * The field messages to show for the selected item. A client-check refusal is
 * re-checked against the current definition, for the keys it named, so fixing
 * one input clears only its message; a server refusal shows until the next
 * edit (`isCurrent`). Nothing shows for a different item than the one refused.
 */
function visibleFieldErrors(
  feedback: ActionFeedback | null,
  item: { fileName?: string; definition: ProjectTypeDefinition } | null,
  isCurrent: boolean,
): Record<string, string> | undefined {
  if (!feedback || !item || feedback.fileName !== item.fileName) {
    return undefined;
  }
  if (!feedback.recheck) return isCurrent ? feedback.fieldErrors : undefined;
  const now = validateDraft(item.definition);
  if (now.valid) return undefined;
  const still: Record<string, string> = {};
  for (const key of Object.keys(feedback.fieldErrors)) {
    if (key in now.fieldErrors) still[key] = now.fieldErrors[key];
  }
  return still;
}

/**
 * Places a failed save or delete: an id problem next to the id field, a name
 * clash next to the name field, anything else in the action bar.
 */
function feedbackFor(
  definition: ProjectTypeDefinition,
  fileName: string | undefined,
  failure: DraftOperationFailure,
): ActionFeedback {
  const base = { definition, fileName, fieldErrors: {}, recheck: false };
  if (failure.kind === "validation") {
    return {
      ...base,
      messages: failure.unplacedErrors,
      fieldErrors: splitByPlacement(failure.fieldErrors).placed,
      recheck: true,
    };
  }
  if (failure.kind === "failed") {
    return { ...base, messages: [failure.message] };
  }
  if (
    failure.reason === "invalid" &&
    failure.fieldErrors &&
    Object.keys(failure.fieldErrors).length > 0
  ) {
    const { placed, unplaced } = splitByPlacement(failure.fieldErrors);
    return { ...base, messages: unplaced, fieldErrors: placed };
  }
  if (failure.reason === "id-clash" || failure.reason === "invalid") {
    return { ...base, idMessage: failure.message, messages: [] };
  }
  if (failure.reason === "name-clash") {
    return { ...base, nameMessage: failure.message, messages: [] };
  }
  return { ...base, messages: [failure.message] };
}

/**
 * Project type management page component.
 *
 * @param props - Component properties.
 * @returns Management page UI.
 */
export default function ProjectTypesManagerPage({
  initialTemplates,
  onClose,
  renderInModal = false,
  listNotice = null,
  resolveTransport = resolveProjectTypesTransport,
  registerCloseGuard,
}: ProjectTypesManagerPageProps): JSX.Element {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  const selectedProject = useAppSelector((state) => {
    const id = selectSelectedProjectId(state);
    return id ? selectProject(state, id) : null;
  });

  useEffect(() => {
    const metadata = selectedProject?.metadata as
      | Record<string, MetadataValue>
      | undefined;
    setIsDarkMode(resolvePreferredColorMode(metadata) === "dark");
  }, [selectedProject?.id, selectedProject?.metadata]);

  const {
    items,
    selectedKey,
    selectedItem,
    setSelectedKey,
    updateSelectedDefinition,
    handleCreateProjectType,
    handleAddFolder,
    handleRemoveFolder,
    handleAddResource,
    handleRemoveResource,
    handleWordCountGoalChange,
    handleAddStatus,
    handleRemoveStatus,
    handleUpdateStatus,
    handleAddDefaultFolder,
    handleRemoveDefaultFolder,
    isWriting,
    handleSave,
    handleSaveAsCopy,
    handleDelete,
    refreshFromList,
    discardChanges,
  } = useProjectTypeDraftService(initialTemplates, resolveTransport);

  const { isBlocked: hasRefusedField, report: reportRefusedField } =
    useRefusedFields();
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [status, setStatus] = useState<string>("");
  const [refreshNotice, setRefreshNotice] = useState<{
    value: string | null;
  } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const shownNotice = refreshNotice ? refreshNotice.value : listNotice;
  const origin = selectedItem ? describeItemOrigin(selectedItem) : null;
  const shownFeedback =
    feedback && selectedItem && feedback.definition === selectedItem.definition
      ? feedback
      : null;
  const shownFieldErrors = visibleFieldErrors(
    feedback,
    selectedItem,
    shownFeedback !== null,
  );

  /** Re-reads the list from the server so the manager shows what is stored. */
  const refreshList = async (): Promise<void> => {
    try {
      const transport = await resolveTransport();
      const list = await transport.list();
      refreshFromList(list);
      setRefreshNotice({ value: projectTypeListNotice(list) });
      setRefreshError(null);
    } catch (error) {
      setRefreshError(
        `The list could not be refreshed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  };

  const settle = async (
    result: DraftSaveResult | DraftDeleteResult | null,
    definition: ProjectTypeDefinition,
    fileName: string | undefined,
    succeeded: string,
  ): Promise<void> => {
    if (result === null) return;
    if (!result.ok) {
      setStatus("");
      setFeedback(feedbackFor(definition, fileName, result));
      return;
    }
    setFeedback(null);
    setStatus(succeeded);
    await refreshList();
  };

  const runSave = async (asCopy: boolean): Promise<void> => {
    if (!selectedItem || hasRefusedField) return;
    const { definition, fileName } = selectedItem;
    const result = await (asCopy ? handleSaveAsCopy() : handleSave());
    const isCopy = result?.ok === true && "copied" in result && result.copied;
    const name =
      result?.ok === true && "item" in result
        ? result.item.definition.name
        : definition.name;
    await settle(
      result,
      definition,
      fileName,
      isCopy
        ? `Saved a copy as \u201C${name}\u201D.`
        : `Saved \u201C${name}\u201D.`,
    );
  };

  const runDelete = async (): Promise<void> => {
    if (!selectedItem) return;
    const { definition, fileName } = selectedItem;
    const result = await handleDelete();
    setIsConfirmingDelete(false);
    await settle(
      result,
      definition,
      fileName,
      `Deleted \u201C${definition.name}\u201D.`,
    );
  };

  const dirtyItems = items.filter((item) => item.hasChanges);
  const hasAnyChanges = dirtyItems.length > 0;
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
  const [isResumingAfterSave, setIsResumingAfterSave] = useState(false);
  const hasChangesRef = useRef(hasAnyChanges);
  hasChangesRef.current = hasAnyChanges;
  // True while a history entry pushed by this page sits above the page's own.
  const sentinelRef = useRef(false);
  // The control focused when the prompt was requested; focus returns to it.
  const openerRef = useRef<HTMLElement | null>(null);

  const handleCloseManager = (): void => {
    if (onClose) {
      onClose();
      return;
    }
    if (sentinelRef.current) {
      sentinelRef.current = false;
      window.history.go(-2);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  const performExit = (exit: PendingExit): void => {
    if (exit.kind === "select") setSelectedKey(exit.key);
    else if (exit.kind === "close") handleCloseManager();
    else window.history.back();
  };

  /** Runs the exit, or asks first when any item has unsaved edits. */
  const requestExit = (exit: PendingExit): void => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!hasAnyChanges) {
      performExit(exit);
      return;
    }
    const firstDirty = dirtyItems[0];
    if (firstDirty && !selectedItem?.hasChanges) setSelectedKey(firstDirty.key);
    setPendingExit(exit);
  };

  const keepEditing = (): void => {
    if (pendingExit?.kind === "back" && !sentinelRef.current) {
      window.history.pushState(window.history.state, "");
      sentinelRef.current = true;
    }
    setIsResumingAfterSave(false);
    setPendingExit(null);
  };

  const discardAndExit = (): void => {
    const exit = pendingExit;
    discardChanges();
    setFeedback(null);
    setPendingExit(null);
    if (exit) performExit(exit);
  };

  const saveAndExit = async (): Promise<void> => {
    if (!selectedItem) return;
    if (hasRefusedField) {
      keepEditing();
      return;
    }
    const { definition, fileName } = selectedItem;
    const result = await handleSave();
    if (result === null) return;
    if (!result.ok) {
      setStatus("");
      setFeedback(feedbackFor(definition, fileName, result));
      keepEditing();
      return;
    }
    await settle(
      result,
      definition,
      fileName,
      `Saved \u201C${result.item.definition.name}\u201D.`,
    );
    setIsResumingAfterSave(true);
  };

  // After a prompt Save, carry on once no item has edits; otherwise offer the
  // next item with edits.
  useEffect(() => {
    if (!isResumingAfterSave || isWriting || !pendingExit) return;
    setIsResumingAfterSave(false);
    if (hasAnyChanges) {
      const next = items.find((item) => item.hasChanges);
      if (next && next.key !== selectedKey) setSelectedKey(next.key);
      return;
    }
    const exit = pendingExit;
    setPendingExit(null);
    performExit(exit);
    // performExit and the hook setters are recreated each render; the state
    // read here is what triggers the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResumingAfterSave, isWriting, items]);

  // Browser or OS window and tab close: the browser's own confirmation.
  useEffect(() => {
    if (!hasAnyChanges) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasAnyChanges]);

  // Browser back: while edits exist a history entry sits above the page's own,
  // so Back lands on the page and the prompt can appear before leaving.
  useEffect(() => {
    if (hasAnyChanges && !sentinelRef.current) {
      window.history.pushState(window.history.state, "");
      sentinelRef.current = true;
    }
  }, [hasAnyChanges]);

  useEffect(() => {
    const onPopState = (): void => {
      if (!sentinelRef.current) return;
      sentinelRef.current = false;
      if (hasChangesRef.current) setPendingExit({ kind: "back" });
      else window.history.back();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // In a modal the page stays mounted underneath; remove the entry we pushed.
  useEffect(
    () => () => {
      if (renderInModal && sentinelRef.current) {
        sentinelRef.current = false;
        window.history.back();
      }
    },
    [renderInModal],
  );

  // The modal host asks before it dismisses the dialog (Escape, outside click).
  const closeGuardRef = useRef<() => boolean>(() => false);
  closeGuardRef.current = (): boolean => {
    if (!hasAnyChanges) return false;
    requestExit({ kind: "close" });
    return true;
  };
  useEffect(() => {
    registerCloseGuard?.(() => closeGuardRef.current());
    return () => registerCloseGuard?.(null);
  }, [registerCloseGuard]);

  // Escape on the full page with unsaved edits asks first instead of leaving
  // edits unguarded. In a modal the dialog host owns Escape (via the close
  // guard), so the page does not also handle it. An Escape the prompt or the
  // delete confirmation already took (React events bubble out of their portals)
  // is not handled a second time.
  const handleEscape = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape" || renderInModal) return;
    if (event.defaultPrevented || pendingExit !== null || isConfirmingDelete) {
      return;
    }
    if (!hasAnyChanges) return;
    event.preventDefault();
    requestExit({ kind: "close" });
  };

  // Bound the manager to a definite height so the list and editor panes scroll
  // internally instead of growing the page. In a modal `main` has no flex
  // parent to stretch into, so it needs an explicit viewport-relative height;
  // on the full page it fills the 100vh app shell via `flex-1`.
  const heightClass = renderInModal ? "h-[85vh]" : "min-h-0 flex-1";

  const content = (
    <main
      onKeyDown={handleEscape}
      className={`mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-10 ${heightClass}`}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {renderInModal ? (
            <DialogTitle asChild>
              <h1 className="text-2xl font-semibold text-gw-primary">
                Project Type Management
              </h1>
            </DialogTitle>
          ) : (
            <h1 className="text-2xl font-semibold text-gw-primary">
              Project Type Management
            </h1>
          )}
          <p className="text-sm text-gw-secondary">
            View built-in project types, and create, edit and delete your own.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => requestExit({ kind: "close" })}
            className="rounded-md border border-gw-primary bg-transparent px-3 py-2 text-sm font-medium text-gw-primary hover:bg-gw-chrome2 transition-colors duration-150"
          >
            Close
          </button>
        </div>
      </header>

      {shownNotice ? (
        <p role="alert" className="text-sm text-gw-primary">
          {shownNotice}
        </p>
      ) : null}
      {refreshError ? (
        <p role="alert" className="text-sm text-gw-primary">
          {refreshError}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm text-gw-secondary">
        {status}
      </p>

      <section className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-6 lg:grid-cols-[280px_1fr]">
        <ProjectTypeListPane
          items={items}
          selectedKey={selectedKey}
          onSelectKey={(key) => {
            if (key === selectedKey) return;
            requestExit({ kind: "select", key });
          }}
          onCreateProjectType={handleCreateProjectType}
        />

        <div className="min-h-0 overflow-y-auto rounded-lg border border-gw-border bg-gw-chrome p-5">
          {selectedItem ? (
            <>
              <div
                role="group"
                aria-label="Project type actions"
                className="mb-4 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm font-medium text-gw-primary">
                  {origin}
                </span>
                {/* The actions sit on the right, the origin label on the left. */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {origin === "Built-in" ? (
                    <Button
                      size="sm"
                      disabled={isWriting}
                      onClick={() => void runSave(true)}
                    >
                      {isWriting ? "Saving\u2026" : "Save as copy"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={isWriting}
                      aria-busy={isWriting}
                      onClick={() => void runSave(false)}
                    >
                      {isWriting ? "Saving\u2026" : "Save"}
                    </Button>
                  )}
                  {origin === "Saved" ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isWriting}
                        onClick={() => void runSave(true)}
                      >
                        Save as copy
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isWriting}
                        onClick={() => setIsConfirmingDelete(true)}
                      >
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              {shownFeedback && shownFeedback.messages.length > 0 ? (
                <div role="alert" className="mb-4 text-sm text-gw-primary">
                  {shownFeedback.messages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              ) : null}
              <ProjectTypeEditorForm
                key={selectedKey}
                onRefusalChange={reportRefusedField}
                idReadOnly={origin !== "Draft"}
                idError={shownFeedback?.idMessage}
                nameError={shownFeedback?.nameMessage}
                fieldErrors={shownFieldErrors}
                definition={selectedItem.definition}
                onChange={(nextDefinition) => {
                  updateSelectedDefinition(() => nextDefinition);
                }}
                onAddFolder={handleAddFolder}
                onRemoveFolder={handleRemoveFolder}
                onAddResource={handleAddResource}
                onRemoveResource={handleRemoveResource}
                onWordCountGoalChange={handleWordCountGoalChange}
                onAddStatus={handleAddStatus}
                onRemoveStatus={handleRemoveStatus}
                onUpdateStatus={handleUpdateStatus}
                onAddDefaultFolder={handleAddDefaultFolder}
                onRemoveDefaultFolder={handleRemoveDefaultFolder}
              />
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gw-border p-6 text-sm text-gw-secondary">
              No project type selected.
            </div>
          )}
        </div>
      </section>
      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title={`Delete \u201C${selectedItem?.definition.name ?? ""}\u201D?`}
        description={`Projects already made from \u201C${selectedItem?.definition.name ?? ""}\u201D are not affected. The type can no longer be chosen for new projects.`}
        confirmLabel="Delete"
        isConfirmDisabled={isWriting}
        onConfirm={() => void runDelete()}
        onCancel={() => setIsConfirmingDelete(false)}
      />
      <UnsavedChangesPrompt
        isOpen={pendingExit !== null}
        itemNames={dirtyItems.map(
          (item) =>
            item.definition.name.trim() ||
            item.definition.id.trim() ||
            "Untitled",
        )}
        isSaving={isWriting}
        returnFocusTo={openerRef.current}
        onSave={() => void saveAndExit()}
        onDiscard={discardAndExit}
        onKeepEditing={keepEditing}
      />
    </main>
  );

  if (renderInModal) {
    return content;
  }

  return (
    <div
      className={`appshell-shell ${isDarkMode ? "appshell-theme-dark" : ""}`}
    >
      {content}
    </div>
  );
}
