import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nullifyResourceRefs } from "../../src/lib/models/trash";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

async function makeProjectDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-nullify-"));
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

describe("nullifyResourceRefs (Task 8)", () => {
  it("nullifies a matching single ResourceRef in userMetadata", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";
      const otherResourceId = "bbbb-bbbb";

      await writeSidecarDirect(dir, otherResourceId, {
        id: otherResourceId,
        name: "Scene One",
        userMetadata: { pov: { id: deletedId, name: "Alice" } },
      });

      await nullifyResourceRefs(dir, deletedId, "Alice", ["pov"]);

      const sidecar = await readSidecar(dir, otherResourceId);
      const meta = sidecar?.["userMetadata"] as Record<string, unknown>;
      expect(meta?.["pov"]).toEqual({ id: null, name: "Alice" });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("preserves the name from the stored ResourceRef when nullifying", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";
      const otherResourceId = "cccc-cccc";

      await writeSidecarDirect(dir, otherResourceId, {
        id: otherResourceId,
        name: "Scene Two",
        userMetadata: { pov: { id: deletedId, name: "Bob the Great" } },
      });

      await nullifyResourceRefs(dir, deletedId, "ignored-name", ["pov"]);

      const sidecar = await readSidecar(dir, otherResourceId);
      const meta = sidecar?.["userMetadata"] as Record<string, unknown>;
      // Name comes from the stored ref, not from the deletedResourceName parameter
      expect((meta?.["pov"] as Record<string, unknown>)?.["name"]).toBe(
        "Bob the Great",
      );
      expect((meta?.["pov"] as Record<string, unknown>)?.["id"]).toBeNull();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("leaves non-matching ResourceRef values unchanged", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";
      const otherResourceId = "dddd-dddd";

      await writeSidecarDirect(dir, otherResourceId, {
        id: otherResourceId,
        name: "Scene Three",
        userMetadata: { pov: { id: "zzzz-zzzz", name: "Carol" } },
      });

      await nullifyResourceRefs(dir, deletedId, "Alice", ["pov"]);

      const sidecar = await readSidecar(dir, otherResourceId);
      const meta = sidecar?.["userMetadata"] as Record<string, unknown>;
      expect(meta?.["pov"]).toEqual({ id: "zzzz-zzzz", name: "Carol" });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("nullifies matching elements within an array (multiple: true)", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";
      const otherResourceId = "eeee-eeee";

      await writeSidecarDirect(dir, otherResourceId, {
        id: otherResourceId,
        name: "Scene Four",
        userMetadata: {
          characters: [
            { id: deletedId, name: "Alice" },
            { id: "zzzz-zzzz", name: "Carol" },
          ],
        },
      });

      await nullifyResourceRefs(dir, deletedId, "Alice", ["characters"]);

      const sidecar = await readSidecar(dir, otherResourceId);
      const meta = sidecar?.["userMetadata"] as Record<string, unknown>;
      const chars = meta?.["characters"] as unknown[];
      expect(chars).toHaveLength(2);
      expect(chars[0]).toEqual({ id: null, name: "Alice" });
      expect(chars[1]).toEqual({ id: "zzzz-zzzz", name: "Carol" });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("skips the deleted resource's own sidecar", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";

      await writeSidecarDirect(dir, deletedId, {
        id: deletedId,
        name: "Alice",
        userMetadata: { pov: { id: deletedId, name: "Alice" } },
      });

      await nullifyResourceRefs(dir, deletedId, "Alice", ["pov"]);

      // The deleted resource's own sidecar should be untouched
      const sidecar = await readSidecar(dir, deletedId);
      const meta = sidecar?.["userMetadata"] as Record<string, unknown>;
      expect(meta?.["pov"]).toEqual({ id: deletedId, name: "Alice" });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("returns early with no filesystem access when resourceRefFieldKeys is empty", async () => {
    const dir = await makeProjectDir();
    try {
      const deletedId = "aaaa-aaaa";
      const otherResourceId = "ffff-ffff";

      await writeSidecarDirect(dir, otherResourceId, {
        id: otherResourceId,
        name: "Scene Five",
        userMetadata: { pov: { id: deletedId, name: "Alice" } },
      });

      // No-op: empty keys
      await nullifyResourceRefs(dir, deletedId, "Alice", []);

      const sidecar = await readSidecar(dir, otherResourceId);
      const meta = sidecar?.["userMetadata"] as Record<string, unknown>;
      // Should be unchanged
      expect(meta?.["pov"]).toEqual({ id: deletedId, name: "Alice" });
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("completes without error when the meta directory does not exist", async () => {
    const dir = await makeProjectDir();
    try {
      // Remove meta dir
      await fs.rmdir(path.join(dir, "meta"));
      await expect(
        nullifyResourceRefs(dir, "aaaa-aaaa", "Alice", ["pov"]),
      ).resolves.toBeUndefined();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("patches multiple sidecar files in one call", async () => {
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
        userMetadata: { pov: { id: deletedId, name: "Alice" } },
      });
      await writeSidecarDirect(dir, "r3", {
        id: "r3",
        name: "Scene C",
        userMetadata: { pov: { id: "other-id", name: "Bob" } },
      });

      await nullifyResourceRefs(dir, deletedId, "Alice", ["pov"]);

      const s1 = await readSidecar(dir, "r1");
      const s2 = await readSidecar(dir, "r2");
      const s3 = await readSidecar(dir, "r3");

      expect(
        (
          (s1?.["userMetadata"] as Record<string, unknown>)?.["pov"] as Record<
            string,
            unknown
          >
        )?.["id"],
      ).toBeNull();
      expect(
        (
          (s2?.["userMetadata"] as Record<string, unknown>)?.["pov"] as Record<
            string,
            unknown
          >
        )?.["id"],
      ).toBeNull();
      expect(
        (
          (s3?.["userMetadata"] as Record<string, unknown>)?.["pov"] as Record<
            string,
            unknown
          >
        )?.["id"],
      ).toBe("other-id");
    } finally {
      await removeDirRetry(dir);
    }
  });
});
