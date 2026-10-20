import { describe, it, expect, vi } from "vitest";
import {
  validateDraft,
  createEmptyProjectType,
  applyDefinitionEdit,
  saveDraftItem,
  saveDraftItemAsCopy,
  deleteDraftItem,
  describeItemOrigin,
  mergeListIntoItems,
  discardAllEdits,
  type ProjectTypeListItem,
} from "../../components/project-types/ProjectTypeDraftService";
import type {
  ProjectTypesTransport,
  ProjectTypeWriteOutcome,
} from "../../src/lib/api/project-types";
import type { ProjectTypeDefinition } from "../../src/types/project-types";

describe("ProjectTypeDraftService.validateDraft", () => {
  it("accepts a valid definition that has no Workspace folder", () => {
    const definition: ProjectTypeDefinition = {
      id: "no-workspace",
      name: "No Workspace",
      description: "",
      folders: [{ name: "Drafts" }],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    expect(validateDraft(definition)).toEqual({ valid: true });
  });

  it("accepts a Workspace-less definition that still carries the deprecated `special` flag", () => {
    const definition: ProjectTypeDefinition = {
      id: "special-no-workspace",
      name: "Special No Workspace",
      description: "",
      folders: [{ name: "Drafts", special: true }],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    expect(validateDraft(definition)).toEqual({ valid: true });
  });

  it("still rejects a schema-invalid definition (no folders)", () => {
    const definition: ProjectTypeDefinition = {
      id: "empty",
      name: "Empty",
      description: "",
      folders: [],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    const result = validateDraft(definition);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("still rejects a schema-invalid definition (bad id pattern)", () => {
    const definition: ProjectTypeDefinition = {
      id: "Bad ID!",
      name: "Bad",
      description: "",
      folders: [{ name: "Drafts" }],
      defaultFolders: [],
      defaultResources: [],
      statuses: [],
    };
    const result = validateDraft(definition);
    expect(result.valid).toBe(false);
  });
});

describe("ProjectTypeDraftService.validateDraft line height floor (FR-23)", () => {
  const withLineHeight = (lineHeight: string): ProjectTypeDefinition => ({
    id: "lh",
    name: "LH",
    description: "",
    folders: [{ name: "Drafts" }],
    defaultFolders: [],
    defaultResources: [],
    statuses: [],
    editorConfig: { body: { lineHeight } },
  });

  it.each(["1.7", "normal"])("refuses %j with the floor message", (v) => {
    const result = validateDraft(withLineHeight(v));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain(
        "Line height must be a number of at least 1.8.",
      );
    }
  });

  it.each(["", "1.8", "2"])("accepts %j", (v) => {
    expect(validateDraft(withLineHeight(v))).toEqual({ valid: true });
  });
});

describe("ProjectTypeDraftService.createEmptyProjectType", () => {
  it("seeds at least one starter folder", () => {
    const draft = createEmptyProjectType();
    expect(draft.folders.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag any seeded folder as `special`", () => {
    const draft = createEmptyProjectType();
    expect(draft.folders.every((folder) => !folder.special)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Save, save as copy, delete (Feature 90, Task 21: FR-8 client, FR-10, FR-11)
// ---------------------------------------------------------------------------

const def = (id: string, name: string): ProjectTypeDefinition => ({
  id,
  name,
  description: "",
  folders: [{ name: "Drafts" }],
  defaultFolders: [],
  defaultResources: [],
  statuses: [],
});

const item = (
  definition: ProjectTypeDefinition,
  over: Partial<ProjectTypeListItem> = {},
): ProjectTypeListItem => ({
  key: `file:${definition.id}.json`,
  fileName: `${definition.id}.json`,
  definition,
  baseline: definition,
  source: "saved",
  hasChanges: true,
  ...over,
});

function fakeTransport(
  outcome?: (spec: ProjectTypeDefinition) => ProjectTypeWriteOutcome,
): ProjectTypesTransport & {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const ok = (spec: ProjectTypeDefinition): ProjectTypeWriteOutcome =>
    outcome?.(spec) ?? { ok: true, fileName: `${spec.id}.json`, spec };
  return {
    list: vi.fn(),
    create: vi.fn(async (spec: ProjectTypeDefinition) => ok(spec)),
    update: vi.fn(async (_id: string, spec: ProjectTypeDefinition) => ok(spec)),
    remove: vi.fn(
      async (id: string): Promise<ProjectTypeWriteOutcome> => ({
        ok: true,
        fileName: `${id}.json`,
      }),
    ),
  };
}

describe("saveDraftItem", () => {
  it("posts a valid new draft once; on success hasChanges is false and fileName is <id>.json", async () => {
    const transport = fakeTransport();
    const draft = item(def("mine", "Mine"), {
      fileName: undefined,
      source: undefined,
      baseline: undefined,
      key: "draft:mine",
    });

    const result = await saveDraftItem(draft, [draft], transport);

    expect(transport.create).toHaveBeenCalledTimes(1);
    expect(transport.update).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.hasChanges).toBe(false);
      expect(result.item.fileName).toBe("mine.json");
      expect(result.item.source).toBe("saved");
      expect(result.item.key).toBe("file:mine.json");
    }
  });

  it("sends nothing and lists the errors when validateDraft fails", async () => {
    const transport = fakeTransport();
    const draft = item(
      { ...def("mine", "Mine"), editorConfig: { body: { lineHeight: "1.7" } } },
      { fileName: undefined, source: undefined, baseline: undefined },
    );

    const result = await saveDraftItem(draft, [draft], transport);

    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      kind: "validation",
      errors: ["Line height must be a number of at least 1.8."],
    });
  });

  it("saving a built-in posts a copy with a different id and name and leaves the built-in unchanged", async () => {
    const transport = fakeTransport();
    const builtIn = item(def("novel", "Novel"), {
      source: "built-in",
      key: "file:novel.json",
    });
    const edited = {
      ...builtIn,
      definition: { ...builtIn.definition, description: "edited" },
    };

    const result = await saveDraftItem(edited, [edited], transport);

    expect(transport.create).toHaveBeenCalledTimes(1);
    expect(transport.update).not.toHaveBeenCalled();
    const posted = transport.create.mock.calls[0][0] as ProjectTypeDefinition;
    expect(posted.id).not.toBe("novel");
    expect(posted.name).not.toBe("Novel");
    expect(posted.description).toBe("edited");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.copied).toBe(true);
      expect(result.item.source).toBe("saved");
      expect(result.item.definition.id).toBe(posted.id);
      // the built-in entry handed back is the original, still listed
      expect(result.original?.definition).toEqual(def("novel", "Novel"));
      expect(result.original?.source).toBe("built-in");
      expect(result.original?.hasChanges).toBe(false);
    }
  });

  it("chooses a copy id and name that do not clash with items already listed", async () => {
    const transport = fakeTransport();
    const builtIn = item(def("novel", "Novel"), { source: "built-in" });
    const taken = item(def("novel-copy", "Novel copy"));

    await saveDraftItemAsCopy(builtIn, [builtIn, taken], transport);

    const posted = transport.create.mock.calls[0][0] as ProjectTypeDefinition;
    expect(posted.id).not.toBe("novel-copy");
    expect(posted.name.toLowerCase()).not.toBe("novel copy");
  });

  it("a saved type is updated with PUT on its original id; rename changes the name only", async () => {
    const transport = fakeTransport();
    const saved = item(def("mine", "Mine"));
    const renamed = {
      ...saved,
      definition: { ...saved.definition, name: "Renamed" },
    };

    const result = await saveDraftItem(renamed, [renamed], transport);

    expect(transport.update).toHaveBeenCalledTimes(1);
    expect(transport.create).not.toHaveBeenCalled();
    const [id, body] = transport.update.mock.calls[0] as [
      string,
      ProjectTypeDefinition,
    ];
    expect(id).toBe("mine");
    expect(body.id).toBe("mine");
    expect(body.name).toBe("Renamed");
    expect(result.ok && result.item.hasChanges).toBe(false);
  });

  it.each([
    ["id-clash", "A project type with this id already exists."],
    ["name-clash", "A project type with this name already exists."],
    ["invalid", "The project type is not valid."],
    ["built-in", "Built-in project types cannot be changed or deleted."],
    ["saving-unavailable", "Saving project types is not available here."],
    ["write-failed", "The project type could not be written."],
  ] as const)(
    "returns a %s response as a refusal with its message and no new item",
    async (reason, message) => {
      const conflictsWith = { id: "x", name: "X", source: "saved" as const };
      const transport = fakeTransport(() => ({
        ok: false,
        reason,
        message,
        conflictsWith,
      }));
      const draft = item(def("mine", "Mine"), {
        fileName: undefined,
        source: undefined,
        baseline: undefined,
      });
      const before = structuredClone(draft);

      const result = await saveDraftItem(draft, [draft], transport);

      expect(result).toEqual({
        ok: false,
        kind: "refused",
        reason,
        message,
        conflictsWith,
      });
      expect(draft).toEqual(before);
    },
  );

  it("reports a thrown transport failure as a failed result, not success", async () => {
    const transport = fakeTransport();
    transport.create.mockRejectedValue(new Error("Invalid response"));
    const draft = item(def("mine", "Mine"), {
      fileName: undefined,
      source: undefined,
      baseline: undefined,
    });

    const result = await saveDraftItem(draft, [draft], transport);

    expect(result).toMatchObject({ ok: false, kind: "failed" });
  });
});

describe("applyDefinitionEdit", () => {
  it("keeps a saved type's id fixed while other fields change", () => {
    const saved = item(def("mine", "Mine"));
    const next = applyDefinitionEdit(saved, {
      ...saved.definition,
      id: "other",
      name: "Renamed",
    });
    expect(next.id).toBe("mine");
    expect(next.name).toBe("Renamed");
  });

  it("lets a draft's id change", () => {
    const draft = item(def("mine", "Mine"), {
      fileName: undefined,
      source: undefined,
      baseline: undefined,
    });
    expect(applyDefinitionEdit(draft, def("changed", "Mine")).id).toBe(
      "changed",
    );
  });
});

describe("deleteDraftItem", () => {
  it("refuses a built-in client-side without a request", async () => {
    const transport = fakeTransport();
    const result = await deleteDraftItem(
      item(def("novel", "Novel"), { source: "built-in" }),
      transport,
    );
    expect(transport.remove).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      kind: "refused",
      reason: "built-in",
    });
  });

  it("deletes a saved type by id", async () => {
    const transport = fakeTransport();
    const result = await deleteDraftItem(item(def("mine", "Mine")), transport);
    expect(transport.remove).toHaveBeenCalledWith("mine");
    expect(result).toEqual({ ok: true });
  });

  it("returns a 404 refusal and a thrown failure as non-success", async () => {
    const transport = fakeTransport();
    transport.remove.mockResolvedValueOnce({
      ok: false,
      reason: "not-found",
      message: "No saved project type has this id.",
    });
    expect(
      await deleteDraftItem(item(def("mine", "Mine")), transport),
    ).toMatchObject({ ok: false, kind: "refused", reason: "not-found" });

    transport.remove.mockRejectedValueOnce(new Error("boom"));
    expect(
      await deleteDraftItem(item(def("mine", "Mine")), transport),
    ).toMatchObject({ ok: false, kind: "failed" });
  });

  it("removes an unsaved draft locally with no request", async () => {
    const transport = fakeTransport();
    const draft = item(def("mine", "Mine"), {
      fileName: undefined,
      source: undefined,
      baseline: undefined,
    });
    expect(await deleteDraftItem(draft, transport)).toEqual({ ok: true });
    expect(transport.remove).not.toHaveBeenCalled();
  });
});

describe("describeItemOrigin and mergeListIntoItems", () => {
  const def = (id: string, name: string): ProjectTypeDefinition => ({
    id,
    name,
    description: "",
    folders: [{ name: "Workspace" }],
    defaultFolders: [],
    defaultResources: [],
    statuses: [],
  });
  const item = (
    fileName: string | undefined,
    source: "built-in" | "saved" | undefined,
    name: string,
    hasChanges = false,
  ): ProjectTypeListItem => ({
    key: fileName ? `file:${fileName}` : `draft:${name}`,
    ...(fileName ? { fileName } : {}),
    ...(source ? { source } : {}),
    definition: def(name.toLowerCase(), name),
    hasChanges,
  });

  it("labels built-in, saved and draft items", () => {
    expect(describeItemOrigin(item("a.json", "built-in", "A"))).toBe(
      "Built-in",
    );
    expect(describeItemOrigin(item("b.json", "saved", "B"))).toBe("Saved");
    expect(describeItemOrigin(item(undefined, undefined, "C"))).toBe("Draft");
    expect(describeItemOrigin(item("d.json", undefined, "D"))).toBe("Built-in");
  });

  it("takes the server's entries, keeps drafts and edited items", () => {
    const edited = item("b.json", "saved", "B edited", true);
    const draft = item(undefined, undefined, "Draft");
    const merged = mergeListIntoItems(
      [draft, item("a.json", "built-in", "A"), edited],
      {
        entries: [
          { fileName: "a.json", spec: def("a", "A2"), source: "built-in" },
          { fileName: "b.json", spec: def("b", "B"), source: "saved" },
          { fileName: "c.json", spec: def("c", "C"), source: "saved" },
        ],
        unusable: [],
        savedStatus: "ok",
      },
    );
    expect(merged.map((i) => i.key)).toEqual([
      "draft:Draft",
      "file:a.json",
      "file:b.json",
      "file:c.json",
    ]);
    expect(merged[1].definition.name).toBe("A2");
    expect(merged[2]).toBe(edited);
    expect(merged[3].source).toBe("saved");
    expect(merged[3].hasChanges).toBe(false);
  });

  it("drops an unedited item the server no longer lists", () => {
    const merged = mergeListIntoItems([item("gone.json", "saved", "Gone")], {
      entries: [],
      unusable: [],
      savedStatus: "ok",
    });
    expect(merged).toEqual([]);
  });
});

describe("discardAllEdits", () => {
  const baseline: ProjectTypeDefinition = {
    id: "mine",
    name: "Mine",
    description: "",
    folders: [{ name: "Workspace" }],
  };
  const edited: ProjectTypeListItem = {
    key: "mine.json",
    fileName: "mine.json",
    source: "saved",
    baseline,
    definition: { ...baseline, name: "Mine edited" },
    hasChanges: true,
  };
  const clean: ProjectTypeListItem = {
    key: "novel.json",
    fileName: "novel.json",
    source: "built-in",
    baseline: { ...baseline, id: "novel", name: "Novel" },
    definition: { ...baseline, id: "novel", name: "Novel" },
    hasChanges: false,
  };
  const draft: ProjectTypeListItem = {
    key: "draft:new-1",
    definition: { ...baseline, id: "", name: "" },
    hasChanges: true,
  };

  it("resets edited items to their baseline, drops drafts and keeps clean items", () => {
    const result = discardAllEdits([draft, edited, clean]);
    expect(result.map((item) => item.key)).toEqual(["mine.json", "novel.json"]);
    expect(result[0].definition).toEqual(baseline);
    expect(result[0].hasChanges).toBe(false);
    expect(result[1]).toBe(clean);
  });

  it("does not mutate its input", () => {
    const input = [edited];
    discardAllEdits(input);
    expect(input[0].definition.name).toBe("Mine edited");
  });
});
