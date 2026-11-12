/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  organizerArrangementStorageKey,
  readLastOrganizerArrangementId,
  writeLastOrganizerArrangementId,
} from "../../src/lib/organizer-arrangement-preference";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const ARRANGEMENT = "33333333-3333-4333-8333-333333333333";

describe("organizer-arrangement-preference", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("keys by project directory id", () => {
    expect(organizerArrangementStorageKey(PROJECT_A)).toBe(
      `getwrite-organizer-arrangement:${PROJECT_A}`,
    );
  });

  it("stores the arrangement id as the value under that key", () => {
    expect(writeLastOrganizerArrangementId(PROJECT_A, ARRANGEMENT)).toBe(true);
    expect(
      window.localStorage.getItem(
        `getwrite-organizer-arrangement:${PROJECT_A}`,
      ),
    ).toBe(ARRANGEMENT);
    expect(readLastOrganizerArrangementId(PROJECT_A)).toBe(ARRANGEMENT);
  });

  it("reads null (the default arrangement) when nothing is stored", () => {
    expect(readLastOrganizerArrangementId(PROJECT_A)).toBeNull();
  });

  it("does not share a value between two projects", () => {
    writeLastOrganizerArrangementId(PROJECT_A, ARRANGEMENT);
    expect(readLastOrganizerArrangementId(PROJECT_B)).toBeNull();
  });

  it("reads a malformed stored value as absent", () => {
    const key = organizerArrangementStorageKey(PROJECT_A);
    for (const bad of ["", "../etc", "a b", "x".repeat(200), '{"a":1}']) {
      window.localStorage.setItem(key, bad);
      expect(readLastOrganizerArrangementId(PROJECT_A)).toBeNull();
    }
  });

  it("never writes on read, including for a malformed value", () => {
    const key = organizerArrangementStorageKey(PROJECT_A);
    window.localStorage.setItem(key, "../bad");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    readLastOrganizerArrangementId(PROJECT_A);
    readLastOrganizerArrangementId(PROJECT_B);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(key)).toBe("../bad");
  });

  it("returns null, without throwing, when the read throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readLastOrganizerArrangementId(PROJECT_A)).toBeNull();
  });

  it("returns false, without throwing, when the write throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(writeLastOrganizerArrangementId(PROJECT_A, ARRANGEMENT)).toBe(false);
  });

  it("refuses a malformed project id or arrangement id without writing", () => {
    expect(writeLastOrganizerArrangementId("a/b", ARRANGEMENT)).toBe(false);
    expect(writeLastOrganizerArrangementId(PROJECT_A, "a/b")).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(readLastOrganizerArrangementId("a/b")).toBeNull();
  });
});
