import React, { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2, Package } from "lucide-react";
import ConfirmDialog from "../common/ConfirmDialog";
import RenameProjectModal from "./RenameProjectModal";
import CompilePreviewModal from "../common/CompilePreviewModal";
import type { AnyResource } from "../../src/lib/models/types";
import {
    deleteProject as deleteProjectInStore,
    renameProject as renameProjectInStore,
    selectProject,
} from "../../src/store/projectsSlice";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import { projectActionsController } from "../../src/store/project-actions-controller";
import { toastService } from "../../src/lib/toast-service";

export interface ManageProjectMenuProps {
    projectId: string;
    projectName?: string;
    onRename?: (projectId: string, newName: string) => void;
    onDelete?: (projectId: string) => void;
    /** Called when the project packaging flow completes. Receives projectId and optional selected resource ids. */
    onPackage?: (projectId: string, selectedIds?: string[]) => void;
    resources?: AnyResource[];
}

/**
 * Callbacks: `onRename`, `onDelete`, and `onPackage`. These are UI signals; actual effects are the caller's responsibility.
 */
export default function ManageProjectMenu({
    projectId,
    projectName = "",
    onRename,
    onDelete,
    onPackage,
    resources = [],
}: ManageProjectMenuProps): JSX.Element {
    const dispatch = useAppDispatch();
    const projectFromStore = useAppSelector((s) => selectProject(s, projectId));
    const [open, setOpen] = useState<boolean>(false);
    const [editing, setEditing] = useState<boolean>(false);
    const [name, setName] = useState<string>(projectName);
    const [renameOpen, setRenameOpen] = useState<boolean>(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
    const [confirmPackageOpen, setConfirmPackageOpen] =
        useState<boolean>(false);
    const [compileOpen, setCompileOpen] = useState<boolean>(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Use mousedown so the listener runs before React's click handlers and
        // before any re-render that might replace menu nodes. This prevents a
        // click inside the menu (that toggles editing) from being considered an
        // outside click after a synchronous DOM update.
        function onDocClick(e: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    useEffect(() => {
        setName(projectName);
    }, [projectName]);

    const handleRenameSave = (): void => {
        const trimmed = name.trim();
        if (!trimmed) return;
        if (onRename) onRename(projectId, trimmed);
        setEditing(false);
        setOpen(false);
        toastService.success("Project renamed", trimmed);
    };

    const handleDeleteConfirm = (): void => {
        void projectActionsController
            .deleteProject({
                projectId,
                projectPath: projectFromStore?.rootPath,
                onDelete,
            })
            .catch((err) => {
                console.error("Failed to delete project:", err);
                toastService.error(
                    "Failed to delete project",
                    "Please try again",
                );
            });

        dispatch(deleteProjectInStore({ projectId }));
        setConfirmDeleteOpen(false);
        setOpen(false);
        toastService.success("Project deleted", projectName);
    };

    const handlePackageConfirm = (): void => {
        // Legacy confirm path: call package without selected ids
        if (onPackage) onPackage(projectId);
        setConfirmPackageOpen(false);
        setOpen(false);
        toastService.info("Package created");
    };

    const handleConfirmCompile = (selectedIds: string[]) => {
        if (onPackage) onPackage(projectId, selectedIds);
        setCompileOpen(false);
        setOpen(false);
        toastService.info(
            `Package created (${selectedIds.length || "all"} resources)`,
        );
    };

    // Implementation notes: `menuRef` ensures outside-click detection. Rename only
    // fires `onRename` when value is non-empty.

    return (
        <div className="relative inline-block" ref={menuRef}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center justify-center px-2 py-1 border border-gw-border rounded text-sm text-gw-secondary hover:border-gw-border-md hover:text-gw-primary transition-colors duration-150"
            >
                <MoreHorizontal size={16} aria-hidden="true" />
            </button>

            {open ? (
                <div
                    role="menu"
                    aria-label="Manage project"
                    className="absolute right-0 mt-2 w-56 bg-gw-chrome border border-gw-border rounded z-20"
                >
                    <div className="p-2">
                        <>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => setRenameOpen(true)}
                                className="w-full text-left flex items-center gap-2 px-2 py-2 text-sm text-gw-secondary hover:bg-gw-chrome2 hover:text-gw-primary rounded transition-colors duration-150"
                            >
                                <Pencil size={14} aria-hidden="true" />
                                Rename
                            </button>

                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => setConfirmDeleteOpen(true)}
                                className="w-full text-left flex items-center gap-2 px-2 py-2 text-sm text-gw-red hover:bg-gw-chrome2 rounded transition-colors duration-150"
                            >
                                <Trash2 size={14} aria-hidden="true" />
                                Delete
                            </button>

                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => setCompileOpen(true)}
                                className="w-full text-left flex items-center gap-2 px-2 py-2 text-sm text-gw-secondary hover:bg-gw-chrome2 hover:text-gw-primary rounded transition-colors duration-150"
                            >
                                <Package size={14} aria-hidden="true" />
                                Package
                            </button>
                        </>
                    </div>
                </div>
            ) : null}

            <ConfirmDialog
                isOpen={confirmDeleteOpen}
                title="Delete project"
                description="This will permanently remove the project and its resources. Are you sure?"
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={handleDeleteConfirm}
                onCancel={() => setConfirmDeleteOpen(false)}
            />

            <ConfirmDialog
                isOpen={confirmPackageOpen}
                title="Package project"
                description="Create a downloadable package of this project (placeholder). Proceed?"
                confirmLabel="Package"
                cancelLabel="Cancel"
                onConfirm={handlePackageConfirm}
                onCancel={() => setConfirmPackageOpen(false)}
            />

            <CompilePreviewModal
                isOpen={compileOpen}
                projectId={projectId}
                resources={resources}
                onClose={() => setCompileOpen(false)}
                onConfirmCompile={handleConfirmCompile}
            />

            <RenameProjectModal
                isOpen={renameOpen}
                initialName={name}
                onClose={() => setRenameOpen(false)}
                onConfirm={async (newName) => {
                    await projectActionsController.renameProject({
                        projectId,
                        projectPath: projectFromStore?.rootPath,
                        newName,
                        onRename,
                    });
                    dispatch(renameProjectInStore({ projectId, newName }));
                    setName(newName);
                    setRenameOpen(false);
                    setOpen(false);
                }}
            />
        </div>
    );
}
