/**
 * The effective-sharing decision: pure, takes its environment as an argument.
 */
import { describe, it, expect } from "vitest";
import { resolveSharingMode } from "../src/sharing/sharing-mode";

describe("resolveSharingMode", () => {
  it("is effective when enabled and no hosted-auth variables are present", () => {
    expect(resolveSharingMode({ enabled: true, env: {} })).toEqual({
      effective: true,
      blockedByHostedAuth: false,
    });
  });

  it("is blocked when enabled and both hosted-auth variables are present", () => {
    expect(
      resolveSharingMode({
        enabled: true,
        env: { DATABASE_URL: "a", BETTER_AUTH_SECRET: "b" },
      }),
    ).toEqual({ effective: false, blockedByHostedAuth: true });
  });

  it("is effective when enabled with only DATABASE_URL", () => {
    expect(
      resolveSharingMode({ enabled: true, env: { DATABASE_URL: "a" } }),
    ).toEqual({ effective: true, blockedByHostedAuth: false });
  });

  it("is effective when enabled with only BETTER_AUTH_SECRET", () => {
    expect(
      resolveSharingMode({ enabled: true, env: { BETTER_AUTH_SECRET: "b" } }),
    ).toEqual({ effective: true, blockedByHostedAuth: false });
  });

  it("treats empty and whitespace-only values as absent, like isHostedAuthActive", () => {
    expect(
      resolveSharingMode({
        enabled: true,
        env: { DATABASE_URL: "", BETTER_AUTH_SECRET: "   " },
      }),
    ).toEqual({ effective: true, blockedByHostedAuth: false });
  });

  it("is never effective and never blocked when not enabled", () => {
    expect(resolveSharingMode({ enabled: false, env: {} })).toEqual({
      effective: false,
      blockedByHostedAuth: false,
    });
    expect(
      resolveSharingMode({
        enabled: false,
        env: { DATABASE_URL: "a", BETTER_AUTH_SECRET: "b" },
      }),
    ).toEqual({ effective: false, blockedByHostedAuth: false });
  });

  it("does not mutate the env it is given (FR-24)", () => {
    const env = { DATABASE_URL: "a", BETTER_AUTH_SECRET: "b", OTHER: "c" };
    const before = { ...env };
    resolveSharingMode({ enabled: true, env });
    expect(env).toEqual(before);
  });

  it("does not read process.env", () => {
    const savedDb = process.env.DATABASE_URL;
    const savedSecret = process.env.BETTER_AUTH_SECRET;
    process.env.DATABASE_URL = "x";
    process.env.BETTER_AUTH_SECRET = "y";
    try {
      expect(resolveSharingMode({ enabled: true, env: {} }).effective).toBe(
        true,
      );
    } finally {
      if (savedDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDb;
      if (savedSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = savedSecret;
    }
  });
});
