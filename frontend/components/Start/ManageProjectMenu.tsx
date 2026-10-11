import React, { useState, useEffect } from "react";
import { MoreHorizontal, Pencil, Trash2, Package } from "lucide-react";
import ConfirmDialog from "../common/ConfirmDialog";
import RenameProjectModal from "./RenameProjectModal";
import MenuItemButton from "../common/MenuItemButton";
import {
  deleteProject as deleteProjectInStore,
  getProjectDirectoryId,
  renameProject as renameProjectInStore,
  selectProject,
} from "../../src/store/projectsSlice";
import { useAppDispatch, useAppSelector } from "../../src/store/hooks";
import { projectActionsController } from "../../src/store/project-actions-controller";
import { toastService } from "../../src/lib/toast-service";
import useDismissableMenu from "../common/UI/hooks/useDismissableMenu";
import Button from "../common/UI/Button";
import { useSharingLimits } from "../Sharing/SharingLimitsContext";
import { isLimitOn } from "../Sharing/limit-gate";
import LimitReason from "../Sharing/LimitReason";
import {
  PROJECT_DELETING_LABEL,
  PROJECT_DELETION_LIMITED_REASON,
  PROJECT_NOT_DELETED,
} from "../Sharing/sharing-copy";
import { isLimitRefusalError } from "../../src/lib/api/limit-refusal";

export interface ManageProjectMenuProps {
  projectId: string;
  projectName?: string;
  onRename?: (projectId: string, newName: string) => void;
  onDelete?: (projectId: string) => void;
  /** Called when the project packaging flow completes. Receives projectId and optional selected resource ids. */
  onPackage?: (projectId: string, selectedIds?: string[]) => void;
  /** Called when the user triggers the compile/package flow. The modal is rendered by the caller. */
  onRequestCompile?: () => void;
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
  onRequestCompile,
}: ManageProjectMenuProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { state: limitsState, refresh: refreshLimits } = useSharingLimits();
  const isDeleteLimited = isLimitOn(limitsState, "projectDeletion");
  const deleteReasonId = `project-delete-limit-${projectId}`;
  const projectFromStore = useAppSelector((s) => selectProject(s, projectId));
  // ManageProjectMenu renders one row per project in a list (see StartPage),
  // not necessarily the active project — so the tenant-scoped `projectId`
  // sent to project routes must come from this record's own `rootPath` via
  // `getProjectDirectoryId`, not `selectActiveProjectDirectoryId` (FR12: the
  // on-disk directory basename and `project.json`'s internal `id` are
  // distinct, independently generated UUIDs).
  const directoryProjectId = projectFromStore?.rootPath
    ? getProjectDirectoryId(projectFromStore.rootPath)
    : undefined;
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [name, setName] = useState<string>(projectName);
  const [isRenameOpen, setIsRenameOpen] = useState<boolean>(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] =
    useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
  const { containerRef: menuRef } = useDismissableMenu({
    isOpen,
    onClose: () => setIsOpen(false),
  });

  useEffect(() => {
    setName(projectName);
  }, [projectName]);

  // Feature 77 FR-25: the server answers before anything is removed from the
  // list, the store or the dialog, for every caller. A second confirm while
  // the request is pending is ignored.
  const handleDeleteConfirm = async (): Promise<void> => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteFailure(null);
    try {
      await projectActionsController.deleteProject({
        storeProjectId: projectId,
        projectId: directoryProjectId,
        onDelete,
      });
    } catch (err) {
      console.error("Failed to delete project:", err);
      if (isLimitRefusalError(err)) void refreshLimits();
      setDeleteFailure(
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : "Failed to delete project.",
      );
      setIsDeleting(false);
      return;
    }
    dispatch(deleteProjectInStore({ projectId }));
    setIsDeleting(false);
    setIsConfirmDeleteOpen(false);
    setIsOpen(false);
    toastService.success("Project deleted", projectName);
  };

  const closeDeleteDialog = (): void => {
    if (isDeleting) return;
    setDeleteFailure(null);
    setIsConfirmDeleteOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* One of these renders per project row, so the accessible name has to
          say WHICH project it manages: a bare "Manage project" leaves a
          screen-reader user with a list of identical buttons. */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={projectName ? `Manage ${projectName}` : "Manage project"}
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center justify-center px-2 py-1 border border-gw-border text-sm text-gw-secondary hover:border-gw-border-md hover:text-gw-primary transition-colors duration-150"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Manage project"
          className="absolute right-0 mt-2 w-56 bg-gw-chrome border border-gw-border rounded z-20"
        >
          <div className="p-2">
            <MenuItemButton
              icon={<Pencil size={14} aria-hidden="true" />}
              label="Rename"
              onClick={() => setIsRenameOpen(true)}
            />

            <MenuItemButton
              icon={<Package size={14} aria-hidden="true" />}
              label="Package"
              onClick={() => {
                setIsOpen(false);
                onRequestCompile?.();
              }}
            />

            <MenuItemButton
              icon={<Trash2 size={14} aria-hidden="true" />}
              label="Delete"
              danger
              disabled={isDeleteLimited}
              aria-describedby={isDeleteLimited ? deleteReasonId : undefined}
              onClick={() => {
                setDeleteFailure(null);
                setIsConfirmDeleteOpen(true);
              }}
            />
            {isDeleteLimited ? (
              <LimitReason id={deleteReasonId}>
                {PROJECT_DELETION_LIMITED_REASON}
              </LimitReason>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title="Delete project"
        description="This will permanently remove the project and its resources. Are you sure?"
        details={
          deleteFailure ? (
            <p className="text-sm text-gw-secondary">
              {PROJECT_NOT_DELETED} {deleteFailure}
            </p>
          ) : undefined
        }
        confirmLabel={isDeleting ? PROJECT_DELETING_LABEL : "Delete"}
        cancelLabel="Cancel"
        isConfirmDisabled={isDeleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={closeDeleteDialog}
      />

      <RenameProjectModal
        isOpen={isRenameOpen}
        initialName={name}
        onClose={() => setIsRenameOpen(false)}
        onConfirm={async (newName) => {
          await projectActionsController.renameProject({
            storeProjectId: projectId,
            projectId: directoryProjectId,
            newName,
            onRename,
          });
          dispatch(renameProjectInStore({ projectId, newName }));
          setName(newName);
          setIsRenameOpen(false);
          setIsOpen(false);
        }}
      />
    </div>
  );
}
