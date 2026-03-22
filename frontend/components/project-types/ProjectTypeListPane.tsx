"use client";

/**
 * @module project-types/ProjectTypeListPane
 *
 * Sidebar list navigation pane for the project type manager.
 *
 * Renders the ordered list of available project type items and exposes
 * selection and creation triggers.  This component is purely presentational:
 * it holds no draft state and performs no validation.
 */

import React from "react";
import type { ProjectTypeListItem } from "./ProjectTypeDraftService";

/**
 * Props accepted by {@link ProjectTypeListPane}.
 */
export interface ProjectTypeListPaneProps {
    /** Ordered list of project type items to display. */
    items: ProjectTypeListItem[];
    /** Key of the currently selected item. */
    selectedKey: string;
    /** Called when the user selects an item from the list. */
    onSelectKey: (key: string) => void;
    /** Called when the user requests a new project type draft. */
    onCreateProjectType: () => void;
}

/**
 * Left-sidebar list pane showing project type items with selection and
 * creation controls.
 *
 * @param props - Component properties.
 * @returns List pane UI.
 */
export default function ProjectTypeListPane({
    items,
    selectedKey,
    onSelectKey,
    onCreateProjectType,
}: ProjectTypeListPaneProps): JSX.Element {
    return (
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
                                onClick={() => onSelectKey(item.key)}
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
            <div className="border-t border-slate-200 px-4 py-2">
                <button
                    type="button"
                    onClick={onCreateProjectType}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                    New Project Type
                </button>
            </div>
        </aside>
    );
}
