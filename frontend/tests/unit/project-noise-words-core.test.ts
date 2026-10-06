import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  addCustomNoiseWordCore,
  excludeGlobalNoiseWordCore,
  getNoiseWordListsCore,
  InvalidNoiseWordError,
  InvalidProjectIdCoreError,
  removeCustomNoiseWordCore,
  unexcludeGlobalNoiseWordCore,
} from "../../src/lib/models/project-noise-words-core";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "44444444-4444-4444-8444-444444444444";
const TENANT = "/ws-noise-words-core";
const ROOT = `${TENANT}/${PID}`;
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });

describe("project-noise-words-core (Entity Mention Noise Flagging, Task 6)", () => {
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

  it("reads defaults of [] for a project with neither field set", async () => {
    await expect(getNoiseWordListsCore(PID)).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });
  });

  it("adds a custom word, persisting it, and reads it back", async () => {
    await expect(addCustomNoiseWordCore(PID, "very")).resolves.toEqual({
      customNoiseWords: ["very"],
      excludedGlobalNoiseWords: [],
    });

    const cfg = JSON.parse(
      await readFile(`${ROOT}/project.json`, "utf8"),
    ).config;
    expect(cfg.customNoiseWords).toEqual(["very"]);

    await expect(getNoiseWordListsCore(PID)).resolves.toEqual({
      customNoiseWords: ["very"],
      excludedGlobalNoiseWords: [],
    });
  });

  it("adding an already-present custom word is a no-op (idempotent)", async () => {
    await addCustomNoiseWordCore(PID, "very");
    await expect(addCustomNoiseWordCore(PID, "very")).resolves.toEqual({
      customNoiseWords: ["very"],
      excludedGlobalNoiseWords: [],
    });
  });

  it("removes a custom word, persisting the removal", async () => {
    await addCustomNoiseWordCore(PID, "very");
    await addCustomNoiseWordCore(PID, "really");
    await expect(removeCustomNoiseWordCore(PID, "very")).resolves.toEqual({
      customNoiseWords: ["really"],
      excludedGlobalNoiseWords: [],
    });

    const cfg = JSON.parse(
      await readFile(`${ROOT}/project.json`, "utf8"),
    ).config;
    expect(cfg.customNoiseWords).toEqual(["really"]);
  });

  it("removing an absent custom word is a no-op", async () => {
    await expect(removeCustomNoiseWordCore(PID, "nope")).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });
  });

  it("excludes a global word, persisting it, and reads it back", async () => {
    await expect(excludeGlobalNoiseWordCore(PID, "said")).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: ["said"],
    });

    const cfg = JSON.parse(
      await readFile(`${ROOT}/project.json`, "utf8"),
    ).config;
    expect(cfg.excludedGlobalNoiseWords).toEqual(["said"]);

    await expect(getNoiseWordListsCore(PID)).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: ["said"],
    });
  });

  it("un-excludes a global word, removing it from the exclusion list", async () => {
    await excludeGlobalNoiseWordCore(PID, "said");
    await expect(unexcludeGlobalNoiseWordCore(PID, "said")).resolves.toEqual({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });

    const cfg = JSON.parse(
      await readFile(`${ROOT}/project.json`, "utf8"),
    ).config;
    expect(cfg.excludedGlobalNoiseWords).toEqual([]);
  });

  it("does not touch other config keys", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ dailyWordGoal: 250, maxRevisions: 9 }),
      "utf8",
    );
    await addCustomNoiseWordCore(PID, "very");
    const cfg = JSON.parse(
      await readFile(`${ROOT}/project.json`, "utf8"),
    ).config;
    expect(cfg).toMatchObject({
      customNoiseWords: ["very"],
      dailyWordGoal: 250,
      maxRevisions: 9,
    });
  });

  it("rejects an empty/whitespace-only word with InvalidNoiseWordError", async () => {
    await expect(addCustomNoiseWordCore(PID, "")).rejects.toBeInstanceOf(
      InvalidNoiseWordError,
    );
    await expect(addCustomNoiseWordCore(PID, "   ")).rejects.toBeInstanceOf(
      InvalidNoiseWordError,
    );
    await expect(addCustomNoiseWordCore(PID, 5)).rejects.toBeInstanceOf(
      InvalidNoiseWordError,
    );
  });

  it("trims a word before storing it", async () => {
    await expect(addCustomNoiseWordCore(PID, "  very  ")).resolves.toEqual({
      customNoiseWords: ["very"],
      excludedGlobalNoiseWords: [],
    });
  });

  it("rejects a malformed projectId on every operation", async () => {
    await expect(getNoiseWordListsCore("nope")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(addCustomNoiseWordCore("nope", "very")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(
      removeCustomNoiseWordCore("nope", "very"),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    await expect(
      excludeGlobalNoiseWordCore("nope", "very"),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    await expect(
      unexcludeGlobalNoiseWordCore("nope", "very"),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("rethrows locked-access errors on read and write", async () => {
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

    const getErr = await getNoiseWordListsCore(PID).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(getErr)).toBe(true);

    const addErr = await addCustomNoiseWordCore(PID, "very").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(addErr)).toBe(true);
  });
});
