"use client";

/**
 * @module ProjectTypesManagerPage
 *
 * Client UI for viewing, creating, and editing project type definitions.
 * This is an in-memory management interface only; persistence is intentionally
 * deferred to future API wiring.
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
    ProjectTypeDefinition,
    ProjectTypeDefaultResource,
    ProjectTypeFolder,
    ProjectTypeResourceKind,
    ProjectTypeTemplateFile,
} from "../../src/types/project-types";

/**
 * Properties required by {@link ProjectTypesManagerPage}.
 */
interface ProjectTypesManagerPageProps {
    /**
     * Initial templates loaded from filesystem-backed project type JSON files.
     */
    initialTemplates: ProjectTypeTemplateFile[];
}

/**
 * Local list row shape used for sidebar rendering.
 */
interface ProjectTypeListItem {
    /**
     * Stable key for list rendering and selection.
     */
    key: string;
    /**
     * Source file name, if this entry came from disk.
     */
    fileName?: string;
    /**
     * Editable project type definition.
     */
    definition: ProjectTypeDefinition;
    /**
     * Marks whether this item has local unsaved edits.
     */
    hasChanges: boolean;
}

/**
 * Creates an empty draft project type definition.
 *
 * @returns New project type draft with a required Workspace folder.
 */
function createEmptyProjectType(): ProjectTypeDefinition {
    return {
        id: "",
        name: "",
        description: "",
        folders: [{ name: "Workspace", special: true }],
        defaultResources: [],
    };
}

/**
 * Creates a stable local key used for list item identity.
 *
 * @param fileName - Backing file name if present.
 * @param definition - Project type definition.
 * @returns Stable key string.
 */
function toItemKey(
    fileName: string | undefined,
    definition: ProjectTypeDefinition,
): string {
    if (fileName) {
        return `file:${fileName}`;
    }

    if (definition.id.trim().length > 0) {
        return `draft:${definition.id}`;
    }

    return `draft:${definition.name || "untitled"}`;
}

/**
 * Ensures default resources and folders arrays are always present.
 *
 * @param definition - Project type definition to normalize.
 * @returns Normalized definition object.
 */
function normalizeDefinition(
    definition: ProjectTypeDefinition,
): ProjectTypeDefinition {
    return {
        ...definition,
        folders: definition.folders ?? [],
        defaultResources: definition.defaultResources ?? [],
    };
}

/**
 * Project type management page component.
 *
 * @param props - Component properties.
 * @returns Management page UI.
 */
