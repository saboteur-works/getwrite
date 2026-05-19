import React from "react";
import SynopsisInput from "./controls/SynopsisInput";
import NotesInput from "./controls/NotesInput";
import StatusSelector from "./controls/StatusSelector";
import POVAutocomplete from "./controls/POVAutocomplete";
import DateTimeInput from "./controls/DateTimeInput";
import DurationInput from "./controls/DurationInput";
import EndDateInput from "./controls/EndDateInput";
import NumberInput from "./controls/NumberInput";
import BooleanToggle from "./controls/BooleanToggle";
import SelectInput from "./controls/SelectInput";
import ResourceRefInput, { type ResourceOption } from "./controls/ResourceRefInput";
import MultiResourceRefInput from "./controls/MultiResourceRefInput";
import { filterResourceOptionsByScope } from "./folderScope";
import LabeledField from "./controls/LabeledField";
import useSyncedControlledValue from "./controls/useSyncedControlledValue";
import TagsSection from "./TagsSection";
import SidebarSection from "./SidebarSection";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { shallowEqual } from "react-redux";
import { createSelector } from "@reduxjs/toolkit";
import { selectResource } from "../../src/store/resourcesSlice";
import {
    selectActiveProjectStatuses,
    selectActiveProjectMetadataSchema,
    selectSelectedProjectId,
    addMetadataField,
} from "../../src/store/projectsSlice";
import type {
    Folder,
    MetadataField,
    MetadataValue,
    ResourceRef,
} from "../../src/lib/models/types";

const EMPTY_REF_OPTIONS: ResourceOption[] = [];

/**
 * Validates raw sidecar JSON as a ResourceRef array at the system boundary.
 * Filters out any element missing a string `name` — old or malformed sidecar
 * data can produce such elements, and components assume `name` is always defined.
 */
function toResourceRefArray(raw: unknown): ResourceRef[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
        (r): r is ResourceRef =>
            r !== null &&
            typeof r === "object" &&
            typeof (r as { name?: unknown }).name === "string",
    );
}

const selectAllResourceOptions = createSelector(
    (state: any) => state.resources.resources as { id: string; name: string }[],
    (resources): ResourceOption[] => {
        if (!resources?.length) return EMPTY_REF_OPTIONS;
        return resources.reduce((acc: ResourceOption[], r) => {
            if (r.name) acc.push({ id: r.id, name: r.name });
            return acc;
        }, []);
    },
);

type RawResource = { id: string; name: string; folderId?: string | null };
const EMPTY_RAW_RESOURCES: RawResource[] = [];
const EMPTY_FOLDERS: Folder[] = [];

const selectRawResourcesList = createSelector(
    (state: any) => state.resources.resources as RawResource[],
    (resources): RawResource[] => resources ?? EMPTY_RAW_RESOURCES,
);

const selectFoldersList = createSelector(
    (state: any) => state.resources.folders as Folder[],
    (folders): Folder[] => folders ?? EMPTY_FOLDERS,
);

export interface MetadataSidebarProps {
    onChangeField?: (key: string, value: MetadataValue) => void;
    className?: string;
}

function GenericTextInput({
    label,
    ariaLabel,
    value,
    onChange,
    className = "",
}: {
    label: string;
    ariaLabel: string;
    value: string;
    onChange: (v: string) => void;
    className?: string;
}): JSX.Element {
    const [text, setText] = useSyncedControlledValue(value, onChange);
    return (
        <LabeledField label={label} className={className}>
            <input
                type="text"
                aria-label={ariaLabel}
                className="w-full mt-2 p-2 border border-gw-border rounded text-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
        </LabeledField>
    );
}

