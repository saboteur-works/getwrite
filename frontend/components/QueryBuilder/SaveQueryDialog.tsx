"use client";

import React from "react";
import Button from "../common/UI/Button/Button";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../common/UI/Dialog";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import {
  saveQuery,
  selectSavingQueryId,
  selectQueryErrorMessage,
  type SavedQuery,
} from "../../src/store/querySlice";
import type { QueryAST } from "../../src/lib/models/query-ast";
import { generateUUID } from "../../src/lib/models/uuid";

export interface SaveQueryDialogProps {
  isOpen: boolean;
  definition: QueryAST;
  projectId: string;
  onClose: () => void;
  onSaved?: (queryId: string) => void;
  /** Pass to rename or overwrite an existing query. */
  existingQuery?: SavedQuery;
}

export default function SaveQueryDialog({
  isOpen,
  definition,
  projectId,
  onClose,
  onSaved,
  existingQuery,
}: SaveQueryDialogProps): JSX.Element {
  const dispatch = useAppDispatch();
  const savingQueryId = useAppSelector(selectSavingQueryId);
  const errorMessage = useAppSelector(selectQueryErrorMessage);

  const pendingIdRef = React.useRef<string | null>(null);
  const [name, setName] = React.useState(existingQuery?.name ?? "");
  const [viewKind, setViewKind] = React.useState<string>(
    existingQuery?.view?.kind ?? "",
  );
  const [localError, setLocalError] = React.useState("");

  React.useEffect(() => {
    if (isOpen) {
      setName(existingQuery?.name ?? "");
      setViewKind(existingQuery?.view?.kind ?? "");
      setLocalError("");
      pendingIdRef.current = null;
    }
  }, [isOpen, existingQuery]);

  const isSaving =
    pendingIdRef.current !== null && savingQueryId === pendingIdRef.current;

  React.useEffect(() => {
    if (pendingIdRef.current === null) return;
    if (savingQueryId === null && !errorMessage) {
      const savedId = pendingIdRef.current;
      pendingIdRef.current = null;
      onSaved?.(savedId);
      onClose();
    }
  }, [savingQueryId, errorMessage, onSaved, onClose]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Name is required.");
      return;
    }

    const query: SavedQuery = {
      id: existingQuery?.id ?? generateUUID(),
      name: trimmed,
      definition,
      ...(viewKind ? { view: { kind: viewKind } } : {}),
    };

    pendingIdRef.current = query.id;
    setLocalError("");
    dispatch(saveQuery({ projectId, query }));
  }

  const displayError = localError || (pendingIdRef.current ? errorMessage : "");

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent maxWidth="max-w-[460px]" className="p-6">
        <DialogTitle>
          {existingQuery ? "Rename query" : "Save query"}
        </DialogTitle>
        <DialogDescription>
          Saved queries appear as smart folders in the resource tree.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="save-query-name"
              className="font-mono text-[10px] uppercase tracking-[0.10em] text-gw-secondary"
            >
              Name
            </label>
            <Input
              id="save-query-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Draft chapters"
              autoFocus
              disabled={isSaving}
              className="w-full font-mono text-[11px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="save-query-view"
              className="font-mono text-[10px] uppercase tracking-[0.10em] text-gw-secondary"
            >
              Default view{" "}
              <span className="normal-case text-gw-dim">(optional)</span>
            </label>
            <Select
              id="save-query-view"
              value={viewKind}
              onChange={(e) => setViewKind(e.target.value)}
              disabled={isSaving}
              className="w-full font-mono text-[11px]"
            >
              <option value="">None</option>
              <option value="list">List</option>
              <option value="table">Table</option>
            </Select>
          </div>

          {displayError && (
            <p className="font-mono text-[10px] text-gw-dim" role="alert">
              {displayError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
