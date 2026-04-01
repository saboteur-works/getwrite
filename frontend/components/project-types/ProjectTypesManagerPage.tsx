"use client";

/**
 * @module ProjectTypesManagerPage
 *
 * Slim orchestration shell for project type management.
 *
 * Responsibilities:
 * - Compose list + editor + draft state service.
 * - Resolve dark/light mode from selected project metadata.
 * - Enforce Workspace guardrails before any commit boundary.
 */

import React, { useMemo, useState } from "react";
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
import {
    useProjectTypeDraftService,
    validateDraft,
} from "./ProjectTypeDraftService";

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
    const [workspaceGuardErrors, setWorkspaceGuardErrors] = useState<string[]>(
        [],
    );

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

    const workspaceGuardrailStatus = useMemo(() => {
        if (!selectedItem) {
            return { valid: true as const, errors: [] as string[] };
        }

        const validation = validateDraft(selectedItem.definition);
        if (validation.valid) {
            return { valid: true as const, errors: [] as string[] };
        }

        return { valid: false as const, errors: validation.errors };
    }, [selectedItem]);

    React.useEffect(() => {
        if (workspaceGuardrailStatus.valid) {
            setWorkspaceGuardErrors([]);
            return;
        }

        setWorkspaceGuardErrors(workspaceGuardrailStatus.errors);
    }, [workspaceGuardrailStatus]);

    const content = (
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:px-10">
            <header className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-gw-primary">
                        Project Type Management
                    </h1>
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

            {workspaceGuardErrors.length > 0 ? (
                <section className="rounded-md border border-gw-border p-3 text-sm text-gw-red">
                    <p className="font-semibold">Workspace guardrail warning</p>
                    <ul className="mt-2 list-disc pl-5">
                        {workspaceGuardErrors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <ProjectTypeListPane
                    items={items}
                    selectedKey={selectedKey}
                    onSelectKey={setSelectedKey}
                    onCreateProjectType={handleCreateProjectType}
                />

                <div className="rounded-lg border border-gw-border bg-gw-chrome p-5">
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
