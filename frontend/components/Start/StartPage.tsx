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
import React, { useEffect, useMemo, useState } from "react";
import { FolderPlus, Plus, FolderOpen } from "lucide-react";
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

/** Non-folder resources summarized on start-page cards and package actions. */
type StartPageRenderableResource = Exclude<AnyResource, Folder>;

/**
 * Narrows a canonical resource to a renderable, non-folder resource.
 *
 * @param resource - Candidate project resource.
 * @returns `true` when the resource should appear in start-page summaries.
 */
function isRenderableResource(
    resource: AnyResource,
): resource is StartPageRenderableResource {
    return resource.type !== "folder";
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
    /** Locally synchronized project list used for optimistic UI updates. */
    const [localProjects, setLocalProjects] =
        useState<StartPageProjectEntry[]>(projects);
    /** Controls the create-project modal visibility. */
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    /** Total non-folder resources across all visible projects. */
    const totalRenderableResources = useMemo<number>(() => {
        return localProjects.reduce((total, projectEntry) => {
            return (
                total +
                projectEntry.resources.filter(isRenderableResource).length
            );
        }, 0);
    }, [localProjects]);

    /** Total folder count across all visible projects. */
    const totalFolders = useMemo<number>(() => {
        return localProjects.reduce((total, projectEntry) => {
            return total + projectEntry.folders.length;
        }, 0);
    }, [localProjects]);

    /** Lead project name referenced in the hero copy. */
    const featuredProjectName = useMemo<string>(() => {
        return localProjects[0]?.project.name ?? "your next manuscript";
    }, [localProjects]);

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
        void payload;

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
        <section
            aria-labelledby="start-projects"
            className="start-page-shell px-6 py-8 lg:px-8"
        >
            <CreateProjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleModalCreate}
            />

            <div className="max-content-width mx-auto">
                <div className="start-page-hero start-page-fade-in px-6 py-8 lg:px-10 lg:py-10">
                    <div
                        className="start-page-orb start-page-orb-primary"
                        aria-hidden="true"
                    />
                    <div
                        className="start-page-orb start-page-orb-secondary"
                        aria-hidden="true"
                    />

                    <div className="start-page-hero-grid">
                        <div className="start-page-hero-copy">
                            <div className="start-page-kicker">
                                <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
                                Local-first writing studio
                            </div>

                            <h1 className="mt-6 start-page-wordmark">
                                <span className="start-page-wordmark-accent">
                                    GetWrite
                                </span>
                            </h1>

                            <p className="mt-5 max-w-2xl text-base leading-8 text-ink-700 sm:text-lg">
                                Shape books, series, and scene libraries with a
                                calm editorial workspace. Pick up where you left
                                off in {featuredProjectName} or open a clean
                                slate for your next draft.
                            </p>

                            <div className="mt-6 flex flex-wrap gap-3 text-sm">
                                <span className="start-page-chip">
                                    {localProjects.length} active project
                                    {localProjects.length === 1 ? "" : "s"}
                                </span>
                                <span className="start-page-chip">
                                    {totalRenderableResources} writing assets
                                </span>
                                <span className="start-page-chip">
                                    {totalFolders} folders organized
                                </span>
                            </div>
                        </div>

                        <aside className="start-page-panel start-page-fade-in-delayed p-6 lg:p-7">
                            <p className="text-xs uppercase tracking-[0.28em] text-neutral-500">
                                Writing at a glance
                            </p>
                            <div className="mt-5 grid gap-4">
                                <div>
                                    <div className="text-5xl font-semibold text-ink-900">
                                        {localProjects.length}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-ink-700">
                                        Project
                                        {localProjects.length === 1
                                            ? ""
                                            : "s"}{" "}
                                        ready to open and continue.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-neutral-200 bg-paper-50 px-4 py-4">
                                        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                                            Resources
                                        </div>
                                        <div className="mt-2 text-2xl font-semibold text-ink-900">
                                            {totalRenderableResources}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-neutral-200 bg-paper-50 px-4 py-4">
                                        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                                            Folders
                                        </div>
                                        <div className="mt-2 text-2xl font-semibold text-ink-900">
                                            {totalFolders}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCreateClick}
                                    className="start-page-primary-button inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white"
                                >
                                    <FolderPlus size={16} aria-hidden="true" />
                                    Start a New Project
                                </button>
                            </div>
                        </aside>
                    </div>
                </div>

                <div className="mt-10 flex items-end justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                            Library
                        </p>
                        <h2
                            id="start-projects"
                            className="mt-3 text-3xl font-semibold text-ink-900"
                        >
                            Projects
                        </h2>
                    </div>
                    <div className="max-w-xl text-right text-sm leading-6 text-ink-700">
                        {localProjects.length === 0
                            ? "Create your first project to begin writing."
                            : "Open a project or manage its packaging and metadata."}
                    </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {localProjects.length === 0 ? (
                        <article className="start-page-card start-page-fade-in p-6 md:col-span-2 xl:col-span-3">
                            <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">
                                Empty shelf
                            </p>
                            <h3 className="mt-3 text-2xl font-semibold text-ink-900">
                                No projects yet
                            </h3>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-700">
                                Create a project to scaffold your workspace,
                                organize folders, and start drafting in
                                GetWrite.
                            </p>
                            <button
                                type="button"
                                onClick={handleCreateClick}
                                className="start-page-secondary-button mt-6 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700"
                            >
                                <Plus size={15} aria-hidden="true" />
                                Create the first project
                            </button>
                        </article>
                    ) : null}

                    {localProjects.map((projectEntry) => {
                        /** Non-folder resources shown in summaries and package flow. */
                        const resourceList =
                            projectEntry.resources.filter(isRenderableResource);
                        /** Resolved project name for the current card. */
                        const projectName =
                            projectEntry.project.name || "Untitled Project";

                        return (
                            <article
                                key={projectEntry.project.id}
                                className="start-page-card start-page-fade-in flex flex-col justify-between p-5"
                                aria-labelledby={`proj-${projectEntry.project.id}-title`}
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">
                                                Project
                                            </p>
                                            <h3
                                                id={`proj-${projectEntry.project.id}-title`}
                                                className="mt-3 text-xl font-semibold text-ink-900"
                                            >
                                                {projectName}
                                            </h3>
                                        </div>

                                        <ManageProjectMenu
                                            projectId={projectEntry.project.id}
                                            projectName={projectName}
                                            onRename={(id, newName) => {
                                                setLocalProjects((prev) =>
                                                    prev.map((projectItem) =>
                                                        projectItem.project
                                                            .id === id
                                                            ? {
                                                                  ...projectItem,
                                                                  project: {
                                                                      ...projectItem.project,
                                                                      name: newName,
                                                                  },
                                                              }
                                                            : projectItem,
                                                    ),
                                                );
                                            }}
                                            onDelete={(id) => {
                                                setLocalProjects((prev) =>
                                                    prev.filter(
                                                        (projectItem) =>
                                                            projectItem.project
                                                                .id !== id,
                                                    ),
                                                );
                                            }}
                                            onPackage={(id, selectedIds) => {
                                                const selectedProject =
                                                    localProjects.find(
                                                        (projectItem) =>
                                                            projectItem.project
                                                                .id === id,
                                                    );
                                                const selectedText =
                                                    selectedIds &&
                                                    selectedIds.length > 0
                                                        ? `\nSelected: ${selectedIds.join(", ")}`
                                                        : "";

                                                window.alert(
                                                    `Package placeholder for ${selectedProject?.project.name ?? id}${selectedText}`,
                                                );
                                            }}
                                            resources={resourceList}
                                        />
                                    </div>

                                    <p className="mt-4 text-sm leading-7 text-ink-700">
                                        {resourceList.length} resource
                                        {resourceList.length === 1 ? "" : "s"}
                                        {" · "}
                                        {projectEntry.folders.length} folder
                                        {projectEntry.folders.length === 1
                                            ? ""
                                            : "s"}
                                    </p>

                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-700">
                                        <span className="rounded-full bg-brand-50 px-3 py-1">
                                            {projectEntry.project.projectType ??
                                                "Custom template"}
                                        </span>
                                        <span className="truncate rounded-full bg-paper-100 px-3 py-1 max-w-full">
                                            {projectEntry.project.rootPath ??
                                                "Local project"}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleOpen(
                                                projectEntry.project.rootPath ??
                                                    projectEntry.project.id,
                                            )
                                        }
                                        className="start-page-secondary-button inline-flex items-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-ink-900"
                                    >
                                        <FolderOpen
                                            size={15}
                                            aria-hidden="true"
                                        />
                                        Open Project
                                    </button>

                                    <span className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                                        Ready to write
                                    </span>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
