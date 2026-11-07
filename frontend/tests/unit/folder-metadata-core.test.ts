import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
  stat,
  rm,
} from "../../src/lib/models/io";
import {
  FOLDER_METADATA_WRITABLE_KEYS,
  InvalidFolderMetadataError,
  InvalidProjectIdCoreError,
  getFolderMetadataCore,
  updateFolderMetadataCore,
} from "../../src/lib/models/folder-metadata-core";
import { folderSidecarPathForProject } from "../../src/lib/models/sidecar";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "44444444-4444-4444-8444-444444444444";
const FID = "55555555-5555-4555-8555-555555555555";
const TENANT = "/ws-folder-meta-core";
const ROOT = `${TENANT}/${PID}`;
const SIDECAR = folderSidecarPathForProject(ROOT, FID);
const FOLDER_JSON = `${ROOT}/folders/act-one/folder.json`;
const FOLDER_JSON_BODY = JSON.stringify(
  {
    id: FID,
    slug: "act-one",
    name: "Act One",
    type: "folder",
    orderIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  null,
  2,
);

const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });
const readSidecarRaw = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(SIDECAR, "utf8"));
const sidecarExists = async (): Promise<boolean> =>
  stat(SIDECAR).then(
    () => true,
    () => false,
  );
const failureOf = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("folder-metadata-core (Feature 102 Task 8)", () => {
  const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(`${ROOT}/folders/act-one`, { recursive: true });
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ subtypes: ["Act", "Chapter"] }),
      "utf8",
    );
    await writeFile(FOLDER_JSON, FOLDER_JSON_BODY, "utf8");
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  });

  it("declares one client-writable allowlist", () => {
    expect([...FOLDER_METADATA_WRITABLE_KEYS].sort()).toEqual([
      "fieldValues",
      "notes",
      "resourceSubtype",
    ]);
  });

  it("a write leaves folder.json byte-equal", async () => {
    await updateFolderMetadataCore(PID, FID, {
      notes: "n",
      fieldValues: { mood: "calm" },
      resourceSubtype: "Act",
    });
    expect(await readFile(FOLDER_JSON, "utf8")).toBe(FOLDER_JSON_BODY);
  });

  it("refuses a key outside the allowlist before any write and keeps the stored value", async () => {
    await updateFolderMetadataCore(PID, FID, { notes: "kept" });
    const before = await readFile(SIDECAR, "utf8");
    for (const bad of [
      { notes: "x", plainText: "body" },
      { tiptap: {} },
      { userMetadata: { notes: "x" } },
      { name: "renamed" },
      { orderIndex: 3 },
    ]) {
      const err = await failureOf(updateFolderMetadataCore(PID, FID, bad));
      expect(err).toBeInstanceOf(InvalidFolderMetadataError);
      expect((err as Error).message).toMatch(/not writable/i);
    }
    expect(await readFile(SIDECAR, "utf8")).toBe(before);
    expect(await readFile(FOLDER_JSON, "utf8")).toBe(FOLDER_JSON_BODY);
  });

  it("refuses before taking any lock", async () => {
    // A locked adapter would raise a locked-access error if a read or lock
    // were reached; a refusal must come first.
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
    const err = await failureOf(
      updateFolderMetadataCore(PID, FID, { plainText: "x" }),
    );
    expect(err).toBeInstanceOf(InvalidFolderMetadataError);
  });

  it("refuses a non-object payload and creates nothing", async () => {
    for (const bad of [null, "x", 3, [], undefined]) {
      expect(
        await failureOf(updateFolderMetadataCore(PID, FID, bad)),
      ).toBeInstanceOf(InvalidFolderMetadataError);
    }
    expect(await sidecarExists()).toBe(false);
  });

  it("refuses a bad notes value, a notes key inside fieldValues and a bad field value", async () => {
    const cases: string[] = [
      '{"notes":3}',
      '{"notes":{"a":1}}',
      '{"fieldValues":{"notes":"sneaky"}}',
      '{"fieldValues":{"__proto__":1}}',
      '{"fieldValues":{"mood":[1,"a"]}}',
      '{"fieldValues":{"":"empty key"}}',
      '{"fieldValues":[]}',
    ];
    for (const json of cases) {
      const payload = JSON.parse(json) as unknown;
      expect(
        await failureOf(updateFolderMetadataCore(PID, FID, payload)),
      ).toBeInstanceOf(InvalidFolderMetadataError);
    }
    expect(await sidecarExists()).toBe(false);
  });

  it("stores notes as plain text only at userMetadata.notes", async () => {
    await updateFolderMetadataCore(PID, FID, {
      notes: "<b>plain</b> text",
      fieldValues: { mood: "calm" },
    });
    const stored = await readSidecarRaw();
    expect(stored).toEqual({
      userMetadata: { notes: "<b>plain</b> text", mood: "calm" },
    });
    expect("notes" in stored).toBe(false);
    const folderJson = JSON.parse(await readFile(FOLDER_JSON, "utf8"));
    expect("notes" in folderJson).toBe(false);
  });

  it("never reads a top-level notes key from the sidecar or folder.json", async () => {
    await writeFile(
      FOLDER_JSON,
      JSON.stringify({ ...JSON.parse(FOLDER_JSON_BODY), notes: "legacy" }),
      "utf8",
    );
    await mkdir(`${ROOT}/meta`, { recursive: true });
    await writeFile(
      SIDECAR,
      JSON.stringify({ userMetadata: { notes: "real" }, notes: "top" }),
      "utf8",
    );
    // A top-level key is outside the sidecar shape: reported, never read.
    await expect(getFolderMetadataCore(PID, FID)).rejects.toThrow();
    await writeFile(
      SIDECAR,
      JSON.stringify({ userMetadata: { notes: "real" } }),
      "utf8",
    );
    expect((await getFolderMetadataCore(PID, FID)).notes).toBe("real");
    await rm(SIDECAR, { force: true });
    expect((await getFolderMetadataCore(PID, FID)).notes).toBe("");
  });

  it("stores the subtype under resourceSubtype, normalised against config.subtypes", async () => {
    const out = await updateFolderMetadataCore(PID, FID, {
      resourceSubtype: "  aCT ",
    });
    expect(out.resourceSubtype).toBe("Act");
    expect((await readSidecarRaw()).resourceSubtype).toBe("Act");
  });

  it("refuses a subtype that is blank, not a string, or not in the project list", async () => {
    for (const bad of ["", "   ", 3, "Scene"]) {
      expect(
        await failureOf(
          updateFolderMetadataCore(PID, FID, { resourceSubtype: bad }),
        ),
      ).toBeInstanceOf(InvalidFolderMetadataError);
    }
    expect(await sidecarExists()).toBe(false);
  });

  it("clears the subtype with null", async () => {
    await updateFolderMetadataCore(PID, FID, { resourceSubtype: "Act" });
    const out = await updateFolderMetadataCore(PID, FID, {
      resourceSubtype: null,
    });
    expect(out.resourceSubtype).toBeUndefined();
    expect("resourceSubtype" in (await readSidecarRaw())).toBe(false);
  });

  it("removing a subtype from config.subtypes does not rewrite a stored value", async () => {
    await updateFolderMetadataCore(PID, FID, { resourceSubtype: "Act" });
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ subtypes: ["Chapter"] }),
      "utf8",
    );
    await updateFolderMetadataCore(PID, FID, { notes: "later" });
    expect((await readSidecarRaw()).resourceSubtype).toBe("Act");
    expect((await getFolderMetadataCore(PID, FID)).resourceSubtype).toBe("Act");
  });

  it("the first write creates the sidecar and a read does not", async () => {
    expect(await getFolderMetadataCore(PID, FID)).toEqual({
      notes: "",
      fieldValues: {},
      resourceSubtype: undefined,
    });
    expect(await sidecarExists()).toBe(false);
    await updateFolderMetadataCore(PID, FID, { notes: "hi" });
    expect(await sidecarExists()).toBe(true);
  });

  it("merges a partial write into the stored value", async () => {
    await updateFolderMetadataCore(PID, FID, {
      notes: "a",
      fieldValues: { mood: "calm", tone: "dry" },
    });
    await updateFolderMetadataCore(PID, FID, {
      fieldValues: { mood: "tense" },
    });
    expect(await getFolderMetadataCore(PID, FID)).toEqual({
      notes: "a",
      fieldValues: { mood: "tense", tone: "dry" },
      resourceSubtype: undefined,
    });
  });

  it("two overlapping writes lose neither change", async () => {
    await Promise.all([
      updateFolderMetadataCore(PID, FID, { notes: "n" }),
      updateFolderMetadataCore(PID, FID, { fieldValues: { mood: "calm" } }),
      updateFolderMetadataCore(PID, FID, { resourceSubtype: "Chapter" }),
    ]);
    expect(await getFolderMetadataCore(PID, FID)).toEqual({
      notes: "n",
      fieldValues: { mood: "calm" },
      resourceSubtype: "Chapter",
    });
  });

  it("the folder sidecar has no body key", async () => {
    await updateFolderMetadataCore(PID, FID, { notes: "n" });
    const keys = Object.keys(await readSidecarRaw());
    for (const body of ["plainText", "tiptap", "content", "body", "notes"]) {
      expect(keys).not.toContain(body);
    }
  });

  it("refuses an invalid project id or folder id with a named error", async () => {
    expect(
      await failureOf(updateFolderMetadataCore("../etc", FID, { notes: "x" })),
    ).toBeInstanceOf(InvalidProjectIdCoreError);
    for (const bad of ["../../x", "a/b", "", "nope"]) {
      expect(
        await failureOf(updateFolderMetadataCore(PID, bad, { notes: "x" })),
      ).toBeInstanceOf(InvalidFolderMetadataError);
      expect(await failureOf(getFolderMetadataCore(PID, bad))).toBeInstanceOf(
        InvalidFolderMetadataError,
      );
    }
  });

  it("rethrows locked-access errors", async () => {
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
    for (const run of [
      () => updateFolderMetadataCore(PID, FID, { notes: "x" }),
      () => updateFolderMetadataCore(PID, FID, { resourceSubtype: "Act" }),
      () => getFolderMetadataCore(PID, FID),
    ]) {
      expect(isLockedAccessError(await failureOf(run()))).toBe(true);
    }
  });

  it("does not overwrite an unreadable sidecar", async () => {
    await mkdir(`${ROOT}/meta`, { recursive: true });
    await writeFile(SIDECAR, "{not json", "utf8");
    await expect(
      updateFolderMetadataCore(PID, FID, { notes: "x" }),
    ).rejects.toThrow();
    expect(await readFile(SIDECAR, "utf8")).toBe("{not json");
  });
});
