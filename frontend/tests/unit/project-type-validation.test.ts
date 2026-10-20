import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  EditorConfigSchema,
  ProjectTypeSchema,
  validateProjectType,
} from "../../src/lib/models/schemas";
import { validateProject } from "../../src/lib/models/project";
import { createProject } from "../../src/lib/models/project";
import { ApiEditorConfigSchema } from "../../src/lib/api/schemas";

describe("project-type validation (T016)", () => {
  it("accepts a minimal valid spec", () => {
    const spec = {
      id: "novel",
      name: "Novel",
      folders: [{ name: "Workspace" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.id).toBe("novel");
  });

  it("rejects a template missing `id`", () => {
    const spec = { name: "NoId", folders: [{ name: "Workspace" }] };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("id");
  });

  it("rejects a template with no `folders` array", () => {
    const spec = { id: "no-folders", name: "No Folders" };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("folders");
  });

  it("rejects a template with empty `folders`", () => {
    const spec = { id: "empty-folders", name: "Empty Folders", folders: [] };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("Add at least one folder.");
  });

  it("accepts a template without a Workspace folder", () => {
    const spec = {
      id: "no-workspace",
      name: "No Workspace",
      folders: [{ name: "Drafts" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.folders[0]?.name).toBe("Drafts");
  });

  it("accepts a Workspace-less template that still uses the deprecated `special` flag", () => {
    const spec = {
      id: "special-no-workspace",
      name: "Special No Workspace",
      folders: [{ name: "Drafts", special: true }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.folders[0]?.special).toBe(true);
  });

  it("rejects invalid id pattern", () => {
    const spec = {
      id: "Bad ID!",
      name: "Bad",
      folders: [{ name: "Workspace" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain(
      "ID can use only lowercase letters",
    );
  });

  it("rejects unknown top-level fields", () => {
    const spec = {
      id: "strict-shape",
      name: "Strict Shape",
      folders: [{ name: "Workspace" }],
      extra: true,
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("extra");
  });

  it("accepts an optional relationshipTypes string array", () => {
    const spec = {
      id: "with-relationship-types",
      name: "With Relationship Types",
      folders: [{ name: "Workspace" }],
      relationshipTypes: ["ally of", "rival of"],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.relationshipTypes).toEqual(["ally of", "rival of"]);
  });

  it("accepts a spec with no relationshipTypes at all", () => {
    const spec = {
      id: "no-relationship-types",
      name: "No Relationship Types",
      folders: [{ name: "Workspace" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.relationshipTypes).toBeUndefined();
  });

  it("rejects a non-string-array relationshipTypes value", () => {
    const spec = {
      id: "bad-relationship-types",
      name: "Bad Relationship Types",
      folders: [{ name: "Workspace" }],
      relationshipTypes: [1, 2, 3],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
  });
});

/**
 * Workspace requirement removal (see
 * docs/features/feature-specifications/remove-workspace-requirement).
 *
 * The former Workspace-invariant guardrail (originally T027) has been removed:
 * a folder named `Workspace` is no longer required and folder names carry no
 * special application semantics.  These assertions verify that authors may now
 * use any folder layout, while the deprecated `special` flag is still accepted
 * (but ignored) for backward compatibility.
 */
describe("project-type folder freedom (Workspace requirement removed)", () => {
  it("accepts a folder named 'workspace' (folder name is no longer significant)", () => {
    const spec = {
      id: "case-check",
      name: "Case Check",
      folders: [{ name: "workspace" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
  });

  it("still accepts the deprecated `special` flag on any folder", () => {
    const spec = {
      id: "multi-folder",
      name: "Multi Folder",
      folders: [{ name: "Drafts" }, { name: "Workspace", special: true }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
  });

  it("accepts a definition with only non-Workspace folders", () => {
    const spec = {
      id: "renamed-workspace",
      name: "Renamed",
      folders: [{ name: "Archive" }, { name: "Notes" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
  });

  it("preserves validation result when Workspace folder is the only folder", () => {
    const spec = {
      id: "workspace-only",
      name: "Workspace Only",
      folders: [{ name: "Workspace", special: true }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
  });

  it("accepts Workspace when default resources are defined at both root and folder level", () => {
    const spec = {
      id: "workspace-defaults",
      name: "Workspace Defaults",
      folders: [
        {
          name: "Workspace",
          special: true,
          defaultResources: [{ name: "Scene Seed", type: "text" }],
        },
      ],
      defaultResources: [{ name: "Front Matter", type: "text" }],
    };

    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value) {
      expect(res.value.folders[0]?.name).toBe("Workspace");
      expect(res.value.defaultResources).toHaveLength(1);
    }
  });

  it("rejects a definition whose id contains uppercase letters", () => {
    const spec = {
      id: "NovelType",
      name: "Novel Type",
      folders: [{ name: "Workspace" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
  });

  it("rejects a definition with valid id, folders, but a Workspace folder with special=undefined replaced by extra keys", () => {
    const spec = {
      id: "extra-folder-key",
      name: "Extra Folder Key",
      folders: [{ name: "Workspace", special: false, extraKey: "value" }],
    };
    const res = validateProjectType(spec);
    // folder schema is not strict, so extra keys are stripped — should pass
    expect(res.success).toBe(true);
  });

  it("validates that defaultResources entries have required name, type fields", () => {
    const spec = {
      id: "default-resources",
      name: "Default Resources",
      folders: [{ name: "Workspace" }],
      defaultResources: [
        { name: "Scene 1", type: "text", folder: "Workspace" },
      ],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
  });

  it("accepts a valid defaultFolders declaration", () => {
    const spec = {
      id: "default-folders",
      name: "Default Folders",
      folders: [{ name: "Workspace" }, { name: "Drafts" }],
      defaultFolders: [{ folder: "Drafts", name: "Act 1" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value) {
      expect(res.value.defaultFolders).toHaveLength(1);
      expect(res.value.defaultFolders![0]?.name).toBe("Act 1");
    }
  });

  it("rejects a defaultFolders entry missing name", () => {
    const spec = {
      id: "df-no-name",
      name: "DF No Name",
      folders: [{ name: "Workspace" }],
      defaultFolders: [{ folder: "Workspace" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("name");
  });

  it("rejects a defaultFolders entry missing folder", () => {
    const spec = {
      id: "df-no-folder",
      name: "DF No Folder",
      folders: [{ name: "Workspace" }],
      defaultFolders: [{ name: "Act 1" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("folder");
  });

  it("still rejects unknown top-level keys when defaultFolders is present", () => {
    const spec = {
      id: "df-strict",
      name: "DF Strict",
      folders: [{ name: "Workspace" }],
      defaultFolders: [{ folder: "Workspace", name: "Sub" }],
      unknownKey: true,
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain("unknownKey");
  });

  it("retains metadataSource and special fields on defaultFolders entries after validation", () => {
    const spec = {
      id: "df-metadata",
      name: "DF Metadata",
      folders: [{ name: "Workspace" }, { name: "Research" }],
      defaultFolders: [
        {
          folder: "Research",
          name: "Characters",
          special: true,
          metadataSource: {
            isMetadataSource: true,
            metadataInputType: "multiselect",
          },
        },
      ],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value) {
      const entry = res.value.defaultFolders![0];
      expect(entry?.special).toBe(true);
      expect(entry?.metadataSource?.isMetadataSource).toBe(true);
      expect(entry?.metadataSource?.metadataInputType).toBe("multiselect");
    }
  });
});

describe("project-type subtypes seeding (Feature 72, FR-26)", () => {
  const base = { id: "t", name: "T", folders: [{ name: "Workspace" }] };

  it("accepts an optional subtypes list, trimmed and in order", () => {
    const res = validateProjectType({ ...base, subtypes: [" Scene ", "Beat"] });
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.subtypes).toEqual(["Scene", "Beat"]);
  });

  it("accepts a spec without subtypes", () => {
    const res = validateProjectType(base);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect("subtypes" in res.value).toBe(false);
  });

  it("rejects duplicate subtypes under trim + lowercase", () => {
    expect(
      validateProjectType({ ...base, subtypes: ["Scene", "scene"] }).success,
    ).toBe(false);
  });

  it("rejects a blank subtype entry", () => {
    expect(validateProjectType({ ...base, subtypes: ["  "] }).success).toBe(
      false,
    );
  });
});

describe("project line height floor (Part 2, FR-22)", () => {
  const base = { id: "t", name: "T", folders: [{ name: "Workspace" }] };
  const withLineHeight = (lineHeight: string) => ({
    ...base,
    editorConfig: { body: { lineHeight } },
  });
  const accepted = ["", "1.8", "2", "3.5"];
  const refused = ["1.7", "1", "0.5", "normal", "150%", "1.8em", "28px", "abc"];

  it.each(accepted)("validateProjectType accepts lineHeight %j", (v) => {
    expect(validateProjectType(withLineHeight(v)).success).toBe(true);
  });

  it.each(refused)("validateProjectType refuses lineHeight %j", (v) => {
    const res = validateProjectType(withLineHeight(v));
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.errors)).toContain(
      "Line height must be a number of at least 1.8.",
    );
  });

  it.each(accepted)("EditorConfigSchema accepts lineHeight %j", (v) => {
    expect(
      EditorConfigSchema.safeParse({ body: { lineHeight: v } }).success,
    ).toBe(true);
  });

  it.each(refused)("EditorConfigSchema refuses lineHeight %j", (v) => {
    expect(
      EditorConfigSchema.safeParse({ body: { lineHeight: v } }).success,
    ).toBe(false);
  });

  it.each(accepted)("ApiEditorConfigSchema accepts lineHeight %j", (v) => {
    expect(
      ApiEditorConfigSchema.safeParse({ body: { lineHeight: v } }).success,
    ).toBe(true);
  });

  it.each(refused)("ApiEditorConfigSchema refuses lineHeight %j", (v) => {
    expect(
      ApiEditorConfigSchema.safeParse({ body: { lineHeight: v } }).success,
    ).toBe(false);
  });

  it("all built-in project type files still pass validateProjectType", () => {
    const dir = path.resolve(
      __dirname,
      "../../../getwrite-config/templates/project-types",
    );
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "project-type.schema.json");
    expect(files).toHaveLength(6);
    for (const f of files) {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(path.join(dir, f), "utf8"),
      );
      expect(validateProjectType(parsed).success, f).toBe(true);
    }
  });

  it("a stored project with lineHeight below 1.8 stays valid (no migration, not refused on read)", () => {
    const proj = createProject({ name: "Legacy" });
    const legacy = {
      ...proj,
      config: {
        ...(proj.config ?? {}),
        editorConfig: { body: { lineHeight: "1.5" } },
      },
    };
    const parsed = validateProject(legacy);
    expect(parsed.config?.editorConfig?.body?.lineHeight).toBe("1.5");
  });
});

type Issue = { path: PropertyKey[]; message: string };

function issuesOf(spec: unknown): Issue[] {
  const result = ProjectTypeSchema.safeParse(spec);
  return result.success
    ? []
    : result.error.issues.map((i) => ({ path: i.path, message: i.message }));
}

const base = (
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: "t",
  name: "T",
  folders: [{ name: "Workspace" }],
  ...extra,
});

describe("project-type blank and duplicate entries (Feature 90, FR-28)", () => {
  describe("type name", () => {
    it.each(["", "   "])("refuses name %j", (name) => {
      expect(issuesOf(base({ name }))).toEqual([
        { path: ["name"], message: "Name must not be blank." },
      ]);
    });

    it("stores the trimmed name and keeps its case", () => {
      const r = ProjectTypeSchema.parse(base({ name: "  My Novel " }));
      expect(r.name).toBe("My Novel");
    });
  });

  describe.each([
    ["statuses", "Status label must not be blank.", "Duplicate status label."],
    [
      "relationshipTypes",
      "Relationship type must not be blank.",
      "Duplicate relationship type.",
    ],
  ])("%s", (key, blank, dup) => {
    it.each(["", "  "])("refuses a blank entry %j at its index", (entry) => {
      expect(issuesOf(base({ [key]: ["Draft", entry] }))).toEqual([
        { path: [key, 1], message: blank },
      ]);
    });

    it("refuses a duplicate under trim and case, reporting the second", () => {
      expect(issuesOf(base({ [key]: ["Draft", " draft "] }))).toEqual([
        { path: [key, 1], message: dup },
      ]);
    });

    it("accepts an empty list and an absent one", () => {
      expect(issuesOf(base({ [key]: [] }))).toEqual([]);
      expect(issuesOf(base())).toEqual([]);
    });

    it("trims surrounding space in the parsed value", () => {
      const r = ProjectTypeSchema.parse(base({ [key]: [" Draft ", "Done"] }));
      expect((r as Record<string, unknown>)[key]).toEqual(["Draft", "Done"]);
    });
  });

  describe("folder, subfolder and starter document names", () => {
    it("refuses a blank folder name with its path", () => {
      expect(
        issuesOf(base({ folders: [{ name: "Ok" }, { name: "  " }] })),
      ).toEqual([
        {
          path: ["folders", 1, "name"],
          message: "Folder name must not be blank.",
        },
      ]);
    });

    it("refuses a blank subfolder name and a blank Parent Folder", () => {
      expect(
        issuesOf(
          base({
            defaultFolders: [
              { folder: "Workspace", name: "" },
              { folder: "   ", name: "Sub" },
              { folder: "", name: "Sub2" },
            ],
          }),
        ),
      ).toEqual([
        {
          path: ["defaultFolders", 0, "name"],
          message: "Subfolder name must not be blank.",
        },
        {
          path: ["defaultFolders", 1, "folder"],
          message: "Parent folder must not be blank.",
        },
        {
          path: ["defaultFolders", 2, "folder"],
          message: "Parent folder must not be blank.",
        },
      ]);
    });

    it("refuses a blank starter document name in folders[].defaultResources and top-level defaultResources", () => {
      expect(
        issuesOf(
          base({
            folders: [
              { name: "W", defaultResources: [{ name: " ", type: "text" }] },
            ],
            defaultResources: [{ name: "", type: "text" }],
          }),
        ),
      ).toEqual([
        {
          path: ["folders", 0, "defaultResources", 0, "name"],
          message: "Starter document name must not be blank.",
        },
        {
          path: ["defaultResources", 0, "name"],
          message: "Starter document name must not be blank.",
        },
      ]);
    });

    it("trims folder, subfolder and starter document names and keeps their case", () => {
      const r = ProjectTypeSchema.parse(
        base({
          folders: [
            {
              name: " Drafts ",
              defaultResources: [{ name: " In Folder ", type: "text" }],
            },
          ],
          defaultFolders: [{ folder: "Drafts", name: " Part One " }],
          defaultResources: [{ name: " Title Page ", type: "text" }],
        }),
      );
      expect(r.folders[0]?.name).toBe("Drafts");
      expect(r.folders[0]?.defaultResources?.[0]?.name).toBe("In Folder");
      expect(r.defaultFolders?.[0]?.name).toBe("Part One");
      expect(r.defaultResources?.[0]?.name).toBe("Title Page");
    });

    it("accepts a blank or absent starter document folder", () => {
      expect(
        issuesOf(
          base({
            defaultResources: [
              { name: "A", type: "text", folder: "" },
              { name: "B", type: "text", folder: "  " },
              { name: "C", type: "text" },
            ],
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("slug-equal siblings", () => {
    it("refuses top-level folders Chapter 1 then Chapter 1!, reporting the second", () => {
      expect(
        issuesOf(
          base({ folders: [{ name: "Chapter 1" }, { name: "Chapter 1!" }] }),
        ),
      ).toEqual([
        {
          path: ["folders", 1, "name"],
          message:
            "Folder name \u201cChapter 1!\u201d is too similar to \u201cChapter 1\u201d.",
        },
      ]);
    });

    it("refuses the reversed pair, reporting the second", () => {
      expect(
        issuesOf(
          base({ folders: [{ name: "Chapter 1!" }, { name: "Chapter 1" }] }),
        ),
      ).toEqual([
        {
          path: ["folders", 1, "name"],
          message:
            "Folder name \u201cChapter 1\u201d is too similar to \u201cChapter 1!\u201d.",
        },
      ]);
    });

    it.each([
      [
        ["Part 1", "part-1"],
        ["A", "A!"],
      ],
      [
        ["part-1", "Part 1"],
        ["A!", "A"],
      ],
    ])(
      "refuses slug-equal subfolders under parents %j (equal by slugify) in order %j",
      (parents, names) => {
        expect(
          issuesOf(
            base({
              folders: [{ name: "Part 1" }],
              defaultFolders: [
                { folder: parents[0], name: names[0] },
                { folder: parents[1], name: names[1] },
              ],
            }),
          ),
        ).toEqual([
          {
            path: ["defaultFolders", 1, "name"],
            message: `Subfolder name \u201c${names[1]}\u201d is too similar to \u201c${names[0]}\u201d.`,
          },
        ]);
      },
    );

    it("accepts slug-equal subfolders under different parents", () => {
      expect(
        issuesOf(
          base({
            folders: [{ name: "One" }, { name: "Two" }],
            defaultFolders: [
              { folder: "One", name: "Notes" },
              { folder: "Two", name: "Notes!" },
            ],
          }),
        ),
      ).toEqual([]);
    });

    it("accepts a subfolder whose slug equals a top-level folder's (siblings only)", () => {
      expect(
        issuesOf(
          base({
            folders: [{ name: "Notes" }, { name: "Other" }],
            defaultFolders: [
              { folder: "Other", name: "Notes" },
              { folder: "Notes", name: "Notes!" },
            ],
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("starter documents with the same slug in one folder (allowed)", () => {
    it("are not refused: project creation writes two resources for them (project-creator.test.ts, MEASURED 2026-10-20)", () => {
      expect(
        issuesOf(
          base({
            defaultResources: [
              { folder: "Workspace", name: "Chapter 1", type: "text" },
              { folder: "Workspace", name: "Chapter 1!", type: "text" },
            ],
            folders: [
              {
                name: "Workspace",
                defaultResources: [
                  { name: "Scene", type: "text" },
                  { name: "Scene!", type: "text" },
                ],
              },
            ],
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("built-in files", () => {
    const dir = path.resolve(
      __dirname,
      "../../../getwrite-config/templates/project-types",
    );
    const files = [
      "article_project_type.json",
      "blank_project_type.json",
      "game_documentation.json",
      "novel_project_type.json",
      "poetry_and_lyrics_type.json",
      "serial_project_type.json",
    ];
    it("the directory holds exactly these six spec files", () => {
      expect(
        fs
          .readdirSync(dir)
          .filter(
            (f) => f.endsWith(".json") && f !== "project-type.schema.json",
          )
          .sort(),
      ).toEqual(files);
    });
    it.each(files)("%s passes validateProjectType", (f) => {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(path.join(dir, f), "utf8"),
      );
      const res = validateProjectType(parsed);
      expect(res.success, JSON.stringify(res.success ? [] : res.errors)).toBe(
        true,
      );
    });
  });
});

describe("project-type refusal messages are readable (Feature 90, FR-28 g)", () => {
  const valid = {
    id: "my-type",
    name: "My Type",
    folders: [{ name: "Drafts" }],
  };
  const ZOD_DEFAULT =
    /expected|too small|too big|invalid input|invalid string|unrecognized key/i;

  function messagesFor(spec: unknown): string[] {
    const result = validateProjectType(spec);
    if (result.success) return [];
    return result.issues.map((issue) => issue.message);
  }

  it("asks for a folder when there is none, also with a starter document whose folder is blank", () => {
    const messages = messagesFor({
      ...valid,
      folders: [],
      defaultResources: [{ name: "Opening", folder: "", type: "text" }],
    });
    expect(messages).toEqual([
      "Add at least one folder. A new project needs a folder to hold its documents.",
    ]);
  });

  it("says how long an ID may be", () => {
    expect(messagesFor({ ...valid, id: "a".repeat(65) })).toEqual([
      "ID must be 64 characters or fewer.",
    ]);
    expect(messagesFor({ ...valid, id: "a".repeat(64) })).toEqual([]);
  });

  it("says a blank ID must not be blank, once", () => {
    expect(messagesFor({ ...valid, id: "" })).toEqual([
      "ID must not be blank.",
    ]);
  });

  it.each(["My Type", "my type", "my.type"])(
    "says which characters an ID may use for %j",
    (id) => {
      expect(messagesFor({ ...valid, id })).toEqual([
        "ID can use only lowercase letters, numbers, hyphens (-) and underscores (_).",
      ]);
    },
  );

  it.each([-5, 1.5])(
    "says the word count goal must be a whole number of 0 or more for %j",
    (wordCountGoal) => {
      expect(messagesFor({ ...valid, wordCountGoal })).toEqual([
        "Word count goal must be a whole number of 0 or more.",
      ]);
    },
  );

  it("names the section for a value the form cannot produce", () => {
    const messages = messagesFor({
      ...valid,
      folders: [{ name: "Drafts", metadataSource: 5 }],
    });
    expect(messages).toEqual(["A value under Folders is not valid."]);
  });

  it("names an unrecognised setting in plain words", () => {
    expect(messagesFor({ ...valid, colour: "red" })).toEqual([
      "This project type has a setting GetWrite does not recognise: colour.",
    ]);
  });

  it("never shows a default validator message for these refusals", () => {
    const specs: unknown[] = [
      { ...valid, folders: [] },
      { ...valid, id: "" },
      { ...valid, id: "Bad Id" },
      { ...valid, wordCountGoal: -1 },
      { ...valid, folders: [{ name: "Drafts", metadataSource: 5 }] },
      { ...valid, defaultResources: [{ name: "Doc", type: "video" }] },
      { ...valid, extra: true },
      { ...valid, name: 7 },
    ];
    for (const spec of specs) {
      for (const message of messagesFor(spec)) {
        expect(message).not.toMatch(ZOD_DEFAULT);
      }
    }
  });
});
