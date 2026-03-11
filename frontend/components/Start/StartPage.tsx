/**
 * @module Start/StartPage
 *
 * Landing page section that lists projects and provides quick actions:
 * - Create project via modal
 * - Open project
 * - Manage project (rename/delete/package placeholder)
 *
 * The component supports both externally supplied project lists (via props)
 * and local optimistic updates for create/rename/delete interactions.
 */
import React, { useEffect, useState } from "react";
import type {
    Project as CanonicalProject,
    AnyResource,
    Folder,
} from "../../src/lib/models/types";
import CreateProjectModal, {
    type CreateProjectPayload,
} from "./CreateProjectModal";
import ManageProjectMenu from "./ManageProjectMenu";

/**
 * Project card data shape displayed on the start page.
 */
export interface StartPageProjectEntry {
    /** Canonical project record (id, name, root path, config, etc.). */
    project: CanonicalProject;
    /** All resources known for the project. */
    resources: AnyResource[];
    /** Folder tree entries for the project. */
    folders: Folder[];
}

/**
 * Payload emitted when a project is created via the modal.
 */
export interface StartPageCreateResult {
    /** Newly created canonical project record. */
    project: CanonicalProject;
    /** Created folder entries for the project scaffold. */
    folders: Folder[];
    /** Created/scaffolded resources for the project scaffold. */
    resources: AnyResource[];
}

/**
 * Props for {@link StartPage}.
 */
export interface StartPageProps {
    /** Optional externally controlled list of projects to render. */
    projects?: StartPageProjectEntry[];
    /** Callback fired after project creation succeeds. */
    onCreate?: (projectFiles: StartPageCreateResult) => void;
    /** Callback fired when user chooses to open a project. */
    onOpen?: (projectId: string) => void;
}

/**
 * Renders the project start page list with create/open/manage actions.
 *
 * State behavior:
 * - Initializes local list from incoming `projects` prop.
 * - Re-syncs local list whenever `projects` prop changes.
 * - Applies local optimistic updates for create/rename/delete interactions.
 *
 * @param props - {@link StartPageProps}.
 * @returns Start page section containing project cards and action controls.
 *
 * @example
 * <StartPage
 *   projects={projects}
 *   onCreate={(created) => console.log(created.project.id)}
 *   onOpen={(projectRootPath) => openProject(projectRootPath)}
 * />
 */
export default function StartPage({
    projects = [],
    onCreate,
    onOpen,
}: StartPageProps): JSX.Element {
    const [localProjects, setLocalProjects] =
        useState<StartPageProjectEntry[]>(projects);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    /**
     * Forwards open action to parent callback when provided.
     *
     * @param id - Project identifier/path used by parent open handler.
     */
    const handleOpen = (id: string): void => {
        if (onOpen) onOpen(id);
    };

    /**
     * Handles successful project creation from modal and updates local list.
     *
     * @param payload - Raw create form payload from modal (not used directly).
     * @param projectFiles - Created project data and scaffolded entities.
     */
    const handleModalCreate = (
        payload: CreateProjectPayload,
        projectFiles?: StartPageCreateResult,
    ): void => {
        if (!projectFiles) {
            setIsModalOpen(false);
            return;
        }
        setLocalProjects((prev) => [projectFiles, ...prev]);
        if (onCreate) {
            onCreate(projectFiles);
        }
        setIsModalOpen(false);
    };

    /** Opens the create-project modal. */
    const handleCreateClick = (): void => {
        setIsModalOpen(true);
    };

    /** Synchronizes local project list when external `projects` prop changes. */
    useEffect(() => {
        setLocalProjects(projects);
    }, [projects]);

    return (
        <section aria-labelledby="start-projects" className="p-6">
            <CreateProjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleModalCreate}
            />

            <div className="flex items-center justify-between">
                <h1 id="start-projects" className="text-2xl font-semibold">
                    Projects
                </h1>
                <button
                    type="button"
                    onClick={handleCreateClick}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded hover:opacity-95"
                >
                    New Project
                </button>
            </div>

            <div className="mt-6 grid gap-4">
                {localProjects.map((p, idx) => {
                    const resourceList = p.resources.filter(
                        (r) => r.type !== "folder",
                    );
                    const projName = p?.project?.name ?? p.project.name;

                    return (
                        <article
                            key={p.project.id}
                            className="rounded bg-white p-4 shadow-card border flex items-start justify-between"
                            aria-labelledby={`proj-${p.project.id}-title`}
                        >
                            <div>
                                <h2
                                    id={`proj-${p.project.id}-title`}
                                    className="font-medium"
                                >
                                    {projName}
                                </h2>
                                <div className="text-xs text-slate-500 mt-2">
                                    {resourceList.length} resources
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <ManageProjectMenu
                                    projectId={p.project.id}
                                    projectName={projName}
                                    onRename={(id, newName) => {
                                        setLocalProjects((prev) =>
                                            prev.map((proj) =>
                                                proj.project.id === id
                                                    ? {
                                                          ...proj,
                                                          project: {
                                                              ...proj.project,
                                                              name: newName,
                                                          },
                                                      }
                                                    : proj,
                                            ),
                                        );
                                    }}
                                    onDelete={(id) => {
                                        setLocalProjects((prev) =>
                                            prev.filter(
                                                (proj) =>
                                                    proj.project.id !== id,
                                            ),
                                        );
                                    }}
                                    onPackage={(id, selectedIds) => {
                                        // UI-only placeholder action — show selected ids if provided
                                        const proj = localProjects.find(
                                            (x) => x.project.id === id,
                                        );
                                        const selText = selectedIds
                                            ? `\nSelected: ${selectedIds.join(", ")}`
                                            : "";
                                        window.alert(
                                            `Package placeholder for ${proj?.project.name ?? id}${selText}`,
                                        );
                                    }}
                                    resources={resourceList as any}
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleOpen(
                                            p.project.rootPath ?? p.project.id,
                                        )
                                    }
                                    className="px-3 py-1 rounded border text-sm bg-slate-50 hover:bg-slate-100"
                                >
                                    Open
                                </button>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
