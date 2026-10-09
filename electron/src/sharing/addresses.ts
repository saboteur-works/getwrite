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
 * Lists `http://<ip>:<port>` for each non-internal private IPv4 address.
 * IPv6, loopback, link-local and public addresses are skipped.
 *
 * @param interfaces - Result of `os.networkInterfaces()`.
 * @param port - The shared server port (single source: `server-config.ts`).
 * @returns The URLs, or `[]` when there is none.
 */
export function candidateAddresses(
  interfaces: NetworkInterfaces,
  port: number,
): string[] {
  const urls: string[] = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      if (!isPrivateIPv4(entry.address)) continue;
      urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}
