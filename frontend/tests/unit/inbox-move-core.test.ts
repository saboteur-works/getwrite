/**
 * Feature 106 Task 14 (FR-23, OQ-3): the move core that clears a moved item's
 * saved compile exclusion when it leaves the Inbox subtree.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const control = vi.hoisted(() => ({ failRemoval: false }));

vi.mock("../../src/lib/models/saved-defaults-core", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/saved-defaults-core")
    >();
  return {
    ...actual,
    removeCompileExclusions: (
      ...args: Parameters<typeof actual.removeCompileExclusions>
    ) => {
      if (control.failRemoval) {
        return Promise.reject(new Error("disk full"));
      }
      return actual.removeCompileExclusions(...args);
    },
  };
});

import {
  INBOX_EXCLUSION_NOT_CLEARED_NOTICE,
  reorderResourcesClearingInboxExclusions,
} from "../../src/lib/models/inbox-move-core";

const tmpDirs: string[] = [];
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;

beforeEach(() => {
  control.failRemoval = false;
});

afterEach(async () => {
  process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

interface Fixture {
  projectId: string;
  root: string;
  inbox: string;
  sub: string;
  other: string;
  inInbox: string;
  inSub: string;
  outside: string;
}

async function writeFolder(
  root: string,
  dirParts: string[],
  id: string,
  parentId: string | null,
): Promise<void> {
  const dir = path.join(root, "folders", ...dirParts);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "folder.json"),
    JSON.stringify({ id, name: id, parentId, orderIndex: 0 }),
  );
}

/** A resource directory plus its sidecar, as the id listing and the move read them. */
async function writeResource(
  root: string,
  id: string,
  name: string,
  folderId: string,
): Promise<void> {
  await fs.mkdir(path.join(root, "resources", id), { recursive: true });
  await writeSidecar(root, id, { name, folderId });
}

async function makeFixture(opts?: {
  inboxFolderId?: boolean;
  excluded?: string[];
}): Promise<Fixture> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-inbox-move-"),
  );
  tmpDirs.push(projectsDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const root = path.join(projectsDir, projectId);
  const [inbox, sub, other] = [generateUUID(), generateUUID(), generateUUID()];
  const [inInbox, inSub, outside] = [
    generateUUID(),
    generateUUID(),
    generateUUID(),
  ];
  await fs.mkdir(root, { recursive: true });
  const config: Record<string, unknown> = {
    compileDefaults: {
      excludedResourceIds: opts?.excluded ?? [inInbox, inSub, outside],
    },
    exportDefaults: { excludedResourceIds: [inInbox] },
  };
  if (opts?.inboxFolderId !== false) config.inboxFolderId = inbox;
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: projectId, name: "P", config }),
  );
  await writeFolder(root, [inbox], inbox, null);
  await writeFolder(root, [inbox, sub], sub, inbox);
  await writeFolder(root, [other], other, null);
  await writeResource(root, inInbox, "a", inbox);
  await writeResource(root, inSub, "b", sub);
  await writeResource(root, outside, "c", other);
  return { projectId, root, inbox, sub, other, inInbox, inSub, outside };
}

async function compileIds(root: string): Promise<string[]> {
  const project = JSON.parse(
    await fs.readFile(path.join(root, "project.json"), "utf8"),
  ) as { config: { compileDefaults?: { excludedResourceIds: string[] } } };
  return project.config.compileDefaults?.excludedResourceIds ?? [];
}

