"use client";

import React, { useEffect, useRef, useState } from "react";
import Button from "../common/UI/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import Input from "../common/UI/Input/Input";
import { getDesktopBridge } from "../../src/lib/desktop-bridge";

export interface ImportScrivenerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (projectId: string) => void;
}

/**
 * The dialog's internal state machine. Each variant carries exactly the data
 * that state needs — in particular `handle`/`displayName` live only from
 * `editing-name` onward, since `choose-source` has not picked a source yet.
 */
type DialogState =
  | { kind: "choose-source" }
  | { kind: "editing-name"; handle: string; displayName: string }
  | { kind: "importing"; handle: string; name: string }
  | { kind: "success"; projectId: string; report: string }
  | { kind: "refusal-unsupported"; message: string }
  | { kind: "refusal-destination-not-empty"; message: string }
  | { kind: "fatal"; message: string };

/**
 * The Electron desktop UI for Feature 31's Scrivener import.
 *
 * Owns picking (and re-picking) the `.scriv` source itself, then walks
 * through naming the destination project, running the import, and showing
 * one of four distinct terminal outcomes. The two refusal outcomes
 * (unsupported source vs. non-empty destination) are the entire reason the
 * underlying bridge returns a discriminated outcome rather than a single
 * failure string — each renders its own specific, non-generic message here.
 */
export default function ImportScrivenerDialog({
  isOpen,
  onClose,
  onImported,
}: ImportScrivenerDialogProps): JSX.Element | null {
  const [state, setState] = useState<DialogState>({ kind: "choose-source" });
  const [name, setName] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);

  const chooseSourceRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const outcomeRef = useRef<HTMLDivElement | null>(null);
  const openProjectRef = useRef<HTMLButtonElement | null>(null);

  // Reset to the initial state every time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setState({ kind: "choose-source" });
      setName("");
      setNameError(null);
    }
  }, [isOpen]);

  // Focus follows the state machine: the choose-source control on open, the
  // name field on entering editing-name, and the primary action / outcome
  // message on every later transition.
  useEffect(() => {
    if (!isOpen) return;
    if (state.kind === "choose-source") {
      chooseSourceRef.current?.focus();
    } else if (state.kind === "editing-name") {
      nameRef.current?.focus();
    } else if (state.kind === "success") {
      openProjectRef.current?.focus();
    } else if (
      state.kind === "refusal-unsupported" ||
      state.kind === "refusal-destination-not-empty" ||
      state.kind === "fatal"
    ) {
      outcomeRef.current?.focus();
    }
  }, [state.kind, isOpen]);

  const handleChooseSource = async (): Promise<void> => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const choice = await bridge.chooseScrivenerSource();
    // A cancelled pick is not a failure — stay in choose-source with no error.
    if (!choice.ok) return;
    setNameError(null);
    setName(choice.displayName);
    setState({
      kind: "editing-name",
      handle: choice.handle,
      displayName: choice.displayName,
    });
  };

  const handleChooseDifferent = (): void => {
    setNameError(null);
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

    const { handle } = state;
    setNameError(null);
    setState({ kind: "importing", handle, name: trimmed });

    const bridge = getDesktopBridge();
    if (!bridge) return;
    const outcome = await bridge.startScrivenerImport(handle, trimmed);

    switch (outcome.kind) {
      case "success":
        setState({
          kind: "success",
          projectId: outcome.projectId,
          report: outcome.report,
        });
        break;
      case "refusal-unsupported":
        setState({ kind: "refusal-unsupported", message: outcome.message });
        break;
      case "refusal-destination-not-empty":
        setState({
          kind: "refusal-destination-not-empty",
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
    // An in-progress import cannot be cancelled (FR-18): both an Escape press
    // and an overlay click route here, so blocking it here blocks both.
    if (state.kind === "importing") return;
    onClose();
  };

  const isImporting = state.kind === "importing";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        maxWidth="max-w-[560px]"
        className="p-6"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          chooseSourceRef.current?.focus();
        }}
      >
        <DialogTitle asChild>
          <h2 className="font-sans text-gw-h2 text-gw-primary mb-5">
            Import from Scrivener
          </h2>
        </DialogTitle>

        {state.kind === "choose-source" && (
          <div>
            <p className="text-sm text-gw-secondary mb-4">
              Choose a Scrivener 3 project (created on a Mac) to import as a new
              GetWrite project.
            </p>
            <div className="project-modal-actions">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                ref={chooseSourceRef}
                variant="default"
                onClick={() => void handleChooseSource()}
              >
                Choose Scrivener project…
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

            <div className="project-modal-actions">
              {!isImporting && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleChooseDifferent}
                >
                  Choose a different project…
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
              The Scrivener project was imported successfully.
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

        {state.kind === "refusal-unsupported" && (
          <div>
            <div ref={outcomeRef} tabIndex={-1} role="alert">
              <p className="text-sm text-gw-primary mb-2">
                This Scrivener project isn&apos;t supported.
              </p>
              <p className="text-sm text-gw-secondary">
                GetWrite can only import Scrivener 3 projects created on a Mac.{" "}
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
