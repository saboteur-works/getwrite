import { describe, it, expect } from "vitest";
import {
  organizerFilterReducer,
  filterChildren,
  initialOrganizerFilterState,
  NO_STATUS_FILTER_VALUE,
  type OrganizerFilterState,
} from "../components/WorkArea/Views/OrganizerView/organizerFilters";
import type {
  AnyResource,
  Folder,
  MetadataField,
  TextResource,
} from "../src/lib/models/types";

function makeFolder(id: string, overrides: Partial<Folder> = {}): Folder {
  return {
    id,
    slug: id,
    name: `Folder ${id}`,
    type: "folder",
    createdAt: new Date().toISOString(),
    orderIndex: 0,
    userMetadata: {},
    ...overrides,
  };
}

function makeText(
  id: string,
  overrides: Partial<TextResource> = {},
): TextResource {
  return {
    id,
    slug: id,
    name: `Resource ${id}`,
    type: "text",
    createdAt: new Date().toISOString(),
    orderIndex: 0,
    wordCount: 0,
    userMetadata: {},
    ...overrides,
  };
}

const CHARACTER_FIELD: MetadataField = {
  key: "characters",
  label: "Characters",
  type: "multi-resource-ref",
  multiple: true,
};

const LOCATION_FIELD: MetadataField = {
  key: "location",
  label: "Location",
  type: "resource-ref",
};

describe("organizerFilterReducer", () => {
  it("set-status sets the status filter", () => {
    const next = organizerFilterReducer(initialOrganizerFilterState, {
      type: "set-status",
      value: "Draft",
    });
    expect(next.status).toBe("Draft");
  });

  it("set-status with undefined clears the status filter", () => {
    const withStatus: OrganizerFilterState = {
      ...initialOrganizerFilterState,
      status: "Draft",
    };
    const next = organizerFilterReducer(withStatus, {
      type: "set-status",
      value: undefined,
    });
    expect(next.status).toBeUndefined();
  });

  it("set-word-count-range sets min and max independently", () => {
    const next = organizerFilterReducer(initialOrganizerFilterState, {
      type: "set-word-count-range",
      min: 100,
      max: undefined,
    });
    expect(next.wordCountMin).toBe(100);
    expect(next.wordCountMax).toBeUndefined();
  });

  it("set-ref-filter sets a value keyed by field key", () => {
    const next = organizerFilterReducer(initialOrganizerFilterState, {
      type: "set-ref-filter",
      fieldKey: "characters",
      value: "Alice",
    });
    expect(next.refFilters).toEqual({ characters: "Alice" });
  });

  it("set-ref-filter with undefined removes that field's entry", () => {
    const withRef: OrganizerFilterState = {
      ...initialOrganizerFilterState,
      refFilters: { characters: "Alice", location: "Forest" },
    };
    const next = organizerFilterReducer(withRef, {
      type: "set-ref-filter",
      fieldKey: "characters",
      value: undefined,
    });
    expect(next.refFilters).toEqual({ location: "Forest" });
  });

  it("clear-one clears only the status filter", () => {
    const state: OrganizerFilterState = {
      status: "Draft",
      wordCountMin: 10,
      refFilters: { characters: "Alice" },
    };
    const next = organizerFilterReducer(state, {
      type: "clear-one",
      key: "status",
    });
    expect(next.status).toBeUndefined();
    expect(next.wordCountMin).toBe(10);
    expect(next.refFilters).toEqual({ characters: "Alice" });
  });

  it("clear-one clears only the word-count filter (both bounds)", () => {
    const state: OrganizerFilterState = {
      status: "Draft",
      wordCountMin: 10,
      wordCountMax: 500,
      refFilters: { characters: "Alice" },
    };
    const next = organizerFilterReducer(state, {
      type: "clear-one",
      key: "wordCount",
    });
    expect(next.wordCountMin).toBeUndefined();
    expect(next.wordCountMax).toBeUndefined();
    expect(next.status).toBe("Draft");
    expect(next.refFilters).toEqual({ characters: "Alice" });
  });

  it("clear-one clears only the named ref filter", () => {
    const state: OrganizerFilterState = {
      status: "Draft",
      refFilters: { characters: "Alice", location: "Forest" },
    };
    const next = organizerFilterReducer(state, {
      type: "clear-one",
      key: { refFieldKey: "characters" },
    });
    expect(next.refFilters).toEqual({ location: "Forest" });
    expect(next.status).toBe("Draft");
  });

  it("clear-all resets to the empty state", () => {
    const state: OrganizerFilterState = {
      status: "Draft",
      wordCountMin: 10,
      wordCountMax: 500,
      refFilters: { characters: "Alice" },
    };
    const next = organizerFilterReducer(state, { type: "clear-all" });
    expect(next).toEqual(initialOrganizerFilterState);
  });

  it("reset returns the initial empty state", () => {
    const state: OrganizerFilterState = {
      status: "Draft",
      wordCountMin: 10,
      wordCountMax: 500,
      refFilters: { characters: "Alice" },
    };
    const next = organizerFilterReducer(state, { type: "reset" });
    expect(next).toEqual(initialOrganizerFilterState);
  });
});

