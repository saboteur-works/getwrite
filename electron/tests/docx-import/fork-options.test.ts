// Last Updated: 2026-10-18

/**
 * The DOCX worker fork options must tell the worker where the project-type
 * specs are (`GETWRITE_PROJECT_TYPES_DIR`) and which working directory to use.
 * Feature 88 FR-2.
 */
import { describe, it, expect } from "vitest";
import { buildDocxWorkerForkOptions } from "../../src/docx-import/fork-options";

describe("buildDocxWorkerForkOptions", () => {
  it("carries GETWRITE_PROJECT_TYPES_DIR equal to the templates directory and a defined cwd", () => {
    const options = buildDocxWorkerForkOptions({
      templatesDir: "/root/getwrite-config/templates/project-types",
      workingDir: "/root",
      savedProjectTypesDir: "/ud/project-types",
      baseEnv: {},
    });

    expect(options.env?.GETWRITE_PROJECT_TYPES_DIR).toBe(
      "/root/getwrite-config/templates/project-types",
    );
    expect(options.cwd).toBeDefined();
  });

  it("preserves a variable present in the input environment (FR-3)", () => {
    const options = buildDocxWorkerForkOptions({
      templatesDir: "/t",
      workingDir: "/root",
      savedProjectTypesDir: "/ud/project-types",
      baseEnv: { PATH: "/usr/bin", SOME_VAR: "kept" },
    });

    expect(options.env.SOME_VAR).toBe("kept");
    expect(options.env.PATH).toBe("/usr/bin");
  });

  it("passes the given working directory unchanged (FR-4)", () => {
    const options = buildDocxWorkerForkOptions({
      templatesDir: "/t",
      workingDir: "/some/where else",
      savedProjectTypesDir: "/ud/project-types",
      baseEnv: {},
    });

    expect(options.cwd).toBe("/some/where else");
  });

  it("carries GETWRITE_SAVED_PROJECT_TYPES_DIR equal to the directory given, beside the other variables (Feature 90 FR-4)", () => {
    const options = buildDocxWorkerForkOptions({
      templatesDir: "/t",
      workingDir: "/root",
      savedProjectTypesDir: "/ud/project-types",
      baseEnv: { KEEP: "yes" },
    });

    expect(options.env.GETWRITE_SAVED_PROJECT_TYPES_DIR).toBe(
      "/ud/project-types",
    );
    expect(options.env.GETWRITE_PROJECT_TYPES_DIR).toBe("/t");
    expect(options.env.KEEP).toBe("yes");
    expect(options.cwd).toBe("/root");
  });

  it("overrides an inherited GETWRITE_SAVED_PROJECT_TYPES_DIR with the directory given", () => {
    const options = buildDocxWorkerForkOptions({
      templatesDir: "/t",
      workingDir: "/root",
      savedProjectTypesDir: "/ud/project-types",
      baseEnv: { GETWRITE_SAVED_PROJECT_TYPES_DIR: "/stale" },
    });

    expect(options.env.GETWRITE_SAVED_PROJECT_TYPES_DIR).toBe(
      "/ud/project-types",
    );
  });
});
