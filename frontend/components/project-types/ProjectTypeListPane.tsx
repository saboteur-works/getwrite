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
        <aside className="project-type-list-pane">
            <div className="project-type-list-pane-header">Templates</div>
            <ul className="project-type-list-pane-items">
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
                                className={`project-type-list-pane-item ${
                                    isSelected
                                        ? "project-type-list-pane-item--selected"
                                        : "project-type-list-pane-item--idle"
                                }`}
                            >
                                <span className="project-type-list-pane-item-title">
                                    {title}
                                </span>
                                <span className="project-type-list-pane-item-meta">
                                    {item.fileName ?? "new draft"}
                                </span>
                                {item.hasChanges ? (
                                    <span className="project-type-list-pane-item-dirty">
                                        Unsaved changes
                                    </span>
                                ) : null}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="project-type-list-pane-footer">
                <button
                    type="button"
                    onClick={onCreateProjectType}
                    className="project-type-list-pane-create-button"
                >
                    New Project Type
                </button>
            </div>
        </aside>
    );
}
