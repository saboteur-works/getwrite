/**
 * Feature 109, Task 2 (FR-5, FR-7, FR-14, FR-20): the contract module and the
 * two inert core stubs. Constants are pinned, the stubs are pinned as exported
 * and inert (Tasks 10 and 25 replace the bodies), and the contract files are
 * pinned as free of React, JSX, JSON and `node:*` imports.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORGANIZER_ARRANGEMENT_LIMIT,
  ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH,
  ORGANIZER_ARRANGEMENT_NAME_MIN_LENGTH,
  type OrganizerArrangement,
  type OrganizerAxis,
  type OrganizerFieldWriteInput,
} from "../../src/lib/models/organizer-grid-types";
import { setOrganizerFieldsCore } from "../../src/lib/models/organizer-field-write-core";
import {
  addOrganizerArrangementCore,
  deleteOrganizerArrangementCore,
  renameOrganizerArrangementCore,
  validateOrganizerArrangementDraft,
} from "../../src/lib/models/organizer-arrangements-core";

const MODELS_DIR = path.resolve(__dirname, "../../src/lib/models");

function importSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(
    /\b(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g,
  )) {
    found.push(m[1]);
  }
  return found;
}

describe("organizer-grid-types constants", () => {
  it("caps arrangements at 50 per project", () => {
    expect(ORGANIZER_ARRANGEMENT_LIMIT).toBe(50);
  });

  it("allows a name of 1 to 100 characters", () => {
    expect(ORGANIZER_ARRANGEMENT_NAME_MIN_LENGTH).toBe(1);
    expect(ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("organizer-grid-types shapes", () => {
  it("accepts every axis spelling and both source kinds", () => {
    const axes: OrganizerAxis[] = [
      "none",
      "order",
      { kind: "status" },
      { kind: "subtype" },
      { kind: "field", key: "plotline" },
    ];
    const arrangement: OrganizerArrangement = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "By plotline",
      source: { kind: "folder", folderId: "f1", scope: "descendants" },
      rows: axes[4],
      columns: axes[1],
    };
    const smart: OrganizerArrangement = {
      ...arrangement,
      source: { kind: "smart-folder", queryId: "q1" },
    };
    expect(axes).toHaveLength(5);
    expect(smart.source.kind).toBe("smart-folder");
  });
});

describe("inert core stubs", () => {
  it("setOrganizerFieldsCore is exported (Task 10 replaced the stub; behaviour is in organizer-field-write-core.test.ts)", () => {
    const input: OrganizerFieldWriteInput = { resourceId: "r1", changes: [] };
    expect(typeof setOrganizerFieldsCore).toBe("function");
    expect(input.changes).toEqual([]);
  });

  it("the arrangement stubs are exported and throw not implemented", async () => {
    await expect(
      addOrganizerArrangementCore("p1", {
        name: "x",
        source: { kind: "smart-folder", queryId: "q" },
        rows: "none",
        columns: "order",
      }),
    ).rejects.toThrow("not implemented");
    await expect(
      renameOrganizerArrangementCore("p1", { id: "a", name: "y" }),
    ).rejects.toThrow("not implemented");
    await expect(
      deleteOrganizerArrangementCore("p1", { id: "a" }),
    ).rejects.toThrow("not implemented");
    expect(() => validateOrganizerArrangementDraft({})).toThrow(
      "not implemented",
    );
  });
});

describe("import graph of the contract files", () => {
  const files = [
    "organizer-grid-types.ts",
    "organizer-field-write-core.ts",
    "organizer-arrangements-core.ts",
  ];

  it.each(files)("%s imports no React, JSX, JSON or node:*", (file) => {
    const text = readFileSync(path.join(MODELS_DIR, file), "utf8");
    const bad = importSpecifiers(text).filter(
      (s) =>
        s === "react" ||
        s.startsWith("react/") ||
        s.startsWith("react-dom") ||
        s.startsWith("node:") ||
        s === "fs" ||
        /\.(tsx|jsx|json)$/.test(s),
    );
    expect(bad).toEqual([]);
  });
});
