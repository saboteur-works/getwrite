/**
 * @module readiness-identity
 *
 * How the main process knows the server answering on the port is the one it
 * forked (Feature 80, FR-10, FR-11). A per-launch key is generated here and
 * handed to the forked server's environment only. Each readiness poll sends a
 * fresh random challenge; the server answers with an HMAC of it under the key,
 * so the key itself is never transmitted and a process that never received it
 * cannot produce the answer.
 *
 * The key is unrelated to the window secret and nothing here reads that
 * secret. This module takes no logger and never writes a value anywhere.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Env variable carrying the key to the forked server. */
export const READINESS_KEY_ENV = "GETWRITE_READINESS_KEY";

/** The server route that answers a challenge. */
export const READINESS_PATH = "/api/sharing/ready";

/** Domain-separation prefix; the server side uses the identical string. */
const PROOF_CONTEXT = "getwrite-ready/1\n";

/** Source of random bytes; `crypto.randomBytes` in production. */
export type RandomBytes = (size: number) => Buffer;

/** A new per-launch key: 32 random bytes as 64 hex characters. */
export function createReadinessKey(randomBytes: RandomBytes): string {
  return randomBytes(32).toString("hex");
}

/** A new challenge: 32 random bytes as 64 hex characters. */
export function createChallenge(randomBytes: RandomBytes): string {
  return randomBytes(32).toString("hex");
}

/** HMAC-SHA256 of the challenge under the key, as hex. */
export function computeReadinessProof(key: string, challenge: string): string {
  return createHmac("sha256", key)
    .update(PROOF_CONTEXT + challenge)
    .digest("hex");
}

/** True only when `presented` is exactly the proof of `challenge` under `key`. */
export function verifyReadinessProof(
  key: string,
  challenge: string,
  presented: string,
): boolean {
  const expected = Buffer.from(computeReadinessProof(key, challenge), "utf8");
  const actual = Buffer.from(presented, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
