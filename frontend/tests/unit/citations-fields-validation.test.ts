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
  validateCitationDate,
  validateCitationFields,
  validateCitationFieldsForWrite,
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

/** Fixed instants; no test reads the system time. */
const AT = (iso: string): Date => new Date(iso);
/** 2026-11-16 12:00 UTC; UTC+14 is 2026-11-17 02:00. */
const NOON = AT("2026-11-16T12:00:00Z");

describe("validateCitationDate: real calendar dates (FR-5)", () => {
  it.each([
    "2005-01-55",
    "1000-02-98",
    "2000-04-31",
    "2023-02-29",
    "2024-02-30",
  ])("refuses day overflow %s", (v) => {
    expect(validateCitationDate(v, NOON)).toEqual({
      ok: false,
      reason: "not-a-real-date",
    });
  });

  it.each(["2026-13", "2020-00", "2020-00-10", "2020-01-00"])(
    "refuses month or day out of range %s",
    (v) => {
      expect(validateCitationDate(v, NOON)).toEqual({
        ok: false,
        reason: "not-a-real-date",
      });
    },
  );

  it("handles leap years", () => {
    expect(validateCitationDate("2024-02-29", NOON).ok).toBe(true);
    expect(validateCitationDate("2000-02-29", NOON).ok).toBe(true);
    expect(validateCitationDate("1900-02-29", NOON).ok).toBe(false);
    expect(validateCitationDate("2023-02-29", NOON).ok).toBe(false);
  });

  it("accepts the YYYY, YYYY-MM and YYYY-MM-DD shapes", () => {
    expect(validateCitationDate("2005", NOON)).toEqual({ ok: true });
    expect(validateCitationDate("2005-01", NOON)).toEqual({ ok: true });
    expect(validateCitationDate("2005-01-31", NOON)).toEqual({ ok: true });
  });

  it("refuses other shapes with a format reason", () => {
    for (const v of [
      "",
      "05",
      "2005-1-1",
      "2005/01/01",
      "2005-01-01T00",
      " 2005",
    ]) {
      expect(validateCitationDate(v, NOON)).toEqual({
        ok: false,
        reason: "bad-format",
      });
    }
  });

  it("applies no lower bound on the year (OQ-17)", () => {
    expect(validateCitationDate("1000-02-08", NOON).ok).toBe(true);
    expect(validateCitationDate("0001", NOON).ok).toBe(true);
  });
});

describe("validateCitationDate: not later than the current date at UTC+14", () => {
  const LATER = { ok: false, reason: "later-than-today" };

  it("refuses a year, year-month and full date after now", () => {
    expect(validateCitationDate("2027", NOON)).toEqual(LATER);
    expect(validateCitationDate("2026-12", NOON)).toEqual(LATER);
    expect(validateCitationDate("2026-11-18", NOON)).toEqual(LATER);
    expect(validateCitationDate("2088", NOON)).toEqual(LATER);
  });

  it("pins the day boundary when UTC+14 is already the next calendar day", () => {
    // 2026-11-16 10:00 UTC is 2026-11-17 00:00 at UTC+14; the UTC date is 16.
    const rolled = AT("2026-11-16T10:00:00Z");
    expect(validateCitationDate("2026-11-17", rolled).ok).toBe(true);
    expect(validateCitationDate("2026-11-18", rolled)).toEqual(LATER);
    expect(validateCitationDate("2026-11-16", rolled).ok).toBe(true);
  });

  it("pins the day boundary just before UTC+14 rolls over", () => {
    // 09:59:59 UTC is 23:59:59 on the 16th at UTC+14.
    const before = AT("2026-11-16T09:59:59Z");
    expect(validateCitationDate("2026-11-16", before).ok).toBe(true);
    expect(validateCitationDate("2026-11-17", before)).toEqual(LATER);
  });

  it("pins the month boundary at a month end", () => {
    const rolled = AT("2026-11-30T10:00:00Z"); // 2026-12-01 at UTC+14
    expect(validateCitationDate("2026-12", rolled).ok).toBe(true);
    expect(validateCitationDate("2026-12-01", rolled).ok).toBe(true);
    expect(validateCitationDate("2026-12-02", rolled)).toEqual(LATER);
    expect(validateCitationDate("2027-01", rolled)).toEqual(LATER);
    const before = AT("2026-11-30T09:59:59Z"); // 2026-11-30 at UTC+14
    expect(validateCitationDate("2026-11", before).ok).toBe(true);
    expect(validateCitationDate("2026-12", before)).toEqual(LATER);
    expect(validateCitationDate("2026-12-01", before)).toEqual(LATER);
  });

  it("pins the year boundary at a year end", () => {
    const rolled = AT("2026-12-31T10:00:00Z"); // 2027-01-01 at UTC+14
    expect(validateCitationDate("2027", rolled).ok).toBe(true);
    expect(validateCitationDate("2027-01", rolled).ok).toBe(true);
    expect(validateCitationDate("2027-01-01", rolled).ok).toBe(true);
    expect(validateCitationDate("2027-01-02", rolled)).toEqual(LATER);
    expect(validateCitationDate("2028", rolled)).toEqual(LATER);
    const before = AT("2026-12-31T09:59:59Z"); // 2026-12-31 at UTC+14
    expect(validateCitationDate("2026", before).ok).toBe(true);
    expect(validateCitationDate("2026-12-31", before).ok).toBe(true);
    expect(validateCitationDate("2027", before)).toEqual(LATER);
    expect(validateCitationDate("2027-01", before)).toEqual(LATER);
  });

  it("reports a non-real date before a later one", () => {
    expect(validateCitationDate("2088-02-31", NOON)).toEqual({
      ok: false,
      reason: "not-a-real-date",
    });
  });
});

describe("validateCitationFieldsForWrite", () => {
  const BOOK = { referenceType: "book", title: "T" };

  it("accepts what validateCitationFields accepts when the dates pass", () => {
    const value = { ...BOOK, date: "2024-02-29", accessed: "2026-11-17" };
    const at = AT("2026-11-16T10:00:00Z");
    expect(validateCitationFieldsForWrite(value, at)).toEqual({
      ok: true,
      value,
    });
  });

  it.each(["date", "accessed"])(
    "refuses a failing %s with the one text, not echoing it",
    (name) => {
      for (const bad of ["2005-01-55", "2026-13", "2088", "2026-11-18"]) {
        const result = validateCitationFieldsForWrite(
          { ...BOOK, [name]: bad },
          NOON,
        );
        expect(result).toEqual({ ok: false, message: CITATION_FIELDS_REFUSAL });
        expect(JSON.stringify(result)).not.toContain(bad);
      }
    },
  );

  it("the accessed date follows the same rule as date", () => {
    const at = AT("2026-11-16T09:59:59Z");
    expect(
      validateCitationFieldsForWrite({ ...BOOK, accessed: "2026-11-16" }, at)
        .ok,
    ).toBe(true);
    expect(
      validateCitationFieldsForWrite({ ...BOOK, accessed: "2026-11-17" }, at)
        .ok,
    ).toBe(false);
  });

  it("still refuses what validateCitationFields refuses", () => {
    expect(
      validateCitationFieldsForWrite({ referenceType: "film" }, NOON).ok,
    ).toBe(false);
  });

  it("validateCitationFields (the read check) stays shape-only", () => {
    expect(validateCitationFields({ ...BOOK, date: "2005-01-55" }).ok).toBe(
      true,
    );
  });
});
