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
      baseEnv: { PATH: "/usr/bin", SOME_VAR: "kept" },
    });

    expect(options.env.SOME_VAR).toBe("kept");
    expect(options.env.PATH).toBe("/usr/bin");
  });

  it("passes the given working directory unchanged (FR-4)", () => {
    const options = buildDocxWorkerForkOptions({
      templatesDir: "/t",
      workingDir: "/some/where else",
      baseEnv: {},
    });

    expect(options.cwd).toBe("/some/where else");
  });
});
