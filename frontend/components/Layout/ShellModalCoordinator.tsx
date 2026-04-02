"use client";

import React from "react";
import type {
    AnyResource,
    Folder,
    Project as CanonicalProject,
    ResourceType,
} from "../../src/lib/models/types";
import type { ProjectTypeTemplateFile } from "../../src/types/project-types";
import ConfirmDialog from "../common/ConfirmDialog";
import ResourceCommandPalette from "../common/ResourceCommandPalette";
import CreateResourceModal from "../ResourceTree/CreateResourceModal";
import ExportPreviewModal from "../common/ExportPreviewModal";
import CompilePreviewModal from "../common/CompilePreviewModal";
import UserPreferencesPage from "../preferences/UserPreferencesPage";
import ProjectTypesManagerPage from "../project-types/ProjectTypesManagerPage";
import HelpPage from "../help/HelpPage";
import type { ResourceContextAction } from "../ResourceTree/ResourceContextMenu";

export interface ShellContextActionState {
    open: boolean;
    action?: ResourceContextAction;
    resourceId?: string;
    resourceTitle?: string;
}

export interface ShellCreateModalState {
    open: boolean;
    parentId?: string;
    initialTitle?: string;
}

export interface ShellExportModalState {
    open: boolean;
    resourceId?: string;
    resourceTitle?: string;
    preview?: string;
}

export interface ShellCompileModalState {
    open: boolean;
    resourceId?: string;
    preview?: string;
}

export interface ShellModalCoordinatorProps {
    contextAction: ShellContextActionState;
    setContextAction: (state: ShellContextActionState) => void;
    isCloseProjectConfirmOpen: boolean;
    setIsCloseProjectConfirmOpen: (open: boolean) => void;
    createModal: ShellCreateModalState;
    setCreateModal: (state: ShellCreateModalState) => void;
    exportModal: ShellExportModalState;
    setExportModal: (state: ShellExportModalState) => void;
    compileModal: ShellCompileModalState;
    setCompileModal: (state: ShellCompileModalState) => void;
    isPreferencesModalOpen: boolean;
    setIsPreferencesModalOpen: (open: boolean) => void;
    isHelpModalOpen: boolean;
    setIsHelpModalOpen: (open: boolean) => void;
    isProjectTypesModalOpen: boolean;
    setIsProjectTypesModalOpen: (open: boolean) => void;
    isResourcePaletteOpen: boolean;
    setIsResourcePaletteOpen: (open: boolean) => void;
    isProjectTypesLoading: boolean;
    projectTypesLoadError: string | null;
    projectTypeTemplates: ProjectTypeTemplateFile[];
    resources?: AnyResource[];
    folders?: Folder[];
    project?: CanonicalProject | null;
    hasUnsavedEditorChanges: boolean;
    onDeleteConfirm: (resourceId: string) => Promise<void>;
    onCloseProjectConfirm: () => void;
    onCreateConfirmed: (
        payload: {
            title: string;
            type: ResourceType | string;
            folderId?: string;
        },
        parentId?: string,
    ) => Promise<void>;
    onExportConfirmed: (resourceId?: string) => Promise<void>;
    onSelectResource?: (resourceId: string) => void;
    onBuildCompilePreview: (resourceId?: string) => string;
    onCompileConfirm: (resourceId?: string) => void;
}

