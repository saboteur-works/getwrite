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
import { useEffect, useMemo, useState } from "react";
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
import CompilePreviewModal from "../common/CompilePreviewModal";
import { toastService } from "../../src/lib/toast-service";

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
 * Returns the freshest available timestamp for a project card.
 *
 * Considers the project record, all folders, and all resources so the card
 * reflects the most recent activity anywhere in that project.
 *
 * @param projectEntry - Project card data.
 * @returns Latest timestamp string when available.
 */
function getProjectLastEditedTimestamp(
    projectEntry: StartPageProjectEntry,
): string | undefined {
    const candidateTimestamps = [
        projectEntry.project.updatedAt,
        projectEntry.project.createdAt,
        ...projectEntry.resources.flatMap((resource) => [
            resource.updatedAt,
            resource.createdAt,
        ]),
        ...projectEntry.folders.flatMap((folder) => [
            folder.updatedAt,
            folder.createdAt,
        ]),
    ].filter((timestamp): timestamp is string => Boolean(timestamp));

    let latestTimestamp: string | undefined;
    let latestValue = 0;

    for (const timestamp of candidateTimestamps) {
        const parsed = Date.parse(timestamp);
        if (Number.isNaN(parsed)) {
            continue;
        }

        if (!latestTimestamp || parsed > latestValue) {
            latestTimestamp = timestamp;
            latestValue = parsed;
        }
    }

    return latestTimestamp;
}

/**
 * Formats a timestamp as a compact relative label.
 *
 * @param timestamp - ISO timestamp to format.
 * @param now - Current time used for relative calculations.
 * @returns Relative label such as `2d ago`.
 */
