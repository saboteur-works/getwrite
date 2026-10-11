import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharingLimitsAnswer } from "../../src/store/sharing-limits-transport-service";

const fetchSharingLimits = vi.fn<() => Promise<SharingLimitsAnswer>>();
vi.mock("../../src/store/sharing-limits-transport-service", () => ({
  fetchSharingLimits: () => fetchSharingLimits(),
}));

import SharingLimitsProvider, {
  useDeclareUnlockPromptMounted,
  useSharingLimits,
} from "../../components/Sharing/SharingLimitsContext";

const LIMITS = {
  projectDeletion: true,
  unlocking: true,
  locking: false,
  encryptionChanges: true,
  permanentDeletion: false,
};
const PAIRED: SharingLimitsAnswer = { state: "paired", limits: LIMITS };

function wrapper({ children }: { children: React.ReactNode }): JSX.Element {
  return <SharingLimitsProvider>{children}</SharingLimitsProvider>;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchSharingLimits.mockReset();
  setHidden(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as { getwriteDesktop?: unknown }).getwriteDesktop;
  window.history.pushState({}, "", "/");
});

describe("useSharingLimits", () => {
  it("starts unknown, then becomes exempt after the first read", async () => {
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    const { result } = renderHook(() => useSharingLimits(), { wrapper });
    expect(result.current.state).toEqual({ state: "unknown" });
    await flush();
    expect(result.current.state).toEqual({ state: "exempt" });
  });

  it("becomes paired with the limits", async () => {
    fetchSharingLimits.mockResolvedValue(PAIRED);
    const { result } = renderHook(() => useSharingLimits(), { wrapper });
    await flush();
    expect(result.current.state).toEqual(PAIRED);
  });

  it("a failed read stays unknown and a later failure returns to unknown, never exempt", async () => {
    fetchSharingLimits.mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => useSharingLimits(), { wrapper });
    await flush();
    expect(result.current.state).toEqual({ state: "unknown" });
    fetchSharingLimits.mockResolvedValueOnce(PAIRED);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state.state).toBe("paired");
    fetchSharingLimits.mockRejectedValueOnce(new Error("down"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toEqual({ state: "unknown" });
  });

  it("re-reads on visibilitychange to visible, not when hidden, and on focus", async () => {
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    renderHook(() => useSharingLimits(), { wrapper });
    await flush();
    expect(fetchSharingLimits).toHaveBeenCalledTimes(1);
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetchSharingLimits).toHaveBeenCalledTimes(1);
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(fetchSharingLimits).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(fetchSharingLimits).toHaveBeenCalledTimes(3);
  });

  it("refresh() returns the new state", async () => {
    fetchSharingLimits.mockResolvedValueOnce({ state: "exempt" });
    const { result } = renderHook(() => useSharingLimits(), { wrapper });
    await flush();
    fetchSharingLimits.mockResolvedValueOnce(PAIRED);
    let returned: unknown;
    await act(async () => {
      returned = await result.current.refresh();
    });
    expect(returned).toEqual(PAIRED);
  });

  it("an older response resolving after a newer one does not overwrite it", async () => {
    let resolveOld: (a: SharingLimitsAnswer) => void = () => {};
    fetchSharingLimits.mockReturnValueOnce(
      new Promise<SharingLimitsAnswer>((r) => {
        resolveOld = r;
      }),
    );
    const { result } = renderHook(() => useSharingLimits(), { wrapper });
    fetchSharingLimits.mockResolvedValueOnce(PAIRED);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state.state).toBe("paired");
    await act(async () => {
      resolveOld({ state: "exempt" });
      await Promise.resolve();
    });
    expect(result.current.state).toEqual(PAIRED);
  });

  it("reports desktop bridge presence", async () => {
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    const none = renderHook(() => useSharingLimits(), { wrapper });
    await flush();
    expect(none.result.current.hasDesktopBridge).toBe(false);
    cleanup();
    (window as { getwriteDesktop?: unknown }).getwriteDesktop = {
      chooseWorkspaceDir: () => Promise.resolve(null),
    };
    const some = renderHook(() => useSharingLimits(), { wrapper });
    await flush();
    expect(some.result.current.hasDesktopBridge).toBe(true);
  });

  it("throws outside a provider, like the sibling contexts", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSharingLimits())).toThrow(
      /SharingLimitsProvider/,
    );
    spy.mockRestore();
  });
});

describe("useSharingLimits on the pairing page", () => {
  it.each(["/pair", "/pair?reason=unpaired"])(
    "makes no limits read at %s on mount, focus, visibility, refresh() or the prompt poll",
    async (url) => {
      window.history.pushState({}, "", url);
      fetchSharingLimits.mockResolvedValue(PAIRED);
      const view = renderHook(
        () => {
          useDeclareUnlockPromptMounted(true);
          return useSharingLimits();
        },
        { wrapper },
      );
      await flush();
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await act(async () => {
        await view.result.current.refresh();
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(fetchSharingLimits).not.toHaveBeenCalled();
      expect(view.result.current.state).toEqual({ state: "unknown" });
    },
  );
});

describe("useDeclareUnlockPromptMounted", () => {
  function both(active: boolean) {
    return renderHook(
      () => {
        useDeclareUnlockPromptMounted(active);
        return useSharingLimits();
      },
      { wrapper },
    );
  }

  it("schedules no timer when no prompt is declared", async () => {
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    renderHook(() => useSharingLimits(), { wrapper });
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(fetchSharingLimits).toHaveBeenCalledTimes(1);
  });

  it("reads when the prompt opens, then every 5 s, and stops on unmount", async () => {
    fetchSharingLimits.mockResolvedValue({ state: "exempt" });
    const view = both(true);
    await flush();
    // mount read + prompt-open read
    expect(fetchSharingLimits.mock.calls.length).toBeGreaterThanOrEqual(2);
    const before = fetchSharingLimits.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchSharingLimits).toHaveBeenCalledTimes(before + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchSharingLimits).toHaveBeenCalledTimes(before + 2);
    view.unmount();
    const after = fetchSharingLimits.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchSharingLimits).toHaveBeenCalledTimes(after);
  });

  it("the poll is paused while the document is hidden and a failed read is retried by the next poll", async () => {
    fetchSharingLimits.mockRejectedValue(new Error("down"));
    const view = both(true);
    await flush();
    setHidden(true);
    const before = fetchSharingLimits.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetchSharingLimits).toHaveBeenCalledTimes(before);
    setHidden(false);
    fetchSharingLimits.mockResolvedValue(PAIRED);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(view.result.current.state).toEqual(PAIRED);
  });
});
