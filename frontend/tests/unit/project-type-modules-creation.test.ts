// Feature 108, Task 7 (FR-4): project creation writes exactly the module
// entries a project type declares to `config.modules`, through the one
// creation path, and saving or editing a type never re-applies it to an
// existing project.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAndAssertProject } from "./helpers/project-creator";
import { isModuleEnabled } from "../../src/lib/models/modules/registry";
import type { ProjectTypeSpec } from "../../src/lib/models/project-creator";
import {
  createProjectCore,
  createProjectCoreNative,
} from "../../src/lib/models/project-crud-core";
import {
  createSavedProjectType,
  replaceSavedProjectType,
} from "../../src/lib/project-types-write-core";
import { clearProjectTypeCache } from "../../src/lib/projectTypes";
import { listStaticProjectTypes } from "../../src/lib/models/project-types-static";

const nativeSpec = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("../../src/lib/models/project-types-static", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/project-types-static")
    >();
  return {
    ...actual,
    getStaticProjectType: (id: string) =>
      id === "static-claims"
        ? nativeSpec.current
        : actual.getStaticProjectType(id),
  };
});

const ENV_KEYS = [
  "GETWRITE_PROJECTS_DIR",
  "GETWRITE_SAVED_PROJECT_TYPES_DIR",
  "GETWRITE_PROJECT_TYPES_DIR",
  "GETWRITE_TEMPLATES_DIR",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
] as const;

function typeSpec(
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id, name: id, folders: [{ name: "Workspace" }], ...extra };
}

function asSpec(raw: Record<string, unknown>): ProjectTypeSpec {
  return raw as unknown as ProjectTypeSpec;
}

async function readProjectJson(
  projectsDir: string,
  id: string,
): Promise<{ config?: Record<string, unknown> }> {
  return JSON.parse(
    await fsp.readFile(path.join(projectsDir, id, "project.json"), "utf8"),
  ) as { config?: Record<string, unknown> };
}

describe("createProjectFromType: declared modules (Feature 108, FR-4)", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-modules-create-"));
  });
  afterEach(async () => {
    await fsp.rm(tmp, { recursive: true, force: true });
  });

  it("stores { claims: true } and isModuleEnabled reads it, in memory and on disk", async () => {
    const { project } = await createAndAssertProject(
      asSpec(typeSpec("t-on", { modules: { claims: true } })),
      { projectRoot: tmp, name: "On" },
    );
    expect(project.config?.modules).toEqual({ claims: true });
    expect(isModuleEnabled(project.config, "claims")).toBe(true);
    const onDisk = JSON.parse(
      await fsp.readFile(path.join(tmp, "project.json"), "utf8"),
    ) as { config: { modules?: unknown } };
    expect(onDisk.config.modules).toEqual({ claims: true });
  });

  it("stores an explicit false as given", async () => {
    const { project } = await createAndAssertProject(
      asSpec(typeSpec("t-off", { modules: { sources: false } })),
      { projectRoot: tmp },
    );
    expect(project.config?.modules).toEqual({ sources: false });
    expect(isModuleEnabled(project.config, "sources")).toBe(false);
  });

  it("writes no config.modules key for a type declaring nothing", async () => {
    const { project } = await createAndAssertProject(
      asSpec(typeSpec("t-none")),
      { projectRoot: tmp },
    );
    expect(project.config).toBeDefined();
    expect("modules" in (project.config ?? {})).toBe(false);
    const onDisk = JSON.parse(
      await fsp.readFile(path.join(tmp, "project.json"), "utf8"),
    ) as { config: Record<string, unknown> };
    expect("modules" in onDisk.config).toBe(false);
  });

  it("stores an empty declaration as no entries and no key", async () => {
    const { project } = await createAndAssertProject(
      asSpec(typeSpec("t-empty", { modules: {} })),
      { projectRoot: tmp },
    );
    expect("modules" in (project.config ?? {})).toBe(false);
  });

  it("stores an unknown declared id as given", async () => {
    const { project } = await createAndAssertProject(
      asSpec(
        typeSpec("t-unknown", {
          modules: { "future-module": true, claims: false },
        }),
      ),
      { projectRoot: tmp },
    );
    expect(project.config?.modules).toEqual({
      "future-module": true,
      claims: false,
    });
  });

  it("does not share the spec's declaration object with the project", async () => {
    const declared = { claims: true };
    const { project } = await createAndAssertProject(
      asSpec(typeSpec("t-copy", { modules: declared })),
      { projectRoot: tmp },
    );
    expect(project.config?.modules).not.toBe(declared);
  });

  it("no built-in type declares modules", () => {
    for (const s of listStaticProjectTypes()) {
      expect(s.modules).toBeUndefined();
    }
  });
});

