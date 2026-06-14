import { describe, it, expect } from "vitest";
import {
  resolveOrganizerCardBody,
  makeTextExcerpt,
  DEFAULT_CARD_EXCERPT_LENGTH,
} from "../components/WorkArea/Views/OrganizerView/cardBody";
import { createTextResource } from "../src/lib/models/resource";

describe("makeTextExcerpt", () => {
  it("returns trimmed text unchanged when within the cap", () => {
    expect(makeTextExcerpt("  hello world  ", 100)).toBe("hello world");
  });

  it("truncates and appends an ellipsis when over the cap", () => {
    const out = makeTextExcerpt("abcdefghij", 4);
    expect(out).toBe("abcd…");
  });
});

describe("resolveOrganizerCardBody — source: none", () => {
  it("returns undefined regardless of resource data", () => {
    const res = createTextResource({
      name: "R",
      plainText: "Some body text",
      userMetadata: { notes: "a note" },
    });
    expect(
      resolveOrganizerCardBody(res, { source: "none" }, { notesEnabled: true }),
    ).toBeUndefined();
  });
});

describe("resolveOrganizerCardBody — source: field", () => {
  it("returns the configured field's string value", () => {
    const res = createTextResource({
      name: "R",
      userMetadata: { synopsis: "A short synopsis." },
    });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "field", fieldKey: "synopsis" },
        { notesEnabled: false },
      ),
    ).toBe("A short synopsis.");
  });

  it("joins array field values with commas", () => {
    const res = createTextResource({
      name: "R",
      userMetadata: { status: ["draft", "review"] },
    });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "field", fieldKey: "status" },
        { notesEnabled: false },
      ),
    ).toBe("draft, review");
  });

  it("renders a resource-ref field as its display name", () => {
    const res = createTextResource({
      name: "R",
      userMetadata: { pov: { id: "r9", name: "Alice" } },
    });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "field", fieldKey: "pov" },
        { notesEnabled: false },
      ),
    ).toBe("Alice");
  });

  it("joins a multi-resource-ref field's names with commas", () => {
    const res = createTextResource({
      name: "R",
      userMetadata: {
        pov: [
          { id: "r9", name: "Alice" },
          { id: "r10", name: "Bob" },
        ],
      },
    });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "field", fieldKey: "pov" },
        { notesEnabled: false },
      ),
    ).toBe("Alice, Bob");
  });

  it("returns undefined for an empty or missing field", () => {
    const res = createTextResource({
      name: "R",
      userMetadata: { synopsis: "   " },
    });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "field", fieldKey: "synopsis" },
        { notesEnabled: false },
      ),
    ).toBeUndefined();
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "field", fieldKey: "missing" },
        { notesEnabled: false },
      ),
    ).toBeUndefined();
  });

  it("returns undefined when no fieldKey is configured", () => {
    const res = createTextResource({ name: "R" });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "field" },
        { notesEnabled: false },
      ),
    ).toBeUndefined();
  });
});

describe("resolveOrganizerCardBody — source: text-excerpt", () => {
  it("returns an excerpt of the resource text capped to excerptLength", () => {
    const res = createTextResource({
      name: "R",
      plainText: "The quick brown fox jumps over the lazy dog.",
    });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "text-excerpt", excerptLength: 9 },
        { notesEnabled: false },
      ),
    ).toBe("The quick…");
  });

  it("falls back to the default cap when excerptLength is unset or invalid", () => {
    const long = "x".repeat(DEFAULT_CARD_EXCERPT_LENGTH + 50);
    const res = createTextResource({ name: "R", plainText: long });
    const out = resolveOrganizerCardBody(
      res,
      { source: "text-excerpt" },
      { notesEnabled: false },
    );
    // DEFAULT_CARD_EXCERPT_LENGTH chars + the ellipsis.
    expect(out).toHaveLength(DEFAULT_CARD_EXCERPT_LENGTH + 1);
  });

  it("returns undefined when the resource has no text content", () => {
    const res = createTextResource({ name: "R", plainText: "" });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "text-excerpt", excerptLength: 50 },
        { notesEnabled: false },
      ),
    ).toBeUndefined();
  });

  it("prefers the provided textExcerpt over the resource's plainText", () => {
    const res = createTextResource({ name: "R", plainText: "stale content" });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "text-excerpt", excerptLength: 50 },
        { notesEnabled: false, textExcerpt: "fetched content" },
      ),
    ).toBe("fetched content");
  });

  it("returns undefined when neither textExcerpt nor plainText is present", () => {
    const res = createTextResource({ name: "R" });
    expect(
      resolveOrganizerCardBody(
        res,
        { source: "text-excerpt", excerptLength: 50 },
        { notesEnabled: false },
      ),
    ).toBeUndefined();
  });
});

describe("resolveOrganizerCardBody — back-compat default (config null)", () => {
  it("shows the Notes field when Notes is enabled", () => {
    const res = createTextResource({
      name: "R",
      userMetadata: { notes: "Legacy note body" },
    });
    expect(resolveOrganizerCardBody(res, null, { notesEnabled: true })).toBe(
      "Legacy note body",
    );
  });

  it("shows nothing when Notes is disabled", () => {
    const res = createTextResource({
      name: "R",
      userMetadata: { notes: "Legacy note body" },
    });
    expect(
      resolveOrganizerCardBody(res, null, { notesEnabled: false }),
    ).toBeUndefined();
  });
});
