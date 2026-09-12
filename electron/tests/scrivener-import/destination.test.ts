/**
 * Pure logic for where a UI-driven Scrivener import lands and what it is
 * called by default — no filesystem, no Electron runtime.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import {
  computeDestinationProjectRoot,
  deriveDefaultProjectName,
} from "../../src/scrivener-import/destination";

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
