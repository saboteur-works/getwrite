import type { Argon2Params } from "../../src/lib/models/crypto/primitives";

/**
 * Argon2id parameters for tests.
 *
 * Production uses `DEFAULT_ARGON2_PARAMS` (m=19456 KiB, t=2, p=1 — the OWASP
 * minimum), which is *meant* to be expensive: measured on 2026-09-16 at
 * **383ms per derivation**, with 148 derivations across the encryption suite
 * costing 56.7s of CPU — essentially the whole runtime of those files.
 *
 * These parameters measure **1.00ms** per derivation, a 320x reduction, and
 * are deliberately far too weak for real use.
 *
 * This is safe to use wherever a test needs *a* key rather than a
 * *hard-to-attack* key, which is almost everywhere: the cost parameters do not
 * change the derivation's output shape, the envelope format, the wrapping, or
 * any error path. The exceptions are the tests that assert on the production
 * profile itself (`crypto-primitives.test.ts`, `keyring.test.ts`), which must
 * keep using `DEFAULT_ARGON2_PARAMS` — checking that the shipped cost is the
 * OWASP minimum is exactly their job.
 *
 * `unlockKeyring` reads the cost parameters back out of the stored keyring
 * rather than assuming the default, so a keyring created with these unlocks
 * cheaply too, with no further plumbing at the unlock site.
 */
export const TEST_ARGON2_PARAMS: Argon2Params = {
  memoryKiB: 64,
  iterations: 1,
  parallelism: 1,
};
