import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { resolveProjectsDir } from "../../src/lib/models/projects-dir";

describe("resolveProjectsDir", () => {
    let savedEnv: string | undefined;

    beforeEach(() => {
        savedEnv = process.env.GETWRITE_PROJECTS_DIR;
        delete process.env.GETWRITE_PROJECTS_DIR;
    });

    afterEach(() => {
        if (savedEnv === undefined) {
            delete process.env.GETWRITE_PROJECTS_DIR;
        } else {
            process.env.GETWRITE_PROJECTS_DIR = savedEnv;
        }
    });

    it("returns GETWRITE_PROJECTS_DIR when the env var is set (Electron path)", () => {
        process.env.GETWRITE_PROJECTS_DIR = "/absolute/electron/projects";
        expect(resolveProjectsDir()).toBe("/absolute/electron/projects");
    });

    it("falls back to cwd/../projects when env var is absent (pnpm dev path)", () => {
        const result = resolveProjectsDir();
        const expected = path.join(process.cwd(), "..", "projects");
        expect(result).toBe(expected);
    });

    it("fallback path ends with the 'projects' segment", () => {
        const result = resolveProjectsDir();
        expect(path.basename(result)).toBe("projects");
    });
});
