"use client";

import React from "react";
import type {
    AnyResource,
    Folder,
    Project as CanonicalProject,
    ResourceType,
} from "../../src/lib/models/types";
import type { ProjectTypeTemplateFile } from "../../src/types/project-types";
import RenameResourceModal from "../ResourceTree/RenameResourceModal";
import ConfirmDialog from "../common/ConfirmDialog";
import ResourceCommandPalette from "../common/ResourceCommandPalette";
import CreateResourceModal from "../ResourceTree/CreateResourceModal";
import ExportPreviewModal from "../common/ExportPreviewModal";
import CompilePreviewModal from "../common/CompilePreviewModal";
import HeadingSettingsModal from "../preferences/HeadingSettingsModal";
import BodySettingsModal from "../preferences/BodySettingsModal";
import UserPreferencesPage from "../preferences/UserPreferencesPage";
import ProjectTypesManagerPage from "../project-types/ProjectTypesManagerPage";
import HelpPage from "../help/HelpPage";
import TagsManagerModal from "../common/TagsManagerModal";
import SchemaManager from "../SchemaManager/SchemaManager";
import DefaultRevisionNameModal from "../preferences/DefaultRevisionNameModal";
import { Dialog, DialogContent, DialogTitle } from "../common/UI/Dialog";
import type { ResourceContextAction } from "../ResourceTree/ResourceContextMenu";
import type { EditorHeadingMap } from "../../src/lib/editor-heading-settings";
import type { EditorBodyConfig } from "../../src/lib/editor-body-settings";
import type { CompileOptions } from "../common/CompilePreviewModal";

export interface SyncBlocker {
    id: string;
    label: string;
    isError?: boolean;
}

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
    sourceResourceId?: string;
}

export interface ShellExportModalState {
    open: boolean;
    resourceId?: string;
    resourceTitle?: string;
    resourceIds?: string[];
    resourceNames?: string[];
}

export interface ShellCompileModalState {
    open: boolean;
    resourceId?: string;
    preview?: string;
}

export interface ShellRenameModalState {
    open: boolean;
    resourceId?: string;
    resourceTitle?: string;
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
    renameModal: ShellRenameModalState;
    setRenameModal: (state: ShellRenameModalState) => void;
    onRenameConfirm: (newName: string) => Promise<void>;
    isHeadingSettingsModalOpen: boolean;
    setIsHeadingSettingsModalOpen: (open: boolean) => void;
    initialHeadingSettings?: EditorHeadingMap;
    isBodySettingsModalOpen: boolean;
    setIsBodySettingsModalOpen: (open: boolean) => void;
    initialBodySettings?: EditorBodyConfig;
    onSaveBodySettings: (body: EditorBodyConfig) => Promise<void>;
    isDefaultRevisionNameModalOpen: boolean;
    setIsDefaultRevisionNameModalOpen: (open: boolean) => void;
    initialDefaultRevisionName: string;
    onSaveDefaultRevisionName: (name: string) => Promise<void>;
    isPreferencesModalOpen: boolean;
    setIsPreferencesModalOpen: (open: boolean) => void;
    isHelpModalOpen: boolean;
    setIsHelpModalOpen: (open: boolean) => void;
    isProjectTypesModalOpen: boolean;
    setIsProjectTypesModalOpen: (open: boolean) => void;
    isTagsManagerOpen: boolean;
    setIsTagsManagerOpen: (open: boolean) => void;
    /** Root path of the active project — required to render TagsManagerModal. */
    projectPath?: string;
    isSchemaManagerOpen: boolean;
    setIsSchemaManagerOpen: (open: boolean) => void;
    isResourcePaletteOpen: boolean;
    setIsResourcePaletteOpen: (open: boolean) => void;
    isProjectTypesLoading: boolean;
    projectTypesLoadError: string | null;
    projectTypeTemplates: ProjectTypeTemplateFile[];
    resources?: AnyResource[];
    folders?: Folder[];
    project?: CanonicalProject | null;
    hasUnsavedEditorChanges: boolean;
    syncBlockers?: SyncBlocker[];
    onDeleteConfirm: (resourceId: string) => Promise<void>;
    onCloseProjectConfirm: () => void;
    onSaveHeadingSettings: (headings: EditorHeadingMap) => Promise<void>;
    onCreateConfirmed: (
        payload: {
            title: string;
            type: ResourceType | string;
            folderId?: string;
        },
        parentId?: string,
    ) => Promise<void>;
    onExportConfirmed: (resourceIds: string[], resourceId?: string) => Promise<void>;
    onSelectResource?: (resourceId: string) => void;
    onBuildCompilePreview: (resourceId?: string) => string;
    onConfirmCompile: (selectedIds: string[], options: CompileOptions) => Promise<void>;
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
    renameModal,
    setRenameModal,
    onRenameConfirm,
    isHeadingSettingsModalOpen,
    setIsHeadingSettingsModalOpen,
    initialHeadingSettings,
    isBodySettingsModalOpen,
    setIsBodySettingsModalOpen,
    initialBodySettings,
    onSaveBodySettings,
    isDefaultRevisionNameModalOpen,
    setIsDefaultRevisionNameModalOpen,
    initialDefaultRevisionName,
    onSaveDefaultRevisionName,
    isPreferencesModalOpen,
    setIsPreferencesModalOpen,
    isHelpModalOpen,
    setIsHelpModalOpen,
    isProjectTypesModalOpen,
    setIsProjectTypesModalOpen,
    isTagsManagerOpen,
    setIsTagsManagerOpen,
    projectPath,
    isSchemaManagerOpen,
    setIsSchemaManagerOpen,
    isResourcePaletteOpen,
    setIsResourcePaletteOpen,
    isProjectTypesLoading,
    projectTypesLoadError,
    projectTypeTemplates,
    resources,
    folders,
    project,
    hasUnsavedEditorChanges,
    syncBlockers,
    onDeleteConfirm,
    onCloseProjectConfirm,
    onSaveHeadingSettings,
    onCreateConfirmed,
    onExportConfirmed,
    onSelectResource,
    onBuildCompilePreview,
    onConfirmCompile,
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

