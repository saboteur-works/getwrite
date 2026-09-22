import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import registerReindex from "../src/commands/reindex";

async function writeEncryptionMarker(root: string): Promise<void> {
  await fs.writeFile(
    path.join(root, ".encrypted.json"),
    JSON.stringify({
      version: 1,
      encrypted: true,
      encryptedAt: new Date().toISOString(),
    }),
    "utf-8",
  );
}

describe("reindex command — encryption guard", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-guard-"));
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("refuses an encrypted project with exit 3 and writes no index files", async () => {
    const resourceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const resourceDir = path.join(tmpDir, "resources", resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    await fs.writeFile(path.join(resourceDir, "content.txt"), "sealed body");
    await writeEncryptionMarker(tmpDir);

    const program = new Command();
    registerReindex(program);
    await program.parseAsync(["node", "test", "reindex", tmpDir]);

    expect(exitSpy).toHaveBeenCalledWith(3);
    expect(errSpy).toHaveBeenCalled();

    // The real regression this guards against: reindex must not have
    // rebuilt (and thereby destroyed) the inverted index, backlinks, or
    // mention index against unreadable, encrypted content.
    await expect(
      fs.access(path.join(tmpDir, "meta", "index", "inverted.json")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(tmpDir, "meta", "backlinks.json")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(tmpDir, "meta", "index", "mentions.json")),
    ).rejects.toThrow();
  });

  it("still reindexes a plain, unencrypted project as before", async () => {
    const resourceId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const resourceDir = path.join(tmpDir, "resources", resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    await fs.writeFile(
      path.join(resourceDir, "content.txt"),
      "reindex hello world unique",
    );

    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    await program.parseAsync(["node", "test", "reindex", tmpDir]);
    delete process.env.GETWRITE_CLI_TESTING;

    expect(exitSpy).not.toHaveBeenCalledWith(3);

    const indexPath = path.join(tmpDir, "meta", "index", "inverted.json");
    const raw = await fs.readFile(indexPath, "utf8");
    const index = JSON.parse(raw) as Record<string, Record<string, number>>;
    expect(index["reindex"]).toBeDefined();
  });
});
