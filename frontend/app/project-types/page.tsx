/**
 * @module ProjectTypesRoute
 *
 * App Router page for project type template management.
 * Loads project types through the resolver and renders the management screen.
 */

import ProjectTypesManagerPage from "../../components/project-types/ProjectTypesManagerPage";
import { isHostedAuthActive } from "../../src/lib/auth/auth-config";
import { resolveProjectTypes } from "../../src/lib/projectTypes";
import type {
  ProjectTypeDefinition,
  ProjectTypeTemplateFile,
} from "../../src/types/project-types";
import type { SavedProjectTypesStatus } from "../../src/lib/api/project-types";

/**
 * Reads all project types through the single resolver (FR-3).
 *
 * @returns Validated template files sorted by filename, and the saved-types
 *   store's status.
 */
async function loadProjectTypeTemplates(): Promise<{
  templates: ProjectTypeTemplateFile[];
  savedStatus: SavedProjectTypesStatus;
}> {
  const { entries, savedStatus } =
    await resolveProjectTypes(isHostedAuthActive());
  const templates = entries
    .map(({ fileName, spec, source }) => ({
      fileName,
      definition: spec as ProjectTypeDefinition,
      source,
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
  return { templates, savedStatus };
}

/**
 * Project type management route page.
 *
 * @returns Project type manager page element.
 */
export default async function ProjectTypesPage(): Promise<JSX.Element> {
  const { templates, savedStatus } = await loadProjectTypeTemplates();

  return (
    <ProjectTypesManagerPage
      initialTemplates={templates}
      savedStatus={savedStatus}
    />
  );
}
