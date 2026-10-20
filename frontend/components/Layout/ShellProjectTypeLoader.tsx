"use client";

import React from "react";
import type { ProjectTypeTemplateFile } from "../../src/types/project-types";
import {
  listProjectTypeEntries,
  projectTypeListNotice,
} from "../../src/lib/api/project-types";

export interface ShellProjectTypeLoaderState {
  projectTypeTemplates: ProjectTypeTemplateFile[];
  isProjectTypesLoading: boolean;
  projectTypesLoadError: string | null;
  /** One-line notice when saved types were unusable or unreadable; null otherwise. */
  projectTypesNotice: string | null;
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
  const [projectTypesNotice, setProjectTypesNotice] = React.useState<
    string | null
  >(null);
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
      setProjectTypesNotice(null);

      try {
        const list = await listProjectTypeEntries();

        if (isCancelled) {
          return;
        }

        const templates: ProjectTypeTemplateFile[] = list.entries.map(
          (entry) => ({
            fileName: entry.fileName,
            source: entry.source,
            definition: {
              ...entry.spec,
              folders: entry.spec.folders ?? [],
              defaultResources: entry.spec.defaultResources ?? [],
            },
          }),
        );

        setProjectTypeTemplates(templates);
        setProjectTypesNotice(projectTypeListNotice(list));
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Failed to load project types";
        setProjectTypeTemplates([]);
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
        projectTypesNotice,
      })}
    </>
  );
}
