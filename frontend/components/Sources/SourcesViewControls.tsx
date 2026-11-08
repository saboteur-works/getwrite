"use client";

import React, { useCallback, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import useAppSelector from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import {
  addResource,
  selectFolders,
  selectResources,
  setSelectedResourceId,
  updateResource,
} from "../../src/store/resourcesSlice";
import { refreshEntityAliasTablesAfterRename } from "../../src/store/entity-alias-refresh";
import { createResource, renameResource } from "../../src/lib/api/resources";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import type { AnyResource } from "../../src/lib/models/types";
import { toastService } from "../../src/lib/toast-service";
import Button from "../common/UI/Button/Button";
import Input from "../common/UI/Input/Input";
import type { AppDispatch } from "../../src/store/store";

const LOCKED_MESSAGE = "This project is locked. Unlock it, then try again.";

/** The message shown for a failed action; a locked project reads as locked. */
function failureMessage(error: unknown, fallback: string): string {
  if (isLockedAccessError(error)) return LOCKED_MESSAGE;
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface SourceActions {
  /** Creates a Source at the project root; resolves to an error message, or null on success. */
  createSource: (name: string) => Promise<string | null>;
  /** Renames a Source; resolves to an error message, or null on success. */
  renameSource: (resourceId: string, name: string) => Promise<string | null>;
}

/**
 * Create and rename for the Sources view. Both go through the calls the
 * resource tree makes (`createResource`, `renameResource`) and update the
 * store the way the tree's handlers do (`page.tsx` create, `AppShell`
 * `handleRenameConfirm`); no storage operation is added. A new Source is
 * seeded out of compile inside `createResource`'s core (Feature 102, FR-27);
 * its create-time notice is shown here as the tree shows it. `onSourceCreated`
 * lets the page add the Source to its own project state, as the tree's create
 * does (Task 43, FR-16).
 */
export function useSourceActions(
  onSourceCreated?: (resource: AnyResource) => void,
): SourceActions {
  const dispatch = useDispatch<AppDispatch>();
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resources = useAppSelector((s) => selectResources(s.resources));
  const folders = useAppSelector((s) => selectFolders(s.resources));

  const createSource = useCallback(
    async (name: string): Promise<string | null> => {
      if (projectId === null) return "No project is open.";
      // Same ordering as the tree's create: last among the root's children.
      const maxSiblingOrder = [...resources, ...folders]
        .filter((item) => {
          const parentId =
            item.type === "folder"
              ? ((item as { parentId?: string | null }).parentId ??
                item.folderId ??
                null)
              : (item.folderId ?? null);
          return parentId === null;
        })
        .reduce((max, item) => Math.max(max, item.orderIndex ?? 0), -1);
      try {
        const body = await createResource(projectId, {
          name,
          folderId: null,
          type: "source",
          orderIndex: maxSiblingOrder + 1,
        });
        const created: AnyResource = body.resource;
        dispatch(addResource(created));
        dispatch(setSelectedResourceId(created.id));
        onSourceCreated?.(created);
        toastService.success("Resource created", `${name} created`);
        if (body.notice !== undefined) {
          toastService.error("Source not left out of compile", body.notice, {
            id: "source-not-excluded-from-compile",
          });
        }
        return null;
      } catch (error) {
        return failureMessage(error, "The Source could not be created.");
      }
    },
    [dispatch, folders, onSourceCreated, projectId, resources],
  );

  const renameSource = useCallback(
    async (resourceId: string, name: string): Promise<string | null> => {
      if (projectId === null) return "No project is open.";
      try {
        const isOk = await renameResource(
          resourceId,
          projectId,
          name,
          "resource",
        );
        if (!isOk) return "The Source could not be renamed.";
        dispatch(updateResource({ id: resourceId, name }));
        // An entity's name is in both alias tables (highlighting and spelling).
        dispatch(refreshEntityAliasTablesAfterRename(projectId, resourceId));
        return null;
      } catch (error) {
        return failureMessage(error, "The Source could not be renamed.");
      }
    },
    [dispatch, projectId],
  );

  return { createSource, renameSource };
}

interface NameFormProps {
  /** Visible and accessible label of the input. */
  label: string;
  initialName: string;
  submitLabel: string;
  /** Returns an error message, or null when the action succeeded. */
  onSubmit: (name: string) => Promise<string | null>;
  onDone: () => void;
}

/** One inline name field: Enter submits, Escape cancels, a failure stays visible. */
function NameForm({
  label,
  initialName,
  submitLabel,
  onSubmit,
  onDone,
}: NameFormProps): JSX.Element {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setIsBusy(true);
    setError(null);
    const failure = await onSubmit(trimmed);
    setIsBusy(false);
    if (failure === null) onDone();
    else setError(failure);
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
    >
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={label}
        aria-invalid={error !== null}
        disabled={isBusy}
        className="text-sm"
      />
      <Button type="submit" variant="outline" size="xs" disabled={isBusy}>
        {submitLabel}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={onDone}
        disabled={isBusy}
      >
        Cancel
      </Button>
      {error !== null && (
        <p role="alert" className="w-full text-gw-label text-gw-primary">
          {error}
        </p>
      )}
    </form>
  );
}

/** The "New Source" button and its inline name form. */
export function CreateSourceControl({
  createSource,
}: Pick<SourceActions, "createSource">): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => setIsOpen(true)}
      >
        New Source
      </Button>
    );
  }
  return (
    <NameForm
      label="Source name"
      initialName=""
      submitLabel="Create"
      onSubmit={createSource}
      onDone={() => setIsOpen(false)}
    />
  );
}

export interface RenameSourceControlProps {
  resourceId: string;
  name: string;
  renameSource: SourceActions["renameSource"];
}

/** A row's "Rename" button and its inline name form. */
export function RenameSourceControl({
  resourceId,
  name,
  renameSource,
}: RenameSourceControlProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  if (!isOpen) {
    return (
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="xs"
        aria-label={`Rename ${name}`}
        onClick={() => setIsOpen(true)}
      >
        Rename
      </Button>
    );
  }
  return (
    <NameForm
      label={`New name for ${name}`}
      initialName={name}
      submitLabel="Save"
      onSubmit={(next) => renameSource(resourceId, next)}
      onDone={() => {
        setIsOpen(false);
        setTimeout(() => triggerRef.current?.focus(), 0);
      }}
    />
  );
}
