import { describe, it, expect } from "vitest";
import { resolvePovValue } from "../../components/Sidebar/controls/POVAutocomplete";

const options = [
  { id: "uuid-alice", name: "Alice" },
  { id: "uuid-bob", name: "Bob" },
];

describe("resolvePovValue (Task 7)", () => {
  it("returns id and name when exact match found", () => {
    expect(resolvePovValue("Alice", options)).toEqual({
      id: "uuid-alice",
      name: "Alice",
    });
  });

  it("returns id: null when no match found", () => {
    expect(resolvePovValue("Charlie", options)).toEqual({
      id: null,
      name: "Charlie",
    });
  });

  it("is case-insensitive for matching", () => {
    expect(resolvePovValue("alice", options)).toEqual({
      id: "uuid-alice",
      name: "Alice",
    });
  });

  it("returns id: null and preserves name for empty string", () => {
    expect(resolvePovValue("", options)).toEqual({ id: null, name: "" });
  });

  it("returns id: null when resourceOptions is empty", () => {
    expect(resolvePovValue("Alice", [])).toEqual({ id: null, name: "Alice" });
  });
});
