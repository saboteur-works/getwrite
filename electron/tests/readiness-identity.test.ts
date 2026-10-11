/**
 * Feature 80, Task 9: the per-launch readiness identity (key, challenge,
 * proof). No test prints a key.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  READINESS_KEY_ENV,
  READINESS_PATH,
  computeReadinessProof,
  createChallenge,
  createReadinessKey,
  verifyReadinessProof,
} from "../src/sharing/readiness-identity";

const KEY = "k".repeat(64);
const CHALLENGE = "ab".repeat(32);
/** The same literal is pinned in frontend/tests/unit/readiness-route.test.ts. */
const PINNED_PROOF =
  "2abeeb00eb3328f6fe38384642a3cf83b2af70b1a9c7d61f5ac20aacff8908d5";

describe("readiness identity", () => {
  it("names the env variable and the route the server side uses", () => {
    expect(READINESS_KEY_ENV).toBe("GETWRITE_READINESS_KEY");
    expect(READINESS_PATH).toBe("/api/sharing/ready");
  });

  it("creates the key and the challenge as 32 random bytes in hex", () => {
    const bytes = (size: number): Buffer => Buffer.alloc(size, 0xab);
    expect(createReadinessKey(bytes)).toBe("ab".repeat(32));
    expect(createChallenge(bytes)).toBe("ab".repeat(32));
  });

  it("computes the proof the server computes (pinned shared test vector)", () => {
    expect(computeReadinessProof(KEY, CHALLENGE)).toBe(PINNED_PROOF);
  });

  it("accepts only the proof of that challenge under that key", () => {
    expect(verifyReadinessProof(KEY, CHALLENGE, PINNED_PROOF)).toBe(true);
    expect(verifyReadinessProof(KEY, "cd".repeat(32), PINNED_PROOF)).toBe(
      false,
    );
    expect(verifyReadinessProof("j".repeat(64), CHALLENGE, PINNED_PROOF)).toBe(
      false,
    );
    expect(verifyReadinessProof(KEY, CHALLENGE, KEY)).toBe(false);
    expect(verifyReadinessProof(KEY, CHALLENGE, CHALLENGE)).toBe(false);
    expect(verifyReadinessProof(KEY, CHALLENGE, "")).toBe(false);
    expect(verifyReadinessProof(KEY, CHALLENGE, PINNED_PROOF.slice(1))).toBe(
      false,
    );
    expect(
      verifyReadinessProof(KEY, CHALLENGE, PINNED_PROOF.toUpperCase()),
    ).toBe(false);
  });

  it("takes no logger and never logs", () => {
    const src = readFileSync(
      path.join(__dirname, "../src/sharing/readiness-identity.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/\blog\(/);
  });
});
