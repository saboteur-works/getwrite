// Last Updated: 2026-10-09

/**
 * Pairing-code lifecycle, main-process side (Feature 75, FR-13 to FR-16).
 *
 * Main generates a one-time 6-digit code, keeps the plain value in memory only
 * (so the window can display it), and persists just a salted HMAC-SHA256 of it
 * to `pairing-state.json` in the directory the server is given via
 * `GETWRITE_SHARING_DIR`. Main writes that file only when generating a new code
 * (replacing everything); the server alone moves `attempts`, `dead` and `used`.
 *
 * The file format is shared with the server side and fixed by the JSON
 * fixtures in `frontend/tests/fixtures/sharing/`. The HMAC key is the
 * hex-decoded `salt` bytes; the message is the code's 6 ASCII digits.
 *
 * Nothing here logs or prints a code.
 */
import {
  createHmac,
  randomBytes as cryptoRandomBytes,
  randomInt as cryptoRandomInt,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Name of the pairing-state file inside the sharing directory. */
export const PAIRING_STATE_FILE = "pairing-state.json";

/** A pairing code stops confirming devices this long after it is generated. */
export const PAIRING_CODE_LIFETIME_MS = 5 * 60 * 1000;

/** Number of decimal digits in a pairing code. */
const CODE_DIGITS = 6;

/** Salt length in bytes. */
const SALT_BYTES = 16;

/** The persisted, hash-only state of the current pairing code. */
export interface PairingState {
  version: 1;
  /** Hex salt; its decoded bytes are the HMAC key. */
  salt: string;
  /** Hex `HMAC-SHA256(salt, code)`. */
  codeHash: string;
  /** Epoch ms after which the code confirms nothing. */
  expiresAt: number;
  /** Wrong attempts so far (server-owned). */
  attempts: number;
  /** True once the attempt limit is hit (server-owned). */
  dead: boolean;
  /** True once a device was confirmed with the code (server-owned). */
  used: boolean;
  /** Epoch ms when the code was generated. */
  generatedAt: number;
}

/** Result of reading the pairing-state file. */
export type PairingStateRead =
  | { kind: "absent" }
  | { kind: "ok"; state: PairingState }
  | { kind: "corrupt" };

/** Injectable randomness and clock for `generatePairingCode`. */
export interface GeneratePairingCodeOptions {
  now: number;
  randomInt?: (min: number, max: number) => number;
  randomBytes?: (size: number) => Buffer;
}

/**
 * Computes the hex HMAC of a code under a hex salt.
 *
 * @param saltHex - Hex-encoded salt used as the key bytes.
 * @param code - The plain code.
 * @returns Hex digest.
 */
function hashCode(saltHex: string, code: string): string {
  return createHmac("sha256", Buffer.from(saltHex, "hex"))
    .update(code)
    .digest("hex");
}

/**
 * Generates a new pairing code and its hash-only state.
 *
 * @param options - Clock and (for tests) injected randomness; production
 *   defaults are `crypto.randomInt` and `crypto.randomBytes`.
 * @returns The plain code (keep in memory only) and the state to persist.
 */
export function generatePairingCode(options: GeneratePairingCodeOptions): {
  code: string;
  state: PairingState;
} {
  const randomInt =
    options.randomInt ?? ((min, max) => cryptoRandomInt(min, max));
  const randomBytes = options.randomBytes ?? cryptoRandomBytes;
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(
    CODE_DIGITS,
    "0",
  );
  const salt = randomBytes(SALT_BYTES).toString("hex");
  return {
    code,
    state: {
      version: 1,
      salt,
      codeHash: hashCode(salt, code),
      expiresAt: options.now + PAIRING_CODE_LIFETIME_MS,
      attempts: 0,
      dead: false,
      used: false,
      generatedAt: options.now,
    },
  };
}

/**
 * Whether a code hashes to the state's `codeHash` (constant-time compare).
 * Says nothing about expiry, attempts or use.
 *
 * @param state - Persisted pairing state.
 * @param code - Candidate code.
 * @returns True when the hash matches.
 */
export function codeMatchesState(state: PairingState, code: string): boolean {
  const expected = Buffer.from(state.codeHash, "hex");
  const actual = Buffer.from(hashCode(state.salt, code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Milliseconds left before the code expires; 0 at and after expiry.
 *
 * @param state - Persisted pairing state.
 * @param now - Current epoch ms.
 * @returns Non-negative remaining milliseconds.
 */
export function remaining(state: PairingState, now: number): number {
  return Math.max(0, state.expiresAt - now);
}

/**
 * Writes the state atomically (temp file with mode 0600, then rename).
 *
 * @param dir - Sharing directory.
 * @param state - State replacing whatever the file held.
 */
export function writePairingState(dir: string, state: PairingState): void {
  const target = path.join(dir, PAIRING_STATE_FILE);
  const temp = path.join(dir, `${PAIRING_STATE_FILE}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, target);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * Narrow guard for the persisted shape.
 *
 * @param value - Parsed JSON.
 * @returns True when it is a version-1 `PairingState`.
 */
function isPairingState(value: unknown): value is PairingState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const isHex = (x: unknown): x is string =>
    typeof x === "string" && /^[0-9a-f]+$/.test(x);
  const isNum = (x: unknown): x is number =>
    typeof x === "number" && Number.isFinite(x);
  return (
    v.version === 1 &&
    isHex(v.salt) &&
    isHex(v.codeHash) &&
    isNum(v.expiresAt) &&
    isNum(v.attempts) &&
    typeof v.dead === "boolean" &&
    typeof v.used === "boolean" &&
    isNum(v.generatedAt)
  );
}

/**
 * Reads the pairing-state file. A missing file is `absent`; anything that
 * cannot be read, parsed or validated is `corrupt`, never `absent`.
 *
 * @param dir - Sharing directory.
 * @returns The read outcome.
 */
export function readPairingState(dir: string): PairingStateRead {
  const target = path.join(dir, PAIRING_STATE_FILE);
  let text: string;
  try {
    text = fs.readFileSync(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { kind: "absent" };
    return { kind: "corrupt" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "corrupt" };
  }
  return isPairingState(parsed)
    ? { kind: "ok", state: parsed }
    : { kind: "corrupt" };
}
