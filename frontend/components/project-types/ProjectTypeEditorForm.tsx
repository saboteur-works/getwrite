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
import Button from "../common/UI/Button/Button";
import Input from "../common/UI/Input/Input";
import Textarea from "../common/UI/Textarea/Textarea";
import type {
  ProjectTypeDefinition,
  ProjectTypeDefaultFolder,
  ProjectTypeDefaultResource,
  ProjectTypeFolder,
  ProjectTypeResourceKind,
} from "../../src/types/project-types";
import type { EditorHeading } from "../../src/lib/models/types";

const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

const FONT_WEIGHT_OPTIONS = ["normal", "bold", "lighter", "bolder"] as const;

const METADATA_INPUT_TYPES = ["text", "multiselect", "autocomplete"] as const;
type MetadataInputType = (typeof METADATA_INPUT_TYPES)[number];

/**
 * Props accepted by {@link ProjectTypeEditorForm}.
 */
export interface ProjectTypeEditorFormProps {
  definition: ProjectTypeDefinition;
  onChange: (nextDefinition: ProjectTypeDefinition) => void;
  onAddFolder: () => void;
  onRemoveFolder: (index: number) => void;
  onAddResource: () => void;
  onRemoveResource: (index: number) => void;
  onWordCountGoalChange: (value: number | undefined) => void;
  onAddStatus: () => void;
  onRemoveStatus: (index: number) => void;
  onUpdateStatus: (index: number, value: string) => void;
  onAddDefaultFolder: () => void;
  onRemoveDefaultFolder: (index: number) => void;
}

