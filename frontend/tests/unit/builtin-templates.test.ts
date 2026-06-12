import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateProjectType } from "../../src/lib/models/schemas";

/**
 * Guards the shipped built-in project-type templates. After the Workspace
 * requirement removal these templates must still validate against the schema
 * and must no longer carry the deprecated `special` folder flag.
 *
 * Vitest runs with cwd = frontend/, so the templates live one directory up.
 */
const TEMPLATES_DIR = join(
  process.cwd(),
  "..",
  "getwrite-config",
  "templates",
  "project-types",
);

const templateFiles = readdirSync(TEMPLATES_DIR).filter(
  (file) => file.endsWith(".json") && file !== "project-type.schema.json",
);

describe("built-in project-type templates", () => {
  it("ships the expected set of templates", () => {
    expect(templateFiles.length).toBeGreaterThanOrEqual(6);
  });

  it.each(templateFiles)(
    "%s validates against the project-type schema",
    (file) => {
      const raw = readFileSync(join(TEMPLATES_DIR, file), "utf8");
      const parsed = JSON.parse(raw);
      const result = validateProjectType(parsed);
      expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
    },
  );

  it.each(templateFiles)("%s carries no `special` folder flag", (file) => {
    const raw = readFileSync(join(TEMPLATES_DIR, file), "utf8");
    expect(raw).not.toContain('"special"');
  });
});
