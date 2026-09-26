/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDIT_FOOTER_EXPANDED_KEY,
  getEditFooterExpanded,
  setEditFooterExpanded,
} from "../../src/lib/edit-footer-state";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("edit-footer-state", () => {
  it("uses the documented key", () => {
    expect(EDIT_FOOTER_EXPANDED_KEY).toBe("getwrite.editFooter.expanded");
  });

  it("defaults to collapsed with no stored value", () => {
    expect(getEditFooterExpanded()).toBe(false);
  });

  it("round-trips", () => {
    setEditFooterExpanded(true);
    expect(window.localStorage.getItem(EDIT_FOOTER_EXPANDED_KEY)).toBe("true");
    expect(getEditFooterExpanded()).toBe(true);
    setEditFooterExpanded(false);
    expect(getEditFooterExpanded()).toBe(false);
  });

  it("treats garbage as collapsed", () => {
    window.localStorage.setItem(EDIT_FOOTER_EXPANDED_KEY, "maybe");
    expect(getEditFooterExpanded()).toBe(false);
  });

  it("survives typeof window undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(getEditFooterExpanded()).toBe(false);
    expect(() => setEditFooterExpanded(true)).not.toThrow();
  });

  it("survives a throwing localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getEditFooterExpanded()).toBe(false);
    expect(() => setEditFooterExpanded(true)).not.toThrow();
  });
});
