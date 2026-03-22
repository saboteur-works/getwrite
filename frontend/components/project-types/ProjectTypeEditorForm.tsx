"use client";

/**
 * @module project-types/ProjectTypeEditorForm
 *
 * Editor form for a single project type definition.
 *
 * This component is intentionally presentation-focused. It delegates all
 * mutation semantics to callbacks supplied by the parent orchestrator.
 */

import React from "react";
import type {
    ProjectTypeDefinition,
    ProjectTypeDefaultResource,
    ProjectTypeFolder,
    ProjectTypeResourceKind,
} from "../../src/types/project-types";

/**
 * Props accepted by {@link ProjectTypeEditorForm}.
 */
export interface ProjectTypeEditorFormProps {
    /** Definition currently being edited. */
    definition: ProjectTypeDefinition;
    /** Called when the definition changes. */
    onChange: (nextDefinition: ProjectTypeDefinition) => void;
    /** Called when user requests a new folder row. */
    onAddFolder: () => void;
    /** Called when user requests folder removal. */
    onRemoveFolder: (index: number) => void;
    /** Called when user requests a new default resource row. */
    onAddResource: () => void;
    /** Called when user requests resource removal. */
    onRemoveResource: (index: number) => void;
}

/**
 * Editor panel for a single project type definition.
 *
 * @param props - Component properties.
 * @returns Editor UI.
 */
export default function ProjectTypeEditorForm({
    definition,
    onChange,
    onAddFolder,
    onRemoveFolder,
    onAddResource,
    onRemoveResource,
}: ProjectTypeEditorFormProps): JSX.Element {
    const patchDefinition = (updates: Partial<ProjectTypeDefinition>): void => {
        onChange({
            ...definition,
            ...updates,
        });
    };

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

interface LabeledInputProps {
    label: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
}

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

interface LabeledTextareaProps {
    label: string;
    value: string;
    placeholder?: string;
    rows?: number;
    onChange: (value: string) => void;
}

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

interface LabeledSelectProps {
    label: string;
    value: ProjectTypeResourceKind;
    options: ProjectTypeResourceKind[];
    onChange: (value: ProjectTypeResourceKind) => void;
}

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