export default function ProjectTypesManagerPage({
    initialTemplates,
}: ProjectTypesManagerPageProps): JSX.Element {
    const router = useRouter();

    const initialItems = useMemo<ProjectTypeListItem[]>(() => {
        return initialTemplates.map((template) => {
            const normalized = normalizeDefinition(template.definition);
            return {
                key: toItemKey(template.fileName, normalized),
                fileName: template.fileName,
                definition: normalized,
                hasChanges: false,
            };
        });
    }, [initialTemplates]);

    const [items, setItems] = useState<ProjectTypeListItem[]>(initialItems);
    const [selectedKey, setSelectedKey] = useState<string>(
        initialItems[0]?.key ?? "",
    );

    const selectedItem = items.find((item) => item.key === selectedKey) ?? null;

    /**
     * Updates the selected project type definition in local state.
     *
     * @param updater - Function that transforms current definition.
     */
    const updateSelectedDefinition = (
        updater: (current: ProjectTypeDefinition) => ProjectTypeDefinition,
    ): void => {
        setItems((previous) => {
            return previous.map((item) => {
                if (item.key !== selectedKey) {
                    return item;
                }

                const updatedDefinition = normalizeDefinition(
                    updater(item.definition),
                );

                const nextKey = toItemKey(item.fileName, updatedDefinition);
                if (nextKey !== item.key) {
                    setSelectedKey(nextKey);
                }

                return {
                    ...item,
                    key: nextKey,
                    definition: updatedDefinition,
                    hasChanges: true,
                };
            });
        });
    };

    /**
     * Adds a new in-memory draft project type and selects it.
     */
    const handleCreateProjectType = (): void => {
        const definition = createEmptyProjectType();
        const timestamp = Date.now();
        const key = `draft:new-${timestamp}`;

        const nextItem: ProjectTypeListItem = {
            key,
            definition,
            hasChanges: true,
        };

        setItems((previous) => [nextItem, ...previous]);
        setSelectedKey(key);
    };

    /**
     * Adds a folder definition to the selected project type.
     */
    const handleAddFolder = (): void => {
        updateSelectedDefinition((current) => ({
            ...current,
            folders: [
                ...current.folders,
                {
                    name: "",
                    special: false,
                },
            ],
        }));
    };

    /**
     * Deletes a folder definition from the selected project type.
     *
     * @param index - Folder index to remove.
     */
    const handleRemoveFolder = (index: number): void => {
        updateSelectedDefinition((current) => ({
            ...current,
            folders: current.folders.filter((_, folderIndex) => {
                return folderIndex !== index;
            }),
        }));
    };

    /**
     * Adds a top-level default resource to the selected project type.
     */
    const handleAddResource = (): void => {
        updateSelectedDefinition((current) => ({
            ...current,
            defaultResources: [
                ...(current.defaultResources ?? []),
                {
                    folder: "Workspace",
                    name: "",
                    type: "text",
                    template: "",
                },
            ],
        }));
    };

    /**
     * Deletes a top-level default resource from the selected project type.
     *
     * @param index - Resource index to remove.
     */
    const handleRemoveResource = (index: number): void => {
        updateSelectedDefinition((current) => ({
            ...current,
            defaultResources: (current.defaultResources ?? []).filter(
                (_, resourceIndex) => {
                    return resourceIndex !== index;
                },
            ),
        }));
    };

    /**
     * Closes the manager and returns user to the previous app screen.
     * Falls back to `/` when there is no meaningful history entry.
     */
    const handleCloseManager = (): void => {
        if (window.history.length > 1) {
            router.back();
            return;
        }

        router.push("/");
    };

    return (
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-10">
            <header className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-slate-900">
                        Project Type Management
                    </h1>
                    <p className="text-sm text-slate-600">
                        View, create, and edit project type templates from
                        getwrite-config/templates/project-types.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCloseManager}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                        Close
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateProjectType}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                        New Project Type
                    </button>
                </div>
            </header>

            <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <aside className="rounded-lg border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
                        Templates
                    </div>
                    <ul className="max-h-[65vh] overflow-y-auto p-2">
                        {items.map((item) => {
                            const isSelected = item.key === selectedKey;
                            const title =
                                item.definition.name.trim() ||
                                item.definition.id.trim() ||
                                "Untitled";

                            return (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedKey(item.key)}
                                        className={`mb-1 flex w-full flex-col rounded-md border px-3 py-2 text-left ${
                                            isSelected
                                                ? "border-slate-700 bg-slate-100"
                                                : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                                        }`}
                                    >
                                        <span className="text-sm font-medium text-slate-900">
                                            {title}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {item.fileName ?? "new draft"}
                                        </span>
                                        {item.hasChanges ? (
                                            <span className="mt-1 text-[11px] font-medium text-amber-700">
                                                Unsaved changes
                                            </span>
                                        ) : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </aside>

                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    {selectedItem ? (
                        <ProjectTypeEditor
                            definition={selectedItem.definition}
                            onChange={(nextDefinition) => {
                                updateSelectedDefinition(() => nextDefinition);
                            }}
                            onAddFolder={handleAddFolder}
                            onRemoveFolder={handleRemoveFolder}
                            onAddResource={handleAddResource}
                            onRemoveResource={handleRemoveResource}
                        />
                    ) : (
                        <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                            No project type selected.
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}

/**
 * Properties for {@link ProjectTypeEditor}.
 */
interface ProjectTypeEditorProps {
    /**
     * Definition currently being edited.
     */
    definition: ProjectTypeDefinition;
    /**
     * Called when the definition changes.
     */
    onChange: (nextDefinition: ProjectTypeDefinition) => void;
    /**
     * Called when user requests a new folder row.
     */
    onAddFolder: () => void;
    /**
     * Called when user requests folder removal.
     */
    onRemoveFolder: (index: number) => void;
    /**
     * Called when user requests a new default resource row.
     */
    onAddResource: () => void;
    /**
     * Called when user requests resource removal.
     */
    onRemoveResource: (index: number) => void;
}

/**
 * Editor panel for a single project type definition.
 *
 * @param props - Component properties.
 * @returns Editor UI.
 */
function ProjectTypeEditor({
    definition,
    onChange,
    onAddFolder,
    onRemoveFolder,
    onAddResource,
    onRemoveResource,
}: ProjectTypeEditorProps): JSX.Element {
    /**
     * Applies a partial update to the definition.
     *
     * @param updates - Partial definition fields to merge.
     */
    const patchDefinition = (updates: Partial<ProjectTypeDefinition>): void => {
        onChange({
            ...definition,
            ...updates,
        });
    };

    /**
     * Updates one folder row in the definition.
     *
     * @param index - Folder index.
     * @param updates - Partial folder updates.
     */
    const patchFolder = (
        index: number,
        updates: Partial<ProjectTypeFolder>,
    ): void => {
        const nextFolders = definition.folders.map((folder, folderIndex) => {
            if (folderIndex !== index) {
                return folder;
            }

            return {
                ...folder,
                ...updates,
            };
        });

        patchDefinition({ folders: nextFolders });
    };

    /**
     * Updates one default resource row in the definition.
     *
     * @param index - Resource index.
     * @param updates - Partial resource updates.
     */
    const patchResource = (
        index: number,
        updates: Partial<ProjectTypeDefaultResource>,
    ): void => {
        const currentResources = definition.defaultResources ?? [];
        const nextResources = currentResources.map(
            (resource, resourceIndex) => {
                if (resourceIndex !== index) {
                    return resource;
                }

                return {
                    ...resource,
                    ...updates,
                };
            },
        );

        patchDefinition({ defaultResources: nextResources });
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                <LabeledInput
                    label="ID"
                    value={definition.id}
                    placeholder="novel"
                    onChange={(value) => patchDefinition({ id: value })}
                />
                <LabeledInput
                    label="Name"
                    value={definition.name}
                    placeholder="Novel"
                    onChange={(value) => patchDefinition({ name: value })}
                />
            </div>

            <LabeledTextarea
                label="Description"
                value={definition.description ?? ""}
                placeholder="Describe this project type..."
                rows={3}
                onChange={(value) => patchDefinition({ description: value })}
            />

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                        Folders
                    </h2>
                    <button
                        type="button"
                        onClick={onAddFolder}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                        Add Folder
                    </button>
                </div>

                <div className="space-y-2">
                    {definition.folders.map((folder, index) => (
                        <div
                            key={`${folder.name || "folder"}-${index}`}
                            className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto]"
                        >
                            <LabeledInput
                                label="Folder Name"
                                value={folder.name}
                                placeholder="Workspace"
                                onChange={(value) => {
                                    patchFolder(index, { name: value });
                                }}
                            />
                            <div className="flex items-end pb-0.5">
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(folder.special)}
                                        onChange={(event) => {
                                            patchFolder(index, {
                                                special: event.target.checked,
                                            });
                                        }}
                                        className="h-4 w-4 rounded border-slate-300"
                                    />
                                    Special
                                </label>
                            </div>
                            <div className="flex items-end justify-end pb-0.5">
                                <button
                                    type="button"
                                    onClick={() => onRemoveFolder(index)}
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                        Default Resources
                    </h2>
                    <button
                        type="button"
                        onClick={onAddResource}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                        Add Resource
                    </button>
                </div>

                <div className="space-y-2">
                    {(definition.defaultResources ?? []).map(
                        (resource, index) => (
                            <div
                                key={`${resource.name || "resource"}-${index}`}
                                className="space-y-3 rounded-md border border-slate-200 p-3"
                            >
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <LabeledInput
                                        label="Name"
                                        value={resource.name}
                                        placeholder="Manuscript Start"
                                        onChange={(value) => {
                                            patchResource(index, {
                                                name: value,
                                            });
                                        }}
                                    />
                                    <LabeledInput
                                        label="Folder"
                                        value={resource.folder}
                                        placeholder="Workspace"
                                        onChange={(value) => {
                                            patchResource(index, {
                                                folder: value,
                                            });
                                        }}
                                    />
                                    <LabeledSelect
                                        label="Type"
                                        value={resource.type}
                                        options={["text", "image", "audio"]}
                                        onChange={(value) => {
                                            patchResource(index, {
                                                type: value,
                                            });
                                        }}
                                    />
                                </div>

                                <LabeledTextarea
                                    label="Template"
                                    value={resource.template ?? ""}
                                    placeholder="Optional default content"
                                    rows={3}
                                    onChange={(value) => {
                                        patchResource(index, {
                                            template: value,
                                        });
                                    }}
                                />

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => onRemoveResource(index)}
                                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                    >
                                        Remove Resource
                                    </button>
                                </div>
                            </div>
                        ),
                    )}
                </div>
            </section>
        </div>
    );
}

/**
 * Properties for {@link LabeledInput}.
 */
interface LabeledInputProps {
    /**
     * Visible field label.
     */
    label: string;
    /**
     * Current input value.
     */
    value: string;
    /**
     * Optional placeholder value.
     */
    placeholder?: string;
    /**
     * Called whenever the value changes.
     */
    onChange: (value: string) => void;
}

/**
 * Labeled text input used throughout the editor.
 *
 * @param props - Component properties.
 * @returns Input field UI.
 */
function LabeledInput({
    label,
    value,
    placeholder,
    onChange,
}: LabeledInputProps): JSX.Element {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <input
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
        </label>
    );
}

/**
 * Properties for {@link LabeledTextarea}.
 */
interface LabeledTextareaProps {
    /**
     * Visible field label.
     */
    label: string;
    /**
     * Current textarea value.
     */
    value: string;
    /**
     * Optional placeholder value.
     */
    placeholder?: string;
    /**
     * Visible text row count.
     */
    rows?: number;
    /**
     * Called whenever the value changes.
     */
    onChange: (value: string) => void;
}

/**
 * Labeled textarea used for multiline fields.
 *
 * @param props - Component properties.
 * @returns Textarea field UI.
 */
function LabeledTextarea({
    label,
    value,
    placeholder,
    rows,
    onChange,
}: LabeledTextareaProps): JSX.Element {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <textarea
                value={value}
                rows={rows}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
        </label>
    );
}

/**
 * Properties for {@link LabeledSelect}.
 */
interface LabeledSelectProps {
    /**
     * Visible field label.
     */
    label: string;
    /**
     * Current select value.
     */
    value: ProjectTypeResourceKind;
    /**
     * Available select options.
     */
    options: ProjectTypeResourceKind[];
    /**
     * Called whenever the value changes.
     */
    onChange: (value: ProjectTypeResourceKind) => void;
}

/**
 * Labeled select input for resource kind.
 *
 * @param props - Component properties.
 * @returns Select field UI.
 */
function LabeledSelect({
    label,
    value,
    options,
    onChange,
}: LabeledSelectProps): JSX.Element {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <select
                value={value}
                onChange={(event) => {
                    onChange(event.target.value as ProjectTypeResourceKind);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            >
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    );
}
