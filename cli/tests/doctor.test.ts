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

test("doctor refuses an encrypted project with exit 3 rather than crashing", async () => {
  await withTmp(async (root) => {
    // A real project's files, plus the plaintext opt-in marker that says they
    // are sealed. Before this case, doctor read straight through the plain
    // adapter and died on the first JSON.parse of an envelope with
    // `Unexpected token 'G', "GWE ..."` — a message about corruption, not
    // encryption. Measured against a real encrypted project on 2026-09-16.
    const folder = createFolderResource({ name: "Episode 1" });
    await writeResourceToFile(root, folder);

    await fs.writeFile(
      path.join(root, ".encrypted.json"),
      JSON.stringify({
        version: 1,
        encrypted: true,
        encryptedAt: new Date().toISOString(),
      }),
      "utf-8",
    );

    // 3, not 0 and not 1: the project is unexamined, so reporting it as either
    // clean or problem-bearing would state something untrue about its
    // integrity.
    expect(await runDoctor(root)).toBe(3);
  });
});
