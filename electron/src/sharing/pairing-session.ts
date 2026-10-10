/**
 * @module pairing-session
 *
 * Holds the current plain pairing code in memory so the window can display it
 * (FR-13). Only a hash is persisted (by `pairing-code.ts`). After a main
 * restart there is no in-memory code, so `get()` is null. Nothing here logs.
 */
import {
  PAIRING_CODE_LIFETIME_MS,
  generatePairingCode,
  writePairingState,
} from "./pairing-code";

/** What the window may be told about the current code. */
export interface PairingCodeInfo {
  code: string;
  generatedAt: number;
  expiresAt: number;
}

/** The in-memory pairing-code holder. */
export interface PairingSession {
  /** Generates a new code, replacing the persisted state and the held code. */
  generate(): PairingCodeInfo;
  /** The held code (possibly expired), or null when none is held. */
  get(): PairingCodeInfo | null;
}

/**
 * @param dir - Sharing directory (`userData`).
 * @param now - Clock returning epoch ms.
 * @returns A session. A failed write throws and leaves the held code as it was.
 */
export function createPairingSession(
  dir: string,
  now: () => number,
): PairingSession {
  let held: PairingCodeInfo | null = null;
  return {
    generate(): PairingCodeInfo {
      const { code, state } = generatePairingCode({ now: now() });
      writePairingState(dir, state);
      held = {
        code,
        generatedAt: state.generatedAt,
        expiresAt: state.generatedAt + PAIRING_CODE_LIFETIME_MS,
      };
      return held;
    },
    get: () => held,
  };
}
