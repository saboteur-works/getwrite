import React, { type ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import type { StaticSharingLimitsValue } from "../../components/Sharing/SharingLimitsContext";
import { useUserListAvailable } from "../../src/hooks/useUserListAvailable";

const PAIRED_LIMITS = {
  projectDeletion: true,
  unlocking: true,
  locking: true,
  encryptionChanges: true,
  permanentDeletion: true,
};

function wrapperFor(value: StaticSharingLimitsValue) {
  return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <StaticSharingLimitsProvider value={value}>
        {children}
      </StaticSharingLimitsProvider>
    );
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("useUserListAvailable", () => {
  it("is unavailable for role paired", () => {
    const { result } = renderHook(() => useUserListAvailable(), {
      wrapper: wrapperFor({
        state: { state: "paired", limits: PAIRED_LIMITS },
      }),
    });
    expect(result.current).toBe("unavailable");
  });

  it("is available for role exempt", () => {
    const { result } = renderHook(() => useUserListAvailable(), {
      wrapper: wrapperFor({ state: { state: "exempt" } }),
    });
    expect(result.current).toBe("available");
  });

  it("is unknown while the role is still loading", () => {
    const { result } = renderHook(() => useUserListAvailable(), {
      wrapper: wrapperFor({ state: { state: "unknown" } }),
    });
    expect(result.current).toBe("unknown");
  });

  it("does not treat a failed limits read as exempt", () => {
    const { result } = renderHook(() => useUserListAvailable(), {
      wrapper: wrapperFor({
        state: { state: "unknown" },
        didLastReadFail: true,
      }),
    });
    expect(result.current).toBe("unknown");
  });

  it("is available on Android without calling /api/sharing/limits", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useUserListAvailable(), {
      wrapper: wrapperFor({ state: { state: "unknown" } }),
    });
    expect(result.current).toBe("available");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
