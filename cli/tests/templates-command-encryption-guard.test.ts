import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import registerTemplates from "../src/commands/templates";

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

describe("templates command — encryption guard", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-templates-guard-"));
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

  it("`templates save` refuses an encrypted project with exit 3 and writes nothing", async () => {
    await writeEncryptionMarker(tmpDir);

    const program = new Command();
    registerTemplates(program);
    await program.parseAsync([
      "node",
      "test",
      "templates",
      "save",
      tmpDir,
      "scene",
      "Scene",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(3);
    expect(errSpy).toHaveBeenCalled();
    await expect(
      fs.access(path.join(tmpDir, "meta", "templates", "scene.json")),
    ).rejects.toThrow();
  });

  it("`templates create` refuses an encrypted project with exit 3 and creates no resource", async () => {
    await writeEncryptionMarker(tmpDir);

    const program = new Command();
    registerTemplates(program);
    await program.parseAsync([
      "node",
      "test",
      "templates",
      "create",
      tmpDir,
      "scene",
      "New Scene",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(3);
    await expect(fs.access(path.join(tmpDir, "resources"))).rejects.toThrow();
  });

  it("`templates duplicate` refuses an encrypted project with exit 3 and creates no resource", async () => {
    await writeEncryptionMarker(tmpDir);

    const program = new Command();
    registerTemplates(program);
    await program.parseAsync([
      "node",
      "test",
      "templates",
      "duplicate",
      tmpDir,
      "some-resource-id",
    ]);

    expect(exitSpy).toHaveBeenCalledWith(3);
  });

  it("`templates save` on an unencrypted project still writes the template as before", async () => {
    const program = new Command();
    registerTemplates(program);
    await program.parseAsync([
      "node",
      "test",
      "templates",
      "save",
      tmpDir,
      "scene",
      "Scene",
    ]);

    expect(exitSpy).not.toHaveBeenCalledWith(3);
    const raw = await fs.readFile(
      path.join(tmpDir, "meta", "templates", "scene.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe("scene");
  });
});