export default function MetadataSidebar({
    onChangeField,
    className = "",
}: MetadataSidebarProps): JSX.Element {
    const dispatch = useAppDispatch();
    const schema = useAppSelector(selectActiveProjectMetadataSchema);
    const selectedProjectId = useAppSelector(selectSelectedProjectId);

    const selectedResource = useAppSelector((state) =>
        selectResource(state.resources),
    );

    const projectStatuses = useAppSelector(
        (state) => selectActiveProjectStatuses(state),
        shallowEqual,
    );

    const [pendingFocusKey, setPendingFocusKey] = React.useState<string | null>(null);
    const sidebarRef = React.useRef<HTMLElement | null>(null);

    React.useEffect(() => {
        if (!pendingFocusKey || !sidebarRef.current) return;
        const input = sidebarRef.current.querySelector<HTMLInputElement>(
            `input[aria-label="${pendingFocusKey}"]`,
        );
        if (input) {
            input.scrollIntoView({ behavior: "smooth", block: "nearest" });
            input.focus();
            setPendingFocusKey(null);
        }
    }, [schema, pendingFocusKey]);

    async function handleAddField(): Promise<void> {
        if (!selectedProjectId) return;
        const firstGroup = schema.groups[0];
        if (!firstGroup) return;
        const key = `field-${Date.now()}`;
        setPendingFocusKey(key);
        const result = await dispatch(
            addMetadataField({
                projectId: selectedProjectId,
                groupId: firstGroup.id,
                field: { key, label: "New Field", type: "text" },
            }),
        );
        if (addMetadataField.rejected.match(result)) {
            setPendingFocusKey(null);
        }
    }

    const allResourceOptions = useAppSelector(selectAllResourceOptions, shallowEqual);
    const rawResources = useAppSelector(selectRawResourcesList, shallowEqual);
    const folders = useAppSelector(selectFoldersList, shallowEqual);

    const storyDate = selectedResource?.userMetadata?.storyDate as string | undefined;
    const storyDuration = selectedResource?.userMetadata?.storyDuration as
        | number
        | null
        | undefined;

    const computedEndDate = React.useMemo(() => {
        if (!storyDate || storyDuration == null) return undefined;
        return new Date(
            Date.parse(storyDate) + storyDuration * 60000,
        ).toISOString();
    }, [storyDate, storyDuration]);

    const emit = (key: string, value: MetadataValue): void => {
        onChangeField?.(key, value);
    };

    const renderField = (field: MetadataField): JSX.Element | null => {
        const rawValue = selectedResource?.userMetadata?.[field.key];
        const { key, label, type, options, multiple } = field;

        // Built-in locked fields use their specialized controls
        switch (key) {
            case "synopsis":
                return (
                    <SynopsisInput
                        ariaLabel="synopsis"
                        value={(rawValue as string) ?? ""}
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "notes":
                return (
                    <NotesInput
                        ariaLabel="notes"
                        value={(rawValue as string) ?? ""}
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "status":
                return (
                    <StatusSelector
                        ariaLabel="status"
                        className="text-brand-mid"
                        value={(rawValue as string) ?? ""}
                        options={
                            projectStatuses.length > 0
                                ? projectStatuses
                                : undefined
                        }
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "pov":
                return (
                    <POVAutocomplete
                        className="text-brand-mid"
                        resourceOptions={allResourceOptions}
                        value={(rawValue as string | ResourceRef) ?? undefined}
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "storyDate":
                return (
                    <DateTimeInput
                        className="text-brand-mid"
                        value={(rawValue as string) ?? ""}
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "storyDuration":
                return (
                    <DurationInput
                        className="text-brand-mid"
                        value={(rawValue as number | null) ?? null}
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "storyEndDate":
                return (
                    <EndDateInput
                        className="text-brand-mid"
                        computedEndDate={computedEndDate}
                        overrideValue={(rawValue as string) ?? undefined}
                        onChange={(v) => emit(key, v)}
                    />
                );
        }

        // Generic controls by field type
        switch (type) {
            case "text":
                return (
                    <GenericTextInput
                        label={label}
                        ariaLabel={key}
                        value={(rawValue as string) ?? ""}
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "number":
                return (
                    <NumberInput
                        label={label}
                        ariaLabel={key}
                        value={(rawValue as number) ?? undefined}
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "date":
                return (
                    <DateTimeInput
                        className="text-brand-mid"
                        value={(rawValue as string) ?? ""}
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "boolean":
                return (
                    <BooleanToggle
                        label={label}
                        ariaLabel={key}
                        value={(rawValue as boolean) ?? false}
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "select":
                return (
                    <SelectInput
                        label={label}
                        ariaLabel={key}
                        options={options ?? []}
                        value={(rawValue as string) ?? ""}
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "multiselect":
                return (
                    <SelectInput
                        label={label}
                        ariaLabel={key}
                        options={options ?? []}
                        value={(rawValue as string[]) ?? []}
                        multiple
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "resource-ref":
                return (
                    <ResourceRefInput
                        label={label}
                        ariaLabel={key}
                        value={
                            (rawValue as ResourceRef | ResourceRef[] | null) ??
                            null
                        }
                        resourceOptions={allResourceOptions}
                        className="text-brand-mid"
                        multiple={multiple}
                        onChange={(v) => emit(key, v)}
                    />
                );
            case "multi-resource-ref":
                return (
                    <MultiResourceRefInput
                        label={label}
                        resourceOptions={filterResourceOptionsByScope(
                            rawResources,
                            folders,
                            field.refFolder,
                            field.includeSubfolders,
                        )}
                        value={toResourceRefArray(rawValue)}
                        maxSelections={field.maxSelections}
                        className="text-brand-mid"
                        onChange={(v) => emit(key, v)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <aside
            ref={sidebarRef}
            className={`metadata-sidebar-root flex flex-col h-full overflow-hidden ${className}`}
            aria-label="metadata-sidebar"
        >
            {selectedResource?.type === "text" ? (
                <React.Fragment>
                    <div className="flex-shrink-0 mb-4">
                        <h3 className="metadata-sidebar-title text-gw-secondary-light font-bold">
                            {selectedResource.name}
                        </h3>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {schema.groups.map((group) => {
                            if (
                                group.folderId &&
                                selectedResource.folderId !== group.folderId
                            ) {
                                return null;
                            }
                            return (
                                <SidebarSection key={group.id} label={group.label}>
                                    {group.fields.map((field) => (
                                        <React.Fragment key={field.key}>
                                            {renderField(field)}
                                        </React.Fragment>
                                    ))}
                                </SidebarSection>
                            );
                        })}
                        <SidebarSection label="Tags">
                            <TagsSection />
                        </SidebarSection>
                    </div>
                    <div className="flex-shrink-0 mt-2 pt-3 border-t border-gw-border">
                        <button
                            type="button"
                            onClick={() => { void handleAddField(); }}
                            disabled={!selectedProjectId || schema.groups.length === 0}
                            className="flex w-full items-center gap-1.5 py-1 text-[11px] font-mono uppercase tracking-[0.12em] text-gw-secondary hover:text-gw-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="add-metadata-field"
                        >
                            + Add field
                        </button>
                    </div>
                </React.Fragment>
            ) : (
                <div className="metadata-sidebar-empty">
                    <h4 className="text-gw-secondary">
                        Select a text resource to view and edit its metadata.
                    </h4>
                </div>
            )}
        </aside>
    );
}
