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

/**
 * Reads all project types through the single resolver (FR-3).
 *
 * @returns Validated template files sorted by filename.
 */
async function loadProjectTypeTemplates(): Promise<ProjectTypeTemplateFile[]> {
  const { entries } = await resolveProjectTypes(isHostedAuthActive());
  return entries
    .map(({ fileName, spec, source }) => ({
      fileName,
      definition: spec as ProjectTypeDefinition,
      source,
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
}

/**
 * Project type management route page.
 *
 * @returns Project type manager page element.
 */
export default async function ProjectTypesPage(): Promise<JSX.Element> {
  const initialTemplates = await loadProjectTypeTemplates();

  return <ProjectTypesManagerPage initialTemplates={initialTemplates} />;
}
