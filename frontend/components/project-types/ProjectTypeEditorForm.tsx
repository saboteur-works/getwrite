"use client";

/**
 * @module project-types/ProjectTypeEditorForm
 *
 * Editor form for a single project type definition.
 *
 * This component is intentionally presentation-focused. It delegates all
 * mutation semantics to callbacks supplied by the parent orchestrator.
 */

import { useId, type ChangeEvent } from "react";
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
import { getLineHeightError } from "../../src/lib/editor-body-settings";
import TypographyFields, {
  type TypographyFieldKey,
} from "../typography/TypographyFields";

const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

const HEADING_FIELDS: readonly TypographyFieldKey[] = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "letterSpacing",
  "color",
];
const BODY_FIELDS: readonly TypographyFieldKey[] = [
  "fontFamily",
  "fontSize",
  "lineHeight",
  "paragraphSpacing",
];

type HeadingFieldKey =
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "letterSpacing"
  | "color";
type BodyFieldKey =
  | "fontFamily"
  | "fontSize"
  | "lineHeight"
  | "paragraphSpacing";

function isHeadingField(key: TypographyFieldKey): key is HeadingFieldKey {
  return (HEADING_FIELDS as readonly string[]).includes(key);
}

function isBodyField(key: TypographyFieldKey): key is BodyFieldKey {
  return (BODY_FIELDS as readonly string[]).includes(key);
}

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
  /** Makes the ID field read-only (a saved type's id is fixed; so is a built-in's). */
  idReadOnly?: boolean;
  /** Refusal message shown next to the ID field as an alert. */
  idError?: string;
  /** Refusal message shown next to the Name field as an alert. */
  nameError?: string;
  /**
   * Schema refusals keyed by path joined with "." (`name`, `statuses.1`,
   * `folders.0.name`, `defaultFolders.0.name`, `defaultFolders.0.folder`,
   * `defaultResources.0.name`; see `isFormFieldKey`). Each message is shown
   * as an alert beside its input. Other keys are ignored here: the manager
   * lists them in the action bar.
   */
  fieldErrors?: Record<string, string>;
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
  idReadOnly = false,
  idError,
  nameError,
  fieldErrors,
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

  const handleBodyLineHeightRefusal = (
    event: ChangeEvent<HTMLElement>,
  ): void => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.id === "type-body-lineHeight" &&
      getLineHeightError(target.value)
    ) {
      patchBody({ lineHeight: target.value });
    }
  };

  return (
    <div className="project-type-editor-form">
      {/* ── Identity ── */}
      <div className="project-type-editor-form-grid project-type-editor-form-grid--three-column">
        <LabeledInput
          label="ID"
          value={definition.id}
          placeholder="novel"
          readOnly={idReadOnly}
          error={idError}
          errorIsAlert
          onChange={(value) => patchDefinition({ id: value })}
        />
        <LabeledInput
          label="Name"
          value={definition.name}
          placeholder="Novel"
          error={nameError ?? fieldErrors?.name}
          errorIsAlert
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
                  error={fieldErrors?.[`statuses.${index}`]}
                  errorIsAlert
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
              key={index}
              className="project-type-editor-card project-type-editor-stack"
            >
              <div className="project-type-editor-form-grid project-type-editor-form-grid--folder-row">
                <LabeledInput
                  label="Folder Name"
                  value={folder.name}
                  placeholder="Workspace"
                  error={fieldErrors?.[`folders.${index}.name`]}
                  errorIsAlert
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

              <MetadataSourceRow
                isMetadataSource={Boolean(
                  folder.metadataSource?.isMetadataSource,
                )}
                metadataInputType={folder.metadataSource?.metadataInputType}
                onIsMetadataSourceChange={(checked) =>
                  patchFolder(index, {
                    metadataSource: {
                      isMetadataSource: checked,
                      metadataInputType:
                        folder.metadataSource?.metadataInputType,
                    },
                  })
                }
                onMetadataInputTypeChange={(value) =>
                  patchFolder(index, {
                    metadataSource: {
                      isMetadataSource: true,
                      metadataInputType: value,
                    },
                  })
                }
              />
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
              key={index}
              className="project-type-editor-card project-type-editor-stack"
            >
              <div className="project-type-editor-form-grid project-type-editor-form-grid--two-column">
                <LabeledInput
                  label="Name"
                  value={df.name}
                  placeholder="Chapter 1"
                  error={fieldErrors?.[`defaultFolders.${index}.name`]}
                  errorIsAlert
                  onChange={(value) =>
                    patchDefaultFolder(index, { name: value })
                  }
                />
                <LabeledInput
                  label="Parent Folder"
                  value={df.folder}
                  placeholder="Workspace"
                  error={fieldErrors?.[`defaultFolders.${index}.folder`]}
                  errorIsAlert
                  onChange={(value) =>
                    patchDefaultFolder(index, { folder: value })
                  }
                />
              </div>

              <MetadataSourceRow
                isMetadataSource={Boolean(df.metadataSource?.isMetadataSource)}
                metadataInputType={df.metadataSource?.metadataInputType}
                onIsMetadataSourceChange={(checked) =>
                  patchDefaultFolder(index, {
                    metadataSource: {
                      isMetadataSource: checked,
                      metadataInputType: df.metadataSource?.metadataInputType,
                    },
                  })
                }
                onMetadataInputTypeChange={(value) =>
                  patchDefaultFolder(index, {
                    metadataSource: {
                      isMetadataSource: true,
                      metadataInputType: value,
                    },
                  })
                }
              />

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
              key={index}
              className="project-type-editor-card project-type-editor-stack"
            >
              <div className="project-type-editor-form-grid project-type-editor-form-grid--three-column">
                <LabeledInput
                  label="Name"
                  value={resource.name}
                  placeholder="Manuscript Start"
                  error={fieldErrors?.[`defaultResources.${index}.name`]}
                  errorIsAlert
                  onChange={(value) => patchResource(index, { name: value })}
                />
                <LabeledInput
                  label="Folder"
                  value={resource.folder ?? ""}
                  placeholder="Workspace"
                  helper="Leave empty to use the first folder."
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
                <TypographyFields
                  className="project-type-editor-form-grid project-type-editor-form-grid--headings-row"
                  label={level.toUpperCase()}
                  idPrefix={`type-${level}`}
                  fields={HEADING_FIELDS}
                  values={heading ?? {}}
                  allowOther
                  onChange={(key, value) => {
                    if (isHeadingField(key)) {
                      patchHeading(level, { [key]: value || undefined });
                    }
                  }}
                />
              </div>
            );
          })}

          <p className="project-type-editor-subsection-title">Body</p>
          <div className="project-type-editor-card">
            {/* TypographyFields keeps a refused line height to itself and never
                reports it, so the draft would still hold the last accepted
                value and Save would store that instead of the typed text. The
                bubbled change event is how this form sees the refused text:
                it puts it in the draft, where validateDraft refuses Save. */}
            <div onChange={handleBodyLineHeightRefusal}>
              <TypographyFields
                className="project-type-editor-form-grid project-type-editor-form-grid--four-column"
                label="Body"
                idPrefix="type-body"
                fields={BODY_FIELDS}
                values={definition.editorConfig?.body ?? {}}
                allowOther
                onChange={(key, value) => {
                  if (isBodyField(key)) {
                    patchBody({ [key]: value || undefined });
                  }
                }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MetadataSourceRowProps {
  isMetadataSource: boolean;
  metadataInputType: MetadataInputType | undefined;
  onIsMetadataSourceChange: (checked: boolean) => void;
  onMetadataInputTypeChange: (value: MetadataInputType) => void;
}

function MetadataSourceRow({
  isMetadataSource,
  metadataInputType,
  onIsMetadataSourceChange,
  onMetadataInputTypeChange,
}: MetadataSourceRowProps): JSX.Element {
  return (
    <div className="project-type-editor-form-grid project-type-editor-form-grid--two-column">
      <div className="project-type-editor-row-end">
        <label className="project-type-editor-checkbox-label">
          <input
            type="checkbox"
            checked={isMetadataSource}
            onChange={(e) => onIsMetadataSourceChange(e.target.checked)}
            className="project-type-editor-checkbox"
          />
          Metadata Source
        </label>
      </div>
      {isMetadataSource ? (
        <LabeledSelect
          label="Input Type"
          value={metadataInputType ?? "text"}
          options={[...METADATA_INPUT_TYPES]}
          onChange={(value) =>
            onMetadataInputTypeChange(value as MetadataInputType)
          }
        />
      ) : null}
    </div>
  );
}

interface LabeledInputProps {
  label: string;
  value: string;
  placeholder?: string;
  /** Refusal message; when set it is linked to the input and flagged invalid. */
  error?: string;
  /** Announces `error` as an alert (a refusal) rather than quiet field help. */
  errorIsAlert?: boolean;
  /** Quiet help under the input, linked to it by `aria-describedby`. */
  helper?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

function LabeledInput({
  label,
  value,
  placeholder,
  error,
  errorIsAlert = false,
  helper,
  readOnly,
  onChange,
}: LabeledInputProps): JSX.Element {
  const errorId = useId();
  const helperId = useId();
  const describedBy =
    [error ? errorId : null, helper ? helperId : null]
      .filter((id): id is string => id !== null)
      .join(" ") || undefined;
  return (
    <div className="project-type-editor-field">
      <label className="project-type-editor-field">
        <span className="project-type-editor-field-label">{label}</span>
        <Input
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className="project-type-editor-field-control"
        />
      </label>
      {helper ? (
        <p id={helperId} className="project-type-editor-helper-text">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role={errorIsAlert ? "alert" : undefined}
          className="text-sm text-gw-secondary"
        >
          {error}
        </p>
      ) : null}
    </div>
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
