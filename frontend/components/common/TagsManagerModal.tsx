"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Tag } from "../../src/lib/models/types";
import {
  listTags,
  createTag,
  deleteTag,
  updateTag,
  TagChangeRefusedError,
} from "../../src/lib/api/tags";
import { toastService } from "../../src/lib/toast-service";
import { getProjectDirectoryId } from "../../src/store/projectsSlice";
import Button from "./UI/Button/Button";
import Chip from "./UI/Chip";
import Input from "./UI/Input/Input";

function toColorInputValue(color: string | undefined): string {
  if (!color) return "#000000"; // GW-HEX-EXEMPT: color picker placeholder — user-selected arbitrary colors
  const normalized = color.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)
    ? normalized
    : "#000000"; // GW-HEX-EXEMPT: color picker placeholder — user-selected arbitrary colors
}

export interface TagsManagerModalProps {
  /** Absolute path to the project root on disk. */
  projectPath: string;
  onClose: () => void;
}

/**
 * The client-side check for an edited tag name, mirroring the refusal
 * `updateTag` in `tags.ts` applies on save: not blank, and not another tag's
 * name (trimmed, ignoring capitals). Returns the message to show, or `null`.
 */
function tagNameProblem(
  name: string,
  tagId: string,
  tags: Tag[],
): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Tag name must not be blank.";
  const clash = tags.find(
    (t) =>
      t.id !== tagId && t.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return clash
    ? `A tag named \u201c${clash.name.trim()}\u201d already exists.`
    : null;
}

/** The in-progress edit of one tag row. */
interface TagEdit {
  tagId: string;
  name: string;
  useColor: boolean;
  color: string;
  error: string | null;
}

/**
 * Modal for managing project-level tags: create, edit (name and color) and
 * delete.
 * Rendered via `Dialog` in `ShellModalCoordinator`.
 */
