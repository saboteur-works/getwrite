/**
 * Feature 116, Task 15 (FR-5, FR-6, FR-22): the pure write-boundary check of a
 * `citationFields` value.
 */
import { describe, expect, it } from "vitest";
import {
  CITATION_FIELDS_BY_TYPE,
  CITATION_REFERENCE_TYPES,
} from "../../src/lib/models/citations-types";
import {
  CITATION_FIELDS_REFUSAL,
  validateCitationFields,
} from "../../src/lib/models/citations-fields-validation";

function sampleFor(kind: string): unknown {
  if (kind === "people") return [{ family: "Le Guin", given: "Ursula" }];
  if (kind === "date") return "2001-02-03";
  return "text";
}

describe("validateCitationFields", () => {
  it.each(CITATION_REFERENCE_TYPES)("accepts every fixed field of %s", (t) => {
    const value: Record<string, unknown> = { referenceType: t };
    for (const f of CITATION_FIELDS_BY_TYPE[t]) {
      value[f.name] = sampleFor(f.kind);
    }
    expect(validateCitationFields(value)).toEqual({ ok: true, value });
  });

  it.each(CITATION_REFERENCE_TYPES)("accepts an incomplete %s", (t) => {
    expect(validateCitationFields({ referenceType: t }).ok).toBe(true);
    expect(validateCitationFields({ referenceType: t, title: "T" }).ok).toBe(
      true,
    );
  });

  it("refuses an unknown reference type and a missing one", () => {
    expect(validateCitationFields({ referenceType: "film" }).ok).toBe(false);
    expect(validateCitationFields({}).ok).toBe(false);
    expect(validateCitationFields({ referenceType: 3 }).ok).toBe(false);
  });

  it("refuses an unknown key, including one valid for another type", () => {
    expect(
      validateCitationFields({ referenceType: "book", extra: "x" }).ok,
    ).toBe(false);
    expect(
      validateCitationFields({ referenceType: "book", journal: "x" }).ok,
    ).toBe(false);
  });

  it("accepts family/given and literal people", () => {
    const authors = [{ literal: "WHO" }, { family: "A", given: "B" }];
    expect(validateCitationFields({ referenceType: "book", authors }).ok).toBe(
      true,
    );
  });

  it("refuses malformed people", () => {
    const bad: unknown[] = [
      [{ family: "A" }],
      [{ family: "A", given: "B", literal: "C" }],
      [{ literal: 1 }],
      [{ literal: "x", extra: "y" }],
      ["A B"],
      [null],
      "A B",
      {},
    ];
    for (const authors of bad) {
      expect(
        validateCitationFields({ referenceType: "book", authors }).ok,
      ).toBe(false);
    }
  });

  it("allows 50 people in a role and refuses 51", () => {
    const person = { literal: "P" };
    expect(
      validateCitationFields({
        referenceType: "book",
        authors: Array.from({ length: 50 }, () => person),
      }).ok,
    ).toBe(true);
    expect(
      validateCitationFields({
        referenceType: "book",
        authors: Array.from({ length: 51 }, () => person),
      }).ok,
    ).toBe(false);
  });

  it("allows 500 characters of text and refuses 501", () => {
    expect(
      validateCitationFields({ referenceType: "book", title: "a".repeat(500) })
        .ok,
    ).toBe(true);
    expect(
      validateCitationFields({ referenceType: "book", title: "a".repeat(501) })
        .ok,
    ).toBe(false);
  });

  it("accepts YYYY, YYYY-MM, YYYY-MM-DD for date and accessed only", () => {
    const good = ["1999", "1999-12", "1999-12-31"];
    const bad = [
      "99",
      "1999-1",
      "1999-12-3",
      "1999/12/31",
      "1999-12-31T",
      " 1999",
      "",
    ];
    for (const field of ["date", "accessed"]) {
      for (const v of good) {
        expect(
          validateCitationFields({ referenceType: "book", [field]: v }).ok,
        ).toBe(true);
      }
      for (const v of bad) {
        expect(
          validateCitationFields({ referenceType: "book", [field]: v }).ok,
        ).toBe(false);
      }
    }
  });

  it("stores a URL, a script and markup as text unchanged", () => {
    const url = "https://example.org/a?b=1";
    const title = "<script>alert(1)</script><b>x</b>";
    const value = { referenceType: "web-page", url, title };
    expect(validateCitationFields(value)).toEqual({ ok: true, value });
  });

  it("refuses non-strings, non-objects and arrays", () => {
    expect(validateCitationFields({ referenceType: "book", title: 5 }).ok).toBe(
      false,
    );
    expect(
      validateCitationFields({ referenceType: "book", date: 1999 }).ok,
    ).toBe(false);
    for (const v of [null, undefined, "book", 5, [], true]) {
      expect(validateCitationFields(v).ok).toBe(false);
    }
  });

  it("uses one refusal text on every path and never echoes input", () => {
    const secret = "SECRET-ZZZ";
    const inputs: unknown[] = [
      { referenceType: secret },
      { referenceType: "book", [secret]: "x" },
      { referenceType: "book", title: 5 },
      { referenceType: "book", title: secret.repeat(100) },
      { referenceType: "book", date: secret },
      { referenceType: "book", authors: [{ literal: 1, [secret]: 1 }] },
      secret,
    ];
    for (const input of inputs) {
      const r = validateCitationFields(input);
      expect(r).toEqual({ ok: false, message: CITATION_FIELDS_REFUSAL });
      expect(JSON.stringify(r)).not.toContain(secret);
    }
  });
});
