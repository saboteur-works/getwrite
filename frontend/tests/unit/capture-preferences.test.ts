/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAST_CAPTURED_PROJECT_STORAGE_KEY,
  LAST_OPENED_PROJECT_STORAGE_KEY,
  chooseDefaultProjectId,
  isWellFormedProjectId,
  readLastCapturedProjectId,
  readLastOpenedProjectId,
  writeLastCapturedProjectId,
  writeLastOpenedProjectId,
} from "../../src/lib/capture-preferences";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("capture-preferences keys", () => {
  it("exports two distinct localStorage keys", () => {
    expect(LAST_CAPTURED_PROJECT_STORAGE_KEY).toMatch(/^getwrite-/);
    expect(LAST_OPENED_PROJECT_STORAGE_KEY).toMatch(/^getwrite-/);
    expect(LAST_CAPTURED_PROJECT_STORAGE_KEY).not.toBe(
      LAST_OPENED_PROJECT_STORAGE_KEY,
    );
  });
});

describe("capture-preferences read/write", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("round-trips both ids", () => {
    expect(writeLastCapturedProjectId(ID_A)).toBe(true);
    expect(writeLastOpenedProjectId(ID_B)).toBe(true);
    expect(readLastCapturedProjectId()).toBe(ID_A);
    expect(readLastOpenedProjectId()).toBe(ID_B);
  });

  it("reads null when nothing is stored", () => {
    expect(readLastCapturedProjectId()).toBeNull();
    expect(readLastOpenedProjectId()).toBeNull();
  });

  it("treats a malformed stored id as gone", () => {
    window.localStorage.setItem(LAST_CAPTURED_PROJECT_STORAGE_KEY, "../etc");
    window.localStorage.setItem(LAST_OPENED_PROJECT_STORAGE_KEY, "");
    expect(readLastCapturedProjectId()).toBeNull();
    expect(readLastOpenedProjectId()).toBeNull();
  });

  it("returns null when the read throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readLastCapturedProjectId()).toBeNull();
    expect(readLastOpenedProjectId()).toBeNull();
  });

  it("returns false, without throwing, when the write throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(writeLastCapturedProjectId(ID_A)).toBe(false);
    expect(writeLastOpenedProjectId(ID_A)).toBe(false);
  });

  it("refuses to write a malformed id", () => {
    expect(writeLastOpenedProjectId("a/b")).toBe(false);
    expect(window.localStorage.getItem(LAST_OPENED_PROJECT_STORAGE_KEY)).toBe(
      null,
    );
  });
});

describe("isWellFormedProjectId", () => {
  it("accepts a uuid and rejects path-like or empty values", () => {
    expect(isWellFormedProjectId(ID_A)).toBe(true);
    expect(isWellFormedProjectId("")).toBe(false);
    expect(isWellFormedProjectId("a/b")).toBe(false);
    expect(isWellFormedProjectId("..")).toBe(false);
    expect(isWellFormedProjectId(null)).toBe(false);
    expect(isWellFormedProjectId("x".repeat(200))).toBe(false);
  });
});

describe("chooseDefaultProjectId", () => {
  it("prefers the last-captured project", () => {
    expect(chooseDefaultProjectId([ID_A, ID_B], ID_B, ID_A)).toBe(ID_B);
  });
  it("prefers the open project over last-captured and last-opened", () => {
    expect(chooseDefaultProjectId([ID_A, ID_B], ID_A, ID_A, ID_B)).toBe(ID_B);
  });
  it("ignores an open project that is not listed", () => {
    expect(chooseDefaultProjectId([ID_A], ID_A, null, ID_B)).toBe(ID_A);
  });
  it("falls back to the most recently opened when last-captured is gone", () => {
    expect(chooseDefaultProjectId([ID_A], ID_B, ID_A)).toBe(ID_A);
  });
  it("returns the first listed project when neither remembered id is present", () => {
    expect(chooseDefaultProjectId([ID_A, ID_B], null, null)).toBe(ID_A);
  });
  it("returns null when there are no projects", () => {
    expect(chooseDefaultProjectId([], ID_A, ID_B)).toBeNull();
  });
});
