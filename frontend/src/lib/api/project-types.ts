import type { ProjectTypeDefinition } from "../../types/project-types";

export async function listProjectTypes(): Promise<ProjectTypeDefinition[]> {
  const response = await fetch("/api/project-types");
  if (!response.ok) {
    throw new Error(`Failed to load project types (${response.status})`);
  }
  return (await response.json()) as ProjectTypeDefinition[];
}
