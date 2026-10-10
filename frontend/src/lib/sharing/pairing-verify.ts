/**
 * Server-side pairing-code verification (Feature 75, FR-14, FR-15, FR-16).
 *
 * Reads `pairing-state.json` (written by the Electron main process, see
 * `electron/src/sharing/pairing-code.ts`; the shared format is pinned by the
 * fixtures in `frontend/tests/fixtures/sharing/`), checks a submitted code,
 * and records the outcome. Wrong attempts are counted per code, not per
 * caller, under an exclusive lock file. No state is held in module variables.
 *
 * The result distinguishes `wrong` (the code was unsuitable but the state is
 * still live) from `unusable` (nothing can be confirmed against this state).
 * The `reason` on `unusable` is for server logging only and must never be sent
 * to the browser (FR-11). No result or error carries a code, hash or salt.
 */
import { readFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";

import { LOCK_SUFFIX, withFileLock, writeFileAtomically } from "./file-lock";

export const PAIRING_STATE_FILE = "pairing-state.json";
/** A code dies on its 5th wrong attempt (FR-16). */
export const MAX_WRONG_ATTEMPTS = 5;

const CODE_PATTERN = /^[0-9]{6}$/;

const PairingStateSchema = z.object({
  version: z.literal(1),
  salt: z.string().regex(/^(?:[0-9a-f]{2})+$/),
  codeHash: z.string().regex(/^[0-9a-f]{64}$/),
  expiresAt: z.number().finite(),
  attempts: z.number().int().nonnegative(),
  dead: z.boolean(),
  used: z.boolean(),
  generatedAt: z.number().finite(),
});

type PairingState = z.infer<typeof PairingStateSchema>;

type UnusableReason =
  | "missing"
  | "corrupt"
  | "expired"
  | "dead"
  | "used"
  | "superseded";

export type PairingVerifyResult =
  | { kind: "confirmed" }
  | { kind: "wrong" }
  | { kind: "unusable"; reason: UnusableReason };

export interface VerifyOptions {
  /** Test seam: runs after the decision and before the write, under the lock. */
  beforeWrite?: () => Promise<void>;
}

type StateRead =
  | { kind: "ok"; state: PairingState }
  | { kind: "missing" }
  | { kind: "corrupt" };

async function readState(filePath: string): Promise<StateRead> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { kind: "missing" };
    return { kind: "corrupt" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { kind: "corrupt" };
  }
  const parsed = PairingStateSchema.safeParse(json);
  return parsed.success
    ? { kind: "ok", state: parsed.data }
    : { kind: "corrupt" };
}

function codeMatches(state: PairingState, code: string): boolean {
  const expected = Buffer.from(state.codeHash, "hex");
  const actual = createHmac("sha256", Buffer.from(state.salt, "hex"))
    .update(code)
    .digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function unusableReason(
  state: PairingState,
  now: number,
): UnusableReason | undefined {
  if (state.used) return "used";
  if (state.dead) return "dead";
  if (now >= state.expiresAt) return "expired";
  return undefined;
}

function nextState(
  state: PairingState,
  code: string,
): { result: PairingVerifyResult; state: PairingState } {
  if (CODE_PATTERN.test(code) && codeMatches(state, code)) {
    return { result: { kind: "confirmed" }, state: { ...state, used: true } };
  }
  const attempts = state.attempts + 1;
  return {
    result: { kind: "wrong" },
    state: { ...state, attempts, dead: attempts >= MAX_WRONG_ATTEMPTS },
  };
}

async function decideAndWrite(
  filePath: string,
  code: string,
  now: number,
  options: VerifyOptions,
): Promise<PairingVerifyResult> {
  const first = await readState(filePath);
  if (first.kind !== "ok") return { kind: "unusable", reason: first.kind };
  const reason = unusableReason(first.state, now);
  if (reason) return { kind: "unusable", reason };

  const { result, state } = nextState(first.state, code);
  if (options.beforeWrite) await options.beforeWrite();

  // Main may have replaced the file with a new code since the read above;
  // never write the old state over it.
  const again = await readState(filePath);
  if (
    again.kind !== "ok" ||
    again.state.generatedAt !== first.state.generatedAt
  )
    return { kind: "unusable", reason: "superseded" };

  await writeFileAtomically(filePath, `${JSON.stringify(state, null, 2)}\n`);
  return result;
}

/**
 * Check `submittedCode` against the pairing state in `dir` and record the
 * outcome. `now` is epoch milliseconds. Never returns `confirmed` unless the
 * state was live, the code matched, and `used: true` was persisted.
 */
export async function verifyAndConsume(
  dir: string,
  submittedCode: string,
  now: number,
  options: VerifyOptions = {},
): Promise<PairingVerifyResult> {
  const filePath = path.join(dir, PAIRING_STATE_FILE);
  try {
    return await withFileLock(`${filePath}${LOCK_SUFFIX}`, () =>
      decideAndWrite(filePath, submittedCode, now, options),
    );
  } catch (error) {
    // No directory means no pairing state (nothing to lock); anything else
    // propagates so a failed check is never mistaken for an answer.
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { kind: "unusable", reason: "missing" };
    throw error;
  }
}
