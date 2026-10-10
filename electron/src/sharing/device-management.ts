/**
 * @module device-management
 *
 * Main-side list, rename and revoke of paired devices (Feature 76). Reads and
 * writes only `device-credentials.json` through the store writer; never
 * touches `pairing-state.json` and reads nothing about the sharing state.
 * Only `id`, `name` and `createdAt` ever leave this module for a device, and
 * no outcome carries a name, id, token or hash.
 */
import fs from "node:fs";
import path from "node:path";
import {
  updateDeviceStore,
  type DeviceStoreMutation,
  type DeviceStoreOptions,
  type DeviceStoreOutcome,
} from "./device-store-writer";
import { CREDENTIALS_FILE_NAME, isDeviceRecord } from "./store-status";

/** The only fields of a device that cross to the renderer. */
interface DeviceSummary {
  id: string;
  name: string;
  createdAt: string;
}

export type ListDevicesResult =
  | { kind: "ok"; devices: DeviceSummary[]; storeDirectory: string }
  | { kind: "missing"; devices: []; storeDirectory: string }
  | { kind: "corrupt"; storeDirectory: string };

/** Why a proposed device name was refused. */
type InvalidNameReason =
  | "not-a-string"
  | "empty"
  | "too-long"
  | "control-character";

export type MutationResult =
  | { kind: "ok" }
  | { kind: "not-found" }
  | { kind: "invalid-name"; reason: InvalidNameReason }
  | { kind: "corrupt" }
  | { kind: "lock-not-acquired" }
  | { kind: "write-failed" };

/** Options for a mutating operation; `update` is a test seam for the writer. */
interface DeviceOperationOptions extends DeviceStoreOptions {
  update?: (
    dir: string,
    mutate: DeviceStoreMutation,
    options?: DeviceStoreOptions,
  ) => Promise<DeviceStoreOutcome>;
}

/** Longest allowed device name, counted in Unicode code points. */
const MAX_NAME_CODE_POINTS = 64;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Lists the paired devices without any secret.
 *
 * @param dir - Directory holding the store (`userData`); echoed back.
 * @returns `ok`, `missing` (no file) or `corrupt` (anything unreadable or invalid).
 */
export function listDevices(dir: string): ListDevicesResult {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, CREDENTIALS_FILE_NAME), "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "missing", devices: [], storeDirectory: dir }
      : { kind: "corrupt", storeDirectory: dir };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "corrupt", storeDirectory: dir };
  }
  const root = parsed as { version?: unknown; devices?: unknown } | null;
  if (
    typeof root !== "object" ||
    root === null ||
    Array.isArray(root) ||
    root.version !== 1 ||
    !Array.isArray(root.devices) ||
    !root.devices.every(isDeviceRecord)
  ) {
    return { kind: "corrupt", storeDirectory: dir };
  }
  const devices = (root.devices as DeviceSummary[]).map((record) => ({
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
  }));
  return { kind: "ok", devices, storeDirectory: dir };
}

function validateName(
  name: unknown,
): { name: string } | { reason: InvalidNameReason } {
  if (typeof name !== "string") return { reason: "not-a-string" };
  const trimmed = name.trim();
  if (trimmed.length === 0) return { reason: "empty" };
  if (CONTROL_CHARACTER.test(trimmed)) return { reason: "control-character" };
  if ([...trimmed].length > MAX_NAME_CODE_POINTS) return { reason: "too-long" };
  return { name: trimmed };
}

async function runMutation(
  dir: string,
  mutate: DeviceStoreMutation,
  options: DeviceOperationOptions,
): Promise<MutationResult> {
  const { update = updateDeviceStore, ...retry } = options;
  let outcome: DeviceStoreOutcome;
  try {
    outcome = await update(dir, mutate, retry);
  } catch {
    return { kind: "write-failed" };
  }
  switch (outcome.kind) {
    case "written":
      return { kind: "ok" };
    case "unchanged":
      return { kind: "not-found" };
    case "corrupt":
      return { kind: "corrupt" };
    case "lock-not-acquired":
      return { kind: "lock-not-acquired" };
  }
}

/**
 * Renames one device; changes only that record's `name`.
 *
 * @param dir - Directory holding the store.
 * @param id - Device id.
 * @param name - Proposed name; trimmed, then at most 64 code points, no control characters.
 * @param options - Retry overrides and the writer test seam.
 */
export async function renameDevice(
  dir: string,
  id: string,
  name: unknown,
  options: DeviceOperationOptions = {},
): Promise<MutationResult> {
  const checked = validateName(name);
  if ("reason" in checked)
    return { kind: "invalid-name", reason: checked.reason };
  return runMutation(
    dir,
    (records) =>
      records.some((r) => r.id === id)
        ? records.map((r) => (r.id === id ? { ...r, name: checked.name } : r))
        : null,
    options,
  );
}

/**
 * Revokes one device by deleting its record; no history is kept.
 *
 * @param dir - Directory holding the store.
 * @param id - Device id.
 * @param options - Retry overrides and the writer test seam.
 */
export async function revokeDevice(
  dir: string,
  id: string,
  options: DeviceOperationOptions = {},
): Promise<MutationResult> {
  return runMutation(
    dir,
    (records) =>
      records.some((r) => r.id === id)
        ? records.filter((r) => r.id !== id)
        : null,
    options,
  );
}
