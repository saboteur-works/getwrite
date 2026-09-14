"use client";

import React, { useEffect, useRef, useState } from "react";
import Button from "../common/UI/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";
import { getDesktopBridge } from "../../src/lib/desktop-bridge";

export interface ImportDocxDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (projectId: string) => void;
}

/**
 * The known project-type ids (FR-8), read from each spec's own `id` field
 * under `getwrite-config/templates/project-types/`. Verified on disk:
 * `article`, `blank`, `game_writing` (the `game_documentation.json` spec's
 * own id, not its filename), `novel`, `poetry_and_lyrics`, `serial`.
 */
const PROJECT_TYPE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "blank", label: "Blank" },
  { id: "article", label: "Article" },
  { id: "game_writing", label: "Game Documentation" },
  { id: "novel", label: "Novel" },
  { id: "poetry_and_lyrics", label: "Poetry & Lyrics" },
  { id: "serial", label: "Serial" },
];

/** Split-level options (FR-2): Heading 1-6, or no split at all. */
const SPLIT_LEVEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "1", label: "Heading 1" },
  { value: "2", label: "Heading 2" },
  { value: "3", label: "Heading 3" },
  { value: "4", label: "Heading 4" },
  { value: "5", label: "Heading 5" },
  { value: "6", label: "Heading 6" },
  { value: "none", label: "Don't split" },
];

type SourceKind = "file" | "folder";

/**
 * The dialog's internal state machine, following
 * `ImportScrivenerDialog.tsx`'s shape (`choose-source` → `editing-name` →
 * `importing` → terminal), extended for two source kinds and the five-kind
 * `DocxImportOutcome`.
 */
type DialogState =
  | { kind: "choose-source" }
  | {
      kind: "editing-name";
      handle: string;
      displayName: string;
      sourceKind: SourceKind;
    }
  | {
      kind: "importing";
      handle: string;
      name: string;
      splitLevel: number | "none" | undefined;
      projectType: string;
    }
  | { kind: "success"; projectId: string; report: string }
  | { kind: "refusal-no-docx-found"; message: string }
  | { kind: "refusal-destination-not-empty"; message: string }
  | { kind: "refusal-unknown-project-type"; message: string }
  | { kind: "fatal"; message: string };

/**
 * The Electron desktop UI for the DOCX importer's import flow (Task 16).
 *
 * `choose-source` offers two explicit buttons — one per bridge method — since
 * a `.docx` source can be a single document or a folder of them (FR-1). Only
 * a document source exposes the split-level control in `editing-name`
 * (FR-2); a folder always imports one resource per file (FR-3), so the
 * control would have nothing to mean there. The project-type control (FR-8)
 * is offered either way. The five-kind `DocxImportOutcome` (FR-17) renders
 * four distinct terminal messages, matching the Scrivener dialog's pattern
 * of never collapsing a discriminated outcome into one generic string.
 */
