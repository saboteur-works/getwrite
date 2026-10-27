import { describe, it, expect } from "vitest";
import {
  addWord,
  removeWord,
  UserWordListError,
} from "../../src/lib/models/user-word-list-core";
import {
  MAX_SPELLING_LIST_SIZE,
  MAX_SPELLING_WORD_LENGTH,
} from "../../src/lib/models/project-spelling-core";

function reasonOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof UserWordListError) return e.reason;
    throw e;
  }
  return undefined;
}

describe("user-word-list-core addWord", () => {
  it("trims and NFC-normalises the stored word", () => {
    expect(addWord([], "  café  ")).toEqual(["café"]);
  });

  it("appends in insertion order, like the project lists", () => {
    expect(addWord(["zeta"], "alpha")).toEqual(["zeta", "alpha"]);
  });

  it("does not mutate the input list", () => {
    const list = ["a"];
    addWord(list, "b");
    expect(list).toEqual(["a"]);
  });

  it.each(["two words", "a\tb", "a\u0000b", "a\nb", "", "   "])(
    "refuses %j as an invalid word",
    (w) => {
      expect(reasonOf(() => addWord([], w))).toBe("invalid-word");
    },
  );

  it.each([undefined, null, 5, {}, ["a"]])("refuses non-string %j", (w) => {
    expect(reasonOf(() => addWord([], w))).toBe("invalid-word");
  });

  it("accepts 100 UTF-16 units and refuses 101 as too-long", () => {
    expect(MAX_SPELLING_WORD_LENGTH).toBe(100);
    const ok = "a".repeat(100);
    expect(addWord([], ok)).toEqual([ok]);
    expect(reasonOf(() => addWord([], "a".repeat(101)))).toBe("too-long");
  });

  it("counts UTF-16 units, not code points", () => {
    expect(reasonOf(() => addWord([], "\u{1F600}".repeat(51)))).toBe(
      "too-long",
    );
    expect(addWord([], "\u{1F600}".repeat(50))).toHaveLength(1);
  });

  it("refuses the 5,001st word and leaves the list unchanged", () => {
    expect(MAX_SPELLING_LIST_SIZE).toBe(5000);
    const full = Array.from({ length: 5000 }, (_, i) => `w${i}`);
    const before = [...full];
    expect(reasonOf(() => addWord(full, "extra"))).toBe("list-full");
    expect(full).toEqual(before);
  });

  it("accepts the 5,000th word", () => {
    const list = Array.from({ length: 4999 }, (_, i) => `w${i}`);
    expect(addWord(list, "last")).toHaveLength(5000);
  });

  it("returns the same list when the word is present (case-folded)", () => {
    const list = ["Hello"];
    expect(addWord(list, "hello")).toBe(list);
    expect(addWord(list, "Hello")).toBe(list);
  });

  it("returns the same list for a present word even when the list is full", () => {
    const full = Array.from({ length: 5000 }, (_, i) => `w${i}`);
    expect(addWord(full, "w3")).toBe(full);
  });

  it("validates before the duplicate check", () => {
    expect(reasonOf(() => addWord(["a"], "a b"))).toBe("invalid-word");
  });
});

describe("user-word-list-core removeWord", () => {
  it("removes a present word (case-folded)", () => {
    expect(removeWord(["a", "Hello", "b"], "hello")).toEqual(["a", "b"]);
  });

  it("returns the same list when the word is absent", () => {
    const list = ["a"];
    expect(removeWord(list, "z")).toBe(list);
  });

  it("does not mutate the input list", () => {
    const list = ["a", "b"];
    removeWord(list, "a");
    expect(list).toEqual(["a", "b"]);
  });

  it("refuses an invalid word with a distinct reason", () => {
    expect(reasonOf(() => removeWord(["a"], "a b"))).toBe("invalid-word");
    expect(reasonOf(() => removeWord(["a"], 3))).toBe("invalid-word");
    expect(reasonOf(() => removeWord(["a"], "a".repeat(101)))).toBe("too-long");
  });
});