describe("filterChildren", () => {
  it("with no active filters returns all children unchanged", () => {
    const children: AnyResource[] = [makeFolder("f1"), makeText("t1")];
    const result = filterChildren(children, initialOrganizerFilterState, []);
    expect(result).toEqual(children);
  });

  describe("status predicate (FR-2)", () => {
    it("hides a card whose resolved status doesn't match", () => {
      const matching = makeText("t1", { userMetadata: { status: "Draft" } });
      const nonMatching = makeText("t2", { userMetadata: { status: "Final" } });
      const result = filterChildren(
        [matching, nonMatching],
        { ...initialOrganizerFilterState, status: "Draft" },
        [],
      );
      expect(result).toEqual([matching]);
    });

    it("uses the default status when no status is set on the resource", () => {
      const usesDefault = makeText("t1", { userMetadata: {} });
      const result = filterChildren(
        [usesDefault],
        { ...initialOrganizerFilterState, status: "Draft" },
        [],
        "Draft",
      );
      expect(result).toEqual([usesDefault]);
    });

    it("matches the 'no status' sentinel against resources with no resolved status", () => {
      const noStatus = makeText("t1", { userMetadata: {} });
      const hasStatus = makeText("t2", { userMetadata: { status: "Draft" } });
      const result = filterChildren(
        [noStatus, hasStatus],
        { ...initialOrganizerFilterState, status: NO_STATUS_FILTER_VALUE },
        [],
        "",
      );
      expect(result).toEqual([noStatus]);
    });
  });

  describe("word-count predicate (FR-3, FR-4)", () => {
    it("excludes a non-text resource when the word-count filter is active", () => {
      const folder = makeFolder("f1");
      const text = makeText("t1", { wordCount: 500 });
      const result = filterChildren(
        [folder, text],
        { ...initialOrganizerFilterState, wordCountMin: 100 },
        [],
      );
      expect(result).toEqual([text]);
    });

    it("narrows text resources by min/max range", () => {
      const low = makeText("t1", { wordCount: 50 });
      const mid = makeText("t2", { wordCount: 500 });
      const high = makeText("t3", { wordCount: 5000 });
      const result = filterChildren(
        [low, mid, high],
        {
          ...initialOrganizerFilterState,
          wordCountMin: 100,
          wordCountMax: 1000,
        },
        [],
      );
      expect(result).toEqual([mid]);
    });

    it("does not exclude non-text resources when the filter is inactive", () => {
      const folder = makeFolder("f1");
      const text = makeText("t1", { wordCount: 500 });
      const result = filterChildren(
        [folder, text],
        initialOrganizerFilterState,
        [],
      );
      expect(result).toEqual([folder, text]);
    });
  });

  describe("resource-ref predicate (FR-6)", () => {
    it("matches a single resource-ref field by name", () => {
      const matching = makeText("t1", {
        userMetadata: { location: { id: "loc-1", name: "Forest" } },
      });
      const nonMatching = makeText("t2", {
        userMetadata: { location: { id: "loc-2", name: "Castle" } },
      });
      const result = filterChildren(
        [matching, nonMatching],
        { ...initialOrganizerFilterState, refFilters: { location: "Forest" } },
        [LOCATION_FIELD],
      );
      expect(result).toEqual([matching]);
    });

    it("matches a multi-resource-ref field if the selected value is any one entry", () => {
      const matching = makeText("t1", {
        userMetadata: {
          characters: [
            { id: "c1", name: "Alice" },
            { id: "c2", name: "Bob" },
          ],
        },
      });
      const nonMatching = makeText("t2", {
        userMetadata: { characters: [{ id: "c3", name: "Carol" }] },
      });
      const result = filterChildren(
        [matching, nonMatching],
        { ...initialOrganizerFilterState, refFilters: { characters: "Alice" } },
        [CHARACTER_FIELD],
      );
      expect(result).toEqual([matching]);
    });

    it("excludes a resource with no value for the filtered field", () => {
      const noValue = makeText("t1", { userMetadata: {} });
      const result = filterChildren(
        [noValue],
        { ...initialOrganizerFilterState, refFilters: { location: "Forest" } },
        [LOCATION_FIELD],
      );
      expect(result).toEqual([]);
    });
  });

  describe("AND combination (FR-7)", () => {
    it("requires every active filter to match", () => {
      const matchesAll = makeText("t1", {
        wordCount: 500,
        userMetadata: {
          status: "Draft",
          location: { id: "loc-1", name: "Forest" },
        },
      });
      const matchesStatusOnly = makeText("t2", {
        wordCount: 5000,
        userMetadata: {
          status: "Draft",
          location: { id: "loc-1", name: "Forest" },
        },
      });
      const matchesRefOnly = makeText("t3", {
        wordCount: 500,
        userMetadata: {
          status: "Final",
          location: { id: "loc-1", name: "Forest" },
        },
      });
      const result = filterChildren(
        [matchesAll, matchesStatusOnly, matchesRefOnly],
        {
          status: "Draft",
          wordCountMin: 100,
          wordCountMax: 1000,
          refFilters: { location: "Forest" },
        },
        [LOCATION_FIELD],
      );
      expect(result).toEqual([matchesAll]);
    });
  });
});