export default function ImportDocxDialog({
  isOpen,
  onClose,
  onImported,
}: ImportDocxDialogProps): JSX.Element | null {
  const [state, setState] = useState<DialogState>({ kind: "choose-source" });
  const [name, setName] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [splitLevelValue, setSplitLevelValue] = useState<string>("1");
  const [projectType, setProjectType] = useState<string>("blank");
  // Tracked separately from `state` because the split-level control must stay
  // visible (disabled) through `importing`, not just `editing-name`.
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);

  const chooseFileRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const outcomeRef = useRef<HTMLDivElement | null>(null);
  const openProjectRef = useRef<HTMLButtonElement | null>(null);

  // Reset to the initial state every time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setState({ kind: "choose-source" });
      setName("");
      setNameError(null);
      setSplitLevelValue("1");
      setProjectType("blank");
      setSourceKind(null);
    }
  }, [isOpen]);

  // Focus follows the state machine: the "Choose document…" control on open,
  // the name field on entering editing-name, and the primary action /
  // outcome message on every later transition.
  useEffect(() => {
    if (!isOpen) return;
    if (state.kind === "choose-source") {
      chooseFileRef.current?.focus();
    } else if (state.kind === "editing-name") {
      nameRef.current?.focus();
    } else if (state.kind === "success") {
      openProjectRef.current?.focus();
    } else if (
      state.kind === "refusal-no-docx-found" ||
      state.kind === "refusal-destination-not-empty" ||
      state.kind === "refusal-unknown-project-type" ||
      state.kind === "fatal"
    ) {
      outcomeRef.current?.focus();
    }
  }, [state.kind, isOpen]);

  const handleChoose = async (kind: SourceKind): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const choice =
      kind === "file"
        ? await bridge.chooseDocxFile()
        : await bridge.chooseDocxFolder();
    // A cancelled pick is not a failure — stay in choose-source with no error.
    if (!choice.ok) return;
    setNameError(null);
    setName(choice.displayName);
    setSourceKind(kind);
    setState({
      kind: "editing-name",
      handle: choice.handle,
      displayName: choice.displayName,
      sourceKind: kind,
    });
  };

  const handleChooseDifferent = (): void => {
    setNameError(null);
    setSourceKind(null);
    setState({ kind: "choose-source" });
  };

  const handleStart = async (e?: React.FormEvent): Promise<void> => {
    e?.preventDefault();
    if (state.kind !== "editing-name") return; // no-op mid-import or terminal

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Please enter a project name.");
      nameRef.current?.focus();
      return;
    }

    const { handle, sourceKind } = state;
    const splitLevel: number | "none" | undefined =
      sourceKind === "file"
        ? splitLevelValue === "none"
          ? "none"
          : Number(splitLevelValue)
        : undefined;

    setNameError(null);
    setState({
      kind: "importing",
      handle,
      name: trimmed,
      splitLevel,
      projectType,
    });

    const bridge = getDesktopBridge();
    if (!bridge) return;
    const outcome = await bridge.startDocxImport(handle, {
      name: trimmed,
      splitLevel,
      projectType,
    });

    switch (outcome.kind) {
      case "success":
        setState({
          kind: "success",
          projectId: outcome.projectId,
          report: outcome.report,
        });
        break;
      case "refusal-no-docx-found":
        setState({ kind: "refusal-no-docx-found", message: outcome.message });
        break;
      case "refusal-destination-not-empty":
        setState({
          kind: "refusal-destination-not-empty",
          message: outcome.message,
        });
        break;
      case "refusal-unknown-project-type":
        setState({
          kind: "refusal-unknown-project-type",
          message: outcome.message,
        });
        break;
      case "fatal":
        setState({ kind: "fatal", message: outcome.message });
        break;
    }
  };

  const handleOpenChange = (open: boolean): void => {
    if (open) return;
    // An in-progress import cannot be cancelled: both an Escape press and an
    // overlay click route here, so blocking it here blocks both.
    if (state.kind === "importing") return;
    onClose();
  };

  const isImporting = state.kind === "importing";
  const shouldShowSplitLevel = sourceKind === "file";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        maxWidth="max-w-[560px]"
        className="p-6"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          chooseFileRef.current?.focus();
        }}
      >
        <DialogTitle asChild>
          <h2 className="font-sans text-gw-h2 text-gw-primary mb-5">
            Import from Word
          </h2>
        </DialogTitle>

        {state.kind === "choose-source" && (
          <div>
            <p className="text-sm text-gw-secondary mb-4">
              Choose a single Word (.docx) document, or a folder of them, to
              import as a new GetWrite project.
            </p>
            <div className="project-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                ref={chooseFileRef}
                variant="default"
                onClick={() => void handleChoose("file")}
              >
                Choose document…
              </Button>
              <Button
                variant="default"
                onClick={() => void handleChoose("folder")}
              >
                Choose folder…
              </Button>
            </div>
          </div>
        )}

        {(state.kind === "editing-name" || state.kind === "importing") && (
          <form onSubmit={handleStart} aria-busy={isImporting}>
            <label className="project-modal-field">
              <div className="project-modal-label">Name</div>
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleStart();
                  }
                }}
                className="w-full mt-1"
                aria-required
                disabled={isImporting}
              />
            </label>

            {nameError ? (
              <div className="project-modal-error">{nameError}</div>
            ) : null}

            {shouldShowSplitLevel && (
              <label className="project-modal-field mt-3 block">
                <div className="project-modal-label">
                  Split into resources at
                </div>
                <Select
                  value={splitLevelValue}
                  onChange={(e) => setSplitLevelValue(e.target.value)}
                  className="w-full mt-1"
                  disabled={isImporting}
                >
                  {SPLIT_LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            <label className="project-modal-field mt-3 block">
              <div className="project-modal-label">Project type</div>
              <Select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                className="w-full mt-1"
                disabled={isImporting}
              >
                {PROJECT_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="project-modal-actions">
              {!isImporting && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleChooseDifferent}
                >
                  Choose a different source…
                </Button>
              )}
              <Button type="submit" variant="default" disabled={isImporting}>
                {isImporting ? "Importing…" : "Start"}
              </Button>
            </div>
          </form>
        )}

        {state.kind === "success" && (
          <div>
            <p className="text-sm text-gw-secondary mb-3">
              The Word document was imported successfully.
            </p>
            <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words border border-gw-border bg-gw-chrome2 p-3 text-[11px] text-gw-primary font-mono">
              {state.report}
            </pre>
            <div className="project-modal-actions">
              <Button
                ref={openProjectRef}
                variant="default"
                onClick={() => onImported(state.projectId)}
              >
                Open Project
              </Button>
            </div>
          </div>
        )}

        {state.kind === "refusal-no-docx-found" && (
          <div>
            <div ref={outcomeRef} tabIndex={-1} role="alert">
              <p className="text-sm text-gw-primary mb-2">
                No Word document was found.
              </p>
              <p className="text-sm text-gw-secondary">
                GetWrite couldn&apos;t find a .docx file at that location.{" "}
                {state.message}
              </p>
            </div>
            <div className="project-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {state.kind === "refusal-destination-not-empty" && (
          <div>
            <div ref={outcomeRef} tabIndex={-1} role="alert">
              <p className="text-sm text-gw-primary mb-2">
                A project already exists at this location.
              </p>
              <p className="text-sm text-gw-secondary">
                Choose a different name and try again. {state.message}
              </p>
            </div>
            <div className="project-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {state.kind === "refusal-unknown-project-type" && (
          <div>
            <div ref={outcomeRef} tabIndex={-1} role="alert">
              <p className="text-sm text-gw-primary mb-2">
                That project type isn&apos;t recognized.
              </p>
              <p className="text-sm text-gw-secondary">
                Choose a different project type and try again. {state.message}
              </p>
            </div>
            <div className="project-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {state.kind === "fatal" && (
          <div>
            <div ref={outcomeRef} tabIndex={-1} role="alert">
              <p className="text-sm text-gw-primary mb-2">
                The import didn&apos;t complete.
              </p>
              <p className="text-sm text-gw-secondary">{state.message}</p>
            </div>
            <div className="project-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
