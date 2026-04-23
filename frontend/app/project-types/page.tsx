/**
 * @module ProjectTypesRoute
 *
 * App Router page for project type template management.
 * Loads JSON templates from `getwrite-config/templates/project-types` and
 * renders a UI-only management screen.
 */

import fs from "node:fs/promises";
import path from "node:path";
import ProjectTypesManagerPage from "../../components/project-types/ProjectTypesManagerPage";
import type {
    ProjectTypeDefinition,
    ProjectTypeTemplateFile,
} from "../../src/types/project-types";

/**
 * Resolves the absolute path to the project type template directory.
 *
 * @returns Absolute filesystem path.
 */
function resolveProjectTypesDirectory(): string {
    return (
        process.env.GETWRITE_TEMPLATES_DIR ??
        path.join(process.cwd(), "..", "getwrite-config", "templates", "project-types")
    );
}

/**
 * Reads and parses all project type templates from disk.
 *
 * @returns Parsed template files sorted by filename.
 */
async function loadProjectTypeTemplates(): Promise<ProjectTypeTemplateFile[]> {
    const directoryPath = resolveProjectTypesDirectory();

    const directoryEntries = await fs.readdir(directoryPath, {
        withFileTypes: true,
    });

    const jsonFileNames = directoryEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .filter((entry) => entry.name !== "project-type.schema.json")
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));

    const templateFiles = await Promise.all(
        jsonFileNames.map(async (fileName) => {
            const filePath = path.join(directoryPath, fileName);
            const rawContent = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(rawContent) as ProjectTypeDefinition;

            return {
                fileName,
                definition: parsed,
            };
        }),
    );

    return templateFiles;
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
