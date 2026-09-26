import { describe, it, expect } from "vitest";
import {
  WritingLogWordEntrySchema,
  WritingLogMarkerEntrySchema,
  WritingLogDayFileSchema,
} from "../../src/lib/models/schemas";

const ts = "2026-09-26T12:00:00.000Z";
const word = { added: 10, deleted: 4, net: 6, timestamp: ts };
const marker = { skipped: true, timestamp: ts };

describe("WritingLogWordEntrySchema (Feature 59, FR-1/FR-3)", () => {
  it("parses a valid entry", () => {
    expect(WritingLogWordEntrySchema.safeParse(word).success).toBe(true);
  });
  it("rejects missing or non-ISO timestamp", () => {
    const { timestamp: _t, ...rest } = word;
    expect(WritingLogWordEntrySchema.safeParse(rest).success).toBe(false);
    for (const bad of ["yesterday", "Sep 26 2026", "2026", ""]) {
      expect(
        WritingLogWordEntrySchema.safeParse({ ...word, timestamp: bad })
          .success,
      ).toBe(false);
    }
  });
  it("rejects negative added or deleted", () => {
    expect(
      WritingLogWordEntrySchema.safeParse({ ...word, added: -1, net: -5 })
        .success,
    ).toBe(false);
    expect(
      WritingLogWordEntrySchema.safeParse({ ...word, deleted: -1, net: 11 })
        .success,
    ).toBe(false);
  });
  it("stores net and rejects a net that is not added minus deleted", () => {
    expect(
      WritingLogWordEntrySchema.safeParse({ ...word, net: 7 }).success,
    ).toBe(false);
    const { net: _n, ...noNet } = word;
    expect(WritingLogWordEntrySchema.safeParse(noNet).success).toBe(false);
    expect(
      WritingLogWordEntrySchema.safeParse({
        added: 2,
        deleted: 5,
        net: -3,
        timestamp: ts,
      }).success,
    ).toBe(true);
  });
  it("accepts docx and scrivener source, optional otherwise", () => {
    for (const source of ["docx", "scrivener"]) {
      expect(
        WritingLogWordEntrySchema.safeParse({ ...word, source }).success,
      ).toBe(true);
    }
    expect(
      WritingLogWordEntrySchema.safeParse({ ...word, source: "plain" }).success,
    ).toBe(false);
    expect(WritingLogWordEntrySchema.safeParse(word).success).toBe(true);
  });
});

describe("WritingLogMarkerEntrySchema (FR-5)", () => {
  it("parses a marker", () => {
    expect(WritingLogMarkerEntrySchema.safeParse(marker).success).toBe(true);
  });
  it("rejects word counts, missing skipped, false skipped, missing/bad timestamp", () => {
    expect(
      WritingLogMarkerEntrySchema.safeParse({ ...marker, added: 1 }).success,
    ).toBe(false);
    expect(
      WritingLogMarkerEntrySchema.safeParse({ ...marker, net: 0 }).success,
    ).toBe(false);
    expect(
      WritingLogMarkerEntrySchema.safeParse({ timestamp: ts }).success,
    ).toBe(false);
    expect(
      WritingLogMarkerEntrySchema.safeParse({ skipped: false, timestamp: ts })
        .success,
    ).toBe(false);
    expect(
      WritingLogMarkerEntrySchema.safeParse({ skipped: true }).success,
    ).toBe(false);
    expect(
      WritingLogMarkerEntrySchema.safeParse({
        skipped: true,
        timestamp: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("WritingLogDayFileSchema", () => {
  it("accepts a mix of both variants and an empty list", () => {
    expect(
      WritingLogDayFileSchema.safeParse({ entries: [word, marker] }).success,
    ).toBe(true);
    expect(WritingLogDayFileSchema.safeParse({ entries: [] }).success).toBe(
      true,
    );
  });
  it("rejects a day file containing an invalid entry", () => {
    expect(
      WritingLogDayFileSchema.safeParse({
        entries: [word, { ...word, net: 99 }],
      }).success,
    ).toBe(false);
  });
});
