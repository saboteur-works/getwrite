"use client";

/**
 * @module ProjectTypesManagerPage
 *
 * Slim orchestration shell for project type management.
 *
 * Responsibilities:
 * - Compose list + editor + draft state service.
 * - Resolve dark/light mode from selected project metadata.
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import useAppSelector from "../../src/store/hooks";
import {
  selectProject,
  selectSelectedProjectId,
} from "../../src/store/projectsSlice";
import { resolvePreferredColorMode } from "../../src/lib/user-preferences";
import type { MetadataValue } from "../../src/lib/models/types";
import type { ProjectTypeTemplateFile } from "../../src/types/project-types";
import ProjectTypeEditorForm from "./ProjectTypeEditorForm";
import ProjectTypeListPane from "./ProjectTypeListPane";
import { useProjectTypeDraftService } from "./ProjectTypeDraftService";
import { DialogTitle } from "../common/UI/Dialog/Dialog";

/**
 * Properties required by {@link ProjectTypesManagerPage}.
 */
interface ProjectTypesManagerPageProps {
  /**
   * Initial templates loaded from filesystem-backed project type JSON files.
   */
  initialTemplates: ProjectTypeTemplateFile[];
  /** Optional close handler used when rendered inside a modal. */
  onClose?: () => void;
  /** Renders without page-level shell wrapper when true. */
  renderInModal?: boolean;
}

/**
 * Project type management page component.
 *
 * @param props - Component properties.
 * @returns Management page UI.
 */
export default function ProjectTypesManagerPage({
  initialTemplates,
  onClose,
  renderInModal = false,
}: ProjectTypesManagerPageProps): JSX.Element {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  const selectedProjectId = useAppSelector((state) =>
    selectSelectedProjectId(state),
  );
  const selectedProject = useAppSelector((state) => {
    if (!selectedProjectId) {
      return null;
    }

    return selectProject(state, selectedProjectId);
  });

  React.useEffect(() => {
    const metadata = selectedProject?.metadata as
      | Record<string, MetadataValue>
      | undefined;
    setIsDarkMode(resolvePreferredColorMode(metadata) === "dark");
  }, [selectedProject?.id, selectedProject?.metadata]);

  const {
    items,
    selectedKey,
    selectedItem,
    setSelectedKey,
    updateSelectedDefinition,
    handleCreateProjectType,
    handleAddFolder,
    handleRemoveFolder,
    handleAddResource,
    handleRemoveResource,
    handleWordCountGoalChange,
    handleAddStatus,
    handleRemoveStatus,
    handleUpdateStatus,
    handleAddDefaultFolder,
    handleRemoveDefaultFolder,
  } = useProjectTypeDraftService(initialTemplates);

  const handleCloseManager = (): void => {
    if (onClose) {
      onClose();
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  // Bound the manager to a definite height so the list and editor panes scroll
  // internally instead of growing the page. In a modal `main` has no flex
  // parent to stretch into, so it needs an explicit viewport-relative height;
  // on the full page it fills the 100vh app shell via `flex-1`.
  const heightClass = renderInModal ? "h-[85vh]" : "min-h-0 flex-1";

  const content = (
    <main
      className={`mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-10 ${heightClass}`}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {renderInModal ? (
            <DialogTitle asChild>
              <h1 className="text-2xl font-semibold text-gw-primary">
                Project Type Management
              </h1>
            </DialogTitle>
          ) : (
            <h1 className="text-2xl font-semibold text-gw-primary">
              Project Type Management
            </h1>
          )}
          <p className="text-sm text-gw-secondary">
            View, create, and edit project type templates from
            getwrite-config/templates/project-types.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCloseManager}
            className="rounded-md border border-gw-primary bg-transparent px-3 py-2 text-sm font-medium text-gw-primary hover:bg-gw-chrome2 transition-colors duration-150"
          >
            Close
          </button>
        </div>
      </header>

      <section className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-6 lg:grid-cols-[280px_1fr]">
        <ProjectTypeListPane
          items={items}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onCreateProjectType={handleCreateProjectType}
        />

        <div className="min-h-0 overflow-y-auto rounded-lg border border-gw-border bg-gw-chrome p-5">
          {selectedItem ? (
            <ProjectTypeEditorForm
              definition={selectedItem.definition}
              onChange={(nextDefinition) => {
                updateSelectedDefinition(() => nextDefinition);
              }}
              onAddFolder={handleAddFolder}
              onRemoveFolder={handleRemoveFolder}
              onAddResource={handleAddResource}
              onRemoveResource={handleRemoveResource}
              onWordCountGoalChange={handleWordCountGoalChange}
              onAddStatus={handleAddStatus}
              onRemoveStatus={handleRemoveStatus}
              onUpdateStatus={handleUpdateStatus}
              onAddDefaultFolder={handleAddDefaultFolder}
              onRemoveDefaultFolder={handleRemoveDefaultFolder}
            />
          ) : (
            <div className="rounded-md border border-dashed border-gw-border p-6 text-sm text-gw-secondary">
              No project type selected.
            </div>
          )}
        </div>
      </section>
    </main>
  );

  if (renderInModal) {
    return content;
  }

  return (
    <div
      className={`appshell-shell ${isDarkMode ? "appshell-theme-dark" : ""}`}
    >
      {content}
    </div>
  );
}