export default function TagsManagerModal({
  projectPath,
  onClose,
}: TagsManagerModalProps): JSX.Element {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newName, setNewName] = useState<string>("");
  const [newColor, setNewColor] = useState<string>("#000000"); // GW-HEX-EXEMPT: color picker initial value — user-selected arbitrary colors
  const [shouldUseColor, setShouldUseColor] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<TagEdit | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const editErrorId = "tag-edit-error";

  // Radix's dialog closes on Escape from a capture-phase listener on
  // document, before the edit input's onKeyDown runs. While a row is being
  // edited, prevent that default so Escape cancels the edit instead
  // (the same approach as SchemaManager's inline edits).
  const isEditingRef = useRef(false);
  useLayoutEffect(() => {
    isEditingRef.current = edit !== null;
  }, [edit]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isEditingRef.current) e.preventDefault();
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () =>
      document.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // Directory basename, not `project.id` (project.json's independently
  // generated internal id) — see `selectActiveProjectDirectoryId`'s doc
  // comment in `projectsSlice.ts`.
  const projectId = getProjectDirectoryId(projectPath);

  const loadTags = () => {
    listTags(projectId)
      .then(setTags)
      .catch(() => setTags([]));
  };

  useEffect(() => {
    loadTags();
  }, [projectPath]);

  // Close on Escape, unless the Escape cancelled a row edit (see above).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCreate = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createTag(
        projectId,
        trimmed,
        shouldUseColor ? newColor : undefined,
      );
      setNewName("");
      setShouldUseColor(false);
      loadTags();
      nameInputRef.current?.focus();
    } catch {
      // `createTag` rejects on a failed write now that the transport checks
      // the response. The typed name is deliberately left in the field: the
      // tag does not exist, and clearing the input would suggest it does.
      toastService.error("Could not create that tag.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEdit({
      tagId: tag.id,
      name: tag.name,
      useColor: Boolean(tag.color),
      color: toColorInputValue(tag.color),
      error: null,
    });
  };

  const handleSaveEdit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!edit || isSaving) return;
    const problem = tagNameProblem(edit.name, edit.tagId, tags);
    if (problem) {
      setEdit({ ...edit, error: problem });
      return;
    }
    setIsSaving(true);
    try {
      await updateTag(projectId, edit.tagId, {
        name: edit.name.trim(),
        ...(edit.useColor ? { color: edit.color } : {}),
      });
      setEdit(null);
      loadTags();
    } catch (err) {
      if (err instanceof TagChangeRefusedError) {
        setEdit({ ...edit, error: err.message });
      } else {
        toastService.error("Could not save that tag.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (tagId: string) => {
    try {
      await deleteTag(projectId, tagId);
    } catch {
      toastService.error("Could not delete that tag.");
      return;
    }
    loadTags();
  };

  return (
    <section className="flex w-full flex-col gap-6">
      {/* This wrapper is a <section> so the <header> below is a section
          header rather than the `banner` landmark: a <header> outside
          sectioning content maps to `banner`, and this panel renders inside
          ProjectSettingsDialog alongside the app top bar, which axe-core
          flags as `landmark-no-duplicate-banner`. EncryptionSettings.tsx
          already used this shape. */}
      <header className="flex flex-col gap-1 border-b border-gw-border pb-4">
        <h2 className="text-lg font-semibold text-gw-primary">Manage Tags</h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          Create, edit and delete project-scoped tags. Assign them to resources
          from the metadata sidebar.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {/* Tag list */}
        {tags.length === 0 ? (
          <p className="text-sm text-gw-secondary">
            No tags yet. Add one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {tags.map((tag) =>
              edit?.tagId === tag.id ? (
                <li
                  key={tag.id}
                  className="rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
                >
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => void handleSaveEdit(e)}
                  >
                    <Input
                      className="w-full"
                      value={edit.name}
                      onChange={(e) =>
                        setEdit({ ...edit, name: e.target.value, error: null })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEdit(null);
                      }}
                      autoFocus
                      aria-label={`Name for tag ${tag.name}`}
                      aria-invalid={edit.error ? true : undefined}
                      aria-describedby={edit.error ? editErrorId : undefined}
                      maxLength={64}
                    />
                    {edit.error ? (
                      <p
                        id={editErrorId}
                        role="alert"
                        className="text-gw-small font-medium text-gw-primary"
                      >
                        {edit.error}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-gw-secondary cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={edit.useColor}
                          onChange={(e) =>
                            setEdit({ ...edit, useColor: e.target.checked })
                          }
                          aria-label="Use a color"
                        />
                        Color
                      </label>
                      {edit.useColor ? (
                        <input
                          type="color"
                          value={edit.color}
                          onChange={(e) =>
                            setEdit({ ...edit, color: e.target.value })
                          }
                          aria-label={`Color for tag ${tag.name}`}
                          className="h-7 w-10 cursor-pointer rounded border border-gw-border bg-transparent"
                        />
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={isSaving}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEdit(null)}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </li>
              ) : (
                <li
                  key={tag.id}
                  className="flex items-center justify-between gap-2 rounded-md border-hairline border-gw-border bg-gw-chrome px-3 py-2"
                >
                  <Chip
                    label={tag.name}
                    shape="sharp"
                    size="sm"
                    color={tag.color}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-label={`Edit tag ${tag.name}`}
                      className="rounded-md border border-gw-border bg-transparent p-1.5 text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                      onClick={() => startEdit(tag)}
                    >
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete tag ${tag.name}`}
                      className="rounded-md border border-gw-border bg-transparent p-1.5 text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                      onClick={() => void handleDelete(tag.id)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}

        {/* New tag form */}
        <form
          className="rounded-lg border-hairline border-gw-border bg-gw-chrome p-4 flex flex-col gap-3"
          onSubmit={(e) => void handleCreate(e)}
        >
          <p className="text-sm font-semibold text-gw-primary">New Tag</p>
          <Input
            ref={nameInputRef}
            className="w-full"
            placeholder="Tag name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="New tag name"
            maxLength={64}
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gw-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shouldUseColor}
                onChange={(e) => setShouldUseColor(e.target.checked)}
                aria-label="Set tag color"
              />
              Color
            </label>
            {shouldUseColor ? (
              <input
                type="color"
                value={toColorInputValue(newColor)}
                onChange={(e) => setNewColor(e.target.value)}
                aria-label="Tag color"
                className="h-7 w-10 cursor-pointer rounded border border-gw-border bg-transparent"
              />
            ) : null}
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={!newName.trim() || isSubmitting}
          >
            Add Tag
          </Button>
        </form>
      </div>
    </section>
  );
}
