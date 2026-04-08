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
import { Pipette } from "lucide-react";

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
        <div className="project-type-editor-form">
            <div className="project-type-editor-form-grid project-type-editor-form-grid--two-column">
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

            <section className="project-type-editor-section">
                <div className="project-type-editor-section-header">
                    <h2 className="project-type-editor-section-title">
                        Folders
                    </h2>
                    <button
                        type="button"
                        onClick={onAddFolder}
                        className="project-type-editor-action-button"
                    >
                        Add Folder
                    </button>
                </div>

                <div className="project-type-editor-stack">
                    {definition.folders.map((folder, index) => (
                        <div
                            key={`${folder.name || "folder"}-${index}`}
                            className="project-type-editor-form-grid project-type-editor-form-grid--folder-row project-type-editor-card"
                        >
                            <LabeledInput
                                label="Folder Name"
                                value={folder.name}
                                placeholder="Workspace"
                                onChange={(value) => {
                                    patchFolder(index, { name: value });
                                }}
                            />
                            <div className="project-type-editor-row-end">
                                <label className="project-type-editor-checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(folder.special)}
                                        onChange={(event) => {
                                            patchFolder(index, {
                                                special: event.target.checked,
                                            });
                                        }}
                                        className="project-type-editor-checkbox"
                                    />
                                    Special
                                </label>
                            </div>
                            <div className="project-type-editor-row-end project-type-editor-row-end--right">
                                <button
                                    type="button"
                                    onClick={() => onRemoveFolder(index)}
                                    className="project-type-editor-action-button"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="project-type-editor-section">
                <div className="project-type-editor-section-header">
                    <h2 className="project-type-editor-section-title">
                        Default Resources
                    </h2>
                    <button
                        type="button"
                        onClick={onAddResource}
                        className="project-type-editor-action-button"
                    >
                        Add Resource
                    </button>
                </div>

                <div className="project-type-editor-stack">
                    {(definition.defaultResources ?? []).map(
                        (resource, index) => (
                            <div
                                key={`${resource.name || "resource"}-${index}`}
                                className="project-type-editor-card project-type-editor-stack"
                            >
                                <div className="project-type-editor-form-grid project-type-editor-form-grid--three-column">
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

                                <div className="project-type-editor-row-end project-type-editor-row-end--right">
                                    <button
                                        type="button"
                                        onClick={() => onRemoveResource(index)}
                                        className="project-type-editor-action-button"
                                    >
                                        Remove Resource
                                    </button>
                                </div>
                            </div>
                        ),
                    )}
                </div>
            </section>

            <section className="project-type-editor-section">
                <div className="project-type-editor-section-header">
                    <h2 className="project-type-editor-section-title">
                        Editor Settings
                    </h2>
                    {/* <button
                        type="button"
                        onClick={onAddResource}
                        className="project-type-editor-action-button"
                    >
                        Add Resource
                    </button> */}
                </div>

                <div className="project-type-editor-stack">
                    <h3>Heading Styles</h3>
                    <p className="project-type-editor-helper-text">
                        Define custom styles for heading levels.
                    </p>
                    <div>
                        <p className="project-type-editor-subsection-title">
                            Heading 1
                        </p>
                        <div className="flex gap-4">
                            <LabeledInput
                                label="Font Family"
                                value={
                                    definition.editorConfig?.headings?.h1
                                        ?.fontFamily ?? ""
                                }
                                placeholder="e.g. 'Georgia, serif'"
                                onChange={(value) => {
                                    patchDefinition({
                                        editorConfig: {
                                            ...definition.editorConfig,
                                            headings: {
                                                ...definition.editorConfig
                                                    ?.headings,
                                                h1: {
                                                    ...definition.editorConfig
                                                        ?.headings?.h1,
                                                    fontFamily: value,
                                                },
                                            },
                                        },
                                    });
                                }}
                            />
                            <LabeledNumberInput
                                label="Font Size (px)"
                                value={
                                    definition.editorConfig?.headings?.h1
                                        ?.fontSize
                                        ? String(
                                              definition.editorConfig.headings
                                                  .h1.fontSize,
                                          )
                                        : ""
                                }
                                placeholder="e.g. 24"
                                onChange={(value) => {
                                    const fontSize = parseInt(value, 10);
                                    if (isNaN(fontSize)) {
                                        return;
                                    }

                                    patchDefinition({
                                        editorConfig: {
                                            ...definition.editorConfig,
                                            headings: {
                                                ...definition.editorConfig
                                                    ?.headings,
                                                h1: {
                                                    ...definition.editorConfig
                                                        ?.headings?.h1,
                                                    fontSize:
                                                        fontSize.toString() +
                                                        "px",
                                                },
                                            },
                                        },
                                    });
                                }}
                            />
                            <label className="project-type-editor-field">
                                <span className="project-type-editor-field-label">
                                    Font Weight
                                </span>
                                <select className="project-type-editor-field-control">
                                    <option value="normal">Normal</option>
                                    <option value="bold">Bold</option>
                                    <option value="lighter">Lighter</option>
                                    <option value="bolder">Bolder</option>
                                </select>
                            </label>
                            <LabeledInput
                                label="Letter Spacing"
                                value={
                                    definition.editorConfig?.headings?.h1
                                        ?.letterSpacing ?? ""
                                }
                                placeholder="e.g. 0.5px"
                                onChange={(value) => {
                                    patchDefinition({
                                        editorConfig: {
                                            ...definition.editorConfig,
                                            headings: {
                                                ...definition.editorConfig
                                                    ?.headings,
                                                h1: {
                                                    ...definition.editorConfig
                                                        ?.headings?.h1,
                                                    letterSpacing: value,
                                                },
                                            },
                                        },
                                    });
                                }}
                            />
                            <label className="project-type-editor-field">
                                <span className="project-type-editor-field-label">
                                    Color
                                </span>
                                <Pipette
                                    fill={
                                        definition.editorConfig?.headings?.h1
                                            ?.color ?? "#000000"
                                    }
                                    className="text-gw-dim"
                                    size={24}
                                    enableBackground={
                                        definition.editorConfig?.headings?.h1
                                            ?.color
                                    }
                                />
                                <input type="color" className="hidden" />
                            </label>
                        </div>
                    </div>
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
        <label className="project-type-editor-field">
            <span className="project-type-editor-field-label">{label}</span>
            <input
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="project-type-editor-field-control"
            />
        </label>
    );
}

function LabeledNumberInput({
    label,
    value,
    placeholder,
    onChange,
}: LabeledInputProps): JSX.Element {
    return (
        <label className="project-type-editor-field">
            <span className="project-type-editor-field-label">{label}</span>
            <input
                type="number"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="project-type-editor-field-control"
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
        <label className="project-type-editor-field">
            <span className="project-type-editor-field-label">{label}</span>
            <textarea
                value={value}
                rows={rows}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="project-type-editor-field-control"
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
        <label className="project-type-editor-field">
            <span className="project-type-editor-field-label">{label}</span>
            <select
                value={value}
                onChange={(event) => {
                    onChange(event.target.value as ProjectTypeResourceKind);
                }}
                className="project-type-editor-field-control"
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
