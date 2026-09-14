import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  nullifyResourceRefs,
  writeTrashRefRecord,
  readTrashRefRecord,
} from "../../src/lib/models/trash";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

async function makeProjectDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-ref-record-"));
  await fs.mkdir(path.join(dir, "meta"), { recursive: true });
  return dir;
}

async function writeSidecarDirect(
  projectRoot: string,
  resourceId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const filePath = path.join(
    projectRoot,
    "meta",
    `resource-${resourceId}.meta.json`,
  );
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

describe("nullifyResourceRefs — returned entries (Task 4, FR-8)", () => {
  it("returns an entry for a scalar reference and an entry (with arrayIndex) for a multi-valued reference", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";

      await writeSidecarDirect(dir, "r1", {
        id: "r1",
        name: "Scene A",
        userMetadata: { pov: { id: deletedId, name: "Alice" } },
      });
      await writeSidecarDirect(dir, "r2", {
        id: "r2",
        name: "Scene B",
        userMetadata: {
          characters: [
            { id: "zzzz-zzzz", name: "Carol" },
            { id: deletedId, name: "Alice" },
          ],
        },
      });

      const entries = await nullifyResourceRefs(dir, deletedId, "Alice", [
        "pov",
        "characters",
      ]);

      expect(entries).toHaveLength(2);

      const scalarEntry = entries.find((e) => e.referencingResourceId === "r1");
      expect(scalarEntry).toBeDefined();
      expect(scalarEntry?.fieldKey).toBe("pov");
      expect("arrayIndex" in (scalarEntry ?? {})).toBe(false);
      expect(scalarEntry?.priorValue).toEqual({ id: deletedId, name: "Alice" });

      const arrayEntry = entries.find((e) => e.referencingResourceId === "r2");
      expect(arrayEntry).toBeDefined();
      expect(arrayEntry?.fieldKey).toBe("characters");
      expect(arrayEntry?.arrayIndex).toBe(1);
      expect(arrayEntry?.priorValue).toEqual({ id: deletedId, name: "Alice" });

      // Side effect (patching) still happens as before.
      const sidecar1 = await readSidecar(dir, "r1");
      const meta1 = sidecar1?.["userMetadata"] as Record<string, unknown>;
      expect(meta1?.["pov"]).toEqual({ id: null, name: "Alice" });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("returns an empty array when no references match", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";
      await writeSidecarDirect(dir, "r1", {
        id: "r1",
        name: "Scene A",
        userMetadata: { pov: { id: "other-id", name: "Bob" } },
      });

      const entries = await nullifyResourceRefs(dir, deletedId, "Alice", [
        "pov",
      ]);

      expect(entries).toEqual([]);
    } finally {
      await removeDirRetry(dir);
    }
  });
});

describe("writeTrashRefRecord / readTrashRefRecord (Task 4, FR-8, resolved OQ-12)", () => {
  it("persists and reads back a ref record with both a scalar and an array entry", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "550e8400-e29b-41d4-a716-446655440000";
      const r1 = "660e8400-e29b-41d4-a716-446655440001";
      const r2 = "770e8400-e29b-41d4-a716-446655440002";
      const entries = [
        {
          referencingResourceId: r1,
          fieldKey: "pov",
          priorValue: { id: deletedId, name: "Alice" },
        },
        {
          referencingResourceId: r2,
          fieldKey: "characters",
          arrayIndex: 1,
          priorValue: { id: deletedId, name: "Alice" },
        },
      ];

      await writeTrashRefRecord(dir, deletedId, entries);

      const filePath = path.join(
        dir,
        ".trash",
        "meta",
        `refs-${deletedId}.json`,
      );
      expect(
        await fs
          .stat(filePath)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      const record = await readTrashRefRecord(dir, deletedId);
      expect(record).toBeDefined();
      expect(record?.resourceId).toBe(deletedId);
      expect(record?.entries).toHaveLength(2);

      const scalar = record?.entries.find((e) => e.fieldKey === "pov");
      expect(scalar).toEqual({
        referencingResourceId: r1,
        fieldKey: "pov",
        priorValue: { id: deletedId, name: "Alice" },
      });

      const arrayEntry = record?.entries.find(
        (e) => e.fieldKey === "characters",
      );
      expect(arrayEntry).toEqual({
        referencingResourceId: r2,
        fieldKey: "characters",
        arrayIndex: 1,
        priorValue: { id: deletedId, name: "Alice" },
      });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("returns undefined, not a thrown error, when no ref record file exists (legacy case)", async () => {
    const dir = await makeProjectDir();
    try {
      const record = await readTrashRefRecord(dir, "no-such-resource-id");
      expect(record).toBeUndefined();
    } finally {
      await removeDirRetry(dir);
    }
  });
});