            <RenameResourceModal
                isOpen={renameModal.open}
                initialName={renameModal.resourceTitle ?? ""}
                onClose={() => setRenameModal({ open: false })}
                onConfirm={onRenameConfirm}
            />

            <ConfirmDialog
                isOpen={isCloseProjectConfirmOpen}
                title="Close project?"
                description="You have unsaved changes that may still be syncing. Close the project anyway and return to Start Page?"
                confirmLabel="Close Project"
                cancelLabel="Keep Editing"
                details={
                    syncBlockers && syncBlockers.length > 0 ? (
                        <ul className="sync-blockers-list">
                            {syncBlockers.map((blocker) => (
                                <li
                                    key={blocker.id}
                                    className={`sync-blocker${blocker.isError ? " sync-blocker--error" : ""}`}
                                >
                                    <span className="sync-blocker-label">{blocker.label}</span>
                                    {blocker.isError ? (
                                        <>
                                            <span aria-hidden="true" className="sync-blocker-error-icon">⚠</span>
                                            <span className="sr-only">error</span>
                                        </>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    ) : undefined
                }
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
                resourceNames={exportModal.resourceNames}
                onClose={() => setExportModal({ open: false })}
                onConfirmExport={() =>
                    onExportConfirmed(
                        exportModal.resourceIds ?? (exportModal.resourceId ? [exportModal.resourceId] : []),
                        exportModal.resourceId,
                    )
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
                resources={[...(resources ?? []), ...(folders ?? [])]}
                projectId={project?.id}
                preview={compileModal.preview}
                onClose={() => setCompileModal({ open: false })}
                onConfirmCompile={(selectedIds, options) => {
                    void onConfirmCompile(selectedIds, options);
                    setCompileModal({ open: false });
                }}
            />

            <Dialog
                open={isHeadingSettingsModalOpen}
                onOpenChange={(open) => { if (!open) setIsHeadingSettingsModalOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[820px]" aria-describedby={undefined}>
                    <HeadingSettingsModal
                        initialHeadings={initialHeadingSettings}
                        onClose={() => setIsHeadingSettingsModalOpen(false)}
                        onSave={onSaveHeadingSettings}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={isBodySettingsModalOpen}
                onOpenChange={(open) => { if (!open) setIsBodySettingsModalOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[820px]" aria-describedby={undefined}>
                    <BodySettingsModal
                        initialBody={initialBodySettings}
                        onClose={() => setIsBodySettingsModalOpen(false)}
                        onSave={onSaveBodySettings}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={isDefaultRevisionNameModalOpen}
                onOpenChange={(open) => { if (!open) setIsDefaultRevisionNameModalOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[820px]" aria-describedby={undefined}>
                    <DefaultRevisionNameModal
                        initialName={initialDefaultRevisionName}
                        onClose={() => setIsDefaultRevisionNameModalOpen(false)}
                        onSave={onSaveDefaultRevisionName}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={isPreferencesModalOpen}
                onOpenChange={(open) => { if (!open) setIsPreferencesModalOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[820px]" aria-describedby={undefined}>
                    <UserPreferencesPage
                        renderInModal
                        onClose={() => setIsPreferencesModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={isHelpModalOpen}
                onOpenChange={(open) => { if (!open) setIsHelpModalOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[860px]" aria-describedby={undefined}>
                    <HelpPage
                        renderInModal
                        onClose={() => setIsHelpModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={isProjectTypesModalOpen}
                onOpenChange={(open) => { if (!open) setIsProjectTypesModalOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[1200px]" aria-describedby={undefined}>
                    {isProjectTypesLoading ? (
                        <>
                            <DialogTitle className="sr-only">Project Types</DialogTitle>
                            <div className="appshell-modal-message">
                                Loading project types...
                            </div>
                        </>
                    ) : projectTypesLoadError ? (
                        <>
                            <DialogTitle className="sr-only">Project Types</DialogTitle>
                            <div className="appshell-modal-message appshell-modal-message--error">
                                {projectTypesLoadError}
                            </div>
                        </>
                    ) : (
                        <ProjectTypesManagerPage
                            initialTemplates={projectTypeTemplates}
                            renderInModal
                            onClose={() => setIsProjectTypesModalOpen(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={isTagsManagerOpen && Boolean(projectPath)}
                onOpenChange={(open) => { if (!open) setIsTagsManagerOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[820px]" aria-describedby={undefined}>
                    {projectPath ? (
                        <TagsManagerModal
                            projectPath={projectPath}
                            onClose={() => setIsTagsManagerOpen(false)}
                        />
                    ) : null}
                </DialogContent>
            </Dialog>

            <Dialog
                open={isSchemaManagerOpen}
                onOpenChange={(open) => { if (!open) setIsSchemaManagerOpen(false); }}
            >
                <DialogContent maxWidth="max-w-[820px]" aria-describedby={undefined}>
                    <SchemaManager onClose={() => setIsSchemaManagerOpen(false)} />
                </DialogContent>
            </Dialog>

            {hasUnsavedEditorChanges ? null : null}
        </>
    );
}
