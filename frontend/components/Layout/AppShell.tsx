"use client";
import React, { useState, useRef, useEffect } from "react";
import type {
    AnyResource,
    ViewName,
    Project as CanonicalProject,
    ResourceType,
    Folder,
} from "../../src/lib/models/types";
import { buildProjectView } from "../../src/lib/models/project-view";
import { useDispatch } from "react-redux";
import {
    persistReorder,
    setProject,
    addResource,
    removeResource,
} from "../../src/store/projectsSlice";
import type { AppDispatch } from "../../src/store/store";
import ResourceTree from "../Tree/ResourceTree";
import ConfirmDialog from "../common/ConfirmDialog";
import CreateResourceModal from "../Tree/CreateResourceModal";
import ExportPreviewModal from "../common/ExportPreviewModal";
import CompilePreviewModal from "../common/CompilePreviewModal";
import type { ResourceContextAction } from "../Tree/ResourceContextMenu";
import ViewSwitcher from "../WorkArea/ViewSwitcher";
import EditView from "../WorkArea/EditView";
import DiffView from "../WorkArea/DiffView";
import OrganizerView from "../WorkArea/OrganizerView";
import DataView from "../WorkArea/DataView";
import TimelineView from "../WorkArea/TimelineView";
import MetadataSidebar from "../Sidebar/MetadataSidebar";
import SearchBar from "./SearchBar";

