import React from "react";
import type { AnyResource } from "../../src/lib/models/types";
import NotesInput from "./controls/NotesInput";
import StatusSelector from "./controls/StatusSelector";
import MultiSelectList from "./controls/MultiSelectList";
import POVAutocomplete from "./controls/POVAutocomplete";
import useAppSelector from "../../src/store/hooks";

export interface MetadataSidebarProps {
    resource?: AnyResource;
    onChangeNotes?: (text: string) => void;
    onChangeStatus?: (status: string) => void;
    onChangeCharacters?: (chars: string[]) => void;
    onChangeLocations?: (locs: string[]) => void;
    onChangeItems?: (items: string[]) => void;
    onChangePOV?: (pov: string) => void;
    className?: string;
}

export default function MetadataSidebar({
    resource,
    onChangeNotes,
    onChangeStatus,
    onChangeCharacters,
    onChangeLocations,
    onChangeItems,
    onChangePOV,
    className = "",
}: MetadataSidebarProps): JSX.Element {
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
    });

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
        (resource?.metadata?.notes as any) ?? "",
    );
    const [status, setStatus] = React.useState<string>(
        (resource?.metadata?.status as any) ?? "draft",
    );
    const [characters, setCharacters] = React.useState<string[]>(
        (resource?.metadata?.characters as any) ?? [],
    );
    const [locations, setLocations] = React.useState<string[]>(
        (resource?.metadata?.locations as any) ?? [],
    );
    const [items, setItems] = React.useState<string[]>(
        (resource?.metadata?.items as any) ?? [],
    );
    const [pov, setPOV] = React.useState<string | null>(
        (resource?.metadata?.pov as any) ?? null,
    );

    React.useEffect(() => {
        setNotes((resource?.metadata?.notes as any) ?? "");
        setStatus((resource?.metadata?.status as any) ?? "draft");
        setCharacters((resource?.metadata?.characters as any) ?? []);
        setLocations((resource?.metadata?.locations as any) ?? []);
        setItems((resource?.metadata?.items as any) ?? []);
        setPOV((resource?.metadata?.pov as any) ?? null);
    }, [resource]);

    // Fallback sample lists when metadata arrays are empty
    const sampleCharacters = characters.length ? characters : ["Alice", "Bob"];

    return (
        <aside
            className={`p-4 bg-white ${className}`}
            aria-label="metadata-sidebar"
        >
            <div className="mb-6">
                <h4 className="text-xs font-semibold text-slate-600 mb-2">
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
                <h4 className="text-xs font-semibold text-slate-600 mb-2">
                    Status
                </h4>
                <StatusSelector
                    ariaLabel="status"
                    value={status}
                    onChange={(s) => {
                        const updated = {
                            ...resource,
                            metadata: {
                                ...resource?.metadata,
                                status: s,
                            },
                        };
                        setStatus(s);
                        onChangeStatus && onChangeStatus(s);
                    }}
                />
            </div>

            {resource?.type === "text" && (
                <React.Fragment>
                    <div className="mb-6">
                        <h4 className="text-xs font-semibold text-slate-600 mb-2">
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
                        <h4 className="text-xs font-semibold text-slate-600 mb-2">
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
                        <h4 className="text-xs font-semibold text-slate-600 mb-2">
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
                        <h4 className="text-xs font-semibold text-slate-600 mb-2">
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
            )}
        </aside>
    );
}