describe("reorderResourcesClearingInboxExclusions", () => {
  it("removes a resource's id when it moves from the Inbox to a folder outside it", async () => {
    const f = await makeFixture();
    const out = await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [],
      resourceOrder: [{ id: f.inInbox, orderIndex: 0, folderId: f.other }],
    });
    expect(out).toEqual({});
    expect((await compileIds(f.root)).sort()).toEqual(
      [f.inSub, f.outside].sort(),
    );
  });

  it("removes the ids of every resource inside a folder moved out", async () => {
    const f = await makeFixture();
    const out = await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [{ id: f.sub, orderIndex: 0, folderId: f.other }],
      resourceOrder: [],
    });
    expect(out).toEqual({});
    expect((await compileIds(f.root)).sort()).toEqual(
      [f.inInbox, f.outside].sort(),
    );
  });

  it("removes the ids of resources in descendant folders of a folder moved out", async () => {
    const f = await makeFixture();
    const deep = generateUUID();
    const inDeep = generateUUID();
    await writeFolder(f.root, [f.inbox, f.sub, deep], deep, f.sub);
    await writeResource(f.root, inDeep, "d", deep);
    const project = JSON.parse(
      await fs.readFile(path.join(f.root, "project.json"), "utf8"),
    ) as { config: { compileDefaults: { excludedResourceIds: string[] } } };
    project.config.compileDefaults.excludedResourceIds.push(inDeep);
    await fs.writeFile(
      path.join(f.root, "project.json"),
      JSON.stringify(project),
    );
    await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [
        { id: f.sub, orderIndex: 0, folderId: null },
        { id: f.other, orderIndex: 1, folderId: null },
      ],
      resourceOrder: [{ id: f.inInbox, orderIndex: 0, folderId: f.inbox }],
    });
    expect((await compileIds(f.root)).sort()).toEqual(
      [f.inInbox, f.outside].sort(),
    );
  });

  it("leaves every id for a move within the Inbox subtree", async () => {
    const f = await makeFixture();
    await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [],
      resourceOrder: [{ id: f.inInbox, orderIndex: 0, folderId: f.sub }],
    });
    expect((await compileIds(f.root)).sort()).toEqual(
      [f.inInbox, f.inSub, f.outside].sort(),
    );
  });

  it("leaves ids as they are for a move from outside into the Inbox", async () => {
    const f = await makeFixture();
    await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [],
      resourceOrder: [{ id: f.outside, orderIndex: 0, folderId: f.inbox }],
    });
    expect((await compileIds(f.root)).sort()).toEqual(
      [f.inInbox, f.inSub, f.outside].sort(),
    );
  });

  it("is a no-op for an id absent from the list and leaves exportDefaults alone", async () => {
    const f = await makeFixture({ excluded: [] });
    const out = await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [],
      resourceOrder: [{ id: f.inInbox, orderIndex: 0, folderId: f.other }],
    });
    expect(out).toEqual({});
    expect(await compileIds(f.root)).toEqual([]);
    const project = JSON.parse(
      await fs.readFile(path.join(f.root, "project.json"), "utf8"),
    ) as { config: { exportDefaults: { excludedResourceIds: string[] } } };
    expect(project.config.exportDefaults.excludedResourceIds).toEqual([
      f.inInbox,
    ]);
  });

  it("changes nothing in a project with no inboxFolderId", async () => {
    const f = await makeFixture({ inboxFolderId: false });
    const out = await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [],
      resourceOrder: [{ id: f.inInbox, orderIndex: 0, folderId: f.other }],
    });
    expect(out).toEqual({});
    expect((await compileIds(f.root)).sort()).toEqual(
      [f.inInbox, f.inSub, f.outside].sort(),
    );
  });

  it("keeps the move and returns a notice when the removal throws", async () => {
    const f = await makeFixture();
    control.failRemoval = true;
    const out = await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [],
      resourceOrder: [{ id: f.inInbox, orderIndex: 0, folderId: f.other }],
    });
    expect(out).toEqual({ notice: INBOX_EXCLUSION_NOT_CLEARED_NOTICE });
    const sidecar = JSON.parse(
      await fs.readFile(
        path.join(f.root, "meta", `resource-${f.inInbox}.meta.json`),
        "utf8",
      ),
    ) as { folderId: string };
    expect(sidecar.folderId).toBe(f.other);
    expect(await compileIds(f.root)).toContain(f.inInbox);
  });

  it("returns a notice, not silence, when the Inbox folder tree is malformed", async () => {
    const f = await makeFixture();
    // A duplicated folder id below the Inbox makes the subtree walk fail.
    await writeFolder(f.root, [f.inbox, "dup"], f.sub, f.inbox);
    const out = await reorderResourcesClearingInboxExclusions(f.projectId, {
      folderOrder: [],
      resourceOrder: [{ id: f.inInbox, orderIndex: 0, folderId: f.other }],
    });
    expect(out).toEqual({ notice: INBOX_EXCLUSION_NOT_CLEARED_NOTICE });
  });

  it("still throws the existing not-found error for a missing project", async () => {
    await makeFixture();
    await expect(
      reorderResourcesClearingInboxExclusions(generateUUID(), {
        folderOrder: [],
        resourceOrder: [],
      }),
    ).rejects.toMatchObject({ name: "ReorderProjectNotFoundError" });
  });
});
