/**
 * Feature 109 Task 25: arrangements core (FR-14, FR-20; OQ-2, OQ-3).
 * Add, rename and delete validate before any lock, refuse without echoing
 * input, re-read inside `withMetaLock` plus `updateProjectJson` (no lost
 * update), touch only `config.organizerArrangements` and rethrow locked-access
 * errors unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { createProjectJsonWriteProbe } from "../helpers/projectJsonWriteProbe";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  addOrganizerArrangementCore,
  renameOrganizerArrangementCore,
  deleteOrganizerArrangementCore,
  validateOrganizerArrangementDraft,
  OrganizerArrangementRefusalError,
} from "../../src/lib/models/organizer-arrangements-core";
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-id-core-error";
import {
  ORGANIZER_ARRANGEMENT_LIMIT,
  type OrganizerArrangement,
  type OrganizerArrangementAddInput,
} from "../../src/lib/models/organizer-grid-types";
import { generateUUID } from "../../src/lib/models/uuid";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "55555555-5555-4555-8555-555555555555";
const TENANT = "/ws-org-arr-core";
const ROOT = `${TENANT}/${PID}`;
const FOLDER = generateUUID();
const QUERY = generateUUID();

const projectJson = (config: Record<string, unknown> = {}): string =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });
const readConfig = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
const stored = async (): Promise<OrganizerArrangement[]> =>
  ((await readConfig()).organizerArrangements ?? []) as OrganizerArrangement[];

const draft = (
  over: Partial<OrganizerArrangementAddInput> = {},
): OrganizerArrangementAddInput => ({
  name: "Plot by status",
  source: { kind: "folder", folderId: FOLDER, scope: "children" },
  rows: { kind: "status" },
  columns: "order",
  ...over,
});

async function add(
  over: Partial<OrganizerArrangementAddInput> = {},
): Promise<string> {
  const out = await addOrganizerArrangementCore(PID, draft(over));
  if (!out.ok) throw new Error(`add refused: ${out.reason}`);
  return out.id;
}

const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
beforeEach(async () => {
  process.env.GETWRITE_PROJECTS_DIR = TENANT;
  setStorageAdapter(createMemoryAdapter());
  await mkdir(ROOT, { recursive: true });
  await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
});
afterEach(() => {
  if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
});

describe("add", () => {
  it("stores { id, name, source, rows, columns } and returns the new UUID id", async () => {
    const out = await addOrganizerArrangementCore(PID, draft());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(await stored()).toEqual([{ id: out.id, ...draft() }]);
  });

  it("trims the name", async () => {
    await add({ name: "  Spaced  " });
    expect((await stored())[0].name).toBe("Spaced");
  });

  it("accepts smart-folder source, field axes and exactly 100 characters", async () => {
    const name = "x".repeat(100);
    await add({
      name,
      source: { kind: "smart-folder", queryId: QUERY },
      rows: { kind: "field", key: "mood" },
      columns: { kind: "subtype" },
    });
    expect((await stored())[0]).toMatchObject({
      name,
      source: { kind: "smart-folder", queryId: QUERY },
      rows: { kind: "field", key: "mood" },
      columns: { kind: "subtype" },
    });
  });

  it("refuses blank, over-length and duplicate names (trim and case-fold)", async () => {
    await add({ name: "Alpha" });
    const cases: ReadonlyArray<[string, string]> = [
      ["", "name-blank"],
      ["   ", "name-blank"],
      ["y".repeat(101), "name-too-long"],
      ["  ALPHA ", "name-duplicate"],
    ];
    for (const [name, reason] of cases) {
      const out = await addOrganizerArrangementCore(PID, draft({ name }));
      expect(out).toMatchObject({ ok: false, reason });
    }
    expect(await stored()).toHaveLength(1);
  });

  it("refuses the 51st arrangement and truncates nothing", async () => {
    for (let i = 0; i < ORGANIZER_ARRANGEMENT_LIMIT; i++) {
      await add({ name: `A${i}` });
    }
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    const out = await addOrganizerArrangementCore(
      PID,
      draft({ name: "Extra" }),
    );
    expect(out).toMatchObject({ ok: false, reason: "limit-reached" });
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
    expect(await stored()).toHaveLength(ORGANIZER_ARRANGEMENT_LIMIT);
  });

  it("refuses an unknown key, malformed source or axis and a non-UUID id, without echoing input", async () => {
    const secret = "SECRET-CLIENT-VALUE";
    const bad: ReadonlyArray<[unknown, string]> = [
      [{ ...draft(), extra: secret }, "invalid-input"],
      [{ ...draft(), id: secret }, "invalid-input"],
      [null, "invalid-input"],
      [[draft()], "invalid-input"],
      [{ ...draft(), name: 5 }, "invalid-input"],
      [
        {
          ...draft(),
          source: { kind: "folder", folderId: secret, scope: "children" },
        },
        "invalid-source",
      ],
      [
        {
          ...draft(),
          source: { kind: "folder", folderId: FOLDER, scope: secret },
        },
        "invalid-source",
      ],
      [
        {
          ...draft(),
          source: {
            kind: "folder",
            folderId: FOLDER,
            scope: "children",
            x: secret,
          },
        },
        "invalid-source",
      ],
      [
        { ...draft(), source: { kind: "smart-folder", queryId: secret } },
        "invalid-source",
      ],
      [{ ...draft(), source: { kind: secret } }, "invalid-source"],
      [{ ...draft(), source: secret }, "invalid-source"],
      [{ ...draft(), rows: secret }, "invalid-axis"],
      [{ ...draft(), columns: { kind: "field" } }, "invalid-axis"],
      [{ ...draft(), columns: { kind: "field", key: "" } }, "invalid-axis"],
      [
        { ...draft(), columns: { kind: "field", key: "__proto__" } },
        "invalid-axis",
      ],
      [
        { ...draft(), columns: { kind: "status", extra: secret } },
        "invalid-axis",
      ],
      [{ ...draft(), columns: { kind: "none" } }, "invalid-axis"],
    ];
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    for (const [input, reason] of bad) {
      const out = await addOrganizerArrangementCore(
        PID,
        input as OrganizerArrangementAddInput,
      );
      expect(out).toMatchObject({ ok: false, reason });
      expect(JSON.stringify(out)).not.toContain(secret);
    }
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
  });

  it("refuses `order` on Rows (Columns only) and accepts it on Columns", async () => {
    const out = await addOrganizerArrangementCore(
      PID,
      draft({ rows: "order" }),
    );
    expect(out).toMatchObject({ ok: false, reason: "invalid-axis" });
    expect(await stored()).toHaveLength(0);
    await add({ rows: "none", columns: "order" });
    expect(await stored()).toHaveLength(1);
  });

  it("refuses `none` on Columns (the spec offers order or a field there) and accepts it on Rows", async () => {
    // FR-2: Rows offers "none" or a field, Columns offers "order" or a field.
    // The Columns picker has no "none", so a saved one could not be shown.
    const out = await addOrganizerArrangementCore(
      PID,
      draft({ columns: "none" }),
    );
    expect(out).toMatchObject({ ok: false, reason: "invalid-axis" });
    expect(await stored()).toHaveLength(0);
    expect(() =>
      validateOrganizerArrangementDraft({ ...draft(), columns: "none" }),
    ).toThrow();
    await add({ rows: "none", columns: { kind: "status" } });
    expect(await stored()).toHaveLength(1);
  });

  it("stores a source or field that no longer exists as written", async () => {
    // The ids and key are not checked against the project: availability is
    // read-side (Task 29).
    const id = await add({ rows: { kind: "field", key: "gone-field" } });
    expect((await stored())[0]).toMatchObject({
      id,
      rows: { kind: "field", key: "gone-field" },
    });
  });

  it("validates before taking any lock or write", async () => {
    const probe = createProjectJsonWriteProbe();
    setStorageAdapter(probe.adapter);
    await mkdir(ROOT, { recursive: true });
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
    const writesBefore = probe.lockKeysAtWrite.length;
    const out = await addOrganizerArrangementCore(PID, draft({ name: "" }));
    expect(out.ok).toBe(false);
    expect(probe.lockKeysAtWrite.length).toBe(writesBefore);
  });
});

describe("rename", () => {
  it("renames, trimming, keeping every other field", async () => {
    const id = await add({ name: "One" });
    const before = (await stored())[0];
    const out = await renameOrganizerArrangementCore(PID, {
      id,
      name: "  Two ",
    });
    expect(out).toEqual({ ok: true, id });
    expect((await stored())[0]).toEqual({ ...before, name: "Two" });
  });

  it("allows a case-only rename of itself, refuses another's name", async () => {
    const a = await add({ name: "Alpha" });
    await add({ name: "Beta" });
    expect(
      await renameOrganizerArrangementCore(PID, { id: a, name: "ALPHA" }),
    ).toEqual({ ok: true, id: a });
    expect(
      await renameOrganizerArrangementCore(PID, { id: a, name: " beta " }),
    ).toMatchObject({ ok: false, reason: "name-duplicate" });
  });

  it("refuses an unknown id, a non-UUID id, a bad name and an unknown key", async () => {
    const id = await add();
    const secret = "SECRET-CLIENT-VALUE";
    const cases: ReadonlyArray<[unknown, string]> = [
      [{ id: generateUUID(), name: "N" }, "not-found"],
      [{ id: secret, name: "N" }, "invalid-id"],
      [{ id, name: "  " }, "name-blank"],
      [{ id, name: "z".repeat(101) }, "name-too-long"],
      [{ id, name: "N", extra: secret }, "invalid-input"],
      [{ id }, "invalid-input"],
    ];
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    for (const [input, reason] of cases) {
      const out = await renameOrganizerArrangementCore(
        PID,
        input as { id: string; name: string },
      );
      expect(out).toMatchObject({ ok: false, reason });
      expect(JSON.stringify(out)).not.toContain(secret);
    }
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
  });
});

describe("delete", () => {
  it("removes only the named arrangement", async () => {
    const a = await add({ name: "A" });
    const b = await add({ name: "B" });
    expect(await deleteOrganizerArrangementCore(PID, { id: a })).toEqual({
      ok: true,
      id: a,
    });
    expect((await stored()).map((x) => x.id)).toEqual([b]);
  });

  it("refuses an unknown id, a non-UUID id and an unknown key", async () => {
    await add();
    expect(
      await deleteOrganizerArrangementCore(PID, { id: generateUUID() }),
    ).toMatchObject({ ok: false, reason: "not-found" });
    expect(
      await deleteOrganizerArrangementCore(PID, { id: "nope" }),
    ).toMatchObject({ ok: false, reason: "invalid-id" });
    expect(
      await deleteOrganizerArrangementCore(PID, {
        id: generateUUID(),
        extra: 1,
      } as unknown as { id: string }),
    ).toMatchObject({ ok: false, reason: "invalid-input" });
    expect(await stored()).toHaveLength(1);
  });
});

describe("persistence and locking", () => {
  it("two interleaved adds both persist (no lost update)", async () => {
    const [x, y] = await Promise.all([
      addOrganizerArrangementCore(PID, draft({ name: "X" })),
      addOrganizerArrangementCore(PID, draft({ name: "Y" })),
    ]);
    expect(x.ok && y.ok).toBe(true);
    expect((await stored()).map((a) => a.name).sort()).toEqual(["X", "Y"]);
  });

  it("an interleaved add and rename and delete all persist", async () => {
    const a = await add({ name: "A" });
    const b = await add({ name: "B" });
    await Promise.all([
      addOrganizerArrangementCore(PID, draft({ name: "C" })),
      renameOrganizerArrangementCore(PID, { id: a, name: "A2" }),
      deleteOrganizerArrangementCore(PID, { id: b }),
    ]);
    expect((await stored()).map((x) => x.name).sort()).toEqual(["A2", "C"]);
  });

  it("20 concurrent adds all persist", async () => {
    const outs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        addOrganizerArrangementCore(PID, draft({ name: `N${i}` })),
      ),
    );
    expect(outs.every((o) => o.ok)).toBe(true);
    expect(await stored()).toHaveLength(20);
  });

  it("every write holds the project.json lock", async () => {
    const probe = createProjectJsonWriteProbe();
    setStorageAdapter(probe.adapter);
    await mkdir(ROOT, { recursive: true });
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
    const before = probe.lockKeysAtWrite.length;
    await add();
    expect(probe.lockKeysAtWrite.length).toBeGreaterThan(before);
  });

  it("touches only the one config key", async () => {
    const untouched = {
      goalFilter: { op: "eq", field: "status", value: "draft" },
      wordCountGoal: 5,
      maxRevisions: 9,
      organizerCardBody: { source: "none" },
      tags: [{ id: generateUUID(), name: "t" }],
    };
    await writeFile(`${ROOT}/project.json`, projectJson(untouched), "utf8");
    const pick = (cfg: Record<string, unknown>): string =>
      JSON.stringify(Object.keys(untouched).map((k) => [k, cfg[k]] as const));
    const before = pick(await readConfig());
    const id = await add();
    await renameOrganizerArrangementCore(PID, { id, name: "Renamed" });
    await deleteOrganizerArrangementCore(PID, { id });
    expect(pick(await readConfig())).toBe(before);
  });

  it("a stored list that does not parse is not read as empty and is not overwritten", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ organizerArrangements: "corrupt" }),
      "utf8",
    );
    const before = await readFile(`${ROOT}/project.json`, "utf8");
    await expect(addOrganizerArrangementCore(PID, draft())).rejects.toThrow();
    expect(await readFile(`${ROOT}/project.json`, "utf8")).toBe(before);
  });

  it("derives the root from projectId and takes no path argument", async () => {
    expect(addOrganizerArrangementCore.length).toBe(2);
    await expect(
      addOrganizerArrangementCore("nope", draft()),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    await expect(
      addOrganizerArrangementCore("../etc", draft()),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("rethrows locked-access errors unchanged for add, rename and delete", async () => {
    const base = createMemoryAdapter();
    await base.mkdir(ROOT, { recursive: true });
    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(PID);
    await writeProjectMarker(ROOT, base);
    keyring.lock();
    setStorageAdapter(workspaceEncryptionAdapter(base, TENANT, keyring));
    const id = generateUUID();
    const calls: Array<() => Promise<unknown>> = [
      () => addOrganizerArrangementCore(PID, draft()),
      () => renameOrganizerArrangementCore(PID, { id, name: "N" }),
      () => deleteOrganizerArrangementCore(PID, { id }),
    ];
    for (const call of calls) {
      const err = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(isLockedAccessError(err)).toBe(true);
    }
  });
});

describe("validateOrganizerArrangementDraft", () => {
  it("returns the trimmed draft rebuilt from validated parts", () => {
    const input = draft({ name: " N " });
    const out = validateOrganizerArrangementDraft(input);
    expect(out).toEqual({ ...input, name: "N" });
    expect(out.source).not.toBe(input.source);
  });

  it("throws a refusal error with fixed text and a reason", () => {
    let caught: unknown;
    try {
      validateOrganizerArrangementDraft({ ...draft(), rows: "order" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OrganizerArrangementRefusalError);
    expect((caught as OrganizerArrangementRefusalError).reason).toBe(
      "invalid-axis",
    );
  });
});
