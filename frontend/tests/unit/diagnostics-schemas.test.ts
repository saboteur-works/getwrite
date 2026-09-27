import { describe, it, expect } from "vitest";
import {
  DiagnosticsRecordSchema,
  DiagnosticsIndexSchema,
} from "../../src/lib/models/schemas";

const validRecord = {
  dialogueRatio: 0.35,
  averageSentenceLength: 14.2,
  topRepeatedWords: [
    { word: "the", count: 42 },
    { word: "and", count: 30 },
  ],
  heuristicVersion: 1,
};

describe("DiagnosticsRecordSchema (Feature 62, Task 1)", () => {
  it("parses a valid record", () => {
    expect(DiagnosticsRecordSchema.safeParse(validRecord).success).toBe(true);
  });

  it("accepts an empty topRepeatedWords list", () => {
    expect(
      DiagnosticsRecordSchema.safeParse({
        ...validRecord,
        topRepeatedWords: [],
      }).success,
    ).toBe(true);
  });

  it("rejects a dialogueRatio outside [0,1]", () => {
    expect(
      DiagnosticsRecordSchema.safeParse({ ...validRecord, dialogueRatio: -0.1 })
        .success,
    ).toBe(false);
    expect(
      DiagnosticsRecordSchema.safeParse({ ...validRecord, dialogueRatio: 1.1 })
        .success,
    ).toBe(false);
  });

  it("accepts dialogueRatio boundary values 0 and 1", () => {
    expect(
      DiagnosticsRecordSchema.safeParse({ ...validRecord, dialogueRatio: 0 })
        .success,
    ).toBe(true);
    expect(
      DiagnosticsRecordSchema.safeParse({ ...validRecord, dialogueRatio: 1 })
        .success,
    ).toBe(true);
  });

  it("rejects a negative averageSentenceLength", () => {
    expect(
      DiagnosticsRecordSchema.safeParse({
        ...validRecord,
        averageSentenceLength: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-integer or negative heuristicVersion", () => {
    expect(
      DiagnosticsRecordSchema.safeParse({
        ...validRecord,
        heuristicVersion: 1.5,
      }).success,
    ).toBe(false);
    expect(
      DiagnosticsRecordSchema.safeParse({
        ...validRecord,
        heuristicVersion: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown extra key (strict)", () => {
    expect(
      DiagnosticsRecordSchema.safeParse({ ...validRecord, extra: "nope" })
        .success,
    ).toBe(false);
  });

  it("rejects a malformed topRepeatedWords entry", () => {
    expect(
      DiagnosticsRecordSchema.safeParse({
        ...validRecord,
        topRepeatedWords: [{ word: "the", count: -1 }],
      }).success,
    ).toBe(false);
    expect(
      DiagnosticsRecordSchema.safeParse({
        ...validRecord,
        topRepeatedWords: [{ word: 42, count: 1 }],
      }).success,
    ).toBe(false);
  });
});

describe("DiagnosticsIndexSchema", () => {
  it("accepts an empty record", () => {
    expect(DiagnosticsIndexSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a multi-resource record", () => {
    expect(
      DiagnosticsIndexSchema.safeParse({
        "resource-a": validRecord,
        "resource-b": validRecord,
      }).success,
    ).toBe(true);
  });

  it("rejects a record whose value fails DiagnosticsRecordSchema", () => {
    expect(
      DiagnosticsIndexSchema.safeParse({
        "resource-a": { ...validRecord, dialogueRatio: 5 },
      }).success,
    ).toBe(false);
  });
});
