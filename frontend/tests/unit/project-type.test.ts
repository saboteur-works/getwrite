import { describe, it, expect } from "vitest";
import { validateProjectType } from "../../src/lib/models/schemas";

describe("project-type schema (T016/T017)", () => {
  it("accepts a valid project-type spec", () => {
    const spec = {
      id: "novel",
      name: "Novel",
      folders: [{ name: "Workspace" }, { name: "Chapters" }],
      defaultResources: [{ name: "Title Page", type: "text", template: "" }],
    };

    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.id).toBe("novel");
  });

  it("accepts a spec with no Workspace folder", () => {
    const spec = {
      id: "article",
      name: "Article",
      folders: [{ name: "Chapters" }],
    };
    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value)
      expect(res.value.folders[0]?.name).toBe("Chapters");
  });

  it("rejects a spec with invalid id pattern", () => {
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

  it("preserves Workspace defaults when validation succeeds", () => {
    const spec = {
      id: "workspace-seed",
      name: "Workspace Seed",
      folders: [
        {
          name: "Workspace",
          special: true,
          defaultResources: [{ name: "Opening Scene", type: "text" }],
        },
      ],
    };

    const res = validateProjectType(spec);
    expect(res.success).toBe(true);
    if (res.success && "value" in res && res.value) {
      expect(res.value.folders[0]?.name).toBe("Workspace");
      expect(res.value.folders[0]?.defaultResources?.[0]?.name).toBe(
        "Opening Scene",
      );
    }
  });
});

describe("project-type modules declaration (Feature 108, FR-4)", () => {
  const folders = [{ name: "Chapters" }];

  it("keeps modules on a validated spec and leaves a spec without it unchanged", () => {
    const withModules = validateProjectType({
      id: "m",
      name: "M",
      folders,
      modules: { claims: true, sources: false },
    });
    expect(withModules.success).toBe(true);
    if (withModules.success && "value" in withModules && withModules.value) {
      expect(withModules.value.modules).toEqual({
        claims: true,
        sources: false,
      });
    }
    const without = validateProjectType({ id: "m", name: "M", folders });
    expect(without.success).toBe(true);
    if (without.success && "value" in without && without.value) {
      expect(without.value.modules).toBeUndefined();
    }
  });

  it("refuses an array as modules, so it is never stored", () => {
    const res = validateProjectType({
      id: "m",
      name: "M",
      folders,
      modules: ["claims"],
    });
    expect(res.success).toBe(false);
  });
});

describe("project-type arrangements key (Feature 109, FR-17)", () => {
  const folders = [{ name: "Chapters" }, { name: "Research Notes" }];
  const arrangement = {
    name: "Scenes by status",
    source: { kind: "folder", folderName: "Chapters", scope: "children" },
    rows: { kind: "status" },
    columns: "order",
  };
  const parse = (arrangements: unknown) =>
    validateProjectType({ id: "m", name: "M", folders, arrangements });

  it("keeps a valid list, by name or by slug, on the validated spec", () => {
    const res = parse([
      arrangement,
      {
        name: "Notes by field",
        source: {
          kind: "folder",
          folderName: "research-notes",
          scope: "descendants",
        },
        rows: "none",
        columns: { kind: "field", key: "plot" },
      },
    ]);
    expect(res.success).toBe(true);
    if (res.success) expect(res.value.arrangements).toHaveLength(2);
  });

  it("leaves a spec without the key unchanged", () => {
    const res = validateProjectType({ id: "m", name: "M", folders });
    expect(res.success).toBe(true);
    if (res.success) expect(res.value.arrangements).toBeUndefined();
  });

  it("accepts an empty list", () => {
    expect(parse([]).success).toBe(true);
  });

  it("refuses a smart-folder source, so it is never stored", () => {
    const res = parse([
      { ...arrangement, source: { kind: "smart-folder", queryId: "x" } },
    ]);
    expect(res.success).toBe(false);
  });

  it("refuses rows 'order', a blank or over-long name, and a bad scope", () => {
    expect(parse([{ ...arrangement, rows: "order" }]).success).toBe(false);
    expect(parse([{ ...arrangement, name: "   " }]).success).toBe(false);
    expect(parse([{ ...arrangement, name: "x".repeat(101) }]).success).toBe(
      false,
    );
    expect(
      parse([
        {
          ...arrangement,
          source: { kind: "folder", folderName: "Chapters", scope: "all" },
        },
      ]).success,
    ).toBe(false);
    expect(
      parse([
        {
          ...arrangement,
          source: { kind: "folder", folderName: " ", scope: "children" },
        },
      ]).success,
    ).toBe(false);
  });

  it("refuses Columns 'none' and Rows 'order' when the type is validated, with a message the Manager can show", () => {
    for (const bad of [
      { ...arrangement, columns: "none" },
      { ...arrangement, rows: "order" },
    ]) {
      const res = parse([bad]);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.issues.length).toBeGreaterThan(0);
        expect(res.issues[0].path[0]).toBe("arrangements");
        expect(res.issues[0].message).toMatch(
          /rows \(none or a field\) and columns \(order or a field\)/,
        );
      }
    }
  });

  it("accepts every allowed axis pair: Rows none or a field, Columns order or a field", () => {
    const axes = [
      { kind: "status" },
      { kind: "subtype" },
      { kind: "field", key: "k" },
    ];
    for (const rows of ["none", ...axes]) {
      for (const columns of ["order", ...axes]) {
        expect(parse([{ ...arrangement, rows, columns }]).success).toBe(true);
      }
    }
  });

  it("refuses non-array, duplicate names, more than 50 and unknown keys", () => {
    expect(parse("Chapters").success).toBe(false);
    expect(
      parse([arrangement, { ...arrangement, name: " scenes BY status " }])
        .success,
    ).toBe(false);
    expect(
      parse(
        Array.from({ length: 51 }, (_, i) => ({
          ...arrangement,
          name: `A${i}`,
        })),
      ).success,
    ).toBe(false);
    expect(parse([{ ...arrangement, id: "abc" }]).success).toBe(false);
  });

  it("names the key and no client input in a refusal", () => {
    const secret = "SECRET_CLIENT_TEXT";
    const cases: unknown[] = [
      [{ ...arrangement, [secret]: 1 }],
      [{ ...arrangement, rows: { kind: "status", [secret]: 1 } }],
      [{ ...arrangement, source: { kind: secret } }],
      [{ ...arrangement, columns: secret }],
      [{ ...arrangement, name: secret.repeat(10) }],
      secret,
    ];
    for (const c of cases) {
      const res = parse(c);
      expect(res.success).toBe(false);
      if (!res.success) {
        const text = res.issues.map((i) => i.message).join(" | ");
        expect(text).not.toContain(secret);
        expect(text).toContain("Arrangements");
      }
    }
  });
});
