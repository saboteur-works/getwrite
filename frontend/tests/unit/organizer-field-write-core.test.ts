/**
 * Feature 109, Task 10 (FR-7, FR-8, FR-13; OQ-6, OQ-19): the field-write core
 * sets named `userMetadata` keys and `resourceSubtype` for one resource inside
 * one `mutateSidecar` write. Real temp-dir project; no route or transport.
 */
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as io from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { generateUUID } from "../../src/lib/models/uuid";
import { setOrganizerFieldsCore } from "../../src/lib/models/organizer-field-write-core";
import type {
  OrganizerFieldChange,
  OrganizerFieldWriteResult,
} from "../../src/lib/models/organizer-grid-types";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { withMetaLock } from "../../src/lib/models/meta-locks";
import { ResourceGoneError } from "../../src/lib/models/resource-gone-error";
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-crud-core";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];
const ORIGINAL_DIR = process.env.GETWRITE_PROJECTS_DIR;
const ORIGINAL_ADAPTER = io.getStorageAdapter();

afterEach(async () => {
  io.setStorageAdapter(ORIGINAL_ADAPTER);
  process.env.GETWRITE_PROJECTS_DIR = ORIGINAL_DIR;
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

const FIELDS = [
  { key: "mood", label: "Mood", type: "select", options: ["calm", "tense"] },
  {
    key: "themes",
    label: "Themes",
    type: "multiselect",
    options: ["love", "loss", "war"],
  },
  { key: "arc", label: "Arc", type: "select", options: ["rise", "fall"] },
  { key: "count", label: "Count", type: "number" },
  { key: "pinned", label: "Pinned", type: "boolean" },
  { key: "title", label: "Title", type: "text" },
  {
    key: "locker",
    label: "Locker",
    type: "select",
    locked: true,
    options: ["a"],
  },
  {
    key: "old",
    label: "Old",
    type: "select",
    deprecated: true,
    options: ["a"],
  },
  {
    key: "scoped",
    label: "Scoped",
    type: "select",
    options: ["x", "y"],
    appliesTo: ["Scene"],
  },
  { key: "cast", label: "Cast", type: "resource-ref", multiple: false },
  { key: "pair", label: "Pair", type: "multi-resource-ref", maxSelections: 2 },
];

interface Ctx {
  projectId: string;
  projectPath: string;
  resourceId: string;
}

async function withProject<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-organizer-field-write-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  const project = {
    id: projectId,
    name: "P",
    config: {
      statuses: ["Draft", "Final"],
      subtypes: ["Scene", "Chapter"],
      metadataSchema: { groups: [{ id: "g", label: "G", fields: FIELDS }] },
    },
  };
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify(project),
    "utf8",
  );
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  return fn({ projectId, projectPath, resourceId: generateUUID() });
}

function set(
  target: OrganizerFieldChange["target"],
  value: unknown,
): OrganizerFieldChange {
  return { target, op: "set", value } as OrganizerFieldChange;
}

function clear(target: OrganizerFieldChange["target"]): OrganizerFieldChange {
  return { target, op: "clear" };
}

function refusal(
  result: OrganizerFieldWriteResult,
): Extract<OrganizerFieldWriteResult, { ok: false }> {
  if (result.ok) throw new Error("expected a refusal");
  return result;
}

const BASE = {
  orderIndex: 4,
  folderId: "folder-1",
  entityKind: "character",
  aliases: ["Al"],
  wordCountGoal: 500,
};

