import React from "react";
import NotesInput from "./controls/NotesInput";
import StatusSelector from "./controls/StatusSelector";
import MultiSelectList from "./controls/MultiSelectList";
import POVAutocomplete from "./controls/POVAutocomplete";
import useAppSelector from "../../src/store/hooks";
import { shallowEqual } from "react-redux";
import { selectResource } from "../../src/store/resourcesSlice";

export interface MetadataSidebarProps {
    onChangeNotes?: (text: string) => void;
    onChangeStatus?: (status: string) => void;
    onChangeCharacters?: (chars: string[]) => void;
    onChangeLocations?: (locs: string[]) => void;
    onChangeItems?: (items: string[]) => void;
    onChangePOV?: (pov: string) => void;
    className?: string;
}

export default function MetadataSidebar({
    onChangeNotes,
    onChangeStatus,
    onChangeCharacters,
    onChangeLocations,
    onChangeItems,
    onChangePOV,
    className = "",
}: MetadataSidebarProps): JSX.Element {
    const selectedResource = useAppSelector((state) =>
        selectResource(state.resources),
    );
    // get the character folder id from the project folders
    const characterList = useAppSelector((state) => {
        if (state.projects.selectedProjectId === null) return null;

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

    const locationList = useAppSelector((state) => {
        if (state.projects.selectedProjectId === null) return null;
        const locationFolderId = state.projects.projects[
            state.projects.selectedProjectId
        ].folders?.find((f) => f.name?.toLowerCase() === "locations")?.id;
        return state.resources.resources.reduce((acc: string[], r) => {
            if (r.folderId === locationFolderId && r.name) {
                acc.push(r.name);
            }
            return acc;
        }, []);
    });

    const itemList = useAppSelector((state) => {
        if (state.projects.selectedProjectId === null) return null;
        const itemFolderId = state.projects.projects[
            state.projects.selectedProjectId
        ].folders?.find((f) => f.name?.toLowerCase() === "items")?.id;
        return state.resources.resources.reduce((acc: string[], r) => {
            if (r.folderId === itemFolderId && r.name) {
                acc.push(r.name);
            }
            return acc;
        }, []);
    });
    const [notes, setNotes] = React.useState<string>(
        (selectedResource?.metadata?.notes as any) ?? "",
    );
    const [status, setStatus] = React.useState<string>(
        (selectedResource?.metadata?.status as any) ?? "draft",
    );
    const [characters, setCharacters] = React.useState<string[]>(
        (selectedResource?.metadata?.characters as any) ?? [],
    );
    const [locations, setLocations] = React.useState<string[]>(
        (selectedResource?.metadata?.locations as any) ?? [],
    );
    const [items, setItems] = React.useState<string[]>(
        (selectedResource?.metadata?.items as any) ?? [],
    );
    const [pov, setPOV] = React.useState<string | null>(
        (selectedResource?.metadata?.pov as any) ?? null,
    );

    React.useEffect(() => {
        setNotes((selectedResource?.metadata?.notes as any) ?? "");
        setStatus((selectedResource?.metadata?.status as any) ?? "draft");
        setCharacters((selectedResource?.metadata?.characters as any) ?? []);
        setLocations((selectedResource?.metadata?.locations as any) ?? []);
        setItems((selectedResource?.metadata?.items as any) ?? []);
        setPOV((selectedResource?.metadata?.pov as any) ?? null);
    }, [selectedResource]);

    // Fallback sample lists when metadata arrays are empty
    const sampleCharacters = characters.length ? characters : ["Alice", "Bob"];

    return (
        <aside
            className={`metadata-sidebar-root ${className}`}
            aria-label="metadata-sidebar"
        >
            {selectedResource?.type === "text" ? (
                <React.Fragment>
                    <div className="mb-4">
                        <h3 className="metadata-sidebar-title">
                            {selectedResource.name}
                        </h3>
                    </div>
                    <div className="mb-6">
                        <h4 className="metadata-sidebar-section-heading">
                            Notes
                        </h4>
                        <NotesInput
                            ariaLabel="notes"
                            value={notes}
                            onChange={(v) => {
                                setNotes(v);
                                onChangeNotes && onChangeNotes(v);
                            }}
                        />
                    </div>

                    <div className="mb-6">
                        <h4 className="metadata-sidebar-section-heading">
                            Status
                        </h4>
                        <StatusSelector
                            ariaLabel="status"
                            value={status}
                            onChange={(s) => {
                                const updated = {
                                    ...selectedResource,
                                    metadata: {
                                        ...selectedResource?.metadata,
                                        status: s,
                                    },
                                };
                                setStatus(s);
                                onChangeStatus && onChangeStatus(s);
                            }}
                        />
                    </div>
                    <div className="mb-6">
                        <h4 className="metadata-sidebar-section-heading">
                            Characters
                        </h4>
                        <MultiSelectList
                            label="Characters"
                            items={characterList || []}
                            selected={characters}
                            onChange={(next) => {
                                setCharacters(next);
                                onChangeCharacters && onChangeCharacters(next);
                            }}
                        />
                    </div>

                    <div className="mb-6">
                        <h4 className="metadata-sidebar-section-heading">
                            Locations
                        </h4>
                        <MultiSelectList
                            label="Locations"
                            items={locationList || []}
                            selected={locations}
                            onChange={(next) => {
                                setLocations(next);
                                onChangeLocations && onChangeLocations(next);
                            }}
                        />
                    </div>
                    <div className="mb-6">
                        <h4 className="metadata-sidebar-section-heading">
                            Items
                        </h4>
                        <MultiSelectList
                            label="Items"
                            items={itemList || []}
                            selected={items}
                            onChange={(next) => {
                                setItems(next);
                                onChangeItems && onChangeItems(next);
                            }}
                        />
                    </div>
                    <div>
                        <h4 className="metadata-sidebar-section-heading">
                            POV
                        </h4>
                        <POVAutocomplete
                            options={characterList || []}
                            value={pov ?? ""}
                            onChange={(v) => {
                                setPOV(v);
                                onChangePOV && onChangePOV(v);
                            }}
                        />
                    </div>
                </React.Fragment>
            ) : (
                <div className="metadata-sidebar-empty">
                    <h4 className="metadata-sidebar-section-heading">
                        Select a text resource to view and edit its metadata.
                    </h4>
                </div>
            )}
        </aside>
    );
}
