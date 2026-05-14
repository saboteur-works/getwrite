/**
 * Unit tests for the default revision name setting (T017).
 *
 * Verifies that updateDefaultRevisionName persists the configured value to
 * project.json, trims whitespace, and rejects invalid inputs.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { updateDefaultRevisionName } from "../../src/lib/models/revision-settings";
import type { Project } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

async function makeTmpProject() {
    const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), "gw-rev-settings-"),
    );
    const proj = createProject({ name: "test-project" });
    await fs.writeFile(
        path.join(dir, PROJECT_FILENAME),
        JSON.stringify(proj, null, 2),
        "utf8",
    );
    return { dir, proj };
}

async function readProject(dir: string): Promise<Project> {
    const raw = await fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
    return JSON.parse(raw) as Project;
}

describe("updateDefaultRevisionName (T017)", () => {
    it("persists the new default revision name to project.json", async () => {
        const { dir } = await makeTmpProject();
        try {
            await updateDefaultRevisionName(dir, "Opening Draft");
            const saved = await readProject(dir);
            expect(saved.config?.defaultRevisionName).toBe("Opening Draft");
        } finally {
            await removeDirRetry(dir);
        }
    });

    it("trims leading and trailing whitespace from the provided name", async () => {
        const { dir } = await makeTmpProject();
        try {
            await updateDefaultRevisionName(dir, "  Draft v1  ");
            const saved = await readProject(dir);
            expect(saved.config?.defaultRevisionName).toBe("Draft v1");
        } finally {
            await removeDirRetry(dir);
        }
    });

    it("rejects an empty string", async () => {
        const { dir } = await makeTmpProject();
        try {
            await expect(updateDefaultRevisionName(dir, "")).rejects.toThrow();
        } finally {
            await removeDirRetry(dir);
        }
    });

    it("rejects a whitespace-only string", async () => {
        const { dir } = await makeTmpProject();
        try {
            await expect(
                updateDefaultRevisionName(dir, "   "),
            ).rejects.toThrow();
        } finally {
            await removeDirRetry(dir);
        }
    });

    it("rejects a name longer than 100 characters", async () => {
        const { dir } = await makeTmpProject();
        try {
            await expect(
                updateDefaultRevisionName(dir, "a".repeat(101)),
            ).rejects.toThrow();
        } finally {
            await removeDirRetry(dir);
        }
    });

    it("accepts a name exactly 100 characters long", async () => {
        const { dir } = await makeTmpProject();
        try {
            const name = "a".repeat(100);
            await updateDefaultRevisionName(dir, name);
            const saved = await readProject(dir);
            expect(saved.config?.defaultRevisionName).toBe(name);
        } finally {
            await removeDirRetry(dir);
        }
    });

    it("updates updatedAt on the project document", async () => {
        const { dir } = await makeTmpProject();
        try {
            const before = Date.now();
            await updateDefaultRevisionName(dir, "Draft");
            const saved = await readProject(dir);
            expect(saved.updatedAt).toBeDefined();
            expect(new Date(saved.updatedAt!).getTime()).toBeGreaterThanOrEqual(
                before,
            );
        } finally {
            await removeDirRetry(dir);
        }
    });

    it("returns the trimmed name that was saved", async () => {
        const { dir } = await makeTmpProject();
        try {
            const result = await updateDefaultRevisionName(dir, "  My Draft  ");
            expect(result).toBe("My Draft");
        } finally {
            await removeDirRetry(dir);
        }
    });
});
