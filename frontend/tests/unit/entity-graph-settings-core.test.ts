import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS,
  getEntityGraphSettingsCore,
  InvalidEntityGraphFocalHopRadiusError,
  InvalidProjectIdCoreError,
  setEntityGraphSettingsCore,
} from "../../src/lib/models/entity-graph-settings-core";
import { DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES } from "../../src/lib/models/entity-graph-connection-types";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "33333333-3333-4333-8333-333333333333";
const TENANT = "/ws-egs-core";
const ROOT = `${TENANT}/${PID}`;
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });

describe("entity-graph-settings-core (Feature 68 Task 6)", () => {
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

  it("reads the Task 1 defaults when nothing is persisted", async () => {
    await expect(getEntityGraphSettingsCore(PID)).resolves.toEqual({
      entityGraphConnectionTypes: DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
      entityGraphFocalHopRadius: DEFAULT_ENTITY_GRAPH_FOCAL_HOP_RADIUS,
    });
  });

  it("set persists both fields and get reads them back, without touching other config keys", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ dailyWordGoal: 250, maxRevisions: 9 }),
      "utf8",
    );
    await expect(
      setEntityGraphSettingsCore(PID, ["authored", "backlinks"], 2),
    ).resolves.toEqual({
      entityGraphConnectionTypes: ["authored", "backlinks"],
      entityGraphFocalHopRadius: 2,
    });

    const cfg = JSON.parse(
      await readFile(`${ROOT}/project.json`, "utf8"),
    ).config;
    expect(cfg).toMatchObject({
      entityGraphConnectionTypes: ["authored", "backlinks"],
      entityGraphFocalHopRadius: 2,
      dailyWordGoal: 250,
      maxRevisions: 9,
    });

    await expect(getEntityGraphSettingsCore(PID)).resolves.toEqual({
      entityGraphConnectionTypes: ["authored", "backlinks"],
      entityGraphFocalHopRadius: 2,
    });
  });

  it("filters an unrecognized connection-type key rather than erroring (FR-2)", async () => {
    await expect(
      setEntityGraphSettingsCore(
        PID,
        ["authored", "not-a-real-type", "cooccurrence"],
        1,
      ),
    ).resolves.toEqual({
      entityGraphConnectionTypes: ["authored", "cooccurrence"],
      entityGraphFocalHopRadius: 1,
    });
  });

  it("accepts a hop radius of 0 and rejects negative/non-integer values", async () => {
    await expect(
      setEntityGraphSettingsCore(PID, ["authored"], 0),
    ).resolves.toEqual({
      entityGraphConnectionTypes: ["authored"],
      entityGraphFocalHopRadius: 0,
    });
    for (const bad of [-1, 1.5, NaN, Infinity]) {
      await expect(
        setEntityGraphSettingsCore(PID, ["authored"], bad),
      ).rejects.toBeInstanceOf(InvalidEntityGraphFocalHopRadiusError);
    }
  });

  it("rejects a malformed projectId on both get and set", async () => {
    await expect(getEntityGraphSettingsCore("nope")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(
      setEntityGraphSettingsCore("nope", ["authored"], 1),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("rethrows locked-access errors on get and set", async () => {
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

    const getErr = await getEntityGraphSettingsCore(PID).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(getErr)).toBe(true);

    const setErr = await setEntityGraphSettingsCore(PID, ["authored"], 1).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(setErr)).toBe(true);
  });
});