function formatRelativeTimestamp(
    timestamp: string | undefined,
    now: number,
): string {
    if (!timestamp) {
        return "just now";
    }

    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) {
        return "just now";
    }

    const elapsedMs = Math.max(0, now - parsed);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    if (elapsedSeconds < 5) {
        return "just now";
    }

    if (elapsedSeconds < 60) {
        return `${elapsedSeconds}s ago`;
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
        return `${elapsedMinutes}m ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
        return `${elapsedHours}h ago`;
    }

    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) {
        return `${elapsedDays}d ago`;
    }

    return new Date(parsed).toLocaleDateString();
}

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
    /** ID of the project currently open in the compile modal, or null when closed. */
    const [compileTargetProjectId, setCompileTargetProjectId] = useState<string | null>(null);

    /**
     * Resources reconstructed for the compile modal.
     *
     * `buildProjectViewAdapter` converts API resources to `UIResource[]` (title not
     * name, no folderId). We rebuild a proper `AnyResource[]` from the folder entries
     * which retain the original data and group resources by folder.
     */
    const compileResources = useMemo((): AnyResource[] => {
        const entry = localProjects.find(p => p.project.id === compileTargetProjectId);
        if (!entry) return [];
        const result: AnyResource[] = [];
        for (const folder of entry.folders as any[]) {
            result.push({
                id: folder.id,
                name: folder.name ?? '',
                slug: folder.slug ?? folder.id,
                type: 'folder' as const,
                // buildResourceTree uses folderId for parent lookup; folders store parent in parentId
                folderId: folder.parentId ?? null,
                parentId: folder.parentId ?? null,
                orderIndex: folder.orderIndex ?? 0,
                createdAt: folder.createdAt ?? '',
                updatedAt: folder.updatedAt ?? '',
                userMetadata: folder.userMetadata ?? {},
            } as AnyResource);
            for (const r of (folder.resources as any[]) ?? []) {
                result.push({
                    id: r.id,
                    // UIResource has title instead of name
                    name: r.title ?? r.name ?? '',
                    slug: r.slug ?? r.id,
                    type: r.type ?? 'text',
                    folderId: folder.id,
                    orderIndex: r._orderIndex ?? r.orderIndex ?? 0,
                    createdAt: r.createdAt ?? '',
                    updatedAt: r.updatedAt ?? '',
                    userMetadata: r.userMetadata ?? {},
                    plainText: r.content ?? '',
                } as AnyResource);
            }
        }
        return result;
    }, [localProjects, compileTargetProjectId]);
    /** Tick used to keep relative timestamps fresh while the page is open. */
    const [timestampTick, setTimestampTick] = useState<number>(Date.now());

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

    useEffect(() => {
        const interval = window.setInterval(() => {
            setTimestampTick(Date.now());
        }, 30000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

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

            <CompilePreviewModal
                isOpen={compileTargetProjectId !== null}
                projectId={compileTargetProjectId ?? undefined}
                resources={compileResources}
                onClose={() => setCompileTargetProjectId(null)}
                onConfirmCompile={(selectedIds, options) => {
                    const entry = localProjects.find(
                        (p) => p.project.id === compileTargetProjectId,
                    );
                    if (!entry?.project.rootPath) {
                        toastService.error("Cannot compile", "Project path not found");
                        setCompileTargetProjectId(null);
                        return;
                    }

                    if (options.format === "pdf") {
                        void fetch("/api/compile/pdf", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                projectPath: entry.project.rootPath,
                                resourceIds: selectedIds,
                                resources: compileResources.map((r) => ({
                                    id: r.id,
                                    name: r.name,
                                    type: r.type,
                                })),
                                includeHeaders: options.includeHeaders,
                                projectName: entry.project.name ?? "project",
                            }),
                        }).then(async (response) => {
                            if (!response.ok) {
                                toastService.error("Compile failed", "Could not generate PDF");
                                return;
                            }
                            if (response.headers.get("X-Compile-Warning") === "font-fallback") {
                                toastService.info("PDF compiled with fallback fonts — IBM Plex fonts were unreachable");
                            }
                            const arrayBuffer = await response.arrayBuffer();
                            const blob = new Blob([arrayBuffer], { type: "application/pdf" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            const rawName = options.compilationName.trim();
                            const disposition = response.headers.get("Content-Disposition") ?? "";
                            const serverFilename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "project.pdf";
                            if (rawName) {
                                a.download = rawName.endsWith(".pdf") ? rawName : `${rawName}.pdf`;
                            } else {
                                a.download = serverFilename;
                            }
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        });
                        setCompileTargetProjectId(null);
                        return;
                    }
                    if (options.format === "docx") {
                        // TODO: implement DOCX compilation
                        console.warn("DOCX compilation not yet implemented");
                        setCompileTargetProjectId(null);
                        return;
                    }

                    void fetch("/api/compile/text", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            projectPath: entry.project.rootPath,
                            resourceIds: selectedIds,
                            resources: compileResources.map((r) => ({
                                id: r.id,
                                name: r.name,
                                type: r.type,
                            })),
                            includeHeaders: options.includeHeaders,
                            projectName: entry.project.name ?? "project",
                        }),
                    }).then(async (response) => {
                        if (!response.ok) {
                            toastService.error("Compile failed", "Could not generate output file");
                            return;
                        }
                        const { text, filename } = (await response.json()) as {
                            text: string;
                            filename: string;
                        };
                        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        const rawName = options.compilationName.trim();
                        if (rawName) {
                            a.download = rawName.endsWith(".txt") ? rawName : `${rawName}.txt`;
                        } else {
                            a.download = filename;
                        }
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    });
                    setCompileTargetProjectId(null);
                }}
            />

            <div className="max-content-width mx-auto">
                <div className="start-page-hero start-page-fade-in px-6 py-8 lg:px-10 lg:py-10">

                    <div className="start-page-hero-grid">
                        <div className="start-page-hero-copy">
                            <div className="start-page-kicker">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gw-secondary" />
                                Local-first writing studio
                            </div>

                            <h1 className="mt-6 start-page-wordmark">
                                <span className="start-page-wordmark-accent">
                                    <span className="font-display font-normal tracking-heading text-gw-secondary">Get</span>
                                    <span className="font-display font-bold tracking-wordmark text-gw-primary">Write</span>
                                </span>
                            </h1>

                            <p className="mt-5 max-w-2xl text-base leading-8 text-gw-secondary sm:text-lg">
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
                            <p className="text-xs uppercase tracking-[0.28em] text-gw-secondary">
                                Writing at a glance
                            </p>
                            <div className="mt-5 grid gap-4">
                                <div>
                                    <div className="text-5xl font-semibold text-gw-primary">
                                        {localProjects.length}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-gw-secondary">
                                        Project
                                        {localProjects.length === 1
                                            ? ""
                                            : "s"}{" "}
                                        ready to open and continue.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-gw-border bg-gw-chrome2 px-4 py-4">
                                        <div className="text-xs uppercase tracking-[0.2em] text-gw-secondary">
                                            Resources
                                        </div>
                                        <div className="mt-2 text-2xl font-semibold text-gw-primary">
                                            {totalRenderableResources}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-gw-border bg-gw-chrome2 px-4 py-4">
                                        <div className="text-xs uppercase tracking-[0.2em] text-gw-secondary">
                                            Folders
                                        </div>
                                        <div className="mt-2 text-2xl font-semibold text-gw-primary">
                                            {totalFolders}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCreateClick}
                                    className="start-page-primary-button inline-flex items-center justify-center gap-2"
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
                        <p className="text-xs uppercase tracking-[0.24em] text-gw-secondary">
                            Library
                        </p>
                        <h2
                            id="start-projects"
                            className="mt-3 text-3xl font-semibold text-gw-primary"
                        >
                            Projects
                        </h2>
                    </div>
                    <div className="max-w-xl text-right text-sm leading-6 text-gw-secondary">
                        {localProjects.length === 0
                            ? "Create your first project to begin writing."
                            : "Open a project or manage its packaging and metadata."}
                    </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {localProjects.length === 0 ? (
                        <article className="start-page-card start-page-fade-in p-6 md:col-span-2 xl:col-span-3">
                            <p className="text-xs uppercase tracking-[0.22em] text-gw-secondary">
                                Empty shelf
                            </p>
                            <h3 className="mt-3 text-2xl font-semibold text-gw-primary">
                                No projects yet
                            </h3>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-gw-secondary">
                                Create a project to scaffold your workspace,
                                organize folders, and start drafting in
                                GetWrite.
                            </p>
                            <button
                                type="button"
                                onClick={handleCreateClick}
                                className="start-page-secondary-button mt-6 inline-flex items-center"
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
                        /** Most recent project-wide activity timestamp. */
                        const lastEditedTimestamp =
                            getProjectLastEditedTimestamp(projectEntry);

                        return (
                            <article
                                key={projectEntry.project.id}
                                className="start-page-card start-page-fade-in flex flex-col justify-between p-5"
                                aria-labelledby={`proj-${projectEntry.project.id}-title`}
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.22em] text-gw-secondary">
                                                Project
                                            </p>
                                            <h3
                                                id={`proj-${projectEntry.project.id}-title`}
                                                className="mt-3 text-xl font-semibold text-gw-primary"
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
                                            onRequestCompile={() =>
                                                setCompileTargetProjectId(
                                                    projectEntry.project.id,
                                                )
                                            }
                                        />
                                    </div>

                                    <p className="mt-4 text-sm leading-7 text-gw-secondary">
                                        {resourceList.length} resource
                                        {resourceList.length === 1 ? "" : "s"}
                                        {" · "}
                                        {projectEntry.folders.length} folder
                                        {projectEntry.folders.length === 1
                                            ? ""
                                            : "s"}
                                    </p>

                                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-gw-secondary">
                                        Last edited{" "}
                                        {formatRelativeTimestamp(
                                            lastEditedTimestamp,
                                            timestampTick,
                                        )}
                                    </p>

                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-gw-secondary">
                                        <span className="bg-gw-chrome2 border border-[0.5px] border-gw-border px-3 py-1 rounded-sm">
                                            {projectEntry.project.projectType ??
                                                "Custom template"}
                                        </span>
                                        <span className="truncate bg-gw-chrome border border-[0.5px] border-gw-border px-3 py-1 rounded-sm max-w-full">
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
                                        className="start-page-secondary-button inline-flex items-center"
                                    >
                                        <FolderOpen
                                            size={15}
                                            aria-hidden="true"
                                        />
                                        Open Project
                                    </button>

                                    <span className="text-xs uppercase tracking-[0.2em] text-gw-secondary">
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
