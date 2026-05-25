import { describe, it, expect } from "vitest";
import {
  enumerateFieldValues,
  canonicalValueKey,
  NULL_VALUE_KEY,
  MISSING_VALUE_KEY,
} from "../../src/lib/models/field-values";
import type { MetadataValue, ResourceRef } from "../../src/lib/models/types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function sidecar(
  fields: Record<string, MetadataValue>,
): Record<string, MetadataValue> {
  return fields;
}

// ─── canonicalValueKey ────────────────────────────────────────────────────────

describe("canonicalValueKey", () => {
  it("returns NULL_VALUE_KEY for null", () => {
    expect(canonicalValueKey(null)).toBe(NULL_VALUE_KEY);
  });

  it("returns the string itself for non-empty strings", () => {
    expect(canonicalValueKey("ominous")).toBe("ominous");
    expect(canonicalValueKey("hopeful")).toBe("hopeful");
  });

  it("returns the empty string for empty string value", () => {
    expect(canonicalValueKey("")).toBe("");
  });

  it("converts numbers to their string representation", () => {
    expect(canonicalValueKey(3)).toBe("3");
    expect(canonicalValueKey(1500)).toBe("1500");
    expect(canonicalValueKey(0)).toBe("0");
  });

  it("converts booleans to 'true' or 'false'", () => {
    expect(canonicalValueKey(true)).toBe("true");
    expect(canonicalValueKey(false)).toBe("false");
  });

  it("serializes a ResourceRef as JSON (deterministic)", () => {
    const ref: ResourceRef = { id: "abc-123", name: "Mara" };
    const key = canonicalValueKey(ref);
    expect(key).toBe(JSON.stringify(ref));
    expect(key).toContain("abc-123");
    expect(key).toContain("Mara");
  });

  it("serializes a stale ResourceRef (id: null) distinctly", () => {
    const stale: ResourceRef = { id: null, name: "Mara" };
    const live: ResourceRef = { id: "abc-123", name: "Mara" };
    expect(canonicalValueKey(stale)).not.toBe(canonicalValueKey(live));
    expect(canonicalValueKey(stale)).toContain("null");
  });

  it("serializes two different ResourceRefs to different keys", () => {
    const a: ResourceRef = { id: "id-a", name: "Alice" };
    const b: ResourceRef = { id: "id-b", name: "Bob" };
    expect(canonicalValueKey(a)).not.toBe(canonicalValueKey(b));
  });

  it("serializes arrays as JSON", () => {
    expect(canonicalValueKey(["a", "b"])).toBe(JSON.stringify(["a", "b"]));
  });

  it("produces the same key for two ResourceRefs with the same id and name", () => {
    const a: ResourceRef = { id: "id-1", name: "Alice" };
    const b: ResourceRef = { id: "id-1", name: "Alice" };
    expect(canonicalValueKey(a)).toBe(canonicalValueKey(b));
  });
});

// ─── enumerateFieldValues ─────────────────────────────────────────────────────

