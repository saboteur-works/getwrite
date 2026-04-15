"use client";
/**
 * @module Layout/AppShell
 *
 * Main three-pane application shell coordinating:
 * - Left pane: resource tree navigation and context actions (resizable, collapsible).
 * - Center pane: active work-area view (edit/diff/organizer/data/timeline).
 * - Right pane: metadata editing controls for the selected resource (resizable, collapsible).
 *
 * Responsibilities include view switching, modal orchestration for
 * create/export/compile flows, resizable/collapsible split panes, and debounced persistence
 * of editor content.
 */
import React, { useState, useRef, useEffect } from "react";
import type {
    AnyResource,
    ViewName,
    Project as CanonicalProject,
    ResourceType,
    Folder,
    TipTapDocument,
} from "../../src/lib/models/types";
import { shallowEqual } from "react-redux";
import { removeResource } from "../../src/store/projectsSlice";
import { setEditorConfig } from "../../src/store/editorConfigSlice";
import ResourceTree from "../ResourceTree/ResourceTree";
import ShellLayoutController from "./ShellLayoutController";
import ShellSettingsMenu from "./ShellSettingsMenu";
import ShellModalCoordinator from "./ShellModalCoordinator";
import ShellProjectTypeLoader from "./ShellProjectTypeLoader";
import type { ResourceContextAction } from "../ResourceTree/ResourceContextMenu";
import ViewSwitcher from "../WorkArea/ViewSwitcher";
import EditView from "../WorkArea/EditView";
import DiffView from "../WorkArea/DiffView";
import OrganizerView from "../WorkArea/Views/OrganizerView/OrganizerView";
import DataView from "../WorkArea/DataView";
import TimelineView from "../WorkArea/TimelineView";
import MetadataSidebar from "../Sidebar/MetadataSidebar";
import SearchBar from "../SearchBar/SearchBar";
import debounce from "lodash/debounce";
import {
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    FileText,
    Image as ImageIcon,
    Music2,
    Plus,
} from "lucide-react";
import useAppSelector, { useAppDispatch } from "../../src/store/hooks";
import { selectResource } from "../../src/store/resourcesSlice";
import {
    getStoredGlobalAppearancePreferences,
    type ColorMode,
    resolvePreferredColorMode,
    saveGlobalAppearancePreferences,
    saveGlobalColorMode,
} from "../../src/lib/user-preferences";
import type { MetadataValue } from "../../src/lib/models/types";
import type { EditorHeadingMap } from "../../src/lib/editor-heading-settings";
import { toastService } from "../../src/lib/toast-service";

/**
 * Optional payload bag forwarded to `onResourceAction` callbacks.
 */
export interface AppShellResourceActionOptions {
    [key: string]: any;
}

/**
 * Local modal state for context-menu destructive actions.
 */
interface ContextActionState {
    open: boolean;
    action?: ResourceContextAction;
    resourceId?: string;
    resourceTitle?: string;
}

/**
 * Local modal state for resource creation flow.
 */
interface CreateModalState {
    open: boolean;
    parentId?: string;
    initialTitle?: string;
}

/**
 * Local modal state for export preview flow.
 */
interface ExportModalState {
    open: boolean;
    resourceId?: string;
    resourceTitle?: string;
    preview?: string;
}

/**
 * Local modal state for compile preview flow.
 */
interface CompileModalState {
    open: boolean;
    resourceId?: string;
    preview?: string;
}

/**
 * Props accepted by {@link AppShell}.
 */
export interface AppShellProps {
    /** Optional fallback content rendered when no resource is selected. */
    children?: React.ReactNode;
    /** Toggles left/right sidebars and drag handles. */
    showSidebars?: boolean;
    /** Full resource list for the currently opened project. */
    resources?: AnyResource[];
    /** Folder list used by resource tree and create modal parent selector. */
    folders?: Folder[];
    /** Active project record backing current shell state. */
    project?: CanonicalProject | null;
    /** Called when a resource is selected from search/tree interactions. */
    onResourceSelect?: (id: string) => void;
    /** ID of currently selected resource (if any). */
    selectedResourceId?: string | null;
    /** Metadata callback for notes field updates. */
    onChangeNotes?: (text: string, resourceId: string) => void;
    /** Metadata callback for status updates. */
    onChangeStatus?: (
        status: "draft" | "in-review" | "published",
        resourceId: string,
    ) => void;
    /** Metadata callback for point-of-view updates. */
    onChangePOV?: (pov: string | null, resourceId: string) => void;
    /** Metadata callback for dynamic metadata updates. */
    onChangeDynamicMetadata?: (
        metadata: Record<string, string[]>,
        resourceId: string,
    ) => void;
    /**
     * General resource action handler used by tree and modal flows.
     *
     * Examples: create, duplicate, delete, export.
     */
    onResourceAction?: (
        action: ResourceContextAction,
        resourceId?: string,
        opts?: AppShellResourceActionOptions,
    ) => Promise<void>;
    /** Closes the active project and returns to the start page. */
    onCloseProject?: () => void;
}

