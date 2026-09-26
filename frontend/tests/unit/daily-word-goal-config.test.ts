import { describe, it, expect } from "vitest";
import { ProjectConfigSchema } from "../../src/lib/models/schemas";
import { normalizeProjectConfig } from "../../src/lib/models/project";
import { ProjectApiEntrySchema } from "../../src/lib/api/schemas";

const apiProject = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  name: "Test Project",
  createdAt: "2024-01-01T00:00:00.000Z",
};

describe("dailyWordGoal (Feature 59, FR-6/FR-13)", () => {
  it("parses a non-negative integer in ProjectConfigSchema", () => {
    expect(
      ProjectConfigSchema.parse({ dailyWordGoal: 500 }).dailyWordGoal,
    ).toBe(500);
    expect(ProjectConfigSchema.parse({ dailyWordGoal: 0 }).dailyWordGoal).toBe(
      0,
    );
  });

  it("rejects negative and non-integer values", () => {
    expect(ProjectConfigSchema.safeParse({ dailyWordGoal: -1 }).success).toBe(
      false,
    );
    expect(ProjectConfigSchema.safeParse({ dailyWordGoal: 1.5 }).success).toBe(
      false,
    );
  });

  it("is absent when unset", () => {
    const parsed = ProjectConfigSchema.parse({});
    expect("dailyWordGoal" in parsed).toBe(false);
    expect(
      normalizeProjectConfig({ editorConfig: {} }).dailyWordGoal,
    ).toBeUndefined();
  });

  it("round-trips through normalizeProjectConfig", () => {
    expect(
      normalizeProjectConfig({ editorConfig: {}, dailyWordGoal: 750 })
        .dailyWordGoal,
    ).toBe(750);
  });

  it("leaves wordCountGoal behaviour unchanged", () => {
    const n = normalizeProjectConfig({
      editorConfig: {},
      wordCountGoal: 80000,
    });
    expect(n.wordCountGoal).toBe(80000);
    expect(n.dailyWordGoal).toBeUndefined();
  });

  it("round-trips through the API response schema", () => {
    const parsed = ProjectApiEntrySchema.parse({
      project: {
        ...apiProject,
        config: { dailyWordGoal: 300, editorConfig: {} },
      },
      folders: [],
      resources: [],
    });
    expect(parsed.project.config?.dailyWordGoal).toBe(300);
    const unset = ProjectApiEntrySchema.parse({
      project: { ...apiProject, config: { editorConfig: {} } },
      folders: [],
      resources: [],
    });
    expect(unset.project.config?.dailyWordGoal).toBeUndefined();
  });
});
