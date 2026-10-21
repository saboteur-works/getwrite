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
  createCheckedTag,
  TagNotFoundError,
  TagRefusedError,
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
      new TagRefusedError("Tag name must not be blank."),
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
      new TagRefusedError("A tag named \u201cKey Event\u201d already exists."),
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
    ).rejects.toThrow(TagRefusedError);
  });

  it("throws TagNotFoundError for an unknown id", async () => {
    const { dir } = await makeTmpProject();

    await expect(
      updateTag(dir, "missing", { name: "Draft" }),
    ).rejects.toBeInstanceOf(TagNotFoundError);
  });
});

describe("createCheckedTag", () => {
  it("creates a tag with a trimmed name and a colour", async () => {
    const { dir } = await makeTmpProject();

    const tag = await createCheckedTag(dir, {
      name: "  Flashback ",
      color: "#336699",
    });

    expect(tag).toEqual({ id: tag.id, name: "Flashback", color: "#336699" });
    expect(await listTags(dir)).toEqual([tag]);
  });

  it("refuses a blank name", async () => {
    const { dir } = await makeTmpProject();

    await expect(createCheckedTag(dir, { name: "  " })).rejects.toThrow(
      new TagRefusedError("Tag name must not be blank."),
    );
    expect(await listTags(dir)).toEqual([]);
  });

  it("refuses an existing tag's name, ignoring capitals and spaces", async () => {
    const { dir } = await makeTmpProject();
    await createTag(dir, "Key Event");

    await expect(
      createCheckedTag(dir, { name: " KEY EVENT " }),
    ).rejects.toThrow(
      new TagRefusedError("A tag named \u201cKey Event\u201d already exists."),
    );
    expect(await listTags(dir)).toHaveLength(1);
  });

  it("refuses a colour that is not a hex colour", async () => {
    const { dir } = await makeTmpProject();

    await expect(
      createCheckedTag(dir, { name: "Draft", color: "red" }),
    ).rejects.toThrow(TagRefusedError);
  });

  it("leaves createTag, which Scrivener import uses, unchecked", async () => {
    const { dir } = await makeTmpProject();
    await createTag(dir, "Hero");

    await createTag(dir, "hero");

    expect((await listTags(dir)).map((t) => t.name)).toEqual(["Hero", "hero"]);
  });
});
