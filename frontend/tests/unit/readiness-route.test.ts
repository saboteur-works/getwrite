/**
 * Feature 80, Task 9: the readiness identity route. The desktop main process
 * sends a fresh random challenge and accepts the forked server only if the
 * answer is the HMAC of that challenge keyed by a per-launch value the server
 * received in its environment. The value itself is never transmitted.
 *
 * No test name, message or assertion prints a key or a window secret.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../app/api/sharing/ready/route";
import {
  READINESS_KEY_ENV,
  computeReadinessProof,
  isValidChallenge,
} from "../../src/lib/readiness/readiness-proof";

const KEY = "k".repeat(64);
const CHALLENGE = "ab".repeat(32);
/** The same literal is pinned in electron/tests/readiness-identity.test.ts. */
const PINNED_PROOF =
  "2abeeb00eb3328f6fe38384642a3cf83b2af70b1a9c7d61f5ac20aacff8908d5";

function call(
  challenge: string | null,
  headers: Record<string, string> = {},
): Promise<Response> {
  const query = challenge === null ? "" : `?challenge=${challenge}`;
  return Promise.resolve(
    GET(
      new Request(`http://localhost:7340/api/sharing/ready${query}`, {
        headers,
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readiness proof", () => {
  it("names the environment variable the main process sets", () => {
    expect(READINESS_KEY_ENV).toBe("GETWRITE_READINESS_KEY");
  });

  it("matches the pinned test vector shared with the desktop side", () => {
    expect(computeReadinessProof(KEY, CHALLENGE)).toBe(PINNED_PROOF);
  });

  it("differs per challenge and per key, and never contains either", () => {
    const other = "cd".repeat(32);
    const proof = computeReadinessProof(KEY, CHALLENGE);
    expect(computeReadinessProof(KEY, other)).not.toBe(proof);
    expect(computeReadinessProof("j".repeat(64), CHALLENGE)).not.toBe(proof);
    expect(proof).not.toContain(KEY);
    expect(proof).not.toContain(CHALLENGE);
  });

  it("accepts exactly 64 lowercase hex characters as a challenge", () => {
    expect(isValidChallenge(CHALLENGE)).toBe(true);
    for (const bad of [
      "",
      "ab".repeat(31),
      "ab".repeat(33),
      "AB".repeat(32),
      "zz".repeat(32),
      `${CHALLENGE}\n`,
    ]) {
      expect(isValidChallenge(bad)).toBe(false);
    }
  });
});

describe("GET /api/sharing/ready", () => {
  it("answers 404 with no proof when the server was given no key", async () => {
    const res = await call(CHALLENGE);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not-available" });
  });

  it("answers 404 when the key is empty", async () => {
    vi.stubEnv(READINESS_KEY_ENV, "");
    expect((await call(CHALLENGE)).status).toBe(404);
  });

  it("answers the proof of the challenge, and only that", async () => {
    vi.stubEnv(READINESS_KEY_ENV, KEY);
    const res = await call(CHALLENGE);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ proof: PINNED_PROOF });
  });

  it("refuses a missing or malformed challenge with a fixed 400", async () => {
    vi.stubEnv(READINESS_KEY_ENV, KEY);
    for (const bad of [null, "abc", "AB".repeat(32), "ab".repeat(100)]) {
      const res = await call(bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid-challenge" });
    }
  });

  it("does not echo the key, and does not vary with the window header, the window secret or any other header", async () => {
    vi.stubEnv(READINESS_KEY_ENV, KEY);
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "w".repeat(64));
    const plain = await (await call(CHALLENGE)).text();
    const withRightHeader = await (
      await call(CHALLENGE, { "x-getwrite-window": "w".repeat(64) })
    ).text();
    const withWrongHeader = await (
      await call(CHALLENGE, {
        "x-getwrite-window": "x".repeat(64),
        cookie: "getwrite_device=anything",
        "x-getwrite-classification": "window",
      })
    ).text();
    expect(withRightHeader).toBe(plain);
    expect(withWrongHeader).toBe(plain);
    expect(plain).not.toContain(KEY);
    expect(plain).not.toContain("w".repeat(64));
  });

  it("is independent of the window secret: the same key gives the same proof with no secret set", async () => {
    vi.stubEnv(READINESS_KEY_ENV, KEY);
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "");
    expect(await (await call(CHALLENGE)).json()).toEqual({
      proof: PINNED_PROOF,
    });
  });

  it("exports only a GET handler and imports nothing from lib/sharing", async () => {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(
      new URL("../../app/api/sharing/ready/route.ts", import.meta.url),
      "utf8",
    );
    expect(text).not.toMatch(
      /export (async )?(function|const) (POST|PUT|PATCH|DELETE)\b/,
    );
    expect(text).not.toMatch(/lib\/sharing\//);
    expect(text).not.toMatch(
      /WINDOW|credential|storage-context|withStorageContext/i,
    );
  });
});