describe("setOrganizerFieldsCore: writes", () => {
  it("stores two fields from one call, keeping unnamed userMetadata and untouched keys", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        resourceSubtype: "Chapter",
        userMetadata: { synopsis: "kept", status: "Draft", themes: ["love"] },
      });
      const result = await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [
          set({ kind: "field", key: "mood" }, "tense"),
          set({ kind: "status" }, "Final"),
        ],
      });
      expect(result).toEqual({ ok: true, resourceId });
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored).toEqual({
        ...BASE,
        resourceSubtype: "Chapter",
        userMetadata: {
          synopsis: "kept",
          status: "Final",
          themes: ["love"],
          mood: "tense",
        },
      });
    });
  });

  it("writes a subtype in the list's spelling together with a field in one call", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        userMetadata: {},
      });
      const result = await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [
          set({ kind: "subtype" }, "  scene "),
          set({ kind: "field", key: "scoped" }, "x"),
        ],
      });
      expect(result.ok).toBe(true);
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored?.resourceSubtype).toBe("Scene");
      expect((stored?.userMetadata as Record<string, unknown>).scoped).toBe(
        "x",
      );
    });
  });

  it("clears status by removing the key and subtype by removing resourceSubtype", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        resourceSubtype: "Scene",
        userMetadata: { status: "Draft", mood: "calm" },
      });
      const result = await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [clear({ kind: "status" }), clear({ kind: "subtype" })],
      });
      expect(result.ok).toBe(true);
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored).not.toHaveProperty("resourceSubtype");
      expect(stored?.userMetadata).toEqual({ mood: "calm" });
      expect(stored?.entityKind).toBe("character");
    });
  });

  it("clears a named field key and leaves the others", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        userMetadata: { mood: "calm", arc: "rise" },
      });
      await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [clear({ kind: "field", key: "mood" })],
      });
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored?.userMetadata).toEqual({ arc: "rise" });
    });
  });

  it("accepts valid multiselect, number, boolean, text and reference values", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, { ...BASE });
      const ref = { id: generateUUID(), name: "Ann" };
      const result = await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [
          set({ kind: "field", key: "themes" }, ["love", "war"]),
          set({ kind: "field", key: "count" }, 3),
          set({ kind: "field", key: "pinned" }, true),
          set({ kind: "field", key: "title" }, "T"),
          set({ kind: "field", key: "cast" }, ref),
          set({ kind: "field", key: "pair" }, [
            ref,
            { id: generateUUID(), name: "B" },
          ]),
        ],
      });
      expect(result.ok).toBe(true);
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored?.userMetadata).toMatchObject({
        themes: ["love", "war"],
        count: 3,
        pinned: true,
        title: "T",
        cast: ref,
      });
    });
  });

  it("writes nothing when the value is already stored", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        userMetadata: { mood: "calm" },
      });
      const file = path.join(
        projectPath,
        "meta",
        `resource-${resourceId}.meta.json`,
      );
      const before = await fs.stat(file);
      await new Promise((r) => setTimeout(r, 20));
      const result = await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [set({ kind: "field", key: "mood" }, "calm")],
      });
      expect(result.ok).toBe(true);
      expect((await fs.stat(file)).mtimeMs).toBe(before.mtimeMs);
    });
  });

  it("keeps both fields when two calls race for one resource", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        userMetadata: {},
      });
      await Promise.all([
        setOrganizerFieldsCore(projectId, {
          resourceId,
          changes: [set({ kind: "field", key: "mood" }, "calm")],
        }),
        setOrganizerFieldsCore(projectId, {
          resourceId,
          changes: [set({ kind: "field", key: "arc" }, "fall")],
        }),
      ]);
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored?.userMetadata).toEqual({ mood: "calm", arc: "fall" });
    });
  });
});

