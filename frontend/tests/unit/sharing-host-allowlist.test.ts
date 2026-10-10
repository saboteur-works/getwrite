/**
 * Feature 75, Task 25 (FR-31): the Host allowlist. The contract fixture
 * `host-allowlist.cases.json` is also read by `electron/tests/addresses.test.ts`,
 * which checks the address display against the same `accepted` list.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isAllowedHost,
  ownHostNames,
  readOwnMachine,
  type MachineInterfaces,
} from "../../src/lib/sharing/host-allowlist";

interface Case {
  name: string;
  port: number;
  hostname: string;
  interfaces: MachineInterfaces;
  displayed: string[];
  accepted: string[];
  refused: string[];
}

const CASES = (
  JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../fixtures/sharing/host-allowlist.cases.json"),
      "utf8",
    ),
  ) as { cases: Case[] }
).cases;

describe.each(CASES)("fixture case: $name", (c) => {
  const base = { port: c.port, interfaces: c.interfaces, hostname: c.hostname };

  it.each(c.accepted)("accepts %s", (hostHeader) => {
    expect(isAllowedHost({ ...base, hostHeader })).toBe(true);
  });

  it.each(c.refused)("refuses %j", (hostHeader) => {
    expect(isAllowedHost({ ...base, hostHeader })).toBe(false);
  });

  it("refuses a missing header", () => {
    expect(isAllowedHost({ ...base, hostHeader: null })).toBe(false);
    expect(isAllowedHost({ ...base, hostHeader: undefined })).toBe(false);
  });

  it("every displayed address is in ownHostNames", () => {
    const names = ownHostNames(base);
    for (const url of c.displayed) {
      expect(names).toContain(new URL(url).host);
    }
  });
});

describe("computed at call time", () => {
  const port = 3000;
  const hostname = "box";
  const first = {
    en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
  } as MachineInterfaces;
  const second = {
    en0: [{ address: "10.0.0.9", family: "IPv4", internal: false }],
  } as MachineInterfaces;

  it("an address present on the second call and absent on the first is accepted only on the second", () => {
    const hostHeader = "10.0.0.9:3000";
    expect(
      isAllowedHost({ hostHeader, port, hostname, interfaces: first }),
    ).toBe(false);
    expect(
      isAllowedHost({ hostHeader, port, hostname, interfaces: second }),
    ).toBe(true);
    expect(
      isAllowedHost({
        hostHeader: "10.0.0.5:3000",
        port,
        hostname,
        interfaces: second,
      }),
    ).toBe(false);
  });

  it("an IPv6 or internal entry adds nothing beyond localhost and 127.0.0.1", () => {
    const interfaces = {
      lo0: [
        { address: "127.0.0.2", family: "IPv4", internal: true },
        { address: "::1", family: "IPv6", internal: true },
      ],
      en0: [{ address: "fd00::5", family: "IPv6", internal: false }],
      en1: undefined,
    } as MachineInterfaces;
    expect(ownHostNames({ port, hostname: "", interfaces }).sort()).toEqual([
      "127.0.0.1:3000",
      "localhost:3000",
    ]);
  });

  it("a hostname that is only .local contributes no name", () => {
    expect(
      ownHostNames({ port, hostname: ".local", interfaces: {} }).sort(),
    ).toEqual(["127.0.0.1:3000", "localhost:3000"]);
  });
});

describe("readOwnMachine", () => {
  it("returns the live interfaces and hostname", () => {
    const machine = readOwnMachine();
    expect(typeof machine.hostname).toBe("string");
    expect(typeof machine.interfaces).toBe("object");
  });
});