/**
 * Three-column app shell used in the main app and Storybook.
 *
 * Layout:
 * - Left pane: `ResourceTree` and tree actions (resizable, collapsible).
 * - Center pane: `ViewSwitcher`, search, and active work view (constant width).
 * - Right pane: `MetadataSidebar` bound to selected resource (resizable, collapsible).
 *
 * @param props - {@link AppShellProps}.
 * @returns Top-level app shell layout.
 */
export default function AppShell({
    children,
    showSidebars = true,
    resources,
    folders,
    onResourceSelect,
    selectedResourceId,
    onChangeNotes,
    onChangeStatus,
    onChangePOV,
    onChangeDynamicMetadata,
    onResourceAction,
    onCloseProject,
    project,
}: AppShellProps): JSX.Element {
    const [view, setView] = useState<ViewName>("edit");
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] =
        useState<boolean>(false);
    const [isProjectMenuOpen, setIsProjectMenuOpen] =
        useState<boolean>(false);
    const [isPreferencesModalOpen, setIsPreferencesModalOpen] =
        useState<boolean>(false);
    const [isHeadingSettingsModalOpen, setIsHeadingSettingsModalOpen] =
        useState<boolean>(false);
    const [isProjectTypesModalOpen, setIsProjectTypesModalOpen] =
        useState<boolean>(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
    const [isResourcePaletteOpen, setIsResourcePaletteOpen] =
        useState<boolean>(false);
    const [colorMode, setColorMode] = useState<ColorMode>("light");
    const [hasUnsavedEditorChanges, setHasUnsavedEditorChanges] =
        useState<boolean>(false);
    const [isCloseProjectConfirmOpen, setIsCloseProjectConfirmOpen] =
        useState<boolean>(false);
    const settingsMenuRef = useRef<HTMLDivElement | null>(null);
    const projectMenuRef = useRef<HTMLDivElement | null>(null);
    const latestEditorEditVersionRef = useRef<number>(0);
    const combined = React.useMemo(() => {
        return [...(resources ?? []), ...(folders ?? [])];
    }, [resources, folders]);
    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );
    const [recentTimestampTick, setRecentTimestampTick] = useState<number>(
        Date.now(),
    );

    const recentResources = React.useMemo(() => {
        const sortableResources = (resources ?? []).filter(
            (resource) => resource.type !== "folder",
        );

        return [...sortableResources]
            .sort((left, right) => {
                const leftTimestamp = Date.parse(
                    left.updatedAt ?? left.createdAt ?? "",
                );
                const rightTimestamp = Date.parse(
                    right.updatedAt ?? right.createdAt ?? "",
                );

                const leftSafe = Number.isNaN(leftTimestamp)
                    ? 0
                    : leftTimestamp;
                const rightSafe = Number.isNaN(rightTimestamp)
                    ? 0
                    : rightTimestamp;

                return rightSafe - leftSafe;
            })
            .slice(0, 6);
    }, [resources]);

    const formatRelativeTimestamp = React.useCallback(
        (timestamp: string | undefined): string => {
            if (!timestamp) {
                return "just now";
            }

            const parsed = Date.parse(timestamp);
            if (Number.isNaN(parsed)) {
                return "just now";
            }

            const elapsedMs = Math.max(0, recentTimestampTick - parsed);
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
        },
        [recentTimestampTick],
    );

    useEffect(() => {
        const interval = window.setInterval(() => {
            setRecentTimestampTick(Date.now());
        }, 30000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

    /**
     * Extracts a best-effort display name from resource-like objects.
     *
     * @param r - Resource-like object that may expose `name` or `title`.
     * @returns Resolved display name, or empty string when unavailable.
     */
    const getResourceName = (r: AnyResource | any) =>
        (r && ((r as any).name ?? (r as any).title ?? "")) || "";

    /**
     * Returns plain-text content used by edit/diff views.
     *
     * @param r - Resource-like object containing persisted plain-text content.
     * @returns Plain-text content for view rendering.
     */
    const getResourceContent = (r: AnyResource | any) => r.plaintext;

    const [contextAction, setContextAction] = useState<ContextActionState>({
        open: false,
    });

    /**
     * Handles context-menu actions from `ResourceTree` and routes them to
     * confirmation/modals or forwards directly to `onResourceAction`.
     *
     * @param action - Requested context action.
     * @param resourceId - Target resource id for the action (when applicable).
     * @param resourceTitle - Optional resource title used by modal labels.
     */
    const handleResourceAction = async (
        action: ResourceContextAction,
        resourceId?: string,
        resourceTitle?: string,
    ) => {
        // For destructive actions show a confirmation dialog.
        if (action === "delete") {
            setContextAction({ open: true, action, resourceId, resourceTitle });
            return;
        }

        // For create/copy/duplicate/show modals locally and confirm before forwarding
        if (action === "create") {
            setCreateModal({
                open: true,
                parentId: resourceId,
                initialTitle: "",
            });
            return;
        }

        if (action === "copy" || action === "duplicate") {
            setCreateModal({
                open: true,
                parentId: resourceId,
                initialTitle: `${resourceTitle ?? "Resource"} (copy)`,
            });
            return;
        }

        if (action === "export") {
            setExportModal({
                open: true,
                resourceId,
                resourceTitle,
                preview: "Export preview (placeholder)",
            });
            return;
        }

        // Fallback forward
        await onResourceAction?.(action, resourceId);
    };

    const [createModal, setCreateModal] = useState<CreateModalState>({
        open: false,
    });
    const [exportModal, setExportModal] = useState<ExportModalState>({
        open: false,
    });
    const [compileModal, setCompileModal] = useState<CompileModalState>({
        open: false,
    });

    /**
     * Handles create-modal confirmation and forwards creation payload upstream.
     *
     * @param payload - Creation payload from `CreateResourceModal`.
     * @param parentId - Optional parent resource/folder id for nesting.
     * @param _opts - Optional callback options from modal (currently unused).
     */
    const handleCreateConfirmed = async (
        payload: {
            title: string;
            type: ResourceType | string;
            folderId?: string;
        },
        parentId?: string,
        _opts?: AppShellResourceActionOptions,
    ) => {
        // forward to page-level handler to mutate project resources
        await onResourceAction?.("create", parentId, payload);
        setCreateModal({ open: false });
    };

    /**
     * Handles export preview confirmation and forwards export action upstream.
     *
     * @param resourceId - Optional resource id to export; when omitted exports project context.
     */
    const handleExportConfirmed = async (resourceId?: string) => {
        await onResourceAction?.("export", resourceId);
        setExportModal({ open: false });
    };

    const _prevProjectId = React.useRef<string | undefined | null>(undefined);
    useEffect(() => {
        if (_prevProjectId.current !== project?.id) {
            _prevProjectId.current = project?.id;
        }
    }, [project?.id]);
    const dispatch = useAppDispatch();

    /**
     * Persists editor content to resource API using debounced transport.
     *
     * Guard clauses ensure this only runs for open projects with selected
     * resources and known `rootPath`.
     *
     * @param content - Current plain-text editor content (reserved for parity/logging).
     * @param doc - Current TipTap document snapshot to persist.
     */
    const persistContent = async (
        content: string,
        doc: TipTapDocument,
        editVersion: number,
    ): Promise<void> => {
        if (!project || !selectedResourceId) {
            setHasUnsavedEditorChanges(false);
            return;
        }
        if (!project.rootPath) {
            setHasUnsavedEditorChanges(false);
            return;
        }
        console.log("Persisting content for", selectedResourceId);
        try {
            const response = await fetch(
                `/api/resource/${selectedResourceId}/content`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        projectPath: project.rootPath,
                        doc,
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to persist content (${response.status})`,
                );
            }

            if (latestEditorEditVersionRef.current === editVersion) {
                setHasUnsavedEditorChanges(false);
            }
        } catch (err) {
            console.error("Failed to persist content:", err);
            setHasUnsavedEditorChanges(true);
        }
    };

    /**
     * Debounced content persistence function to limit API write frequency while
     * users are typing.
     */
    const debouncedPersistContent = React.useMemo(
        () => debounce(persistContent, 2500),
        [persistContent],
    );

    /**
     * Editor change handler that feeds updates into debounced persistence.
     *
     * @param content - Latest plain-text content.
     * @param doc - Latest TipTap document snapshot.
     */
    const handlerEditorChange = (content: string, doc: TipTapDocument) => {
        latestEditorEditVersionRef.current += 1;
        const nextEditVersion = latestEditorEditVersionRef.current;
        setHasUnsavedEditorChanges(true);
        debouncedPersistContent(content, doc, nextEditVersion);
    };

    useEffect(() => {
        return () => {
            debouncedPersistContent.cancel(); // Cancel any pending debounced calls
        };
    }, [debouncedPersistContent]);

    useEffect(() => {
        setHasUnsavedEditorChanges(false);
        latestEditorEditVersionRef.current = 0;
    }, [project?.id, selectedResourceId]);

    useEffect(() => {
        const onDocumentMouseDown = (event: MouseEvent) => {
            if (
                settingsMenuRef.current &&
                !settingsMenuRef.current.contains(event.target as Node)
            ) {
                setIsSettingsMenuOpen(false);
            }
            if (
                projectMenuRef.current &&
                !projectMenuRef.current.contains(event.target as Node)
            ) {
                setIsProjectMenuOpen(false);
            }
        };

        const onDocumentKeyDown = (event: KeyboardEvent) => {
            const isCommandPaletteShortcut =
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "k";

            if (isCommandPaletteShortcut) {
                event.preventDefault();
                setIsSettingsMenuOpen(false);
                setIsResourcePaletteOpen(true);
                return;
            }

            if (event.key === "Escape") {
                setIsSettingsMenuOpen(false);
                setIsProjectMenuOpen(false);
                setIsPreferencesModalOpen(false);
                setIsProjectTypesModalOpen(false);
                setIsHelpModalOpen(false);
                setIsResourcePaletteOpen(false);
            }
        };

        document.addEventListener("mousedown", onDocumentMouseDown);
        document.addEventListener("keydown", onDocumentKeyDown);

        return () => {
            document.removeEventListener("mousedown", onDocumentMouseDown);
            document.removeEventListener("keydown", onDocumentKeyDown);
        };
    }, []);

    useEffect(() => {
        const metadata = project?.metadata as
            | Record<string, MetadataValue>
            | undefined;
        setColorMode(resolvePreferredColorMode(metadata));
    }, [project?.id, project?.metadata]);

    const isDarkMode = colorMode === "dark";
    const persistColorModePreference = async (
        nextMode: ColorMode,
    ): Promise<void> => {
        const appearance = getStoredGlobalAppearancePreferences();
        saveGlobalAppearancePreferences({
            ...appearance,
            colorModePreference: nextMode,
        });
        saveGlobalColorMode(nextMode);

        if (!project?.rootPath) {
            return;
        }

        try {
            await fetch("/api/project/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectPath: project.rootPath,
                    preferences: {
                        colorMode: nextMode,
                    },
                }),
            });
        } catch (error) {
            console.error("Failed to persist project user preferences", error);
        }
    };

    const handleToggleColorMode = () => {
        setColorMode((previous) => {
            const nextMode: ColorMode = previous === "dark" ? "light" : "dark";
            void persistColorModePreference(nextMode);
            return nextMode;
        });
    };

    const handleOpenProjectTypeManager = (): void => {
        setIsSettingsMenuOpen(false);
        setIsProjectTypesModalOpen(true);
    };

    const handleOpenPreferences = (): void => {
        setIsSettingsMenuOpen(false);
        setIsPreferencesModalOpen(true);
    };

    const handleOpenHeadingSettings = (): void => {
        setIsSettingsMenuOpen(false);
        setIsHeadingSettingsModalOpen(true);
    };

    const handleOpenHelp = (): void => {
        setIsSettingsMenuOpen(false);
        setIsHelpModalOpen(true);
    };

    const handleOpenCompile = (): void => {
        setIsProjectMenuOpen(false);
        setCompileModal({ open: true });
    };

    const handleCloseProject = (): void => {
        setIsSettingsMenuOpen(false);
        setIsHeadingSettingsModalOpen(false);
        setIsPreferencesModalOpen(false);
        setIsProjectTypesModalOpen(false);
        setIsHelpModalOpen(false);

        if (hasUnsavedEditorChanges) {
            setIsCloseProjectConfirmOpen(true);
            return;
        }

        onCloseProject?.();
    };

    const handleConfirmCloseProject = (): void => {
        setIsCloseProjectConfirmOpen(false);
        setHasUnsavedEditorChanges(false);
        debouncedPersistContent.cancel();
        onCloseProject?.();
    };

    const handleSaveHeadingSettings = async (
        headings: EditorHeadingMap,
    ): Promise<void> => {
        if (!project?.rootPath) {
            throw new Error("Project path unavailable for heading settings.");
        }

        const response = await fetch("/api/project/editor-config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: project.rootPath,
                headings,
            }),
        });
        const body = (await response.json().catch(() => null)) as {
            editorConfig?: { headings?: EditorHeadingMap };
            error?: string;
        } | null;

        if (!response.ok) {
            throw new Error(body?.error ?? "Failed to save heading settings.");
        }

        dispatch(
            setEditorConfig({
                headings: body?.editorConfig?.headings ?? {},
            }),
        );
    };

    return (
        <div
            className={`appshell-shell ${isDarkMode ? "appshell-theme-dark" : ""}`}
        >
            <ShellSettingsMenu
                projectName={project?.name}
                isDarkMode={isDarkMode}
                isOpen={isSettingsMenuOpen}
                menuRef={settingsMenuRef}
                onToggleOpen={() => setIsSettingsMenuOpen((prev) => !prev)}
                onOpenPreferences={handleOpenPreferences}
                onOpenHeadingSettings={handleOpenHeadingSettings}
                onOpenProjectTypeManager={handleOpenProjectTypeManager}
                onToggleColorMode={handleToggleColorMode}
                onOpenHelp={handleOpenHelp}
                onCloseProject={handleCloseProject}
                hasProject={Boolean(project)}
                isProjectMenuOpen={isProjectMenuOpen}
                projectMenuRef={projectMenuRef}
                onToggleProjectMenuOpen={() =>
                    setIsProjectMenuOpen((prev) => !prev)
                }
                onOpenCompile={handleOpenCompile}
            />

            <ShellLayoutController>
                {(layout) => (
                    <div className="appshell-body">
                        {/* Left Sidebar */}
                        {showSidebars && layout.leftOpen ? (
                            <aside
                                className="hidden sm:flex appshell-sidebar border-r"
                                style={{ width: layout.leftWidth }}
                            >
                                <div className="appshell-sidebar-header">
                                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] font-semibold text-gw-secondary">
                                        Resources
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            layout.setLeftOpen(false)
                                        }
                                        className="appshell-close-button"
                                        title="Close left sidebar"
                                        aria-label="Close resource sidebar"
                                    >
                                        <PanelLeftClose
                                            size={16}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>
                                <div className="appshell-sidebar-content p-4 pt-3">
                                    {project ? (
                                        <ResourceTree
                                            debug={false}
                                            onResourceAction={
                                                handleResourceAction
                                            }
                                        />
                                    ) : (
                                        <div className="space-y-2">
                                            <p>Loading Resource Tree</p>
                                        </div>
                                    )}
                                </div>
                            </aside>
                        ) : null}

                        {/* Left Sidebar Collapsed Toggle */}
                        {showSidebars && !layout.leftOpen ? (
                            <div className="hidden sm:flex flex-col items-center justify-start h-full p-2 bg-gw-chrome border-r border-[0.5px] border-gw-border">
                                <button
                                    type="button"
                                    onClick={() => layout.setLeftOpen(true)}
                                    className="appshell-sidebar-toggle"
                                    title="Open left sidebar"
                                    aria-label="Open resource sidebar"
                                >
                                    <PanelLeftOpen
                                        size={16}
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                        ) : null}

                        <ShellProjectTypeLoader
                            isOpen={isProjectTypesModalOpen}
                        >
                            {({
                                projectTypeTemplates,
                                isProjectTypesLoading,
                                projectTypesLoadError,
                            }) => (
                                <ShellModalCoordinator
                                    contextAction={contextAction}
                                    setContextAction={setContextAction}
                                    isCloseProjectConfirmOpen={
                                        isCloseProjectConfirmOpen
                                    }
                                    setIsCloseProjectConfirmOpen={
                                        setIsCloseProjectConfirmOpen
                                    }
                                    createModal={createModal}
                                    setCreateModal={setCreateModal}
                                    exportModal={exportModal}
                                    setExportModal={setExportModal}
                                    compileModal={compileModal}
                                    setCompileModal={setCompileModal}
                                    isHeadingSettingsModalOpen={
                                        isHeadingSettingsModalOpen
                                    }
                                    setIsHeadingSettingsModalOpen={
                                        setIsHeadingSettingsModalOpen
                                    }
                                    initialHeadingSettings={
                                        project?.config?.editorConfig?.headings
                                    }
                                    isPreferencesModalOpen={
                                        isPreferencesModalOpen
                                    }
                                    setIsPreferencesModalOpen={
                                        setIsPreferencesModalOpen
                                    }
                                    isHelpModalOpen={isHelpModalOpen}
                                    setIsHelpModalOpen={setIsHelpModalOpen}
                                    isProjectTypesModalOpen={
                                        isProjectTypesModalOpen
                                    }
                                    setIsProjectTypesModalOpen={
                                        setIsProjectTypesModalOpen
                                    }
                                    isResourcePaletteOpen={
                                        isResourcePaletteOpen
                                    }
                                    setIsResourcePaletteOpen={
                                        setIsResourcePaletteOpen
                                    }
                                    isProjectTypesLoading={
                                        isProjectTypesLoading
                                    }
                                    projectTypesLoadError={
                                        projectTypesLoadError
                                    }
                                    projectTypeTemplates={projectTypeTemplates}
                                    resources={resources}
                                    folders={folders}
                                    project={project}
                                    hasUnsavedEditorChanges={
                                        hasUnsavedEditorChanges
                                    }
                                    onSaveHeadingSettings={
                                        handleSaveHeadingSettings
                                    }
                                    onDeleteConfirm={async (resourceId) => {
                                        if (project) {
                                            dispatch(
                                                removeResource({
                                                    projectId: project.id,
                                                    resourceId,
                                                }),
                                            );
                                        }
                                        await onResourceAction?.(
                                            "delete",
                                            resourceId,
                                        );
                                    }}
                                    onCloseProjectConfirm={
                                        handleConfirmCloseProject
                                    }
                                    onCreateConfirmed={async (
                                        payload,
                                        parentId,
                                    ) => {
                                        await handleCreateConfirmed(
                                            payload,
                                            parentId,
                                        );
                                    }}
                                    onExportConfirmed={async (resourceId) => {
                                        await handleExportConfirmed(resourceId);
                                    }}
                                    onSelectResource={onResourceSelect}
                                    onBuildCompilePreview={(resourceId) => {
                                        const resource = resourceId
                                            ? resources?.find(
                                                  (x) => x.id === resourceId,
                                              )
                                            : undefined;
                                        if (resource) {
                                            return (
                                                `Compiled package for ${getResourceName(resource)}\n\n` +
                                                JSON.stringify(
                                                    resource,
                                                    null,
                                                    2,
                                                )
                                            );
                                        }
                                        return (
                                            "Compiled project bundle\n\n" +
                                            JSON.stringify(
                                                resources ?? [],
                                                null,
                                                2,
                                            )
                                        );
                                    }}
                                    onConfirmCompile={async (
                                        selectedIds,
                                        options,
                                    ) => {
                                        if (!project?.rootPath) return;
                                        try {

                                        if (options.format === "pdf") {
                                            const pdfResponse = await fetch(
                                                "/api/compile/pdf",
                                                {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type":
                                                            "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        projectPath:
                                                            project.rootPath,
                                                        resourceIds: selectedIds,
                                                        resources: (
                                                            resources ?? []
                                                        ).map((r) => ({
                                                            id: r.id,
                                                            name: r.name,
                                                            type: r.type,
                                                        })),
                                                        includeHeaders:
                                                            options.includeHeaders,
                                                        projectName:
                                                            project.name ??
                                                            "project",
                                                    }),
                                                },
                                            );
                                            if (!pdfResponse.ok) {
                                                toastService.error("Compile failed", "Could not generate PDF");
                                                return;
                                            }
                                            if (pdfResponse.headers.get("X-Compile-Warning") === "font-fallback") {
                                                toastService.info("PDF compiled with fallback fonts — IBM Plex fonts were unreachable");
                                            }
                                            const arrayBuffer =
                                                await pdfResponse.arrayBuffer();
                                            const blob = new Blob(
                                                [arrayBuffer],
                                                {
                                                    type: "application/pdf",
                                                },
                                            );
                                            const url =
                                                URL.createObjectURL(blob);
                                            const a =
                                                document.createElement("a");
                                            a.href = url;
                                            const rawName =
                                                options.compilationName.trim();
                                            const disposition =
                                                pdfResponse.headers.get(
                                                    "Content-Disposition",
                                                ) ?? "";
                                            const serverFilename =
                                                disposition
                                                    .match(
                                                        /filename="([^"]+)"/,
                                                    )?.[1] ?? "project.pdf";
                                            if (rawName) {
                                                a.download = rawName.endsWith(
                                                    ".pdf",
                                                )
                                                    ? rawName
                                                    : `${rawName}.pdf`;
                                            } else {
                                                a.download = serverFilename;
                                            }
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                            return;
                                        }
                                        if (options.format === "docx") {
                                            const docxResponse = await fetch(
                                                "/api/compile/docx",
                                                {
                                                    method: "POST",
                                                    headers: {
                                                        "Content-Type":
                                                            "application/json",
                                                    },
                                                    body: JSON.stringify({
                                                        projectPath:
                                                            project.rootPath,
                                                        resourceIds: selectedIds,
                                                        resources: (
                                                            resources ?? []
                                                        ).map((r) => ({
                                                            id: r.id,
                                                            name: r.name,
                                                            type: r.type,
                                                        })),
                                                        includeHeaders:
                                                            options.includeHeaders,
                                                        projectName:
                                                            project.name ??
                                                            "project",
                                                    }),
                                                },
                                            );
                                            if (!docxResponse.ok) {
                                                toastService.error("Compile failed", "Could not generate DOCX");
                                                return;
                                            }
                                            const arrayBuffer =
                                                await docxResponse.arrayBuffer();
                                            const blob = new Blob(
                                                [arrayBuffer],
                                                {
                                                    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                                },
                                            );
                                            const url =
                                                URL.createObjectURL(blob);
                                            const a =
                                                document.createElement("a");
                                            a.href = url;
                                            const rawName =
                                                options.compilationName.trim();
                                            const disposition =
                                                docxResponse.headers.get(
                                                    "Content-Disposition",
                                                ) ?? "";
                                            const serverFilename =
                                                disposition
                                                    .match(
                                                        /filename="([^"]+)"/,
                                                    )?.[1] ?? "project.docx";
                                            if (rawName) {
                                                a.download = rawName.endsWith(
                                                    ".docx",
                                                )
                                                    ? rawName
                                                    : `${rawName}.docx`;
                                            } else {
                                                a.download = serverFilename;
                                            }
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                            return;
                                        }

                                        const response = await fetch(
                                            "/api/compile/text",
                                            {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type":
                                                        "application/json",
                                                },
                                                body: JSON.stringify({
                                                    projectPath:
                                                        project.rootPath,
                                                    resourceIds: selectedIds,
                                                    resources: (
                                                        resources ?? []
                                                    ).map((r) => ({
                                                        id: r.id,
                                                        name: r.name,
                                                        type: r.type,
                                                    })),
                                                    includeHeaders:
                                                        options.includeHeaders,
                                                    projectName:
                                                        project.name ??
                                                        "project",
                                                }),
                                            },
                                        );
                                        if (!response.ok) return;
                                        const { text, filename } =
                                            (await response.json()) as {
                                                text: string;
                                                filename: string;
                                            };
                                        const blob = new Blob([text], {
                                            type: "text/plain;charset=utf-8",
                                        });
                                        const url =
                                            URL.createObjectURL(blob);
                                        const a =
                                            document.createElement("a");
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
                                        } catch (err) {
                                            toastService.error("Compile failed", err instanceof Error ? err.message : String(err));
                                        }
                                    }}
                                />
                            )}
                        </ShellProjectTypeLoader>

                        {/* Left Resize Handle */}
                        {showSidebars && layout.leftOpen ? (
                            <div
                                role="separator"
                                aria-orientation="vertical"
                                onMouseDown={layout.startLeftResize}
                                className="hidden sm:block appshell-resize-handle"
                            />
                        ) : null}

                        {/* Main Work Area */}
                        <main className="appshell-work-area">
                            <div className="appshell-work-area-content p-4 md:p-6">
                                {resources ? (
                                    <div className="w-full">
                                        <div className="workarea-header">
                                            <ViewSwitcher
                                                view={view}
                                                onChange={setView}
                                                disabledViews={(() => {
                                                    const disabled: ViewName[] =
                                                        [];
                                                    if (!selectedResource) {
                                                        disabled.push(
                                                            "edit",
                                                            "diff",
                                                        );
                                                    }
                                                    if (
                                                        selectedResource?.type !==
                                                        "text"
                                                    ) {
                                                        disabled.push(
                                                            "edit",
                                                            "diff",
                                                        );
                                                    }
                                                    return Array.from(
                                                        new Set(disabled),
                                                    );
                                                })()}
                                            />
                                            <div style={{ width: 320 }}>
                                                <SearchBar
                                                    onSelect={(id) =>
                                                        onResourceSelect?.(id)
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                                <div className="max-w-full mx-auto">
                                    <div className="workarea-container">
                                        {/* If a resource is selected, render the chosen view; otherwise render empty state or children. */}
                                        {selectedResource && combined
                                            ? (() => {
                                                  if (!selectedResource)
                                                      return (
                                                          <div>
                                                              <h2 className="workarea-section-title">
                                                                  Work Area
                                                              </h2>
                                                              <p className="mt-2 text-sm text-gw-secondary">
                                                                  Resource not
                                                                  found.
                                                              </p>
                                                          </div>
                                                      );

                                                  switch (view) {
                                                      case "edit":
                                                          if (
                                                              selectedResource.type !==
                                                              "text"
                                                          ) {
                                                              return (
                                                                  <div>
                                                                      <h2 className="text-2xl font-semibold">
                                                                          Work
                                                                          Area
                                                                      </h2>
                                                                      <p className="mt-2 text-sm text-gw-secondary">
                                                                          Selected
                                                                          resource
                                                                          is not
                                                                          a text
                                                                          resource.
                                                                      </p>
                                                                  </div>
                                                              );
                                                          }
                                                          return (
                                                              <EditView
                                                                  onChange={
                                                                      handlerEditorChange
                                                                  }
                                                                  initialContent={getResourceContent(
                                                                      selectedResource,
                                                                  )}
                                                              />
                                                          );
                                                      case "diff":
                                                          return (
                                                              <DiffView
                                                                  leftContent=""
                                                                  rightContent={getResourceContent(
                                                                      selectedResource,
                                                                  )}
                                                              />
                                                          );
                                                      case "organizer":
                                                          return (
                                                              <OrganizerView
                                                                  resources={
                                                                      resources ??
                                                                      []
                                                                  }
                                                              />
                                                          );
                                                      case "data":
                                                          return (
                                                              <DataView
                                                                  resources={
                                                                      resources
                                                                  }
                                                              />
                                                          );
                                                      case "timeline":
                                                          return (
                                                              <TimelineView />
                                                          );
                                                      default:
                                                          return (
                                                              <div>
                                                                  <h2 className="workarea-section-title">
                                                                      Work Area
                                                                  </h2>
                                                              </div>
                                                          );
                                                  }
                                              })()
                                            : project && showSidebars
                                              ? (() => {
                                                    return (
                                                        <section className="mx-auto w-full max-w-4xl rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-6 md:p-8">
                                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                                <div>
                                                                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary">
                                                                        Work
                                                                        Area
                                                                    </p>
                                                                    <h2 className="mt-2 text-3xl font-semibold text-gw-primary">
                                                                        {
                                                                            project.name
                                                                        }
                                                                    </h2>
                                                                    <p className="mt-2 text-sm text-gw-secondary">
                                                                        Select a
                                                                        file
                                                                        from the
                                                                        resource
                                                                        tree, or
                                                                        create a
                                                                        new
                                                                        resource
                                                                        to
                                                                        continue.
                                                                    </p>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setCreateModal(
                                                                            {
                                                                                open: true,
                                                                                initialTitle:
                                                                                    "",
                                                                                parentId:
                                                                                    undefined,
                                                                            },
                                                                        )
                                                                    }
                                                                    className="inline-flex items-center gap-2 rounded-md border border-gw-primary bg-transparent px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-gw-primary hover:bg-gw-chrome2 transition-colors duration-150"
                                                                >
                                                                    <Plus
                                                                        size={
                                                                            14
                                                                        }
                                                                        aria-hidden="true"
                                                                    />
                                                                    Create
                                                                    Resource
                                                                </button>
                                                            </div>

                                                            <div className="mt-8">
                                                                <div className="mb-3 flex items-center justify-between">
                                                                    <h3 className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-gw-secondary">
                                                                        Recent
                                                                        Files
                                                                    </h3>
                                                                    <span className="text-xs text-gw-secondary">
                                                                        {
                                                                            recentResources.length
                                                                        }{" "}
                                                                        shown
                                                                    </span>
                                                                </div>

                                                                {recentResources.length >
                                                                0 ? (
                                                                    <ul className="divide-y divide-gw-border rounded-lg border-[0.5px] border-gw-border bg-gw-chrome">
                                                                        {recentResources.map(
                                                                            (
                                                                                resource,
                                                                            ) => {
                                                                                const icon =
                                                                                    resource.type ===
                                                                                    "image"
                                                                                        ? ImageIcon
                                                                                        : resource.type ===
                                                                                            "audio"
                                                                                          ? Music2
                                                                                          : FileText;

                                                                                const Icon =
                                                                                    icon;

                                                                                return (
                                                                                    <li
                                                                                        key={
                                                                                            resource.id
                                                                                        }
                                                                                    >
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                onResourceSelect?.(
                                                                                                    resource.id,
                                                                                                )
                                                                                            }
                                                                                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gw-chrome2"
                                                                                        >
                                                                                            <span className="flex min-w-0 items-center gap-3">
                                                                                                <Icon
                                                                                                    size={
                                                                                                        16
                                                                                                    }
                                                                                                    className="shrink-0 text-gw-secondary"
                                                                                                    aria-hidden="true"
                                                                                                />
                                                                                                <span className="min-w-0">
                                                                                                    <span className="block truncate text-sm font-medium text-gw-primary">
                                                                                                        {
                                                                                                            resource.name
                                                                                                        }
                                                                                                    </span>
                                                                                                    <span className="block text-xs text-gw-secondary">
                                                                                                        {
                                                                                                            resource.type
                                                                                                        }
                                                                                                    </span>
                                                                                                </span>
                                                                                            </span>
                                                                                            <span className="text-xs text-gw-secondary">
                                                                                                {resource.updatedAt
                                                                                                    ? `Updated ${formatRelativeTimestamp(resource.updatedAt)}`
                                                                                                    : `Created ${formatRelativeTimestamp(resource.createdAt)}`}
                                                                                            </span>
                                                                                        </button>
                                                                                    </li>
                                                                                );
                                                                            },
                                                                        )}
                                                                    </ul>
                                                                ) : (
                                                                    <div className="rounded-lg border border-dashed border-gw-border bg-gw-chrome px-4 py-6 text-sm text-gw-secondary">
                                                                        No files
                                                                        yet. Use{" "}
                                                                        <span className="font-medium text-gw-primary">
                                                                            Create
                                                                            Resource
                                                                        </span>{" "}
                                                                        to add
                                                                        your
                                                                        first
                                                                        text,
                                                                        image,
                                                                        or audio
                                                                        item.
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </section>
                                                    );
                                                })()
                                              : (children ?? (
                                                    <div>
                                                        <h2 className="workarea-section-title">
                                                            Work Area
                                                        </h2>
                                                        <p className="mt-2 text-sm text-gw-secondary">
                                                            Placeholder editor
                                                            and views go here.
                                                        </p>
                                                    </div>
                                                ))}
                                    </div>
                                </div>
                            </div>
                        </main>

                        {/* Right Resize Handle */}
                        {showSidebars && layout.rightOpen ? (
                            <div
                                role="separator"
                                aria-orientation="vertical"
                                onMouseDown={layout.startRightResize}
                                className="hidden lg:block appshell-resize-handle"
                            />
                        ) : null}

                        {/* Right Sidebar */}
                        {showSidebars && layout.rightOpen ? (
                            <aside
                                className="hidden lg:flex appshell-sidebar border-l"
                                style={{ width: layout.rightWidth }}
                            >
                                <div className="appshell-sidebar-header">
                                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] font-semibold text-gw-secondary">
                                        Metadata
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            layout.setRightOpen(false)
                                        }
                                        className="appshell-close-button"
                                        title="Close right sidebar"
                                        aria-label="Close metadata sidebar"
                                    >
                                        <PanelRightClose
                                            size={16}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>
                                <div className="appshell-sidebar-content p-4 pt-3">
                                    <MetadataSidebar
                                        onChangeNotes={(text) =>
                                            selectedResource &&
                                            onChangeNotes?.(
                                                text,
                                                selectedResource.id,
                                            )
                                        }
                                        onChangeStatus={(status) =>
                                            selectedResource &&
                                            onChangeStatus?.(
                                                status as any,
                                                selectedResource.id,
                                            )
                                        }
                                        onChangePOV={(pov) =>
                                            selectedResource &&
                                            onChangePOV?.(
                                                pov,
                                                selectedResource.id,
                                            )
                                        }
                                        onChangeDynamicMetadata={(metadata) =>
                                            selectedResource &&
                                            onChangeDynamicMetadata?.(
                                                metadata,
                                                selectedResource.id,
                                            )
                                        }
                                    />
                                </div>
                            </aside>
                        ) : null}

                        {/* Right Sidebar Collapsed Toggle */}
                        {showSidebars && !layout.rightOpen ? (
                            <div className="hidden lg:flex flex-col items-center justify-start h-full p-2 bg-gw-chrome border-l border-[0.5px] border-gw-border">
                                <button
                                    type="button"
                                    onClick={() => layout.setRightOpen(true)}
                                    className="appshell-sidebar-toggle"
                                    title="Open right sidebar"
                                    aria-label="Open metadata sidebar"
                                >
                                    <PanelRightOpen
                                        size={16}
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                        ) : null}
                    </div>
                )}
            </ShellLayoutController>
        </div>
    );
}
