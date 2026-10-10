/**
 * The effective-sharing decision: pure, takes its environment as an argument.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildServerBindEnv,
  resolveServerHostname,
  resolveSharingMode,
  type SharingMode,
} from "../src/sharing/sharing-mode";

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

const LOOPBACK = "127.0.0.1";
const ALL_INTERFACES = "0.0.0.0";
const HOSTED_ENV = { DATABASE_URL: "a", BETTER_AUTH_SECRET: "b" };

describe("resolveServerHostname (Task 22: FR-3, FR-4, FR-24)", () => {
  it("is loopback for sharing off", () => {
    expect(
      resolveServerHostname(resolveSharingMode({ enabled: false, env: {} })),
    ).toBe(LOOPBACK);
  });

  it("is loopback for sharing enabled but blocked by hosted auth", () => {
    expect(
      resolveServerHostname(
        resolveSharingMode({ enabled: true, env: HOSTED_ENV }),
      ),
    ).toBe(LOOPBACK);
  });

  it("is loopback for a missing or corrupt setting (read as off)", () => {
    // readSharingEnabled yields false for both; the mode then is not effective.
    const mode = resolveSharingMode({ enabled: false, env: {} });
    expect(resolveServerHostname(mode)).toBe(LOOPBACK);
  });

  it("is all interfaces only for effective sharing", () => {
    expect(
      resolveServerHostname(resolveSharingMode({ enabled: true, env: {} })),
    ).toBe(ALL_INTERFACES);
  });
});

describe("buildServerBindEnv (FR-34)", () => {
  const MODES: Array<[string, SharingMode]> = [
    ["effective", { effective: true, blockedByHostedAuth: false }],
    ["off", { effective: false, blockedByHostedAuth: false }],
    ["blocked by hosted auth", { effective: false, blockedByHostedAuth: true }],
  ];

  it.each(MODES)(
    "never yields a non-loopback HOSTNAME without GETWRITE_SHARING=1, and GETWRITE_BIND equals HOSTNAME: %s",
    (_name, mode) => {
      const bind = buildServerBindEnv(mode);
      expect(bind.GETWRITE_BIND).toBe(bind.HOSTNAME);
      if (bind.HOSTNAME !== LOOPBACK) {
        expect(bind.GETWRITE_SHARING).toBe("1");
      }
      expect(bind.GETWRITE_SHARING).toBe(mode.effective ? "1" : "0");
      expect(bind.HOSTNAME).toBe(mode.effective ? ALL_INTERFACES : LOOPBACK);
    },
  );

  it("with sharing off the server is started with HOSTNAME 127.0.0.1 and the gate off", () => {
    const mode = resolveSharingMode({ enabled: false, env: {} });
    expect(buildServerBindEnv(mode)).toEqual({
      HOSTNAME: LOOPBACK,
      GETWRITE_BIND: LOOPBACK,
      GETWRITE_SHARING: "0",
    });
  });
});

describe("electron/src/main.ts bind wiring (text)", () => {
  const main = readFileSync(
    path.join(__dirname, "..", "src", "main.ts"),
    "utf8",
  );

  it("contains no hostname literal; the bind comes from resolveServerHostname", () => {
    expect(main).not.toMatch(/127\.0\.0\.1/);
    expect(main).not.toMatch(/0\.0\.0\.0/);
    expect(main).not.toMatch(/["']::1?["']/);
  });

  it("assigns HOSTNAME, GETWRITE_BIND and GETWRITE_SHARING only through buildServerBindEnv", () => {
    expect(main).not.toMatch(/^\s*HOSTNAME\s*:/m);
    expect(main).not.toMatch(/^\s*GETWRITE_BIND\s*:/m);
    expect(main).not.toMatch(/^\s*GETWRITE_SHARING\s*:/m);
    expect(main).not.toMatch(
      /\[\s*["'](HOSTNAME|GETWRITE_BIND|GETWRITE_SHARING)["']\s*\]\s*=/,
    );
    expect(main).toMatch(/\.\.\.buildServerBindEnv\(/);
    expect(main).toMatch(/buildServerBindEnv\(mode\)/);
  });

  it("computes the mode once", () => {
    expect(main.match(/resolveSharingMode\(/g)?.length).toBe(1);
  });
});