describe("enumerateFieldValues", () => {
  it("returns an empty map for an empty sidecars list", () => {
    expect(enumerateFieldValues([], "tone").size).toBe(0);
  });

  it("counts a missing key as MISSING_VALUE_KEY", () => {
    const sidecars = [sidecar({ other: "hello" })];
    const result = enumerateFieldValues(sidecars, "tone");
    expect(result.get(MISSING_VALUE_KEY)?.count).toBe(1);
  });

  it("counts a null sidecar (read failure) as MISSING_VALUE_KEY", () => {
    const sidecars = [null, sidecar({ tone: "ominous" })];
    const result = enumerateFieldValues(sidecars, "tone");
    expect(result.get(MISSING_VALUE_KEY)?.count).toBe(1);
    expect(result.get("ominous")?.count).toBe(1);
  });

  it("counts an explicit null value as NULL_VALUE_KEY", () => {
    const sidecars = [sidecar({ tone: null })];
    const result = enumerateFieldValues(sidecars, "tone");
    expect(result.get(NULL_VALUE_KEY)?.count).toBe(1);
    expect(result.get(NULL_VALUE_KEY)?.sample).toBeNull();
  });

  it("counts string values by their exact string", () => {
    const sidecars = [
      sidecar({ tone: "ominous" }),
      sidecar({ tone: "ominous" }),
      sidecar({ tone: "hopeful" }),
    ];
    const result = enumerateFieldValues(sidecars, "tone");
    expect(result.get("ominous")?.count).toBe(2);
    expect(result.get("hopeful")?.count).toBe(1);
    expect(result.size).toBe(2);
  });

  it("treats case-distinct strings as different values", () => {
    const sidecars = [
      sidecar({ tone: "Hopeful" }),
      sidecar({ tone: "hopeful" }),
    ];
    const result = enumerateFieldValues(sidecars, "tone");
    expect(result.get("Hopeful")?.count).toBe(1);
    expect(result.get("hopeful")?.count).toBe(1);
    expect(result.size).toBe(2);
  });

  it("counts number values using their string representation", () => {
    const sidecars = [
      sidecar({ "word-count": 1500 }),
      sidecar({ "word-count": 1500 }),
      sidecar({ "word-count": 2000 }),
    ];
    const result = enumerateFieldValues(sidecars, "word-count");
    expect(result.get("1500")?.count).toBe(2);
    expect(result.get("1500")?.sample).toBe(1500);
    expect(result.get("2000")?.count).toBe(1);
  });

  it("counts boolean values", () => {
    const sidecars = [
      sidecar({ published: true }),
      sidecar({ published: false }),
      sidecar({ published: true }),
    ];
    const result = enumerateFieldValues(sidecars, "published");
    expect(result.get("true")?.count).toBe(2);
    expect(result.get("false")?.count).toBe(1);
  });

  it("counts ResourceRef values by id and name together", () => {
    const maraRef: ResourceRef = { id: "id-mara", name: "Mara" };
    const sidecars = [
      sidecar({ pov: maraRef }),
      sidecar({ pov: maraRef }),
      sidecar({ pov: { id: "id-jax", name: "Jax" } as ResourceRef }),
    ];
    const result = enumerateFieldValues(sidecars, "pov");
    const maraKey = canonicalValueKey(maraRef);
    expect(result.get(maraKey)?.count).toBe(2);
    expect(result.get(maraKey)?.sample).toEqual(maraRef);
    expect(result.size).toBe(2);
  });

  it("counts stale ResourceRefs (id: null) separately from live ones", () => {
    const live: ResourceRef = { id: "id-mara", name: "Mara" };
    const stale: ResourceRef = { id: null, name: "Mara" };
    const sidecars = [sidecar({ pov: live }), sidecar({ pov: stale })];
    const result = enumerateFieldValues(sidecars, "pov");
    expect(result.size).toBe(2);
    const staleKey = canonicalValueKey(stale);
    const staleEntry = result.get(staleKey);
    expect(staleEntry?.count).toBe(1);
    expect((staleEntry?.sample as ResourceRef).id).toBeNull();
  });

  it("counts ResourceRef[] values as whole-array values", () => {
    const refs: ResourceRef[] = [
      { id: "id-a", name: "A" },
      { id: "id-b", name: "B" },
    ];
    const sidecars = [sidecar({ cast: refs }), sidecar({ cast: refs })];
    const result = enumerateFieldValues(sidecars, "cast");
    expect(result.size).toBe(1);
    const key = canonicalValueKey(refs);
    expect(result.get(key)?.count).toBe(2);
    expect(result.get(key)?.sample).toEqual(refs);
  });

  it("counts string[] (multiselect) values as whole-array values", () => {
    const sidecars = [
      sidecar({ genres: ["Fantasy", "Adventure"] }),
      sidecar({ genres: ["Fantasy", "Adventure"] }),
      sidecar({ genres: ["Horror"] }),
    ];
    const result = enumerateFieldValues(sidecars, "genres");
    expect(result.get(JSON.stringify(["Fantasy", "Adventure"]))?.count).toBe(2);
    expect(result.get(JSON.stringify(["Horror"]))?.count).toBe(1);
  });

  it("empty string is counted as its own entry, separate from null and missing", () => {
    const sidecars = [
      sidecar({ tone: "" }),
      sidecar({ tone: null }),
      sidecar({ other: "x" }), // tone missing
    ];
    const result = enumerateFieldValues(sidecars, "tone");
    expect(result.get("")?.count).toBe(1);
    expect(result.get(NULL_VALUE_KEY)?.count).toBe(1);
    expect(result.get(MISSING_VALUE_KEY)?.count).toBe(1);
    expect(result.size).toBe(3);
  });

  it("preserves the sample value for inspection", () => {
    const ref: ResourceRef = { id: "id-x", name: "Xara" };
    const sidecars = [sidecar({ pov: ref })];
    const result = enumerateFieldValues(sidecars, "pov");
    const entry = result.get(canonicalValueKey(ref));
    expect(entry?.sample).toEqual(ref);
  });

  it("handles mixed missing, null, and present values in one pass", () => {
    const sidecars = [
      sidecar({ tone: "ominous" }),
      sidecar({ tone: "ominous" }),
      sidecar({ tone: null }),
      sidecar({ other: "y" }), // tone missing
    ];
    const result = enumerateFieldValues(sidecars, "tone");
    expect(result.get("ominous")?.count).toBe(2);
    expect(result.get(NULL_VALUE_KEY)?.count).toBe(1);
    expect(result.get(MISSING_VALUE_KEY)?.count).toBe(1);
    expect(result.size).toBe(3);
  });
});
