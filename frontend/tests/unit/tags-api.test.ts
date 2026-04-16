/**
 * Unit tests for the tags API route handlers (T-UI-TAGS-API).
 *
 * Tests call the underlying `tags.ts` module functions directly against a real
 * temporary filesystem project — the same approach used by `tags.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import {
    listTags,
    createTag,
    deleteTag,
    assignTagToResource,
    unassignTagFromResource,
} from "../../src/lib/models/tags";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import type { Project } from "../../src/lib/models/types";

async function makeTmpProject() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-tags-api-"));
    const proj = createProject({ name: "api-test" });
    await fs.writeFile(
        path.join(dir, PROJECT_FILENAME),
        JSON.stringify(proj, null, 2),
        "utf8",
    );
    return { dir };
}

async function readAssignments(
    dir: string,
    resourceId: string,
): Promise<string[]> {
    const raw = await fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
    const project = JSON.parse(raw) as Project;
    return project.config?.tagAssignments?.[resourceId] ?? [];
}

describe("tags API route — list action", () => {
    it("returns empty array for a project with no tags", async () => {
        const { dir } = await makeTmpProject();
        const tags = await listTags(dir);
        expect(tags).toEqual([]);
    });

    it("returns all tags after creation", async () => {
        const { dir } = await makeTmpProject();
        const t1 = await createTag(dir, "Alpha");
        const t2 = await createTag(dir, "Beta", "#ff0000");
        const tags = await listTags(dir);
        expect(tags.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
    });
});

describe("tags API route — create action", () => {
    it("creates a tag and returns it with a generated ID", async () => {
        const { dir } = await makeTmpProject();
        const tag = await createTag(dir, "Draft");
        expect(tag.id).toMatch(/[0-9a-f-]{36}/);
        expect(tag.name).toBe("Draft");
        expect(tag.color).toBeUndefined();
    });

    it("creates a tag with a color", async () => {
        const { dir } = await makeTmpProject();
        const tag = await createTag(dir, "Important", "#d44040");
        expect(tag.color).toBe("#d44040");
    });
});

describe("tags API route — delete action", () => {
    it("removes the tag and cleans up all assignments", async () => {
        const { dir } = await makeTmpProject();
        const tag = await createTag(dir, "ToDelete");
        await assignTagToResource(dir, "res-1", tag.id);
        await assignTagToResource(dir, "res-2", tag.id);

        const deleted = await deleteTag(dir, tag.id);
        expect(deleted).toBe(true);

        const remaining = await listTags(dir);
        expect(remaining.find((t) => t.id === tag.id)).toBeUndefined();

        expect(await readAssignments(dir, "res-1")).toEqual([]);
        expect(await readAssignments(dir, "res-2")).toEqual([]);
    });

    it("returns false when the tag does not exist", async () => {
        const { dir } = await makeTmpProject();
        const result = await deleteTag(dir, "non-existent-id");
        expect(result).toBe(false);
    });
});

describe("tags API route — assign action", () => {
    it("assigns a tag to a resource", async () => {
        const { dir } = await makeTmpProject();
        const tag = await createTag(dir, "Scene");
        await assignTagToResource(dir, "res-abc", tag.id);
        expect(await readAssignments(dir, "res-abc")).toContain(tag.id);
    });

    it("is idempotent — assigning twice does not duplicate", async () => {
        const { dir } = await makeTmpProject();
        const tag = await createTag(dir, "Dupe");
        await assignTagToResource(dir, "res-abc", tag.id);
        await assignTagToResource(dir, "res-abc", tag.id);
        const assignments = await readAssignments(dir, "res-abc");
        expect(assignments.filter((id) => id === tag.id)).toHaveLength(1);
    });

    it("unassigns a tag from a resource", async () => {
        const { dir } = await makeTmpProject();
        const tag = await createTag(dir, "Remove");
        await assignTagToResource(dir, "res-xyz", tag.id);
        await unassignTagFromResource(dir, "res-xyz", tag.id);
        expect(await readAssignments(dir, "res-xyz")).not.toContain(tag.id);
    });
});
