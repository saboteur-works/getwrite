/**
 * @module addresses
 *
 * Candidate LAN addresses for the "other devices open this" display (FR-6).
 * Pure: takes the shape of `os.networkInterfaces()`; makes no connection.
 */
import type { NetworkInterfaceInfo } from "os";

/** The shape of `os.networkInterfaces()`. */
export type NetworkInterfaces = Record<
  string,
  NetworkInterfaceInfo[] | undefined
>;

/** Parses a dotted-quad into four octets, or null when it is not one. */
function octets(address: string): [number, number, number, number] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
}

/** True for 10/8, 172.16/12 and 192.168/16. */
function isPrivateIPv4(address: string): boolean {
  const o = octets(address);
  if (!o) return false;
  const [a, b] = o;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

/**
 * Every non-internal IPv4 address of the machine. This is the one enumeration
 * both the window's display and the server's Host allowlist (FR-31,
 * `frontend/src/lib/sharing/host-allowlist.ts`) start from.
 */
export function ownIPv4Addresses(interfaces: NetworkInterfaces): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      addresses.push(entry.address);
    }
  }
  return addresses;
}

/**
 * Lists `http://<ip>:<port>` for each private-range address of
 * {@link ownIPv4Addresses}. IPv6, loopback, link-local and public addresses
 * are skipped; every address listed is accepted by the server's Host
 * allowlist.
 *
 * @param interfaces - Result of `os.networkInterfaces()`.
 * @param port - The shared server port (single source: `server-config.ts`).
 * @returns The URLs, or `[]` when there is none.
 */
export function candidateAddresses(
  interfaces: NetworkInterfaces,
  port: number,
): string[] {
  return ownIPv4Addresses(interfaces)
    .filter(isPrivateIPv4)
    .map((address) => `http://${address}:${port}`);
}
