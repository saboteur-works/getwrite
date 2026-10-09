import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { createTextResource, writeResourceToFile } from "@gw/core";
import registerRepairRevisions from "../src/commands/repair-revisions";

// `repair-revisions`, driven through `new Command()` + the registered command
// (the shipped path). A text resource written with `writeResourceToFile` and
// nothing else is the revision-less state the command repairs.

async function writeRevisionless(root: string, name: string): Promise<string> {
  const resource = createTextResource({ name, plainText: `${name} body` });
  await writeResourceToFile(root, resource);
  return resource.id;
}

async function revisionDirs(root: string, id: string): Promise<string[]> {
  return fs.readdir(path.join(root, "revisions", id)).catch(() => []);
}

describe("repair-revisions command", () => {
  let root: string;
  let exitCodes: number[];
  let stdout: string[];
  let stderr: string[];
  let spies: Array<{ mockRestore: () => void }>;

  async function run(...args: string[]): Promise<void> {
    const program = new Command();
    registerRepairRevisions(program);
    await program.parseAsync(["node", "test", "repair-revisions", ...args]);
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-repair-revisions-"));
    exitCodes = [];
    stdout = [];
    stderr = [];
    spies = [
      vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        exitCodes.push(code ?? 0);
      }) as never),
      vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
        stdout.push(a.join(" "));
      }),
      vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
        stderr.push(a.join(" "));
      }),
    ];
  });

  afterEach(async () => {
    for (const spy of spies) spy.mockRestore();
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  });

  it("--dry-run lists what it would repair and writes no revision", async () => {
    const id = await writeRevisionless(root, "Old Note");

    await run(root, "--dry-run");

    expect(exitCodes).toEqual([0]);
    expect(stdout.join("\n")).toContain("Would repair 1 text resource");
    expect(stdout.join("\n")).toContain(`"Old Note" (${id})`);
    expect(await revisionDirs(root, id)).toEqual([]);
  });

  it("writes the missing revision and reports it", async () => {
    const id = await writeRevisionless(root, "Old Note");

    await run(root);

    expect(exitCodes).toEqual([0]);
    expect(stdout.join("\n")).toContain("Repaired 1 text resource");
    expect(stdout.join("\n")).toContain(`"Old Note" (${id})`);
    expect(await revisionDirs(root, id)).toEqual(["v-1"]);
  });

  it("reports a clean project and exits 0", async () => {
    const id = await writeRevisionless(root, "Old Note");
    await run(root);
    stdout.length = 0;
    exitCodes.length = 0;

    await run(root);

    expect(exitCodes).toEqual([0]);
    expect(stdout.join("\n")).toContain("every text resource");
    expect(await revisionDirs(root, id)).toEqual(["v-1"]);
  });

  it("exits 1 and names a resource it could not repair", async () => {
    const id = await writeRevisionless(root, "Hollow");
    await fs.rm(path.join(root, "resources", id), { recursive: true });

    await run(root);

    expect(exitCodes).toEqual([1]);
    expect(stderr.join("\n")).toContain(`"Hollow" (${id})`);
    expect(stderr.join("\n")).toContain("no content files");
  });

  it("refuses an encrypted project with exit 3 and writes nothing", async () => {
    const id = await writeRevisionless(root, "Sealed");
    await fs.writeFile(
      path.join(root, ".encrypted.json"),
      JSON.stringify({
        version: 1,
        encrypted: true,
        encryptedAt: new Date().toISOString(),
      }),
    );

    await run(root);

    expect(exitCodes).toEqual([3]);
    expect(await revisionDirs(root, id)).toEqual([]);
  });
});
