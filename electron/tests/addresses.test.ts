/** Candidate LAN addresses (Feature 75, FR-6, FR-25). */
import { describe, it, expect } from "vitest";
import type { NetworkInterfaceInfo } from "os";
import { candidateAddresses } from "../src/sharing/addresses";

type Interfaces = Record<string, NetworkInterfaceInfo[] | undefined>;

function v4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  };
}

function v6(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "ffff:ffff:ffff:ffff::",
    family: "IPv6",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/64`,
    scopeid: 0,
  };
}

describe("candidateAddresses", () => {
  it("returns every private IPv4 address with the given port", () => {
    const interfaces: Interfaces = {
      en0: [v4("192.168.1.20")],
      en1: [v4("10.0.0.5"), v4("172.16.4.9"), v4("172.31.255.1")],
    };
    expect(candidateAddresses(interfaces, 4321)).toEqual([
      "http://192.168.1.20:4321",
      "http://10.0.0.5:4321",
      "http://172.16.4.9:4321",
      "http://172.31.255.1:4321",
    ]);
  });

  it("uses whatever port is passed", () => {
    const interfaces: Interfaces = { en0: [v4("192.168.1.20")] };
    expect(candidateAddresses(interfaces, 1111)).toEqual([
      "http://192.168.1.20:1111",
    ]);
    expect(candidateAddresses(interfaces, 2222)).toEqual([
      "http://192.168.1.20:2222",
    ]);
  });

  it("ignores loopback, IPv6, link-local and public addresses", () => {
    const interfaces: Interfaces = {
      lo0: [v4("127.0.0.1", true), v6("::1", true)],
      en0: [
        v6("fe80::1"),
        v6("fd00::5"),
        v4("169.254.10.10"),
        v4("8.8.8.8"),
        v4("172.15.0.1"),
        v4("172.32.0.1"),
        v4("192.169.0.1"),
        v4("192.168.1.7", true),
      ],
    };
    expect(candidateAddresses(interfaces, 3000)).toEqual([]);
  });

  it("returns [] for an empty map and for loopback only", () => {
    expect(candidateAddresses({}, 3000)).toEqual([]);
    expect(candidateAddresses({ lo0: [v4("127.0.0.1", true)] }, 3000)).toEqual(
      [],
    );
  });

  it("tolerates an interface with no address list", () => {
    expect(candidateAddresses({ en0: undefined }, 3000)).toEqual([]);
  });
});
