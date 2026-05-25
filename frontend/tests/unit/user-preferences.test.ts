import { describe, it, expect } from "vitest";
import {
  getUserPreferencesFromProjectMetadata,
  mergeUserPreferencesIntoProjectMetadata,
  PROJECT_USER_PREFERENCES_KEY,
} from "../../src/lib/user-preferences";

describe("getUserPreferencesFromProjectMetadata — searchResultLimit", () => {
  it("returns undefined when metadata is absent", () => {
    expect(
      getUserPreferencesFromProjectMetadata(undefined).searchResultLimit,
    ).toBeUndefined();
  });

  it("returns undefined when userPreferences key is missing", () => {
    expect(
      getUserPreferencesFromProjectMetadata({}).searchResultLimit,
    ).toBeUndefined();
  });

  it("returns the stored number", () => {
    const metadata = {
      [PROJECT_USER_PREFERENCES_KEY]: { searchResultLimit: 25 },
    };
    expect(
      getUserPreferencesFromProjectMetadata(metadata).searchResultLimit,
    ).toBe(25);
  });

  it("returns undefined for a string value", () => {
    const metadata = {
      [PROJECT_USER_PREFERENCES_KEY]: { searchResultLimit: "25" },
    };
    expect(
      getUserPreferencesFromProjectMetadata(metadata).searchResultLimit,
    ).toBeUndefined();
  });

  it("returns undefined for a negative number", () => {
    const metadata = {
      [PROJECT_USER_PREFERENCES_KEY]: { searchResultLimit: -1 },
    };
    expect(
      getUserPreferencesFromProjectMetadata(metadata).searchResultLimit,
    ).toBeUndefined();
  });

  it("returns undefined for zero", () => {
    const metadata = {
      [PROJECT_USER_PREFERENCES_KEY]: { searchResultLimit: 0 },
    };
    expect(
      getUserPreferencesFromProjectMetadata(metadata).searchResultLimit,
    ).toBeUndefined();
  });

  it("returns undefined for a non-integer number", () => {
    const metadata = {
      [PROJECT_USER_PREFERENCES_KEY]: { searchResultLimit: 10.5 },
    };
    expect(
      getUserPreferencesFromProjectMetadata(metadata).searchResultLimit,
    ).toBeUndefined();
  });
});

describe("mergeUserPreferencesIntoProjectMetadata — searchResultLimit round-trip", () => {
  it("persists searchResultLimit and reads it back", () => {
    const merged = mergeUserPreferencesIntoProjectMetadata(undefined, {
      searchResultLimit: 25,
    });
    const read = getUserPreferencesFromProjectMetadata(merged);
    expect(read.searchResultLimit).toBe(25);
  });

  it("merges searchResultLimit alongside existing colorMode without overwriting", () => {
    const base = mergeUserPreferencesIntoProjectMetadata(undefined, {
      colorMode: "dark",
    });
    const merged = mergeUserPreferencesIntoProjectMetadata(base, {
      searchResultLimit: 10,
    });
    const read = getUserPreferencesFromProjectMetadata(merged);
    expect(read.colorMode).toBe("dark");
    expect(read.searchResultLimit).toBe(10);
  });

  it("overwrites an existing searchResultLimit", () => {
    const base = mergeUserPreferencesIntoProjectMetadata(undefined, {
      searchResultLimit: 50,
    });
    const merged = mergeUserPreferencesIntoProjectMetadata(base, {
      searchResultLimit: 100,
    });
    expect(
      getUserPreferencesFromProjectMetadata(merged).searchResultLimit,
    ).toBe(100);
  });
});
