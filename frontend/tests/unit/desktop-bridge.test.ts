/** getDesktopBridge duck-typing and the sharing bridge surface (Feature 75, Task 19). */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getDesktopBridge } from "../../src/lib/desktop-bridge";

type Holder = { getwriteDesktop?: unknown };

afterEach(() => {
  delete (window as unknown as Holder).getwriteDesktop;
});

describe("getDesktopBridge", () => {
  it("is null with no bridge", () => {
    expect(getDesktopBridge()).toBeNull();
  });

  it("is null for a half-initialised bridge", () => {
    (window as unknown as Holder).getwriteDesktop = { restart: () => {} };
    expect(getDesktopBridge()).toBeNull();
  });

  it("returns a bridge carrying the four sharing methods", () => {
    const bridge = {
      chooseWorkspaceDir: async () => ({ ok: false }),
      getSharingStatus: async () => ({
        enabled: false,
        effective: false,
        blockedByHostedAuth: false,
        addresses: [],
        credentialStore: "missing" as const,
        port: 1,
      }),
      setSharingEnabled: async () => {},
      generatePairingCode: async () => ({
        code: "000000",
        generatedAt: 0,
        expiresAt: 1,
      }),
      getPairingCode: async () => null,
    };
    (window as unknown as Holder).getwriteDesktop = bridge;
    const found = getDesktopBridge();
    expect(found).toBe(bridge);
    expect(typeof found?.getSharingStatus).toBe("function");
    expect(typeof found?.setSharingEnabled).toBe("function");
    expect(typeof found?.generatePairingCode).toBe("function");
    expect(typeof found?.getPairingCode).toBe("function");
  });
});