describe("setOrganizerFieldsCore: refusals", () => {
  const cases: Array<{
    name: string;
    changes: OrganizerFieldChange[];
    reason: string;
    subtype?: string;
  }> = [
    {
      name: "a select value not in options",
      changes: [set({ kind: "field", key: "mood" }, "SECRET-LEAK")],
      reason: "value-not-in-list",
    },
    {
      name: "a multiselect value not in options",
      changes: [set({ kind: "field", key: "themes" }, ["love", "SECRET-LEAK"])],
      reason: "value-not-in-list",
    },
    {
      name: "a status not in config.statuses",
      changes: [set({ kind: "status" }, "SECRET-LEAK")],
      reason: "value-not-in-list",
    },
    {
      name: "a subtype not in config.subtypes",
      changes: [set({ kind: "subtype" }, "SECRET-LEAK")],
      reason: "subtype-not-in-list",
    },
    {
      name: "more references than maxSelections",
      changes: [
        set(
          { kind: "field", key: "pair" },
          [1, 2, 3].map((n) => ({ id: generateUUID(), name: `n${n}` })),
        ),
      ],
      reason: "max-selections-exceeded",
    },
    {
      name: "a locked field",
      changes: [set({ kind: "field", key: "locker" }, "a")],
      reason: "field-locked",
    },
    {
      name: "a clear of a locked field",
      changes: [clear({ kind: "field", key: "locker" })],
      reason: "field-locked",
    },
    {
      name: "a key the schema does not have",
      changes: [set({ kind: "field", key: "SECRET-LEAK" }, "x")],
      reason: "unknown-field",
    },
    {
      name: "a deprecated field",
      changes: [set({ kind: "field", key: "old" }, "a")],
      reason: "unknown-field",
    },
    {
      name: "a field outside the document's subtype scope",
      changes: [set({ kind: "field", key: "scoped" }, "x")],
      reason: "field-out-of-subtype-scope",
      subtype: "Chapter",
    },
    {
      name: "a wrong value type",
      changes: [set({ kind: "field", key: "count" }, "three")],
      reason: "invalid-input",
    },
    {
      name: "a reference with no id",
      changes: [set({ kind: "field", key: "cast" }, { id: null, name: "x" })],
      reason: "invalid-input",
    },
    {
      name: "status written through the field target",
      changes: [set({ kind: "field", key: "status" }, "Draft")],
      reason: "invalid-input",
    },
  ];

  it.each(cases)(
    "refuses $name, echoes no input, writes nothing",
    async ({ changes, reason, subtype }) => {
      await withProject(async ({ projectId, projectPath, resourceId }) => {
        const initial = {
          ...BASE,
          ...(subtype ? { resourceSubtype: subtype } : {}),
          userMetadata: { mood: "calm" },
        };
        await writeSidecar(projectPath, resourceId, initial);
        const result = refusal(
          await setOrganizerFieldsCore(projectId, { resourceId, changes }),
        );
        expect(result.reason).toBe(reason);
        expect(result.message.length).toBeGreaterThan(0);
        expect(result.message).not.toContain("SECRET-LEAK");
        expect(result.message).not.toContain(resourceId);
        expect(await readSidecar(projectPath, resourceId)).toEqual(initial);
      });
    },
  );

  it("refuses the whole call when one of two changes is invalid", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        userMetadata: {},
      });
      const result = await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [
          set({ kind: "field", key: "mood" }, "calm"),
          set({ kind: "field", key: "arc" }, "nope"),
        ],
      });
      expect(result.ok).toBe(false);
      expect(
        (await readSidecar(projectPath, resourceId))?.userMetadata,
      ).toEqual({});
    });
  });

  it("judges scope against the subtype the same write sets", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...BASE,
        resourceSubtype: "Chapter",
        userMetadata: {},
      });
      const result = await setOrganizerFieldsCore(projectId, {
        resourceId,
        changes: [
          set({ kind: "subtype" }, "Scene"),
          set({ kind: "field", key: "scoped" }, "y"),
        ],
      });
      expect(result.ok).toBe(true);
    });
  });
});

