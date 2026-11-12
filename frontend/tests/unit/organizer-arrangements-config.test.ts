/**
 * Feature 109, Task 24 (FR-14, FR-1 (g)): `config.organizerArrangements`
 * through every path that copies a config key by name. One assertion per path;
 * the "before" state is recorded in experiments/task-1.md (key dropped by all
 * in-process copies).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configureStore } from "@reduxjs/toolkit";
import {
  loadProjectConfig,
  PROJECT_FILENAME,
} from "../../src/lib/models/project-config";
import { normalizeProjectConfig } from "../../src/lib/models/project";
import {
  ProjectConfigSchema,
  ProjectSchema as PersistedProjectSchema,
} from "../../src/lib/models/schemas";
import { ProjectSchema as ApiProjectSchema } from "../../src/lib/api/schemas";
import projectsReducer, {
  buildStoredProject,
  setProject,
  setProjects,
  setSelectedProjectId,
  selectActiveProjectOrganizerArrangements,
} from "../../src/store/projectsSlice";
import type { OrganizerArrangement } from "../../src/lib/models/organizer-grid-types";
import type { Project } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const FOLDER_ID = "22222222-2222-4222-8222-222222222222";
const QUERY_ID = "33333333-3333-4333-8333-333333333333";

const ARRANGEMENTS: OrganizerArrangement[] = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "By status",
    source: { kind: "folder", folderId: FOLDER_ID, scope: "descendants" },
    rows: "none",
    columns: { kind: "status" },
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Query grid",
    source: { kind: "smart-folder", queryId: QUERY_ID },
    rows: { kind: "field", key: "pov" },
    columns: "order",
  },
];

function projectWith(config: Record<string, unknown>): Project {
  return {
    id: PROJECT_ID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    rootPath: "/x",
    config: { editorConfig: {}, ...config },
  } as unknown as Project;
}

function makeStore() {
  return configureStore({ reducer: { projects: projectsReducer } });
}

async function writeProjectFile(
  root: string,
  config: Record<string, unknown>,
): Promise<void> {
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify({
      id: PROJECT_ID,
      name: "P",
      createdAt: "2026-01-01T00:00:00.000Z",
      config,
    }),
  );
}

describe("config.organizerArrangements plumbing (Feature 109 Task 24)", () => {
  describe("with a list", () => {
    const cfg = { maxRevisions: 50, organizerArrangements: ARRANGEMENTS };

    it("survives ProjectConfigSchema.parse", () => {
      expect(ProjectConfigSchema.parse(cfg).organizerArrangements).toEqual(
        ARRANGEMENTS,
      );
    });

    it("survives the persisted ProjectSchema parse", () => {
      const parsed = PersistedProjectSchema.parse(projectWith(cfg));
      expect(parsed.config?.organizerArrangements).toEqual(ARRANGEMENTS);
    });

    it("survives normalizeProjectConfig", () => {
      expect(
        normalizeProjectConfig(cfg as never).organizerArrangements,
      ).toEqual(ARRANGEMENTS);
    });

    it("survives buildStoredProject", () => {
      const stored = buildStoredProject(projectWith(cfg), [], []);
      expect(stored.organizerArrangements).toEqual(ARRANGEMENTS);
    });

    it("survives the Redux copy through setProject", () => {
      const store = makeStore();
      store.dispatch(setProject(buildStoredProject(projectWith(cfg), [], [])));
      expect(
        store.getState().projects.projects[PROJECT_ID].organizerArrangements,
      ).toEqual(ARRANGEMENTS);
    });

    it("survives the Redux copy through setProjects", () => {
      const store = makeStore();
      store.dispatch(
        setProjects([
          { project: projectWith(cfg), folders: [], resources: [] },
        ]),
      );
      expect(
        store.getState().projects.projects[PROJECT_ID].organizerArrangements,
      ).toEqual(ARRANGEMENTS);
    });

    it("survives the API ProjectSchema parse", () => {
      const parsed = ApiProjectSchema.parse(projectWith(cfg));
      expect(parsed.config?.organizerArrangements).toEqual(ARRANGEMENTS);
    });

    it("survives a reopen: disk, loadProjectConfig, client parse, Redux", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-oac-"));
      try {
        await writeProjectFile(root, cfg);
        const loaded = await loadProjectConfig(root);
        expect(loaded.organizerArrangements).toEqual(ARRANGEMENTS);
        const client = ApiProjectSchema.parse(
          JSON.parse(JSON.stringify(projectWith(loaded as never))),
        );
        const store = makeStore();
        store.dispatch(
          setProject(buildStoredProject(client as Project, [], [])),
        );
        expect(
          store.getState().projects.projects[PROJECT_ID].organizerArrangements,
        ).toEqual(ARRANGEMENTS);
      } finally {
        await removeDirRetry(root);
      }
    });
  });

  describe("with no key", () => {
    const cfg = { maxRevisions: 50 };

    it("ProjectConfigSchema.parse adds no key", () => {
      expect("organizerArrangements" in ProjectConfigSchema.parse(cfg)).toBe(
        false,
      );
    });

    it("normalizeProjectConfig adds no key", () => {
      expect(
        "organizerArrangements" in
          normalizeProjectConfig({ ...cfg, editorConfig: {} }),
      ).toBe(false);
    });

    it("buildStoredProject adds no key", () => {
      expect(
        "organizerArrangements" in buildStoredProject(projectWith(cfg), [], []),
      ).toBe(false);
    });

    it("the Redux copy adds no key", () => {
      const store = makeStore();
      store.dispatch(setProject(buildStoredProject(projectWith(cfg), [], [])));
      expect(
        "organizerArrangements" in
          store.getState().projects.projects[PROJECT_ID],
      ).toBe(false);
    });

    it("the API parse adds no key", () => {
      const parsed = ApiProjectSchema.parse(projectWith(cfg));
      expect("organizerArrangements" in (parsed.config ?? {})).toBe(false);
    });

    it("a reopen of a file with no key has no key", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-oac-"));
      try {
        await writeProjectFile(root, cfg);
        expect("organizerArrangements" in (await loadProjectConfig(root))).toBe(
          false,
        );
      } finally {
        await removeDirRetry(root);
      }
    });
  });

  describe("schema bounds", () => {
    it("refuses an unknown key on an arrangement", () => {
      const bad = [{ ...ARRANGEMENTS[0], extra: 1 }];
      expect(
        ProjectConfigSchema.safeParse({ organizerArrangements: bad }).success,
      ).toBe(false);
    });

    it("refuses a non-UUID id, a blank or long name and a malformed axis", () => {
      for (const bad of [
        { ...ARRANGEMENTS[0], id: "nope" },
        { ...ARRANGEMENTS[0], name: "" },
        { ...ARRANGEMENTS[0], name: "x".repeat(101) },
        { ...ARRANGEMENTS[0], columns: "status" },
      ]) {
        expect(
          ProjectConfigSchema.safeParse({ organizerArrangements: [bad] })
            .success,
        ).toBe(false);
      }
    });

    it("still reads a stored `none` Columns axis (the write check is in the core, so a project already holding one loads)", () => {
      const stored = [{ ...ARRANGEMENTS[0], columns: "none" }];
      expect(
        ProjectConfigSchema.safeParse({ organizerArrangements: stored })
          .success,
      ).toBe(true);
    });

    it("refuses 51 arrangements and accepts 50", () => {
      const make = (n: number) =>
        Array.from({ length: n }, () => ARRANGEMENTS[0]);
      expect(
        ProjectConfigSchema.safeParse({ organizerArrangements: make(51) })
          .success,
      ).toBe(false);
      expect(
        ProjectConfigSchema.safeParse({ organizerArrangements: make(50) })
          .success,
      ).toBe(true);
    });
  });

  describe("selectActiveProjectOrganizerArrangements", () => {
    it("returns the list for the active project", () => {
      const store = makeStore();
      store.dispatch(
        setProject(
          buildStoredProject(
            projectWith({ organizerArrangements: ARRANGEMENTS }),
            [],
            [],
          ),
        ),
      );
      store.dispatch(setSelectedProjectId(PROJECT_ID));
      expect(
        selectActiveProjectOrganizerArrangements(store.getState()),
      ).toEqual(ARRANGEMENTS);
    });

    it("returns an empty list for a project with none and for no project", () => {
      const store = makeStore();
      expect(
        selectActiveProjectOrganizerArrangements(store.getState()),
      ).toEqual([]);
      store.dispatch(setProject(buildStoredProject(projectWith({}), [], [])));
      store.dispatch(setSelectedProjectId(PROJECT_ID));
      expect(
        selectActiveProjectOrganizerArrangements(store.getState()),
      ).toEqual([]);
    });

    it("returns one stable empty array", () => {
      const state = makeStore().getState();
      expect(selectActiveProjectOrganizerArrangements(state)).toBe(
        selectActiveProjectOrganizerArrangements(state),
      );
    });
  });
});
