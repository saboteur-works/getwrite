"use client";

import React from "react";
import type {
    ProjectTypeDefinition,
    ProjectTypeTemplateFile,
} from "../../src/types/project-types";

export interface ShellProjectTypeLoaderState {
    projectTypeTemplates: ProjectTypeTemplateFile[];
    isProjectTypesLoading: boolean;
    projectTypesLoadError: string | null;
}

export interface ShellProjectTypeLoaderProps {
    isOpen: boolean;
    children: (state: ShellProjectTypeLoaderState) => React.ReactNode;
}

export default function ShellProjectTypeLoader({
    isOpen,
    children,
}: ShellProjectTypeLoaderProps): JSX.Element {
    const [projectTypeTemplates, setProjectTypeTemplates] = React.useState<
        ProjectTypeTemplateFile[]
    >([]);
    const [isProjectTypesLoading, setIsProjectTypesLoading] =
        React.useState<boolean>(false);
    const [projectTypesLoadError, setProjectTypesLoadError] = React.useState<
        string | null
    >(null);

    React.useEffect(() => {
        if (!isOpen) {
            return;
        }

        let isCancelled = false;

        const loadProjectTypes = async (): Promise<void> => {
            setIsProjectTypesLoading(true);
            setProjectTypesLoadError(null);

            try {
                const response = await fetch("/api/project-types");
                if (!response.ok) {
                    throw new Error(
                        `Failed to load project types (${response.status})`,
                    );
                }

                const definitions =
                    (await response.json()) as ProjectTypeDefinition[];

                if (isCancelled) {
                    return;
                }

                const templates: ProjectTypeTemplateFile[] = definitions.map(
                    (definition, index) => {
                        return {
                            fileName:
                                definition.id?.trim().length > 0
                                    ? `${definition.id}.json`
                                    : `template-${index + 1}.json`,
                            definition: {
                                ...definition,
                                folders: definition.folders ?? [],
                                defaultResources:
                                    definition.defaultResources ?? [],
                            },
                        };
                    },
                );

                setProjectTypeTemplates(templates);
            } catch (error) {
                if (isCancelled) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : "Failed to load project types";
                setProjectTypesLoadError(message);
            } finally {
                if (!isCancelled) {
                    setIsProjectTypesLoading(false);
                }
            }
        };

        void loadProjectTypes();

        return () => {
            isCancelled = true;
        };
    }, [isOpen]);

    return (
        <>
            {children({
                projectTypeTemplates,
                isProjectTypesLoading,
                projectTypesLoadError,
            })}
        </>
    );
}