describe("creation through createProjectCore, the native static path and no re-apply", () => {
  let root: string;
  let projectsDir: string;
  let savedDir: string;
  const original: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-modules-core-"));
    projectsDir = path.join(root, "projects");
    savedDir = path.join(root, "saved");
    const builtInDir = path.join(root, "builtin");
    await fsp.mkdir(projectsDir);
    await fsp.mkdir(builtInDir);
    await fsp.writeFile(
      path.join(builtInDir, "plain.json"),
      JSON.stringify(typeSpec("plain")),
    );
    delete process.env.GETWRITE_TEMPLATES_DIR;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    process.env.GETWRITE_PROJECT_TYPES_DIR = builtInDir;
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    clearProjectTypeCache();
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    clearProjectTypeCache();
    await fsp.rm(root, { recursive: true, force: true });
  });

  it("createProjectCore applies a saved type's declared modules", async () => {
    const saved = await createSavedProjectType(
      typeSpec("mine", { modules: { claims: true } }),
      false,
    );
    expect(saved.ok).toBe(true);
    const { project } = await createProjectCore("P", "mine", false);
    expect(project.config?.modules).toEqual({ claims: true });
    const onDisk = await readProjectJson(
      projectsDir,
      path.basename(project.rootPath ?? ""),
    );
    expect(onDisk.config?.modules).toEqual({ claims: true });
  });

  it("createProjectCore on a type declaring nothing writes no modules key", async () => {
    const { project } = await createProjectCore("P", "plain", false);
    const onDisk = await readProjectJson(
      projectsDir,
      path.basename(project.rootPath ?? ""),
    );
    expect("modules" in (onDisk.config ?? {})).toBe(false);
  });

  it("createProjectCoreNative applies the static registry spec's declared modules", async () => {
    nativeSpec.current = typeSpec("static-claims", {
      modules: { claims: true },
    });
    const { project } = await createProjectCoreNative("N", "static-claims");
    expect(project.config?.modules).toEqual({ claims: true });
    const onDisk = await readProjectJson(
      projectsDir,
      path.basename(project.rootPath ?? ""),
    );
    expect(onDisk.config?.modules).toEqual({ claims: true });
  });

  it("saving or editing a type leaves an existing project's config.modules unchanged", async () => {
    await createSavedProjectType(
      typeSpec("mine", { modules: { claims: true } }),
      false,
    );
    const { project } = await createProjectCore("P", "mine", false);
    const before = await fsp.readFile(
      path.join(
        projectsDir,
        path.basename(project.rootPath ?? ""),
        "project.json",
      ),
      "utf8",
    );

    const replaced = await replaceSavedProjectType(
      typeSpec("mine", { modules: { claims: false, sources: false } }),
      false,
    );
    expect(replaced.ok).toBe(true);
    await createSavedProjectType(
      typeSpec("other", { modules: { claims: false } }),
      false,
    );

    const after = await fsp.readFile(
      path.join(
        projectsDir,
        path.basename(project.rootPath ?? ""),
        "project.json",
      ),
      "utf8",
    );
    expect(after).toBe(before);
    expect(
      (
        await readProjectJson(
          projectsDir,
          path.basename(project.rootPath ?? ""),
        )
      ).config?.modules,
    ).toEqual({ claims: true });
  });
});