describe("setOrganizerFieldsCore: malformed payloads are refused before any lock", () => {
  const id = generateUUID();
  const malformed: unknown[] = [
    null,
    "x",
    [],
    {},
    { resourceId: "../../etc", changes: [clear({ kind: "status" })] },
    { resourceId: id, changes: [] },
    { resourceId: id, changes: "no" },
    { resourceId: id, changes: [{ op: "set" }] },
    { resourceId: id, changes: [{ target: { kind: "status" }, op: "wipe" }] },
    {
      resourceId: id,
      changes: [{ target: { kind: "orderIndex" }, op: "clear" }],
    },
    { resourceId: id, changes: [{ target: { kind: "status" }, op: "set" }] },
    {
      resourceId: id,
      changes: [{ target: { kind: "status" }, op: "clear", value: "x" }],
    },
    { resourceId: id, changes: [{ target: { kind: "field" }, op: "clear" }] },
    {
      resourceId: id,
      changes: [{ target: { kind: "field", key: "__proto__" }, op: "clear" }],
    },
    {
      resourceId: id,
      changes: [{ target: { kind: "status" }, op: "clear", extra: 1 }],
    },
    { resourceId: id, changes: [clear({ kind: "status" })], orderIndex: 9 },
    {
      resourceId: id,
      changes: [clear({ kind: "status" }), set({ kind: "status" }, "Draft")],
    },
  ];

  it.each(malformed.map((m, i) => [i, m] as const))(
    "case %i returns invalid-input while the meta lock is held",
    async (_i, payload) => {
      await withProject(async ({ projectId, projectPath }) => {
        let outcome: unknown = "pending";
        await withMetaLock(projectPath, async () => {
          outcome = await Promise.race([
            setOrganizerFieldsCore(projectId, payload as never),
            new Promise((r) => setTimeout(() => r("blocked"), 300)),
          ]);
        });
        expect(outcome).not.toBe("blocked");
        expect(refusal(outcome as OrganizerFieldWriteResult).reason).toBe(
          "invalid-input",
        );
      });
    },
  );

  it("refuses an unknown field key before the lock too", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, { ...BASE });
      let outcome: unknown = "pending";
      await withMetaLock(projectPath, async () => {
        outcome = await Promise.race([
          setOrganizerFieldsCore(projectId, {
            resourceId,
            changes: [set({ kind: "field", key: "nope" }, "x")],
          }),
          new Promise((r) => setTimeout(() => r("blocked"), 300)),
        ]);
      });
      expect(refusal(outcome as OrganizerFieldWriteResult).reason).toBe(
        "unknown-field",
      );
    });
  });
});

describe("setOrganizerFieldsCore: errors", () => {
  it("raises ResourceGoneError for a resource with no sidecar and creates none", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await expect(
        setOrganizerFieldsCore(projectId, {
          resourceId,
          changes: [set({ kind: "status" }, "Draft")],
        }),
      ).rejects.toBeInstanceOf(ResourceGoneError);
      expect(await readSidecar(projectPath, resourceId)).toBeNull();
    });
  });

  it("raises InvalidProjectIdCoreError for a malformed project id", async () => {
    await expect(
      setOrganizerFieldsCore("../nope", {
        resourceId: generateUUID(),
        changes: [clear({ kind: "status" })],
      }),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("rethrows a locked-access error rather than reporting gone or a refusal", async () => {
    const WORKSPACE = "/ws";
    const base = createMemoryAdapter();
    const projectId = generateUUID();
    await base.mkdir(`${WORKSPACE}/${projectId}`, { recursive: true });
    const keyring: Keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(projectId);
    await writeProjectMarker(`${WORKSPACE}/${projectId}`, base);
    process.env.GETWRITE_PROJECTS_DIR = WORKSPACE;
    keyring.lock();
    io.setStorageAdapter(workspaceEncryptionAdapter(base, WORKSPACE, keyring));
    await expect(
      setOrganizerFieldsCore(projectId, {
        resourceId: generateUUID(),
        changes: [set({ kind: "status" }, "Draft")],
      }),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });
});

describe("organizer-field-write-core import graph", () => {
  it("imports no React, JSX, JSON or node:*", () => {
    const text = readFileSync(
      path.resolve(
        __dirname,
        "../../src/lib/models/organizer-field-write-core.ts",
      ),
      "utf8",
    );
    const specs = [
      ...text.matchAll(
        /\b(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g,
      ),
    ].map((m) => m[1]);
    expect(
      specs.filter(
        (s) =>
          s === "react" || s.startsWith("node:") || /\.(tsx|jsx|json)$/.test(s),
      ),
    ).toEqual([]);
  });
});
