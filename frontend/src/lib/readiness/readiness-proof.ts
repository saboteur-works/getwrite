/**
 * Readiness identity for the desktop build (Feature 80, FR-10, FR-11).
 *
 * The Electron main process forks this server with a per-launch key in
 * `GETWRITE_READINESS_KEY`, then asks "are you the server I forked?" by
 * sending a fresh random challenge. The answer is an HMAC of the challenge
 * under that key, so the key itself is never transmitted and a process that
 * never received it cannot produce the answer.
 *
 * The key is unrelated to the window secret: nothing here reads, compares or
 * derives from it. Pure functions; the route supplies the environment.
 */
import { createHmac } from "node:crypto";

/** Environment variable the main process sets for the forked server only. */
export const READINESS_KEY_ENV = "GETWRITE_READINESS_KEY";

/** Domain-separation prefix; the desktop side uses the identical string. */
const PROOF_CONTEXT = "getwrite-ready/1\n";

const CHALLENGE_PATTERN = /^[0-9a-f]{64}$/;

/** True for exactly 64 lowercase hex characters (32 random bytes). */
export function isValidChallenge(value: string): boolean {
  return CHALLENGE_PATTERN.test(value);
}

/**
 * HMAC-SHA256 of the challenge keyed by the per-launch value, as hex.
 *
 * @param key - The per-launch readiness key.
 * @param challenge - A challenge accepted by {@link isValidChallenge}.
 */
export function computeReadinessProof(key: string, challenge: string): string {
  return createHmac("sha256", key)
    .update(PROOF_CONTEXT + challenge)
    .digest("hex");
}
