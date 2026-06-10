import { test, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "@gw/core";
import { runDoctor } from "../src/commands/doctor";

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-cli-doctor-"));
  try {
    await fn(tmp);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

test("doctor reports 0 problems when every resource resolves to a folder", async () => {
  await withTmp(async (root) => {
    const folder = createFolderResource({ name: "Episode 1" });
    await writeResourceToFile(root, folder);

    const scene = createTextResource({
      name: "Scene 1",
      folderId: folder.id,
      plainText: "body",
    });
    await writeResourceToFile(root, scene);

    expect(await runDoctor(root)).toBe(0);
  });
});

test("doctor flags a resource whose folderId points at a missing folder", async () => {
  await withTmp(async (root) => {
    const scene = createTextResource({
      name: "Orphan Scene",
      folderId: "00000000-0000-4000-8000-000000000000",
      plainText: "body",
    });
    await writeResourceToFile(root, scene);

    expect(await runDoctor(root)).toBe(1);
  });
});

test("doctor flags a folder whose parent is missing", async () => {
  await withTmp(async (root) => {
    const child = createFolderResource({
      name: "Episode 1",
      parentFolderId: "11111111-1111-4111-8111-111111111111",
    });
    await writeResourceToFile(root, child);

    expect(await runDoctor(root)).toBe(1);
  });
});
