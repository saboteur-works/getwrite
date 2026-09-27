import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import {
  loadDiagnosticsIndex,
  persistDiagnosticsIndex,
  removeResourceFromDiagnosticsIndex,
  type DiagnosticsIndex,
  type DiagnosticsRecord,
} from "../../src/lib/models/diagnostics-index";
import { generateUUID } from "../../src/lib/models/uuid";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

describe("diagnostics-index (Feature 62, Task 1)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("round-trips a DiagnosticsRecord through persist and load", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-di-"));

    const resourceId = "resource-a";
    const record: DiagnosticsRecord = {
      dialogueRatio: 0.2,
      averageSentenceLength: 12.5,
      topRepeatedWords: [{ word: "said", count: 5 }],
      heuristicVersion: 1,
    };
    const index: DiagnosticsIndex = { [resourceId]: record };

    await persistDiagnosticsIndex(projectRoot, index);
    const loaded = await loadDiagnosticsIndex(projectRoot);

    expect(loaded).toEqual(index);
  });

  it("persists to meta/index/diagnostics.json", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-di-"));

    await persistDiagnosticsIndex(projectRoot, {
      "resource-a": {
        dialogueRatio: 0.5,
        averageSentenceLength: 10,
        topRepeatedWords: [],
        heuristicVersion: 1,
      },
    });

    const raw = await readFile(
      path.join(projectRoot, "meta", "index", "diagnostics.json"),
      "utf8",
    );
    expect(JSON.parse(raw)).toEqual({
      "resource-a": {
        dialogueRatio: 0.5,
        averageSentenceLength: 10,
        topRepeatedWords: [],
        heuristicVersion: 1,
      },
    });
  });

  it("returns an empty index when the diagnostics file is missing", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-di-"));

    const loaded = await loadDiagnosticsIndex(projectRoot);

    expect(loaded).toEqual({});
  });

  it("returns an empty index (not a thrown error) when the persisted file fails schema validation", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-di-"));

    await mkdir(path.join(projectRoot, "meta", "index"), { recursive: true });
    await writeFile(
      path.join(projectRoot, "meta", "index", "diagnostics.json"),
      JSON.stringify({ "resource-a": { dialogueRatio: 5 } }),
      "utf8",
    );

    const loaded = await loadDiagnosticsIndex(projectRoot);

    expect(loaded).toEqual({});
  });

  describe("removeResourceFromDiagnosticsIndex", () => {
    it("removes the resource's own key from the persisted diagnostics index", async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-di-rm-"));

      const resourceA = generateUUID();
      const resourceB = generateUUID();
      const record: DiagnosticsRecord = {
        dialogueRatio: 0.1,
        averageSentenceLength: 8,
        topRepeatedWords: [],
        heuristicVersion: 1,
      };

      const index: DiagnosticsIndex = {
        [resourceA]: record,
        [resourceB]: record,
      };
      await persistDiagnosticsIndex(projectRoot, index);

      await removeResourceFromDiagnosticsIndex(projectRoot, resourceA);

      const loaded = await loadDiagnosticsIndex(projectRoot);
      expect(loaded).not.toHaveProperty(resourceA);
      expect(loaded[resourceB]).toEqual(record);
    });

    it("tolerates a missing diagnostics.json (empty index)", async () => {
      const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-di-rm-"));
      const resourceA = generateUUID();

      await expect(
        removeResourceFromDiagnosticsIndex(projectRoot, resourceA),
      ).resolves.toBeUndefined();

      const loaded = await loadDiagnosticsIndex(projectRoot);
      expect(loaded).toEqual({});
    });
  });

  describe("loadDiagnosticsIndex — locked-access fail-closed", () => {
    it("rejects with a locked-access error instead of degrading to the empty-index fallback when the project is locked", async () => {
      const base = createMemoryAdapter();
      const tenantRoot = "/ws";
      const projectId = "66666666-6666-4666-8666-666666666666";
      const projectRoot = `${tenantRoot}/${projectId}`;
      await base.mkdir(projectRoot, { recursive: true });

      const keyring = await createKeyring(
        "correct horse battery staple",
        TEST_ARGON2_PARAMS,
      );
      await keyring.addProject(projectId);
      await writeProjectMarker(projectRoot, base);

      keyring.lock();

      setStorageAdapter(workspaceEncryptionAdapter(base, tenantRoot, keyring));

      const rejection = loadDiagnosticsIndex(projectRoot);
      await expect(rejection).rejects.toBeTruthy();
      await rejection.catch((err: unknown) => {
        expect(isLockedAccessError(err)).toBe(true);
      });
    });

    it("still degrades to the empty index when the diagnostics file is simply missing (unencrypted project)", async () => {
      const base = createMemoryAdapter();
      setStorageAdapter(base);
      const projectRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gw-di-lock-"),
      );

      await expect(loadDiagnosticsIndex(projectRoot)).resolves.toEqual({});
    });
  });
});
