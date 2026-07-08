"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Tag } from "../../src/lib/models/types";
import { listTags, createTag, deleteTag } from "../../src/lib/api/tags";
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
 * Modal for managing project-level tags: create and delete.
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

  const loadTags = () => {
    listTags(projectPath)
      .then(setTags)
      .catch(() => setTags([]));
  };

  useEffect(() => {
    loadTags();
  }, [projectPath]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
        projectPath,
        trimmed,
        shouldUseColor ? newColor : undefined,
      );
      setNewName("");
      setShouldUseColor(false);
      loadTags();
      nameInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (tagId: string) => {
    await deleteTag(projectPath, tagId);
    loadTags();
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-gw-border pb-4">
        <h2 className="text-lg font-semibold text-gw-primary">Manage Tags</h2>
        <p className="max-w-2xl text-sm text-gw-secondary">
          Create and delete project-scoped tags. Assign them to resources from
          the metadata sidebar.
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
            {tags.map((tag) => (
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
                <button
                  type="button"
                  aria-label={`Delete tag ${tag.name}`}
                  className="rounded-md border border-gw-border bg-transparent p-1.5 text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                  onClick={() => void handleDelete(tag.id)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
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
    </div>
  );
}
