/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/toast-service", () => {
  const toastService = { error: vi.fn() };
  return { toastService, default: toastService };
});

import { useSpellcheckEnabled } from "../src/hooks/useSpellcheckEnabled";
import {
  readSpellcheckEnabled,
  resetSpellcheckSessionValue,
  SPELLCHECK_CHANGED_EVENT,
  SPELLCHECK_ENABLED_STORAGE_KEY,
  writeSpellcheckEnabled,
} from "../src/lib/spellcheck-preference";
import { toastService } from "../src/lib/toast-service";

beforeEach(() => {
  window.localStorage.clear();
  resetSpellcheckSessionValue();
  vi.mocked(toastService.error).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("spellcheck preference module", () => {
  it("is on with no stored value and a read writes nothing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(readSpellcheckEnabled()).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
  });

  it("returns off after writing off", () => {
    writeSpellcheckEnabled(false);
    expect(readSpellcheckEnabled()).toBe(false);
    writeSpellcheckEnabled(true);
    expect(readSpellcheckEnabled()).toBe(true);
  });

  it("dispatches the window event on change", () => {
    const listener = vi.fn();
    window.addEventListener(SPELLCHECK_CHANGED_EVENT, listener);
    writeSpellcheckEnabled(false);
    window.removeEventListener(SPELLCHECK_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the toggle working and toasts when storage throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    writeSpellcheckEnabled(false);
    expect(readSpellcheckEnabled()).toBe(false);
    expect(toastService.error).toHaveBeenCalledTimes(1);
    writeSpellcheckEnabled(true);
    expect(readSpellcheckEnabled()).toBe(true);
  });

  it("stores nothing in project.json", () => {
    writeSpellcheckEnabled(false);
    expect(Object.keys(window.localStorage)).toEqual([
      SPELLCHECK_ENABLED_STORAGE_KEY,
    ]);
  });
});

describe("useSpellcheckEnabled", () => {
  it("renders the default first and reads storage in an effect", () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const firstRender: { isEnabled: boolean; reads: number }[] = [];
    const { result } = renderHook(() => {
      const hook = useSpellcheckEnabled();
      firstRender.push({
        isEnabled: hook[0],
        reads: getItem.mock.calls.length,
      });
      return hook;
    });
    expect(firstRender[0]).toEqual({ isEnabled: true, reads: 0 });
    expect(result.current[0]).toBe(false);
  });

  it("follows setEnabled in the same window", () => {
    const { result } = renderHook(() => useSpellcheckEnabled());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });

  it("follows a storage event for the key from another tab", () => {
    const { result } = renderHook(() => useSpellcheckEnabled());
    act(() => {
      window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
      window.dispatchEvent(
        new StorageEvent("storage", { key: SPELLCHECK_ENABLED_STORAGE_KEY }),
      );
    });
    expect(result.current[0]).toBe(false);
  });

  it("ignores storage events for other keys", () => {
    const { result } = renderHook(() => useSpellcheckEnabled());
    act(() => {
      window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
      window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    });
    expect(result.current[0]).toBe(true);
  });
});
