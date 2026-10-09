/**
 * Request classification for home-network sharing (Feature 75, FR-8, FR-12).
 *
 * Pure decision: takes the request's headers and cookies, the env and an
 * already-read credential store state. No peer-address logic: the address is
 * not evidence of anything. The only things that identify the desktop window
 * are the per-launch secret in the `x-getwrite-window` header; a paired device
 * is identified by the `getwrite_device` cookie matching a stored hash.
 */
import { timingSafeEqual } from "node:crypto";

import {
  matchDeviceByToken,
  type CredentialStoreState,
} from "./credential-store";
import { readSharingEnv, type EnvLike } from "./sharing-env";

/** Request header carrying the window secret (raw secret string, as sent). */
export const WINDOW_HEADER = "x-getwrite-window";
/** Cookie carrying a paired device's credential. */
export const DEVICE_COOKIE = "getwrite_device";

/**
 * Lifetime of the device cookie, 365 days (FR-33). A working value pending
 * owner confirmation (spec OQ-13); re-issued on every confirmed request.
 */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 31536000;
/** Request header the gate may use to carry a serialized classification to routes. */
export const CLASSIFICATION_HEADER = "x-getwrite-classification";

export type NotConfirmedReason =
  | "store-corrupt"
  | "no-credential"
  | "unknown-credential"
  | "window-secret-unavailable";

const NOT_CONFIRMED_REASONS: readonly NotConfirmedReason[] = [
  "store-corrupt",
  "no-credential",
  "unknown-credential",
  "window-secret-unavailable",
];

export type Classification =
  | { kind: "off" }
  | { kind: "window" }
  | { kind: "confirmed"; deviceId: string }
  | { kind: "not-confirmed"; reason: NotConfirmedReason };

export interface HeaderReader {
  get(name: string): string | null;
}

export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface ClassifyInput {
  headers: HeaderReader;
  cookies: CookieReader;
  method: string;
  env: EnvLike;
  store: CredentialStoreState;
}

function secretsEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function classifyRequest(input: ClassifyInput): Classification {
  const sharing = readSharingEnv(input.env);
  const windowSecret = sharing.windowSecret;
  if (!sharing.sharingOn) return { kind: "off" };

  const presented = input.headers.get(WINDOW_HEADER);
  if (
    windowSecret !== undefined &&
    presented !== null &&
    presented !== "" &&
    secretsEqual(presented, windowSecret)
  ) {
    return { kind: "window" };
  }

  if (input.store.kind === "corrupt") {
    return { kind: "not-confirmed", reason: "store-corrupt" };
  }

  const token = input.cookies.get(DEVICE_COOKIE)?.value;
  if (token === undefined || token === "") {
    return { kind: "not-confirmed", reason: "no-credential" };
  }
  if (input.store.kind === "empty") {
    return { kind: "not-confirmed", reason: "unknown-credential" };
  }
  const device = matchDeviceByToken(input.store.devices, token);
  return device
    ? { kind: "confirmed", deviceId: device.id }
    : { kind: "not-confirmed", reason: "unknown-credential" };
}

/** Single header-value form: `off`, `window`, `confirmed:<id>`, `not-confirmed:<reason>`. */
export function serializeClassification(result: Classification): string {
  switch (result.kind) {
    case "off":
    case "window":
      return result.kind;
    case "confirmed":
      return `confirmed:${result.deviceId}`;
    case "not-confirmed":
      return `not-confirmed:${result.reason}`;
  }
}

/** Returns undefined for anything unrecognised; callers must treat that as not confirmed. */
export function parseClassification(
  value: string | null | undefined,
): Classification | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "off") return { kind: "off" };
  if (value === "window") return { kind: "window" };
  if (value.startsWith("confirmed:")) {
    const deviceId = value.slice("confirmed:".length);
    return deviceId !== "" ? { kind: "confirmed", deviceId } : undefined;
  }
  if (value.startsWith("not-confirmed:")) {
    const reason = value.slice("not-confirmed:".length);
    const known = NOT_CONFIRMED_REASONS.find((r) => r === reason);
    return known ? { kind: "not-confirmed", reason: known } : undefined;
  }
  return undefined;
}
