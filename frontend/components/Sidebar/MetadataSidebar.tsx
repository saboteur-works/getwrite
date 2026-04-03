import React from "react";
import NotesInput from "./controls/NotesInput";
import StatusSelector from "./controls/StatusSelector";
import MultiSelectList from "./controls/MultiSelectList";
import POVAutocomplete from "./controls/POVAutocomplete";
import useAppSelector from "../../src/store/hooks";
import { shallowEqual, useStore } from "react-redux";
import { selectResource } from "../../src/store/resourcesSlice";
import { Folder } from "../../src/lib/models";
import { RootState } from "../../src/store/store";
import { set } from "lodash";

const EMPTY_LIST: string[] = [];

export interface MetadataSidebarProps {
    onChangeNotes?: (text: string) => void;
    onChangeStatus?: (status: string) => void;
    onChangePOV?: (pov: string) => void;
    onChangeDynamicMetadata?: (metadata: Record<string, string[]>) => void;
    className?: string;
}

export default function MetadataSidebar({
    onChangeNotes,
    onChangeStatus,
    onChangePOV,
    onChangeDynamicMetadata,
    className = "",
}: MetadataSidebarProps): JSX.Element {
    const store = useStore();
    // TODO: Use this selector to determine what special folders exist in the project,
    // and only show character/location/item selectors if those folders exist.
    // This will make the UI more flexible for different project types and avoid
    // confusion when those folders aren't present.
    const metadataSourceFolders = useAppSelector((state) => {
        if (state.projects.selectedProjectId === null) return [];
        return (
            state.resources.folders
                ?.filter((f) => f.metadataSource?.isMetadataSource)
                .map((f) => f) ?? []
        );
    }, shallowEqual);

    const selectedResource = useAppSelector((state) =>
        selectResource(state.resources),
    );

    const characterList = useAppSelector((state) => {
        if (state.projects.selectedProjectId === null) return EMPTY_LIST;

        const characterFolderId = state.projects.projects[
            state.projects.selectedProjectId
        ].folders?.find((f) => f.name?.toLowerCase() === "characters")?.id;

        return state.resources.resources.reduce((acc: string[], r) => {
            if (r.folderId === characterFolderId && r.name) {
                acc.push(r.name);
            }
            return acc;
        }, []);
    }, shallowEqual);

    /**
     * Retrieves the children of a given folder and maps them to a list of strings for use in the multiselect inputs.
     * This is necessary to support dynamic metadata source folders, where the options for the multiselects are based on the resources within those folders.
     * @param folderName
     */
    const getMetadataForFolder = (folderName: string) => {
        const state = store.getState() as RootState;
        const folderId = state.resources.folders?.find(
            (f) => f.name?.toLowerCase() === folderName.toLowerCase(),
        )?.id;
        if (!folderId) return [];
        return state.resources.resources.reduce((acc: string[], r) => {
            if (r.folderId === folderId && r.name) {
                acc.push(r.name);
            }
            return acc;
        }, []);
    };

    const [notes, setNotes] = React.useState<string>(
        (selectedResource?.userMetadata?.notes as any) ?? "",
    );
    const [status, setStatus] = React.useState<string>(
        (selectedResource?.userMetadata?.status as any) ?? "draft",
    );
    const [pov, setPOV] = React.useState<string | null>(
        (selectedResource?.userMetadata?.pov as any) ?? null,
    );

    const [dynamicMetadataSelections, setDynamicMetadataSelections] =
        React.useState({
            // This state will hold the current selections for each metadata source folder, keyed by folder name. This will allow us to support dynamic metadata source folders without hardcoding state for characters/locations/items.
        } as Record<string, string[]>);
    React.useEffect(() => {
        setNotes((selectedResource?.userMetadata?.notes as any) ?? "");
        setStatus((selectedResource?.userMetadata?.status as any) ?? "draft");
        setPOV((selectedResource?.userMetadata?.pov as any) ?? null);
        setDynamicMetadataSelections((prev) => {
            const newSelections: Record<string, string[]> = {};
            metadataSourceFolders.forEach((folder) => {
                const key = folder.slug;
                newSelections[key] =
                    (selectedResource?.userMetadata?.[key] as any) ?? [];
            });
            return {
                ...prev,
                ...newSelections,
            };
        });
    }, [selectedResource]);

    // TODO: Rewrite the above lists to be more dynamic based on what metadataSourceFolders exist in the project,
    // rather than hardcoding characters/locations/items. This will allow for more flexible project types and custom metadata sources.

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
                    <div className="mb-6">
                        <NotesInput
                            ariaLabel="notes"
                            value={notes}
                            className="text-brand-mid"
                            onChange={(v) => {
                                setNotes(v);
                                onChangeNotes && onChangeNotes(v);
                            }}
                        />
                    </div>

                    <div className="mb-6">
                        <StatusSelector
                            ariaLabel="status"
                            className="text-brand-mid"
                            value={status}
                            onChange={(s) => {
                                const updated = {
                                    ...selectedResource,
                                    userMetadata: {
                                        ...selectedResource?.userMetadata,
                                        status: s,
                                    },
                                };
                                setStatus(s);
                                onChangeStatus && onChangeStatus(s);
                            }}
                        />
                    </div>
                    <div>
                        <POVAutocomplete
                            className="text-brand-mid"
                            options={characterList}
                            value={pov ?? ""}
                            onChange={(v) => {
                                setPOV(v);
                                onChangePOV && onChangePOV(v);
                            }}
                        />
                    </div>
                    <div id="sidebar-dynamic-test">
                        {metadataSourceFolders.map((folder) => (
                            <div key={folder.name} className="mb-6">
                                {folder.metadataSource?.metadataInputType ===
                                "multiselect" ? (
                                    <MultiSelectList
                                        label={folder.name}
                                        className="text-brand-mid"
                                        items={(() =>
                                            getMetadataForFolder(
                                                folder.name,
                                            ))()}
                                        selected={
                                            dynamicMetadataSelections[
                                                folder.name
                                            ] ?? []
                                        }
                                        onChange={(next) => {
                                            setDynamicMetadataSelections(
                                                (prev) => ({
                                                    ...prev,
                                                    [folder.name]: next,
                                                }),
                                            );
                                            onChangeDynamicMetadata &&
                                                onChangeDynamicMetadata({
                                                    ...dynamicMetadataSelections,
                                                    [folder.name]: next,
                                                });
                                        }}
                                    />
                                ) : null}
                            </div>
                        ))}
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
