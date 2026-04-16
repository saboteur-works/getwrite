"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Tag } from "../../src/lib/models/types";

function toColorInputValue(color: string | undefined): string {
    if (!color) return "#000000";
    const normalized = color.trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)
        ? normalized
        : "#000000";
}

export interface TagsManagerModalProps {
    /** Absolute path to the project root on disk. */
    projectPath: string;
    onClose: () => void;
}

/**
 * Modal for managing project-level tags: create and delete.
 * Rendered via `ModalOverlayShell` in `ShellModalCoordinator`.
 */
export default function TagsManagerModal({
    projectPath,
    onClose,
}: TagsManagerModalProps): JSX.Element {
    const [tags, setTags] = useState<Tag[]>([]);
    const [newName, setNewName] = useState<string>("");
    const [newColor, setNewColor] = useState<string>("#000000");
    const [useColor, setUseColor] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const nameInputRef = useRef<HTMLInputElement>(null);

    const loadTags = () => {
        fetch("/api/project/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list", projectPath }),
        })
            .then((r) => r.json())
            .then((data: { tags?: Tag[] }) => setTags(data.tags ?? []))
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
            await fetch("/api/project/tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create",
                    projectPath,
                    name: trimmed,
                    color: useColor ? newColor : undefined,
                }),
            });
            setNewName("");
            setUseColor(false);
            loadTags();
            nameInputRef.current?.focus();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (tagId: string) => {
        await fetch("/api/project/tags/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectPath, tagId }),
        });
        loadTags();
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-8">
            <header className="flex items-start justify-between gap-4 border-b border-gw-border pb-5">
                <div>
                    <h1 className="text-2xl font-semibold text-gw-primary">
                        Manage Tags
                    </h1>
                    <p className="mt-1 text-sm text-gw-secondary">
                        Create and delete project-scoped tags. Assign them to
                        resources from the metadata sidebar.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-gw-border bg-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2"
                    aria-label="Close"
                >
                    Close
                </button>
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
                                className="flex items-center justify-between gap-2 rounded-md border-[0.5px] border-gw-border bg-gw-chrome px-3 py-2"
                            >
                                <span
                                    className="metadata-sidebar-tag"
                                    style={
                                        tag.color
                                            ? {
                                                  borderColor: tag.color,
                                                  color: tag.color,
                                              }
                                            : undefined
                                    }
                                >
                                    {tag.name}
                                </span>
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
                    className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-4 flex flex-col gap-3"
                    onSubmit={(e) => void handleCreate(e)}
                >
                    <p className="text-sm font-semibold text-gw-primary">
                        New Tag
                    </p>
                    <input
                        ref={nameInputRef}
                        type="text"
                        className="w-full rounded-md border border-gw-border bg-transparent px-3 py-2 text-sm text-gw-primary placeholder-gw-secondary focus:outline-none focus:ring-1 focus:ring-gw-border"
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
                                checked={useColor}
                                onChange={(e) => setUseColor(e.target.checked)}
                                aria-label="Set tag color"
                            />
                            Color
                        </label>
                        {useColor ? (
                            <input
                                type="color"
                                value={toColorInputValue(newColor)}
                                onChange={(e) => setNewColor(e.target.value)}
                                aria-label="Tag color"
                                className="h-7 w-10 cursor-pointer rounded border border-gw-border bg-transparent"
                            />
                        ) : null}
                    </div>
                    <button
                        type="submit"
                        disabled={!newName.trim() || isSubmitting}
                        className="rounded-md border border-gw-border bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gw-secondary transition-colors duration-150 hover:bg-gw-chrome2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Add Tag
                    </button>
                </form>
            </div>
        </div>
    );
}
