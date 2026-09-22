import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import registerPrune from "../src/commands/prune";

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

describe("prune command — encryption guard", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-prune-guard-"));
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

  it("refuses an encrypted project with exit 3 rather than reporting a false success", async () => {
    const resourceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const revisionDir = path.join(tmpDir, "revisions", resourceId, "v-1");
    await fs.mkdir(revisionDir, { recursive: true });
    await fs.writeFile(
      path.join(revisionDir, "metadata.json"),
      JSON.stringify({
        isCanonical: false,
        createdAt: new Date(0).toISOString(),
      }),
    );
    await writeEncryptionMarker(tmpDir);

    const program = new Command();
    registerPrune(program);
    await program.parseAsync(["node", "test", "prune", tmpDir]);

    expect(exitSpy).toHaveBeenCalledWith(3);
    expect(errSpy).toHaveBeenCalled();

    // The sealed revision must be left exactly as it was — prune must not
    // have deleted it while unable to see whether it was canonical.
    await expect(
      fs.access(path.join(revisionDir, "metadata.json")),
    ).resolves.toBeUndefined();
  });

  it("still prunes a plain, unencrypted project as before", async () => {
    const program = new Command();
    registerPrune(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    await expect(
      program.parseAsync(["node", "test", "prune", tmpDir]),
    ).resolves.not.toThrow();
    delete process.env.GETWRITE_CLI_TESTING;

    expect(exitSpy).not.toHaveBeenCalledWith(3);
  });
});
