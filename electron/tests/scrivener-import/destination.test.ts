/**
 * Pure logic for where a UI-driven Scrivener import lands and what it is
 * called by default — no filesystem, no Electron runtime.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import {
  computeDestinationProjectRoot,
  deriveDefaultProjectName,
  buildScrivenerSelectionResult,
} from "../../src/scrivener-import/destination";
import { createSelectionHandleRegistry } from "../../src/scrivener-import/selection-handles";

describe("computeDestinationProjectRoot", () => {
  it("returns a valid UUID project id and a matching project root", () => {
    const projectsDir = "/Users/writer/Documents/GetWrite";

    const { projectId, projectRoot } =
      computeDestinationProjectRoot(projectsDir);

    expect(projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(projectRoot).toBe(path.join(projectsDir, projectId));
  });

  it("mints a different id on each call", () => {
    const projectsDir = "/Users/writer/Documents/GetWrite";

    const first = computeDestinationProjectRoot(projectsDir);
    const second = computeDestinationProjectRoot(projectsDir);

    expect(first.projectId).not.toBe(second.projectId);
  });
});

describe("deriveDefaultProjectName", () => {
  it("strips a trailing .scriv extension", () => {
    expect(deriveDefaultProjectName("My Novel.scriv")).toBe("My Novel");
  });

  it("strips the extension case-insensitively", () => {
    expect(deriveDefaultProjectName("My Novel.SCRIV")).toBe("My Novel");
    expect(deriveDefaultProjectName("My Novel.ScRiV")).toBe("My Novel");
  });

  it("leaves the basename unchanged when there is no .scriv extension", () => {
    expect(deriveDefaultProjectName("My Novel")).toBe("My Novel");
  });
});

describe("buildScrivenerSelectionResult", () => {
  it("strips the .scriv extension from the display name (FR-16)", () => {
    const handles = createSelectionHandleRegistry();

    const result = buildScrivenerSelectionResult(
      "/Users/writer/Documents/The SF Sideshow.scriv",
      handles,
    );

    expect(result.displayName).toBe("The SF Sideshow");
  });

  it("never includes the source path in the returned result", () => {
    const handles = createSelectionHandleRegistry();
    const scrivPath = "/Users/writer/Documents/The SF Sideshow.scriv";

    const result = buildScrivenerSelectionResult(scrivPath, handles);

    expect(Object.values(result)).not.toContain(scrivPath);
    expect(JSON.stringify(result)).not.toContain(scrivPath);
  });

  it("records the handle so it resolves back to the original path and the stripped display name", () => {
    const handles = createSelectionHandleRegistry();
    const scrivPath = "/Users/writer/Documents/The SF Sideshow.scriv";

    const result = buildScrivenerSelectionResult(scrivPath, handles);

    expect(handles.resolve(result.handle)).toEqual({
      path: scrivPath,
      displayName: "The SF Sideshow",
    });
  });
});
