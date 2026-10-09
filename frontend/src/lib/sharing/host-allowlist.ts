/**
 * The Host allowlist for home-network sharing (Feature 75, FR-31).
 *
 * With sharing on, a request that is not the window's is served only when its
 * `Host` header names this machine as `<name>:<port>`, where `<name>` is
 * `localhost`, `127.0.0.1`, an IPv4 address currently assigned to one of the
 * machine's own interfaces, or `<hostname>.local`. This closes the
 * DNS-rebinding shape (a page on a foreign name reaching the pairing endpoint
 * with `Host` and `Origin` both that name).
 *
 * Nothing is fixed at launch: {@link readOwnMachine} reads the interfaces and
 * hostname at call time, so an address change needs no restart. There is no
 * cache. Module state is unreliable in `proxy.ts` anyway (measured not shared
 * with routes), so none is kept.
 *
 * Consequences, stated plainly and not softened:
 * - A paired device's cookie belongs to the host it was set on (general
 *   browser behaviour, not tested here), so when the desktop's address changes
 *   the device must be opened at the new address and paired again.
 * - A `<hostname>.local` name avoids that where the device can resolve it,
 *   which is not assured on every Android version (not measured), and whether
 *   `os.hostname()` is the name a device resolves is not measured on any
 *   platform.
 * - A router address reservation is the dependable remedy for a changing
 *   address.
 * - A name supplied by a router or reverse proxy (for example `nas.lan`) is
 *   refused.
 * - IPv6 is out of scope: nothing here listens on IPv6 (`localhost` over IPv6
 *   did not connect under a `0.0.0.0` bind, experiments section C run 2; cause
 *   not established).
 *
 * The desktop window shows a subset of the same enumeration (the private-range
 * addresses; `electron/src/sharing/addresses.ts`), and every address it shows
 * is accepted here. A shared JSON fixture keeps the two honest.
 */
import os from "node:os";

/** One entry of `os.networkInterfaces()`, reduced to what the rule reads. */
export interface MachineInterfaceEntry {
  address: string;
  family: string;
  internal: boolean;
}

/** The shape of `os.networkInterfaces()`. */
export type MachineInterfaces = Record<
  string,
  readonly MachineInterfaceEntry[] | undefined
>;

/** The machine identity the allowlist is computed from. */
export interface OwnMachine {
  interfaces: MachineInterfaces;
  hostname: string;
}

/** Shown to a person whose request is refused for its Host; FR-31 working copy, verbatim. */
export const HOST_NOT_ALLOWED_MESSAGE =
  "This address does not name the computer running GetWrite. Open the address shown in the GetWrite window on that computer.";

/** Reads the interfaces and hostname now. */
export function readOwnMachine(): OwnMachine {
  return {
    interfaces: os.networkInterfaces() as MachineInterfaces,
    hostname: os.hostname(),
  };
}

/**
 * Parses the server's own `PORT` value. Only a plain decimal in 1..65535 is a
 * port; anything else is undefined, which makes every check refuse.
 */
export function parseServerPort(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d{1,5}$/.test(value)) return undefined;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : undefined;
}

function ownIPv4Addresses(interfaces: MachineInterfaces): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      addresses.push(entry.address);
    }
  }
  return addresses;
}

function mdnsName(hostname: string): string | undefined {
  const base = hostname.toLowerCase().replace(/\.local$/, "");
  return base === "" ? undefined : `${base}.local`;
}

/** Every accepted Host value, lowercased, as `<name>:<port>`. */
export function ownHostNames(input: {
  port: number;
  interfaces: MachineInterfaces;
  hostname: string;
}): string[] {
  const names = [
    "localhost",
    "127.0.0.1",
    ...ownIPv4Addresses(input.interfaces),
  ];
  const mdns = mdnsName(input.hostname);
  if (mdns !== undefined) names.push(mdns);
  return names.map((name) => `${name.toLowerCase()}:${input.port}`);
}

/**
 * True only when the header is exactly `<own name>:<port>`, compared
 * case-insensitively. A missing header, no port, another port, an IPv6
 * literal, a trailing-dot name, userinfo or a path all fail the exact match.
 */
export function isAllowedHost(input: {
  hostHeader: string | null | undefined;
  port: number;
  interfaces: MachineInterfaces;
  hostname: string;
}): boolean {
  if (input.hostHeader === null || input.hostHeader === undefined) return false;
  return ownHostNames(input).includes(input.hostHeader.toLowerCase());
}