/**
 * Simple three-column shell used in the app and Storybook:
 * - Left: Projects/Resource tree placeholder
 * - Center: Work area for views and editor
 * - Right: Metadata sidebar placeholder
 *
 * Designed for visual layout only; integrate `ResourceTree` and `MetadataSidebar` in later tasks.
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
}: {
    children?: React.ReactNode;
    showSidebars?: boolean;
    resources?: AnyResource[];
    folders?: Folder[];
    project?: CanonicalProject | null;

    onResourceSelect?: (id: string) => void;
    selectedResourceId?: string | null;
    onChangeNotes?: (text: string, resourceId: string) => void;
    onChangeStatus?: (
        status: "draft" | "in-review" | "published",
        resourceId: string,
    ) => void;
    onChangeCharacters?: (chars: string[], resourceId: string) => void;
    onChangeLocations?: (locs: string[], resourceId: string) => void;
    onChangeItems?: (items: string[], resourceId: string) => void;
    onChangePOV?: (pov: string | null, resourceId: string) => void;
    onResourceAction?: (
        action: ResourceContextAction,
        resourceId?: string,
        opts?: { [key: string]: any },
    ) => Promise<void>;
}): JSX.Element {
    // Read the callback from the raw arguments to avoid name-resolution
    // issues during the incremental migration. Typed explicitly to match
    // the expected shape so downstream call sites remain typed.
    type OnResAction =
        | ((
              action: ResourceContextAction,
              resourceId?: string,
              opts?: { [key: string]: any },
          ) => Promise<void>)
        | undefined;
    const propOnResourceAction = (arguments as any)[0]?.onResourceAction as
        | OnResAction
        | undefined;
    const [view, setView] = useState<ViewName>("edit");
    const [leftWidth, setLeftWidth] = useState<number>(280);
    const [rightWidth, setRightWidth] = useState<number>(320);

    const draggingRef = useRef<null | {
        side: "left" | "right";
        startX: number;
        startWidth: number;
    }>(null);
    const combined = React.useMemo(() => {
        return [...(resources ?? []), ...(folders ?? [])];
    }, [resources, folders]);
    console.log({ combined });

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const d = draggingRef.current;
            if (!d) return;
            const deltaX = e.clientX - d.startX;
            const min = 160;
            const max = 800;
            if (d.side === "left") {
                const next = Math.min(
                    max,
                    Math.max(min, d.startWidth + deltaX),
                );
                setLeftWidth(next);
            } else {
                const next = Math.min(
                    max,
                    Math.max(min, d.startWidth - deltaX),
                );
                setRightWidth(next);
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
    const selectedResource =
        selectedResourceId && resources
            ? resources.find((r) => r.id === selectedResourceId)
            : undefined;

    const getResourceName = (r: AnyResource | any) =>
        (r && ((r as any).name ?? (r as any).title ?? "")) || "";

    const getResourceContent = (r: AnyResource | any) => r.plaintext;
    // const getResourceContent = (r: AnyResource | any) => {
    //     console.log(r);
    // };

    const [contextAction, setContextAction] = useState<{
        open: boolean;
        action?: ResourceContextAction;
        resourceId?: string;
        resourceTitle?: string;
    }>({ open: false });

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

    const [createModal, setCreateModal] = useState<{
        open: boolean;
        parentId?: string;
        initialTitle?: string;
    }>({ open: false });
    const [exportModal, setExportModal] = useState<{
        open: boolean;
        resourceId?: string;
        resourceTitle?: string;
        preview?: string;
    }>({ open: false });
    const [compileModal, setCompileModal] = useState<{
        open: boolean;
        resourceId?: string;
        preview?: string;
    }>({ open: false });

    const handleCreateConfirmed = async (
        payload: {
            title: string;
            type: ResourceType | string;
            folderId?: string;
        },
        parentId?: string,
    ) => {
        // forward to page-level handler to mutate project resources
        await propOnResourceAction?.("create", parentId, payload);
        setCreateModal({ open: false });
    };

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

    const handlePersistReorder = (nextIds: string[] | undefined) => {
        if (!nextIds || !project) return;
        const pos = new Map<string, number>();
        nextIds.forEach((id, i) => pos.set(id, i));

        const folderOrder =
            (project as any).folders?.map((f: any) => ({
                id: f.id,
                orderIndex: pos.has(f.id) ? pos.get(f.id) : (f.orderIndex ?? 0),
            })) ?? [];

        const resourceOrder =
            (project as any).resources?.map((r: any) => ({
                id: r.id,
                orderIndex: pos.has(r.id)
                    ? pos.get(r.id)
                    : (r.metadata?.orderIndex ?? 0),
            })) ?? [];

        const existingFolders: any[] = (project as any).folders ?? [];
        const existingResources: any[] = (project as any).resources ?? [];

        const folderChanged = folderOrder.some((fo: any) => {
            const ex = existingFolders.find((f) => f.id === fo.id);
            if (!ex) return false;
            return (ex.orderIndex ?? 0) !== (fo.orderIndex ?? 0);
        });

        const resourceChanged = resourceOrder.some((ro: any) => {
            const ex = existingResources.find((r) => r.id === ro.id);
            if (!ex) return false;
            const exIdx = ex.metadata?.orderIndex ?? 0;
            return exIdx !== (ro.orderIndex ?? 0);
        });

        if (!folderChanged && !resourceChanged) return;

        const optimisticFolders = existingFolders.map((f) => ({
            ...f,
            orderIndex:
                (folderOrder.find((x: any) => x.id === f.id) as any)
                    ?.orderIndex ??
                f.orderIndex ??
                0,
        }));

        const optimisticResources = existingResources.map((r) => ({
            ...r,
            metadata: {
                ...(r.metadata ?? {}),
                orderIndex:
                    (resourceOrder.find((x: any) => x.id === r.id) as any)
                        ?.orderIndex ??
                    r.metadata?.orderIndex ??
                    0,
            },
        }));

        dispatch(
            setProject({
                id: project.id,
                name: project.name,
                folders: optimisticFolders,
                resources: optimisticResources,
            }),
        );

        dispatch(
            persistReorder({
                projectId: project.id,
                folderOrder,
                resourceOrder,
            }),
        );
    };

    return (
        <div className="min-h-screen flex bg-slate-50 text-slate-900">
            {showSidebars ? (
                <aside
                    className="hidden sm:block bg-white border-r p-4"
                    style={{ width: leftWidth }}
                >
                    <div className="mt-0">
                        {project ? (
                            <ResourceTree
                                projectId={project.id}
                                selectedId={selectedResourceId ?? undefined}
                                onSelect={onResourceSelect}
                                onResourceAction={handleResourceAction}
                                reorderable={true}
                                onReorder={(ids) => {
                                    // persist ordering when adapter view is present
                                    handlePersistReorder(ids);
                                }}
                            />
                        ) : (
                            <div className="space-y-2">
                                <p>Loading Resource Tree</p>
                            </div>
                        )}
                    </div>
                </aside>
            ) : null}

            <ConfirmDialog
                isOpen={contextAction.open && contextAction.action === "delete"}
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

            {/* Left resize handle */}
            {showSidebars ? (
                <div
                    className="hidden sm:flex items-stretch"
                    style={{ alignSelf: "stretch" }}
                >
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
                        className="w-2 -ml-2 cursor-col-resize hover:bg-slate-200"
                    />
                </div>
            ) : null}

            <main className="flex-1 p-4 md:p-6">
                {resources ? (
                    <div className="w-full">
                        <div className="w-full mb-4 flex items-center justify-between gap-4">
                            <ViewSwitcher
                                view={view}
                                onChange={setView}
                                disabledViews={
                                    selectedResourceId ? [] : ["edit", "diff"]
                                }
                            />
                            <div style={{ width: 320 }}>
                                <SearchBar
                                    resources={resources}
                                    onSelect={(id) => onResourceSelect?.(id)}
                                />
                            </div>
                        </div>
                        {(() => {
                            const selected = combined.find(
                                (r) => r.id === selectedResourceId,
                            );

                            if (selected) {
                                return (
                                    <div className="text-lg font-bold">
                                        {selected.name}
                                    </div>
                                );
                            }
                        })()}
                    </div>
                ) : null}
                <div className="max-w-7xl mx-auto">
                    <div className="bg-white rounded-xl shadow-sm p-6 min-h-[400px]">
                        {/* If a resource is selected, render the chosen view; otherwise render children (StartPage or prompt) */}
                        {selectedResourceId && combined
                            ? (() => {
                                  const selected = combined.find(
                                      (r) => r.id === selectedResourceId,
                                  );
                                  console.log(selected);
                                  if (!selected)
                                      return (
                                          <div>
                                              <h2 className="text-2xl font-semibold">
                                                  Work Area
                                              </h2>
                                              <p className="mt-2 text-sm text-slate-600">
                                                  Resource not found.
                                              </p>
                                          </div>
                                      );

                                  switch (view) {
                                      case "edit":
                                          return (
                                              <EditView
                                                  initialContent={getResourceContent(
                                                      selected,
                                                  )}
                                              />
                                          );
                                      case "diff":
                                          return (
                                              <DiffView
                                                  leftContent=""
                                                  rightContent={getResourceContent(
                                                      selected,
                                                  )}
                                              />
                                          );
                                      case "organizer":
                                          return (
                                              <OrganizerView
                                                  resources={resources}
                                              />
                                          );
                                      case "data":
                                          return (
                                              <DataView resources={resources} />
                                          );
                                      case "timeline":
                                          return (
                                              <TimelineView
                                                  project={undefined}
                                              />
                                          );
                                      default:
                                          return (
                                              <div>
                                                  <h2 className="text-2xl font-semibold">
                                                      Work Area
                                                  </h2>
                                              </div>
                                          );
                                  }
                              })()
                            : (children ?? (
                                  <div>
                                      <h2 className="text-2xl font-semibold">
                                          Work Area
                                      </h2>
                                      <p className="mt-2 text-sm text-slate-600">
                                          Placeholder editor and views go here.
                                      </p>
                                  </div>
                              ))}
                    </div>
                </div>
            </main>

            {showSidebars ? (
                <>
                    {/* Right resize handle */}
                    <div
                        className="hidden lg:flex items-stretch"
                        style={{ alignSelf: "stretch" }}
                    >
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
                            className="w-2 -mr-2 cursor-col-resize hover:bg-slate-200"
                        />
                    </div>

                    <aside
                        className="hidden lg:block bg-white border-l p-4"
                        style={{ width: rightWidth }}
                    >
                        <MetadataSidebar
                            resource={selectedResource}
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
                                onChangeCharacters?.(chars, selectedResource.id)
                            }
                            onChangeLocations={(locs) =>
                                selectedResource &&
                                onChangeLocations?.(locs, selectedResource.id)
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
                    </aside>
                </>
            ) : null}
        </div>
    );
}
