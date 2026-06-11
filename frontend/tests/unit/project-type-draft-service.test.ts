import { describe, it, expect } from "vitest";
import {
  validateDraft,
  createEmptyProjectType,
} from "../../components/project-types/ProjectTypeDraftService";
import type { ProjectTypeDefinition } from "../../src/types/project-types";

describe("ProjectTypeDraftService.validateDraft", () => {
  it("accepts a valid definition that has no Workspace folder", () => {
    const definition: ProjectTypeDefinition = {
      id: "no-workspace",
      name: "No Workspace",
      description: "",
      folders: [{ name: "Drafts" }],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    expect(validateDraft(definition)).toEqual({ valid: true });
  });

  it("accepts a Workspace-less definition that still carries the deprecated `special` flag", () => {
    const definition: ProjectTypeDefinition = {
      id: "special-no-workspace",
      name: "Special No Workspace",
      description: "",
      folders: [{ name: "Drafts", special: true }],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    expect(validateDraft(definition)).toEqual({ valid: true });
  });

  it("still rejects a schema-invalid definition (no folders)", () => {
    const definition: ProjectTypeDefinition = {
      id: "empty",
      name: "Empty",
      description: "",
      folders: [],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    const result = validateDraft(definition);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("still rejects a schema-invalid definition (bad id pattern)", () => {
    const definition: ProjectTypeDefinition = {
      id: "Bad ID!",
      name: "Bad",
      description: "",
      folders: [{ name: "Drafts" }],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    const result = validateDraft(definition);
    expect(result.valid).toBe(false);
  });
});

describe("ProjectTypeDraftService.createEmptyProjectType", () => {
  it("seeds at least one starter folder", () => {
    const draft = createEmptyProjectType();
    expect(draft.folders.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag any seeded folder as `special`", () => {
    const draft = createEmptyProjectType();
    expect(draft.folders.every((folder) => !folder.special)).toBe(true);
  });
});