export default function ShellModalCoordinator({
    contextAction,
    setContextAction,
    isCloseProjectConfirmOpen,
    setIsCloseProjectConfirmOpen,
    createModal,
    setCreateModal,
    exportModal,
    setExportModal,
    compileModal,
    setCompileModal,
    isPreferencesModalOpen,
    setIsPreferencesModalOpen,
    isHelpModalOpen,
    setIsHelpModalOpen,
    isProjectTypesModalOpen,
    setIsProjectTypesModalOpen,
    isResourcePaletteOpen,
    setIsResourcePaletteOpen,
    isProjectTypesLoading,
    projectTypesLoadError,
    projectTypeTemplates,
    resources,
    folders,
    project,
    hasUnsavedEditorChanges,
    onDeleteConfirm,
    onCloseProjectConfirm,
    onCreateConfirmed,
    onExportConfirmed,
    onSelectResource,
    onBuildCompilePreview,
    onCompileConfirm,
}: ShellModalCoordinatorProps): JSX.Element {
    return (
        <>
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
                        await onDeleteConfirm(contextAction.resourceId);
                    }
                    setContextAction({ open: false });
                }}
                onCancel={() => setContextAction({ open: false })}
            />

            <ConfirmDialog
                isOpen={isCloseProjectConfirmOpen}
                title="Close project?"
                description="You have unsaved changes that may still be syncing. Close the project anyway and return to Start Page?"
                confirmLabel="Close Project"
                cancelLabel="Keep Editing"
                onConfirm={onCloseProjectConfirm}
                onCancel={() => setIsCloseProjectConfirmOpen(false)}
            />

            <CreateResourceModal
                isOpen={createModal.open}
                initialTitle={createModal.initialTitle}
                parentId={createModal.parentId}
                onClose={() => setCreateModal({ open: false })}
                onCreate={(payload, parentId) =>
                    onCreateConfirmed(payload, parentId)
                }
                parents={folders ?? []}
            />

            <ResourceCommandPalette
                isOpen={isResourcePaletteOpen}
                resources={resources ?? []}
                onClose={() => setIsResourcePaletteOpen(false)}
                onSelectResource={(resourceId) => {
                    onSelectResource?.(resourceId);
                }}
            />

            <ExportPreviewModal
                isOpen={exportModal.open}
                resourceTitle={exportModal.resourceTitle}
                preview={exportModal.preview}
                onClose={() => setExportModal({ open: false })}
                onConfirmExport={() =>
                    onExportConfirmed(exportModal.resourceId)
                }
                onShowCompile={() => {
                    const preview = onBuildCompilePreview(
                        exportModal.resourceId,
                    );
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
                    onCompileConfirm(compileModal.resourceId);
                    setCompileModal({ open: false });
                }}
            />

            {isPreferencesModalOpen ? (
                <div className="appshell-modal-root">
                    <div
                        className="appshell-modal-backdrop"
                        onClick={() => setIsPreferencesModalOpen(false)}
                    />
                    <div className="appshell-modal-panel appshell-modal-panel--preferences">
                        <UserPreferencesPage
                            renderInModal
                            onClose={() => setIsPreferencesModalOpen(false)}
                        />
                    </div>
                </div>
            ) : null}

            {isHelpModalOpen ? (
                <div className="appshell-modal-root">
                    <div
                        className="appshell-modal-backdrop"
                        onClick={() => setIsHelpModalOpen(false)}
                    />
                    <div className="appshell-modal-panel appshell-modal-panel--help">
                        <HelpPage
                            renderInModal
                            onClose={() => setIsHelpModalOpen(false)}
                        />
                    </div>
                </div>
            ) : null}

            {isProjectTypesModalOpen ? (
                <div className="appshell-modal-root">
                    <div
                        className="appshell-modal-backdrop"
                        onClick={() => setIsProjectTypesModalOpen(false)}
                    />
                    <div className="appshell-modal-panel appshell-modal-panel--project-types">
                        {isProjectTypesLoading ? (
                            <div className="appshell-modal-message">
                                Loading project types...
                            </div>
                        ) : projectTypesLoadError ? (
                            <div className="appshell-modal-message appshell-modal-message--error">
                                {projectTypesLoadError}
                            </div>
                        ) : (
                            <ProjectTypesManagerPage
                                initialTemplates={projectTypeTemplates}
                                renderInModal
                                onClose={() =>
                                    setIsProjectTypesModalOpen(false)
                                }
                            />
                        )}
                    </div>
                </div>
            ) : null}

            {hasUnsavedEditorChanges ? null : null}
        </>
    );
}
