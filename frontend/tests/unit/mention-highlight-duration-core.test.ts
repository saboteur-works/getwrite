import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  setMentionHighlightDurationCore,
  InvalidMentionHighlightDurationError,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/mention-highlight-duration-core";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "33333333-3333-4333-8333-333333333333";
const TENANT = "/ws-mhd-core";
const ROOT = `${TENANT}/${PID}`;
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });

describe("mention-highlight-duration-core (Entity mention navigation Task 7)", () => {
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

  it("set persists and clear removes mentionHighlightDurationSeconds without touching other keys", async () => {
    await writeFile(
      `${ROOT}/project.json`,
      projectJson({ dailyWordGoal: 250, maxRevisions: 9 }),
      "utf8",
    );
    expect(await setMentionHighlightDurationCore(PID, 5)).toEqual({
      mentionHighlightDurationSeconds: 5,
    });
    let cfg = JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
    expect(cfg).toMatchObject({
      mentionHighlightDurationSeconds: 5,
      dailyWordGoal: 250,
      maxRevisions: 9,
    });
    expect(await setMentionHighlightDurationCore(PID, null)).toEqual({
      mentionHighlightDurationSeconds: undefined,
    });
    cfg = JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
    expect("mentionHighlightDurationSeconds" in cfg).toBe(false);
    expect(cfg.dailyWordGoal).toBe(250);
    expect(cfg.maxRevisions).toBe(9);
  });

  it("accepts the 1-10 inclusive bounds and rejects out-of-range or non-integer values", async () => {
    await expect(setMentionHighlightDurationCore(PID, 1)).resolves.toEqual({
      mentionHighlightDurationSeconds: 1,
    });
    await expect(setMentionHighlightDurationCore(PID, 10)).resolves.toEqual({
      mentionHighlightDurationSeconds: 10,
    });
    for (const bad of [0, 11, 2.5, -1, NaN, Infinity]) {
      await expect(
        setMentionHighlightDurationCore(PID, bad),
      ).rejects.toBeInstanceOf(InvalidMentionHighlightDurationError);
    }
  });

  it("rejects a malformed projectId", async () => {
    await expect(
      setMentionHighlightDurationCore("nope", 5),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("rethrows locked-access errors on set", async () => {
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
    const err = await setMentionHighlightDurationCore(PID, 5).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLockedAccessError(err)).toBe(true);
  });
});
