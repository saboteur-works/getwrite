/** Sharing status object and pairing-code session (Feature 75, FR-6/13/24/27). */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NetworkInterfaceInfo } from "os";
import { buildSharingStatus } from "../src/sharing/sharing-status";
import { createPairingSession } from "../src/sharing/pairing-session";
import {
  PAIRING_CODE_LIFETIME_MS,
  readPairingState,
  codeMatchesState,
} from "../src/sharing/pairing-code";

const iface: Record<string, NetworkInterfaceInfo[]> = {
  en0: [
    {
      address: "192.168.1.20",
      netmask: "255.255.255.0",
      family: "IPv4",
      mac: "00:00:00:00:00:00",
      internal: false,
      cidr: "192.168.1.20/24",
    },
  ],
};
const hosted = { DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "s" };

describe("buildSharingStatus", () => {
  it("fills addresses when sharing is effective", () => {
    const s = buildSharingStatus({
      enabled: true,
      env: {},
      interfaces: iface,
      port: 4000,
      credentialStore: "ok",
    });
    expect(s).toEqual({
      enabled: true,
      effective: true,
      blockedByHostedAuth: false,
      addresses: ["http://192.168.1.20:4000"],
      credentialStore: "ok",
      port: 4000,
    });
  });

  it("gives no addresses when disabled", () => {
    const s = buildSharingStatus({
      enabled: false,
      env: {},
      interfaces: iface,
      port: 4000,
      credentialStore: "missing",
    });
    expect(s.effective).toBe(false);
    expect(s.addresses).toEqual([]);
  });

  it("reports the hosted-auth block with sharing not effective", () => {
    const s = buildSharingStatus({
      enabled: true,
      env: hosted,
      interfaces: iface,
      port: 4000,
      credentialStore: "ok",
    });
    expect(s.enabled).toBe(true);
    expect(s.effective).toBe(false);
    expect(s.blockedByHostedAuth).toBe(true);
    expect(s.addresses).toEqual([]);
  });

  it("returns an empty address list when effective with no network", () => {
    const s = buildSharingStatus({
      enabled: true,
      env: {},
      interfaces: {},
      port: 4000,
      credentialStore: "corrupt",
    });
    expect(s.effective).toBe(true);
    expect(s.addresses).toEqual([]);
    expect(s.credentialStore).toBe("corrupt");
  });

  it("exposes exactly the six documented keys and no secret material", () => {
    const s = buildSharingStatus({
      enabled: true,
      env: { GETWRITE_WINDOW_SECRET: "topsecret" },
      interfaces: iface,
      port: 4000,
      credentialStore: "ok",
    });
    expect(Object.keys(s).sort()).toEqual(
      [
        "addresses",
        "blockedByHostedAuth",
        "credentialStore",
        "effective",
        "enabled",
        "port",
      ].sort(),
    );
    expect(JSON.stringify(s)).not.toContain("topsecret");
  });
});

describe("createPairingSession", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-session-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("has no code before one is generated", () => {
    expect(createPairingSession(dir, () => 1000).get()).toBeNull();
  });

  it("generates, persists only the hash, and returns the code to the caller", () => {
    const session = createPairingSession(dir, () => 1000);
    const info = session.generate();
    expect(info.code).toMatch(/^\d{6}$/);
    expect(info.generatedAt).toBe(1000);
    expect(info.expiresAt).toBe(1000 + PAIRING_CODE_LIFETIME_MS);
    expect(session.get()).toEqual(info);
    const read = readPairingState(dir);
    expect(read.kind).toBe("ok");
    if (read.kind === "ok") {
      expect(codeMatchesState(read.state, info.code)).toBe(true);
    }
    const onDisk = fs.readFileSync(
      path.join(dir, "pairing-state.json"),
      "utf8",
    );
    expect(onDisk).not.toContain(info.code);
  });

  it("a second generate replaces the first", () => {
    const session = createPairingSession(dir, () => 1000);
    session.generate();
    const second = session.generate();
    expect(session.get()).toEqual(second);
  });

  it("still returns an expired code with its expiry so the window can say expired", () => {
    let now = 1000;
    const session = createPairingSession(dir, () => now);
    const info = session.generate();
    now = info.expiresAt + 1;
    expect(session.get()).toEqual(info);
  });

  it("propagates a write failure instead of returning a code", () => {
    const missing = path.join(dir, "does", "not", "exist");
    const session = createPairingSession(missing, () => 1000);
    expect(() => session.generate()).toThrow();
    expect(session.get()).toBeNull();
  });

  it("PairingCodeInfo has only code, generatedAt, expiresAt", () => {
    const info = createPairingSession(dir, () => 5).generate();
    expect(Object.keys(info).sort()).toEqual(
      ["code", "expiresAt", "generatedAt"].sort(),
    );
  });
});
