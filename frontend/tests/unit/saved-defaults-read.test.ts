/**
 * Feature 101, Task 5: the readers take the saved ids from the opened
 * project's config and let a failed open reject.
 */
import { describe, expect, it, vi } from "vitest";
import {
  readCompileDefaults,
  readExportDefaults,
} from "../../src/lib/api/saved-defaults-read";
import * as projects from "../../src/lib/api/projects";

vi.mock("../../src/lib/api/projects", () => ({ openProject: vi.fn() }));
const openProject = vi.mocked(projects.openProject);

function entry(config: object | undefined): projects.ProjectApiEntry {
  return {
    project: { id: "p", name: "n", config },
    folders: [],
    resources: [],
  } as unknown as projects.ProjectApiEntry;
}

describe("saved-defaults readers", () => {
  it("each reads its own key", async () => {
    openProject.mockResolvedValue(
      entry({
        compileDefaults: { excludedResourceIds: ["a"] },
        exportDefaults: { excludedResourceIds: ["b"] },
      }),
    );
    expect(await readCompileDefaults("p")).toEqual(["a"]);
    expect(await readExportDefaults("p")).toEqual(["b"]);
  });

  it("returns undefined when the key or config is absent", async () => {
    openProject.mockResolvedValue(entry(undefined));
    expect(await readCompileDefaults("p")).toBeUndefined();
    openProject.mockResolvedValue(entry({}));
    expect(await readExportDefaults("p")).toBeUndefined();
  });

  it("rejects when the open fails", async () => {
    openProject.mockRejectedValue(new Error("down"));
    await expect(readCompileDefaults("p")).rejects.toThrow("down");
  });
});
