import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import {
  createTag,
  listTags,
  assignTagToResource,
  listResourcesByTag,
  deleteTag,
  unassignTagFromResource,
  updateTag,
  TagNotFoundError,
  TagUpdateRefusedError,
} from "../../src/lib/models/tags";

async function makeTmpProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-proj-"));
  const proj = createProject({ name: "temp" });
  await fs.writeFile(
    path.join(dir, "project.json"),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return { dir, proj };
}

describe("tags (T023)", () => {
  it("creates and lists tags", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "foo", "#ff0");
    const tags = await listTags(dir);
    expect(tags.find((t) => t.id === tag.id)).toBeDefined();
  });

  it("assigns and lists resources by tag", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "bar");
    // assign tag to resource 'res-1'
    await assignTagToResource(dir, "res-1", tag.id);
    await assignTagToResource(dir, "res-2", tag.id);
    const res = await listResourcesByTag(dir, tag.id);
    expect(res.sort()).toEqual(["res-1", "res-2"]);
  });

  it("unassigns and deletes tags", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "baz");
    await assignTagToResource(dir, "res-x", tag.id);
    await unassignTagFromResource(dir, "res-x", tag.id);
    const res = await listResourcesByTag(dir, tag.id);
    expect(res).toEqual([]);

    const isDeleted = await deleteTag(dir, tag.id);
    expect(isDeleted).toBe(true);
    const tags = await listTags(dir);
    expect(tags.find((t) => t.id === tag.id)).toBeUndefined();
  });
});

describe("updateTag", () => {
  it("renames and recolours a tag, keeping its id and assignments", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "Draft", "#aabbcc");
    await assignTagToResource(dir, "res-1", tag.id);

    const updated = await updateTag(dir, tag.id, {
      name: "  First draft  ",
      color: "#112233",
    });

    expect(updated).toEqual({
      id: tag.id,
      name: "First draft",
      color: "#112233",
    });
    expect(await listTags(dir)).toEqual([updated]);
    expect(await listResourcesByTag(dir, tag.id)).toEqual(["res-1"]);
  });

  it("clears the colour when none is given", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "Draft", "#aabbcc");

    const updated = await updateTag(dir, tag.id, { name: "Draft" });

    expect(updated).toEqual({ id: tag.id, name: "Draft" });
    expect((await listTags(dir))[0]).not.toHaveProperty("color");
  });

  it("refuses a blank name", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "Draft");

    await expect(updateTag(dir, tag.id, { name: "   " })).rejects.toThrow(
      new TagUpdateRefusedError("Tag name must not be blank."),
    );
    expect((await listTags(dir))[0].name).toBe("Draft");
  });

  it("refuses another tag's name, ignoring capitals and spaces", async () => {
    const { dir } = await makeTmpProject();
    await createTag(dir, "Key Event");
    const tag = await createTag(dir, "Draft");

    await expect(
      updateTag(dir, tag.id, { name: " key event " }),
    ).rejects.toThrow(
      new TagUpdateRefusedError(
        "A tag named \u201cKey Event\u201d already exists.",
      ),
    );
  });

  it("allows a tag to keep its own name with different capitals", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "draft");

    const updated = await updateTag(dir, tag.id, { name: "Draft" });

    expect(updated.name).toBe("Draft");
  });

  it("refuses a colour that is not a hex colour", async () => {
    const { dir } = await makeTmpProject();
    const tag = await createTag(dir, "Draft");

    await expect(
      updateTag(dir, tag.id, {
        name: "Draft",
        color: "red; background: url(x)",
      }),
    ).rejects.toThrow(TagUpdateRefusedError);
  });

  it("throws TagNotFoundError for an unknown id", async () => {
    const { dir } = await makeTmpProject();

    await expect(
      updateTag(dir, "missing", { name: "Draft" }),
    ).rejects.toBeInstanceOf(TagNotFoundError);
  });
});