export default function ProjectTypeEditorForm({
  definition,
  onChange,
  onAddFolder,
  onRemoveFolder,
  onAddResource,
  onRemoveResource,
  onWordCountGoalChange,
  onAddStatus,
  onRemoveStatus,
  onUpdateStatus,
  onAddDefaultFolder,
  onRemoveDefaultFolder,
}: ProjectTypeEditorFormProps): JSX.Element {
  const patchDefinition = (updates: Partial<ProjectTypeDefinition>): void => {
    onChange({ ...definition, ...updates });
  };

  const patchFolder = (
    index: number,
    updates: Partial<ProjectTypeFolder>,
  ): void => {
    patchDefinition({
      folders: definition.folders.map((folder, i) =>
        i !== index ? folder : { ...folder, ...updates },
      ),
    });
  };

  const patchDefaultFolder = (
    index: number,
    updates: Partial<ProjectTypeDefaultFolder>,
  ): void => {
    patchDefinition({
      defaultFolders: (definition.defaultFolders ?? []).map((df, i) =>
        i !== index ? df : { ...df, ...updates },
      ),
    });
  };

  const patchResource = (
    index: number,
    updates: Partial<ProjectTypeDefaultResource>,
  ): void => {
    patchDefinition({
      defaultResources: (definition.defaultResources ?? []).map((r, i) =>
        i !== index ? r : { ...r, ...updates },
      ),
    });
  };

  const patchHeading = (
    level: HeadingLevel,
    updates: Partial<EditorHeading>,
  ): void => {
    patchDefinition({
      editorConfig: {
        ...definition.editorConfig,
        headings: {
          ...definition.editorConfig?.headings,
          [level]: {
            ...definition.editorConfig?.headings?.[level],
            ...updates,
          },
        },
      },
    });
  };

  type BodyConfig = NonNullable<
    NonNullable<ProjectTypeDefinition["editorConfig"]>["body"]
  >;

  const patchBody = (updates: Partial<BodyConfig>): void => {
    patchDefinition({
      editorConfig: {
        ...definition.editorConfig,
        body: { ...definition.editorConfig?.body, ...updates },
      },
    });
  };

  return (
    <div className="project-type-editor-form">
      {/* ── Identity ── */}
      <div className="project-type-editor-form-grid project-type-editor-form-grid--three-column">
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
        <LabeledNumberInput
          label="Word Count Goal"
          value={
            definition.wordCountGoal !== undefined
              ? String(definition.wordCountGoal)
              : ""
          }
          placeholder="e.g. 80000"
          onChange={(value) => {
            const parsed = parseInt(value, 10);
            onWordCountGoalChange(isNaN(parsed) ? undefined : parsed);
          }}
        />
      </div>

      <LabeledTextarea
        label="Description"
        value={definition.description ?? ""}
        placeholder="Describe this project type..."
        rows={3}
        onChange={(value) => patchDefinition({ description: value })}
      />

      {/* ── Statuses ── */}
      <section className="project-type-editor-section">
        <div className="project-type-editor-section-header">
          <h2 className="project-type-editor-section-title">Statuses</h2>
          <Button variant="secondary" size="xs" onClick={onAddStatus}>
            Add Status
          </Button>
        </div>
        {(definition.statuses ?? []).length === 0 ? (
          <p className="project-type-editor-helper-text">
            No statuses defined. Resources will use no status.
          </p>
        ) : (
          <div className="project-type-editor-status-list">
            {(definition.statuses ?? []).map((status, index) => (
              <div
                key={index}
                className="project-type-editor-form-grid project-type-editor-form-grid--folder-row project-type-editor-card"
              >
                <LabeledInput
                  label="Status Label"
                  value={status}
                  placeholder="e.g. Draft"
                  onChange={(value) => onUpdateStatus(index, value)}
                />
                <div
                  className="project-type-editor-row-end project-type-editor-row-end--right"
                  style={{ gridColumn: "3" }}
                >
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => onRemoveStatus(index)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Folders ── */}
      <section className="project-type-editor-section">
        <div className="project-type-editor-section-header">
          <h2 className="project-type-editor-section-title">Folders</h2>
          <Button variant="secondary" size="xs" onClick={onAddFolder}>
            Add Folder
          </Button>
        </div>
        <p className="project-type-editor-helper-text">
          Top-level folder categories for this project type. Use any structure
          that fits your project.
        </p>

        <div className="project-type-editor-stack">
          {definition.folders.map((folder, index) => (
            <div
              key={`${folder.name || "folder"}-${index}`}
              className="project-type-editor-card project-type-editor-stack"
            >
              <div className="project-type-editor-form-grid project-type-editor-form-grid--folder-row">
                <LabeledInput
                  label="Folder Name"
                  value={folder.name}
                  placeholder="Workspace"
                  onChange={(value) => patchFolder(index, { name: value })}
                />
                <div
                  className="project-type-editor-row-end project-type-editor-row-end--right"
                  style={{ gridColumn: "3" }}
                >
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => onRemoveFolder(index)}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <div className="project-type-editor-form-grid project-type-editor-form-grid--two-column">
                <div className="project-type-editor-row-end">
                  <label className="project-type-editor-checkbox-label">
                    <input
                      type="checkbox"
                      checked={Boolean(folder.metadataSource?.isMetadataSource)}
                      onChange={(e) =>
                        patchFolder(index, {
                          metadataSource: {
                            isMetadataSource: e.target.checked,
                            metadataInputType:
                              folder.metadataSource?.metadataInputType,
                          },
                        })
                      }
                      className="project-type-editor-checkbox"
                    />
                    Metadata Source
                  </label>
                </div>

                {folder.metadataSource?.isMetadataSource ? (
                  <LabeledSelect
                    label="Input Type"
                    value={folder.metadataSource?.metadataInputType ?? "text"}
                    options={[...METADATA_INPUT_TYPES]}
                    onChange={(value) =>
                      patchFolder(index, {
                        metadataSource: {
                          isMetadataSource: true,
                          metadataInputType: value as MetadataInputType,
                        },
                      })
                    }
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Default Folders ── */}
      <section className="project-type-editor-section">
        <div className="project-type-editor-section-header">
          <h2 className="project-type-editor-section-title">Default Folders</h2>
          <Button variant="secondary" size="xs" onClick={onAddDefaultFolder}>
            Add Default Folder
          </Button>
        </div>
        <p className="project-type-editor-helper-text">
          Subfolders seeded under a parent folder when a project is first
          created.
        </p>

        <div className="project-type-editor-stack">
          {(definition.defaultFolders ?? []).map((df, index) => (
            <div
              key={`${df.name || "df"}-${index}`}
              className="project-type-editor-card project-type-editor-stack"
            >
              <div className="project-type-editor-form-grid project-type-editor-form-grid--two-column">
                <LabeledInput
                  label="Name"
                  value={df.name}
                  placeholder="Chapter 1"
                  onChange={(value) =>
                    patchDefaultFolder(index, { name: value })
                  }
                />
                <LabeledInput
                  label="Parent Folder"
                  value={df.folder}
                  placeholder="Workspace"
                  onChange={(value) =>
                    patchDefaultFolder(index, { folder: value })
                  }
                />
              </div>

              <div className="project-type-editor-form-grid project-type-editor-form-grid--two-column">
                <div className="project-type-editor-row-end">
                  <label className="project-type-editor-checkbox-label">
                    <input
                      type="checkbox"
                      checked={Boolean(df.metadataSource?.isMetadataSource)}
                      onChange={(e) =>
                        patchDefaultFolder(index, {
                          metadataSource: {
                            isMetadataSource: e.target.checked,
                            metadataInputType:
                              df.metadataSource?.metadataInputType,
                          },
                        })
                      }
                      className="project-type-editor-checkbox"
                    />
                    Metadata Source
                  </label>
                </div>

                {df.metadataSource?.isMetadataSource ? (
                  <LabeledSelect
                    label="Input Type"
                    value={df.metadataSource?.metadataInputType ?? "text"}
                    options={[...METADATA_INPUT_TYPES]}
                    onChange={(value) =>
                      patchDefaultFolder(index, {
                        metadataSource: {
                          isMetadataSource: true,
                          metadataInputType: value as MetadataInputType,
                        },
                      })
                    }
                  />
                ) : null}
              </div>

              <div className="project-type-editor-row-end project-type-editor-row-end--right">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => onRemoveDefaultFolder(index)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Default Resources ── */}
      <section className="project-type-editor-section">
        <div className="project-type-editor-section-header">
          <h2 className="project-type-editor-section-title">
            Default Resources
          </h2>
          <Button variant="secondary" size="xs" onClick={onAddResource}>
            Add Resource
          </Button>
        </div>
        <p className="project-type-editor-helper-text">
          Resources created automatically when a new project of this type is
          initialized.
        </p>

        <div className="project-type-editor-stack">
          {(definition.defaultResources ?? []).map((resource, index) => (
            <div
              key={`${resource.name || "resource"}-${index}`}
              className="project-type-editor-card project-type-editor-stack"
            >
              <div className="project-type-editor-form-grid project-type-editor-form-grid--three-column">
                <LabeledInput
                  label="Name"
                  value={resource.name}
                  placeholder="Manuscript Start"
                  onChange={(value) => patchResource(index, { name: value })}
                />
                <LabeledInput
                  label="Folder"
                  value={resource.folder}
                  placeholder="Workspace"
                  onChange={(value) => patchResource(index, { folder: value })}
                />
                <LabeledSelect
                  label="Type"
                  value={resource.type}
                  options={["text", "image", "audio"]}
                  onChange={(value) =>
                    patchResource(index, {
                      type: value as ProjectTypeResourceKind,
                    })
                  }
                />
              </div>

              <LabeledTextarea
                label="Template"
                value={resource.template ?? ""}
                placeholder="Optional default content"
                rows={3}
                onChange={(value) => patchResource(index, { template: value })}
              />

              <div className="project-type-editor-row-end project-type-editor-row-end--right">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => onRemoveResource(index)}
                >
                  Remove Resource
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Editor Settings ── */}
      <section className="project-type-editor-section">
        <div className="project-type-editor-section-header">
          <h2 className="project-type-editor-section-title">Editor Settings</h2>
        </div>

        <div className="project-type-editor-stack">
          <p className="project-type-editor-subsection-title">Heading Styles</p>
          <p className="project-type-editor-helper-text">
            Custom styles applied to each heading level in the editor.
          </p>

          {HEADING_LEVELS.map((level) => {
            const heading = definition.editorConfig?.headings?.[level];
            return (
              <div
                key={level}
                className="project-type-editor-card project-type-editor-stack"
              >
                <p className="project-type-editor-subsection-title">
                  {level.toUpperCase()}
                </p>
                <div className="project-type-editor-form-grid project-type-editor-form-grid--headings-row">
                  <LabeledInput
                    label="Font Family"
                    value={heading?.fontFamily ?? ""}
                    placeholder="Georgia, serif"
                    onChange={(value) =>
                      patchHeading(level, { fontFamily: value || undefined })
                    }
                  />
                  <LabeledNumberInput
                    label="Size (px)"
                    value={
                      heading?.fontSize
                        ? heading.fontSize.replace("px", "")
                        : ""
                    }
                    placeholder="24"
                    onChange={(value) => {
                      const n = parseInt(value, 10);
                      patchHeading(level, {
                        fontSize: isNaN(n) ? undefined : `${n}px`,
                      });
                    }}
                  />
                  <label className="project-type-editor-field">
                    <span className="project-type-editor-field-label">
                      Weight
                    </span>
                    <select
                      value={heading?.fontWeight ?? ""}
                      onChange={(e) =>
                        patchHeading(level, {
                          fontWeight: e.target.value || undefined,
                        })
                      }
                      className="project-type-editor-field-control"
                    >
                      <option value="">—</option>
                      {FONT_WEIGHT_OPTIONS.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                  <LabeledInput
                    label="Letter Spacing"
                    value={heading?.letterSpacing ?? ""}
                    placeholder="0.05em"
                    onChange={(value) =>
                      patchHeading(level, { letterSpacing: value || undefined })
                    }
                  />
                  <LabeledColorInput
                    label="Color"
                    value={heading?.color ?? ""}
                    onChange={(value) =>
                      patchHeading(level, { color: value || undefined })
                    }
                  />
                </div>
              </div>
            );
          })}

          <p className="project-type-editor-subsection-title">Body</p>
          <div className="project-type-editor-card">
            <div className="project-type-editor-form-grid project-type-editor-form-grid--four-column">
              <LabeledInput
                label="Font Family"
                value={definition.editorConfig?.body?.fontFamily ?? ""}
                placeholder="IBM Plex Serif"
                onChange={(value) =>
                  patchBody({ fontFamily: value || undefined })
                }
              />
              <LabeledNumberInput
                label="Size (px)"
                value={
                  definition.editorConfig?.body?.fontSize
                    ? definition.editorConfig.body.fontSize.replace("px", "")
                    : ""
                }
                placeholder="15"
                onChange={(value) => {
                  const n = parseInt(value, 10);
                  patchBody({ fontSize: isNaN(n) ? undefined : `${n}px` });
                }}
              />
              <LabeledInput
                label="Line Height"
                value={definition.editorConfig?.body?.lineHeight ?? ""}
                placeholder="1.8"
                onChange={(value) =>
                  patchBody({ lineHeight: value || undefined })
                }
              />
              <LabeledInput
                label="Paragraph Spacing"
                value={definition.editorConfig?.body?.paragraphSpacing ?? ""}
                placeholder="1em"
                onChange={(value) =>
                  patchBody({ paragraphSpacing: value || undefined })
                }
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
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
      <Input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
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
      <Textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="project-type-editor-field-control"
      />
    </label>
  );
}

interface LabeledSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
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
        onChange={(e) => onChange(e.target.value)}
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

interface LabeledColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function LabeledColorInput({
  label,
  value,
  onChange,
}: LabeledColorInputProps): JSX.Element {
  return (
    <label className="project-type-editor-field">
      <span className="project-type-editor-field-label">{label}</span>
      <div className="project-type-editor-color-row">
        <input
          type="color"
          value={
            value ||
            "#000000" /* GW-HEX-EXEMPT: color picker placeholder — user-selected arbitrary colors */
          }
          onChange={(e) => onChange(e.target.value)}
          className="project-type-editor-color-input"
        />
        <span className="project-type-editor-color-value">{value || ""}</span>
      </div>
    </label>
  );
}
