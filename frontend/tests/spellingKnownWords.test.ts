/**
 * @module spellingKnownWords.test
 *
 * Task 29 (spell-checker): tests for the pure known-word set in
 * `src/lib/spelling/known-words.ts` (FR-17, FR-18, AC-9).
 */
import { describe, expect, it } from "vitest";
import { createKnownWords } from "../src/lib/spelling/known-words";
import type { EntityAliasTable } from "../src/lib/models/entity-alias-table";

function table(...entries: Array<[string, string[]]>): EntityAliasTable {
  const entities: EntityAliasTable["entities"] = {};
  entries.forEach(([name, aliases], i) => {
    entities[`e${i}`] = {
      entityId: `e${i}`,
      entityKind: "character",
      name,
      aliases,
      terms: [name, ...aliases],
    };
  });
  return { entities, claimedBy: {} };
}

const EMPTY: EntityAliasTable = { entities: {}, claimedBy: {} };

describe("createKnownWords", () => {
  it("knows words on either list, ignoring case", () => {
    const known = createKnownWords({
      projectWords: ["Zorblax"],
      ignoredWords: ["qwertz"],
      aliasTable: EMPTY,
    });
    expect(known.has("zorblax")).toBe(true);
    expect(known.has("ZORBLAX")).toBe(true);
    expect(known.has("Qwertz")).toBe(true);
    expect(known.has("other")).toBe(false);
  });

  it("knows entity names and aliases, ignoring case", () => {
    const known = createKnownWords({
      projectWords: [],
      ignoredWords: [],
      aliasTable: table(["Aria", ["Ari"]]),
    });
    expect(known.has("aria")).toBe(true);
    expect(known.has("ARI")).toBe(true);
    expect(known.has("aro")).toBe(false);
  });

  it("knows possessive and plural forms of an entity term", () => {
    const known = createKnownWords({
      projectWords: [],
      ignoredWords: [],
      aliasTable: table(["Aria", []]),
    });
    expect(known.has("Aria's")).toBe(true);
    expect(known.has("Arias")).toBe(true);
    expect(known.has("Aria’s")).toBe(true);
    expect(known.has("Aria'")).toBe(true);
    expect(known.has("Ariax")).toBe(false);
  });

  it("makes each word of a multi-word name or alias known", () => {
    const known = createKnownWords({
      projectWords: [],
      ignoredWords: [],
      aliasTable: table(["Zorblax Quimby", ["the Grand Vizier"]]),
    });
    for (const w of ["zorblax", "Quimby", "Grand", "Vizier", "Quimby's"]) {
      expect(known.has(w)).toBe(true);
    }
  });

  it("counts entity terms whatever the entities flag (no flag input)", () => {
    // The function takes only the table; an entities flag cannot gate it.
    const known = createKnownWords({
      projectWords: [],
      ignoredWords: [],
      aliasTable: table(["Zorblax", []]),
    });
    expect(known.has("zorblax")).toBe(true);
  });

  it("never mutates the lists, by reference or value", () => {
    const projectWords = ["Zorblax"];
    const ignoredWords = ["qwertz"];
    const aliasTable = table(["Aria", ["Ari"]]);
    const snapshot = JSON.stringify([projectWords, ignoredWords, aliasTable]);
    const known = createKnownWords({ projectWords, ignoredWords, aliasTable });
    known.has("unknownword");
    known.has("zorblax");
    expect(JSON.stringify([projectWords, ignoredWords, aliasTable])).toBe(
      snapshot,
    );
    expect(projectWords).toEqual(["Zorblax"]);
    expect(ignoredWords).toEqual(["qwertz"]);
  });
});
