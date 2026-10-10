/**
 * @module store-status
 *
 * Main-side view of the server's device-credential store (FR-27). Applies the
 * same rules as `frontend/src/lib/sharing/credential-store.ts` (kept honest
 * by a contract test over the shared fixtures) and exposes only a status,
 * never a device, credential or hash.
 */
import fs from "node:fs";
import path from "node:path";

/** Name of the credential file inside the sharing directory. */
export const CREDENTIALS_FILE_NAME = "device-credentials.json";

/** Whether the store is absent, readable and valid, or damaged. */
export type CredentialStoreStatus = "ok" | "missing" | "corrupt";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `value` satisfies the server's device-record rules (shape only). */
export function isDeviceRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.credentialHash === "string" &&
    /^[0-9a-f]{64}$/.test(value.credentialHash)
  );
}

/**
 * Reads the store file's status. A missing file is `missing`; anything that
 * cannot be read, parsed or validated is `corrupt`, never `missing`.
 *
 * @param dir - Sharing directory (`userData`).
 * @returns The status.
 */
export function readCredentialStoreStatus(dir: string): CredentialStoreStatus {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, CREDENTIALS_FILE_NAME), "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "missing"
      : "corrupt";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "corrupt";
  }
  if (!isRecord(parsed) || parsed.version !== 1) return "corrupt";
  const devices = parsed.devices;
  return Array.isArray(devices) && devices.every(isDeviceRecord)
    ? "ok"
    : "corrupt";
}
