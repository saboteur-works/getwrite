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
import { shallowEqual, useDispatch } from "react-redux";
import { setProject, removeResource } from "../../src/store/projectsSlice";
import type { AppDispatch } from "../../src/store/store";
import ResourceTree from "../ResourceTree/ResourceTree";
import ConfirmDialog from "../common/ConfirmDialog";
import CreateResourceModal from "../Tree/CreateResourceModal";
import ExportPreviewModal from "../common/ExportPreviewModal";
import CompilePreviewModal from "../common/CompilePreviewModal";
import type { ResourceContextAction } from "../Tree/ResourceContextMenu";
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
    Moon,
    Sun,
    Settings,
    SlidersHorizontal,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
} from "lucide-react";
import { useRouter } from "next/navigation";
import useAppSelector from "../../src/store/hooks";
import { selectResource } from "../../src/store/resourcesSlice";

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
    /** Metadata callback for character associations. */
    onChangeCharacters?: (chars: string[], resourceId: string) => void;
    /** Metadata callback for location associations. */
    onChangeLocations?: (locs: string[], resourceId: string) => void;
    /** Metadata callback for item associations. */
    onChangeItems?: (items: string[], resourceId: string) => void;
    /** Metadata callback for point-of-view updates. */
    onChangePOV?: (pov: string | null, resourceId: string) => void;
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
    onChangeCharacters,
    onChangeLocations,
    onChangeItems,
    onChangePOV,
    onResourceAction,
    project,
}: AppShellProps): JSX.Element {
    // Read the callback from the raw arguments to avoid name-resolution
    // issues during the incremental migration. Typed explicitly to match
    // the expected shape so downstream call sites remain typed.
    type OnResAction =
        | ((
              action: ResourceContextAction,
              resourceId?: string,
              opts?: AppShellResourceActionOptions,
          ) => Promise<void>)
        | undefined;
    const propOnResourceAction = (arguments as any)[0]?.onResourceAction as
        | OnResAction
        | undefined;
    const [view, setView] = useState<ViewName>("edit");
    const [leftWidth, setLeftWidth] = useState<number>(280);
    const [rightWidth, setRightWidth] = useState<number>(320);
    const [leftOpen, setLeftOpen] = useState<boolean>(true);
    const [rightOpen, setRightOpen] = useState<boolean>(true);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] =
        useState<boolean>(false);
    const [colorMode, setColorMode] = useState<"light" | "dark">("light");
    const settingsMenuRef = useRef<HTMLDivElement | null>(null);
    const COLOR_MODE_STORAGE_KEY = "getwrite-color-mode";

    const MIN_SIDEBAR_WIDTH = 160;
    const COLLAPSE_THRESHOLD = 120;

    const draggingRef = useRef<null | {
        side: "left" | "right";
        startX: number;
        startWidth: number;
    }>(null);
    const combined = React.useMemo(() => {
        return [...(resources ?? []), ...(folders ?? [])];
    }, [resources, folders]);
    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const d = draggingRef.current;
            if (!d) return;
            const deltaX = e.clientX - d.startX;
            const maxWidth = 800;

            if (d.side === "left") {
                const next = d.startWidth + deltaX;
                // If dragged left past collapse threshold, close the sidebar
                if (next < COLLAPSE_THRESHOLD) {
                    setLeftOpen(false);
                } else {
                    setLeftOpen(true);
                    setLeftWidth(
                        Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, next)),
                    );
                }
            } else {
                const next = d.startWidth - deltaX;
                // If dragged right past collapse threshold, close the sidebar
                if (next < COLLAPSE_THRESHOLD) {
                    setRightOpen(false);
                } else {
                    setRightOpen(true);
                    setRightWidth(
                        Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, next)),
                    );
                }
            }
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
        };

        const onMouseUp = () => {
            draggingRef.current = null;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
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
        await propOnResourceAction?.(action, resourceId);
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
        await propOnResourceAction?.("create", parentId, payload);
        setCreateModal({ open: false });
    };

    /**
     * Handles export preview confirmation and forwards export action upstream.
     *
     * @param resourceId - Optional resource id to export; when omitted exports project context.
     */
    const handleExportConfirmed = async (resourceId?: string) => {
        await propOnResourceAction?.("export", resourceId);
        setExportModal({ open: false });
    };

    const _prevProjectId = React.useRef<string | undefined | null>(undefined);
    useEffect(() => {
        if (_prevProjectId.current !== project?.id) {
            _prevProjectId.current = project?.id;
        }
    }, [project?.id]);
    const dispatch = useDispatch<AppDispatch>();

    /**
     * Persists editor content to resource API using debounced transport.
     *
     * Guard clauses ensure this only runs for open projects with selected
     * resources and known `rootPath`.
     *
     * @param content - Current plain-text editor content (reserved for parity/logging).
     * @param doc - Current TipTap document snapshot to persist.
     */
    const persistContent = (content: string, doc: TipTapDocument) => {
        if (!project || !selectedResourceId) return;
        if (!project.rootPath) return;
        console.log("Persisting content for", selectedResourceId);
        fetch(`/api/resource/${selectedResourceId}/content`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                projectPath: project.rootPath,
                doc,
            }),
        }).catch((err) => {
            console.error("Failed to persist content:", err);
        });
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
        debouncedPersistContent(content, doc);
    };

    useEffect(() => {
        return () => {
            debouncedPersistContent.cancel(); // Cancel any pending debounced calls
        };
    }, [debouncedPersistContent]);

    useEffect(() => {
        const onDocumentMouseDown = (event: MouseEvent) => {
            if (!settingsMenuRef.current) return;
            if (settingsMenuRef.current.contains(event.target as Node)) return;
            setIsSettingsMenuOpen(false);
        };

        const onDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsSettingsMenuOpen(false);
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
        try {
            const storedMode = window.localStorage.getItem(
                COLOR_MODE_STORAGE_KEY,
            );
            if (storedMode === "dark" || storedMode === "light") {
                setColorMode(storedMode);
                return;
            }

            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches;
            setColorMode(prefersDark ? "dark" : "light");
        } catch {
            setColorMode("light");
        }
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
        } catch {
            // ignore localStorage failures in constrained environments
        }
    }, [colorMode]);

    const isDarkMode = colorMode === "dark";
    const router = useRouter();
    const handleToggleColorMode = () => {
        setColorMode((previous) => (previous === "dark" ? "light" : "dark"));
    };

    const handleOpenProjectTypeManager = (): void => {
        setIsSettingsMenuOpen(false);
        router.push("/project-types");
    };

    return (
        <div
            className={`appshell-shell ${isDarkMode ? "appshell-theme-dark" : ""}`}
        >
            <header className="appshell-topbar">
                <div
                    className="appshell-topbar-project"
                    title={project?.name ?? "Untitled Project"}
                >
                    {project?.name ?? "Untitled Project"}
                </div>

                <div className="appshell-topbar-menu" ref={settingsMenuRef}>
                    <button
                        type="button"
                        className="appshell-topbar-button"
                        aria-haspopup="menu"
                        aria-expanded={isSettingsMenuOpen}
                        aria-label="Open project settings menu"
                        onClick={() => setIsSettingsMenuOpen((prev) => !prev)}
                    >
                        <Settings size={18} aria-hidden="true" />
                    </button>

                    {isSettingsMenuOpen ? (
                        <div
                            className="appshell-topbar-dropdown"
                            role="menu"
                            aria-label="Project settings menu"
                        >
                            <button
                                type="button"
                                className="appshell-topbar-dropdown-item"
                                role="menuitem"
                                onClick={handleOpenProjectTypeManager}
                            >
                                <SlidersHorizontal
                                    size={14}
                                    aria-hidden="true"
                                />
                                Project Type Manager
                            </button>
                            <button
                                type="button"
                                className="appshell-topbar-dropdown-item"
                                role="menuitemcheckbox"
                                aria-checked={isDarkMode}
                                aria-pressed={isDarkMode}
                                onClick={handleToggleColorMode}
                            >
                                {isDarkMode ? (
                                    <Sun size={14} aria-hidden="true" />
                                ) : (
                                    <Moon size={14} aria-hidden="true" />
                                )}
                                {isDarkMode
                                    ? "Switch to light mode"
                                    : "Switch to dark mode"}
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>

            <div className="appshell-body">
                {/* Left Sidebar */}
                {showSidebars && leftOpen ? (
                    <aside
                        className="hidden sm:flex appshell-sidebar border-r"
                        style={{ width: leftWidth }}
                    >
                        <div className="appshell-sidebar-header">
                            <span className="text-xs uppercase tracking-widest font-semibold text-slate-700">
                                Resources
                            </span>
                            <button
                                type="button"
                                onClick={() => setLeftOpen(false)}
                                className="appshell-close-button"
                                title="Close left sidebar"
                                aria-label="Close resource sidebar"
                            >
                                <PanelLeftClose size={16} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="appshell-sidebar-content p-4 pt-3">
                            {project ? (
                                <ResourceTree
                                    debug={false}
                                    onResourceAction={handleResourceAction}
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
                {showSidebars && !leftOpen ? (
                    <div className="hidden sm:flex flex-col items-center justify-start h-full p-2 bg-white border-r">
                        <button
                            type="button"
                            onClick={() => setLeftOpen(true)}
                            className="appshell-sidebar-toggle"
                            title="Open left sidebar"
                            aria-label="Open resource sidebar"
                        >
                            <PanelLeftOpen size={16} aria-hidden="true" />
                        </button>
                    </div>
                ) : null}

                <ConfirmDialog
                    isOpen={
                        contextAction.open && contextAction.action === "delete"
                    }
                    title={
                        contextAction.resourceTitle
                            ? `Delete ${contextAction.resourceTitle}`
                            : "Delete resource"
                    }
                    description={
                        "This will remove the resource from the project UI (placeholder). Proceed?"
                    }
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    onConfirm={async () => {
                        if (contextAction.resourceId) {
                            // dispatch removeResource optimistically in store
                            if (project) {
                                dispatch(
                                    removeResource({
                                        projectId: project.id,
                                        resourceId: contextAction.resourceId,
                                    }),
                                );
                            }
                            await propOnResourceAction?.(
                                "delete",
                                contextAction.resourceId,
                            );
                        }
                        setContextAction({ open: false });
                    }}
                    onCancel={() => setContextAction({ open: false })}
                />

                <CreateResourceModal
                    isOpen={createModal.open}
                    initialTitle={createModal.initialTitle}
                    parentId={createModal.parentId}
                    onClose={() => setCreateModal({ open: false })}
                    onCreate={(payload, parentId, opts) =>
                        handleCreateConfirmed(payload, parentId, opts)
                    }
                    parents={folders ?? []}
                />

                <ExportPreviewModal
                    isOpen={exportModal.open}
                    resourceTitle={exportModal.resourceTitle}
                    preview={exportModal.preview}
                    onClose={() => setExportModal({ open: false })}
                    onConfirmExport={() =>
                        handleExportConfirmed(exportModal.resourceId)
                    }
                    onShowCompile={() => {
                        // generate a simple compiled preview from resources
                        const r = exportModal.resourceId
                            ? resources?.find(
                                  (x) => x.id === exportModal.resourceId,
                              )
                            : undefined;
                        const preview = r
                            ? `Compiled package for ${getResourceName(r)}\n\n` +
                              JSON.stringify(r, null, 2)
                            : `Compiled project bundle\n\n` +
                              JSON.stringify(resources ?? [], null, 2);
                        setCompileModal({
                            open: true,
                            resourceId: exportModal.resourceId,
                            preview,
                        });
                    }}
                />

                <CompilePreviewModal
                    isOpen={compileModal.open}
                    resource={
                        compileModal.resourceId
                            ? resources?.find(
                                  (r) => r.id === compileModal.resourceId,
                              )
                            : undefined
                    }
                    resources={resources}
                    projectId={project?.id}
                    preview={compileModal.preview}
                    onClose={() => setCompileModal({ open: false })}
                    onConfirm={() => {
                        // forward as export confirm action for now
                        if (compileModal.resourceId)
                            propOnResourceAction?.(
                                "export",
                                compileModal.resourceId,
                            );
                        setCompileModal({ open: false });
                    }}
                />

                {/* Left Resize Handle */}
                {showSidebars && leftOpen ? (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        onMouseDown={(e) => {
                            draggingRef.current = {
                                side: "left",
                                startX: e.clientX,
                                startWidth: leftWidth,
                            };
                        }}
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
                                            const disabled: ViewName[] = [];
                                            if (!selectedResource) {
                                                disabled.push("edit", "diff");
                                            }
                                            if (
                                                selectedResource?.type !==
                                                "text"
                                            ) {
                                                disabled.push("edit", "diff");
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
                                {(() => {
                                    const selected = selectedResource;

                                    if (selected) {
                                        return (
                                            <div className="text-lg font-bold mb-4">
                                                {selected.name}
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        ) : null}
                        <div className="max-w-full mx-auto">
                            <div className="workarea-container">
                                {/* If a resource is selected, render the chosen view; otherwise render children (StartPage or prompt) */}
                                {selectedResource && combined
                                    ? (() => {
                                          if (!selectedResource)
                                              return (
                                                  <div>
                                                      <h2 className="workarea-section-title">
                                                          Work Area
                                                      </h2>
                                                      <p className="mt-2 text-sm text-slate-600">
                                                          Resource not found.
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
                                                                  Work Area
                                                              </h2>
                                                              <p className="mt-2 text-sm text-slate-600">
                                                                  Selected
                                                                  resource is
                                                                  not a text
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
                                                              resources ?? []
                                                          }
                                                      />
                                                  );
                                              case "data":
                                                  return (
                                                      <DataView
                                                          resources={resources}
                                                      />
                                                  );
                                              case "timeline":
                                                  return <TimelineView />;
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
                                    : (children ?? (
                                          <div>
                                              <h2 className="workarea-section-title">
                                                  Work Area
                                              </h2>
                                              <p className="mt-2 text-sm text-slate-600">
                                                  Placeholder editor and views
                                                  go here.
                                              </p>
                                          </div>
                                      ))}
                            </div>
                        </div>
                    </div>
                </main>

                {/* Right Resize Handle */}
                {showSidebars && rightOpen ? (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        onMouseDown={(e) => {
                            draggingRef.current = {
                                side: "right",
                                startX: e.clientX,
                                startWidth: rightWidth,
                            };
                        }}
                        className="hidden lg:block appshell-resize-handle"
                    />
                ) : null}

                {/* Right Sidebar */}
                {showSidebars && rightOpen ? (
                    <aside
                        className="hidden lg:flex appshell-sidebar border-l"
                        style={{ width: rightWidth }}
                    >
                        <div className="appshell-sidebar-header">
                            <span className="text-xs uppercase tracking-widest font-semibold text-slate-700">
                                Metadata
                            </span>
                            <button
                                type="button"
                                onClick={() => setRightOpen(false)}
                                className="appshell-close-button"
                                title="Close right sidebar"
                                aria-label="Close metadata sidebar"
                            >
                                <PanelRightClose size={16} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="appshell-sidebar-content p-4 pt-3">
                            <MetadataSidebar
                                onChangeNotes={(text) =>
                                    selectedResource &&
                                    onChangeNotes?.(text, selectedResource.id)
                                }
                                onChangeStatus={(status) =>
                                    selectedResource &&
                                    onChangeStatus?.(
                                        status as any,
                                        selectedResource.id,
                                    )
                                }
                                onChangeCharacters={(chars) =>
                                    selectedResource &&
                                    onChangeCharacters?.(
                                        chars,
                                        selectedResource.id,
                                    )
                                }
                                onChangeLocations={(locs) =>
                                    selectedResource &&
                                    onChangeLocations?.(
                                        locs,
                                        selectedResource.id,
                                    )
                                }
                                onChangeItems={(items) =>
                                    selectedResource &&
                                    onChangeItems?.(items, selectedResource.id)
                                }
                                onChangePOV={(pov) =>
                                    selectedResource &&
                                    onChangePOV?.(pov, selectedResource.id)
                                }
                            />
                        </div>
                    </aside>
                ) : null}

                {/* Right Sidebar Collapsed Toggle */}
                {showSidebars && !rightOpen ? (
                    <div className="hidden lg:flex flex-col items-center justify-start h-full p-2 bg-white border-l">
                        <button
                            type="button"
                            onClick={() => setRightOpen(true)}
                            className="appshell-sidebar-toggle"
                            title="Open right sidebar"
                            aria-label="Open metadata sidebar"
                        >
                            <PanelRightOpen size={16} aria-hidden="true" />
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
