import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import registerReindex from "../../src/cli/commands/reindex";

describe("reindex command — registration", () => {
    it("registers reindex on the CLI program", () => {
        const program = new Command();
        registerReindex(program);
        const names = program.commands.map((c) => c.name());
        expect(names).toContain("reindex");
    });
});

describe("reindex command — functional", () => {
    let tmpDir: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-"));
        exitSpy = vi
            .spyOn(process, "exit")
            .mockImplementation((() => undefined) as never);
    });

    afterEach(async () => {
        exitSpy.mockRestore();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("rebuilds inverted index from resources on disk", async () => {
        const resourceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
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

        const indexPath = path.join(
            tmpDir,
            "meta",
            "index",
            "inverted.json",
        );
        const raw = await fs.readFile(indexPath, "utf8");
        const index = JSON.parse(raw) as Record<
            string,
            Record<string, number>
        >;

        expect(index["reindex"]).toBeDefined();
        expect(Object.keys(index["reindex"]!)).toContain(resourceId);
    });

    it("writes backlinks.json even when no wiki links exist", async () => {
        const resourceId = "11111111-2222-4333-8444-555555555555";
        const resourceDir = path.join(tmpDir, "resources", resourceId);
        await fs.mkdir(resourceDir, { recursive: true });
        await fs.writeFile(
            path.join(resourceDir, "content.txt"),
            "no links here",
        );

        const program = new Command();
        registerReindex(program);
        process.env.GETWRITE_CLI_TESTING = "1";
        await program.parseAsync(["node", "test", "reindex", tmpDir]);
        delete process.env.GETWRITE_CLI_TESTING;

        const backlinksPath = path.join(tmpDir, "meta", "backlinks.json");
        const raw = await fs.readFile(backlinksPath, "utf8");
        const backlinks = JSON.parse(raw) as Record<string, unknown>;
        expect(backlinks).toBeDefined();
    });

    it("exits cleanly when no resources exist", async () => {
        const program = new Command();
        registerReindex(program);
        process.env.GETWRITE_CLI_TESTING = "1";
        await expect(
            program.parseAsync(["node", "test", "reindex", tmpDir]),
        ).resolves.not.toThrow();
        delete process.env.GETWRITE_CLI_TESTING;
    });
});
