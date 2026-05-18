import React from "react";
import SynopsisInput from "./controls/SynopsisInput";
import NotesInput from "./controls/NotesInput";
import StatusSelector from "./controls/StatusSelector";
import POVAutocomplete, { type POVResourceOption } from "./controls/POVAutocomplete";
import DateTimeInput from "./controls/DateTimeInput";
import DurationInput from "./controls/DurationInput";
import EndDateInput from "./controls/EndDateInput";
import NumberInput from "./controls/NumberInput";
import BooleanToggle from "./controls/BooleanToggle";
import SelectInput from "./controls/SelectInput";
import ResourceRefInput from "./controls/ResourceRefInput";
import LabeledField from "./controls/LabeledField";
import useSyncedControlledValue from "./controls/useSyncedControlledValue";
import TagsSection from "./TagsSection";
import SidebarSection from "./SidebarSection";
import useAppSelector from "../../src/store/hooks";
import { shallowEqual } from "react-redux";
import { selectResource } from "../../src/store/resourcesSlice";
import {
    selectActiveProjectStatuses,
    selectActiveProjectMetadataSchema,
} from "../../src/store/projectsSlice";
import type {
    MetadataField,
    MetadataValue,
    ResourceRef,
} from "../../src/lib/models/types";

const EMPTY_RESOURCE_OPTIONS: POVResourceOption[] = [];

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
    const schema = useAppSelector(selectActiveProjectMetadataSchema);

    const selectedResource = useAppSelector((state) =>
        selectResource(state.resources),
    );

    const projectStatuses = useAppSelector(
        (state) => selectActiveProjectStatuses(state),
        shallowEqual,
    );

    const characterList = useAppSelector((state): POVResourceOption[] => {
        if (state.projects.selectedProjectId === null) return EMPTY_RESOURCE_OPTIONS;

        const characterFolderId = state.projects.projects[
            state.projects.selectedProjectId
        ]?.folders?.find((f) => f.name?.toLowerCase() === "characters")?.id;

        return state.resources.resources.reduce((acc: POVResourceOption[], r) => {
            if (r.folderId === characterFolderId && r.name) {
                acc.push({ id: r.id, name: r.name });
            }
            return acc;
        }, []);
    }, shallowEqual);

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
                        resourceOptions={characterList}
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
                        className="text-brand-mid"
                        multiple={multiple}
                        onChange={(v) => emit(key, v)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <aside
            className={`metadata-sidebar-root ${className}`}
            aria-label="metadata-sidebar"
        >
            {selectedResource?.type === "text" ? (
                <React.Fragment>
                    <div className="mb-4">
                        <h3 className="metadata-sidebar-title text-gw-secondary-light font-bold">
                            {selectedResource.name}
                        </h3>
                    </div>
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
