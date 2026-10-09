import { describe, expect, it } from "vitest";

import {
  CLASSIFICATION_HEADER,
  DEVICE_COOKIE,
  WINDOW_HEADER,
  classifyRequest,
  parseClassification,
  serializeClassification,
  type Classification,
} from "../../src/lib/sharing/classify-request";
import { mintCredential } from "../../src/lib/sharing/credential-store";
import type { CredentialStoreState } from "../../src/lib/sharing/credential-store";

const SECRET = "s".repeat(64);
const ON = { GETWRITE_SHARING: "1", GETWRITE_WINDOW_SECRET: SECRET };
const EMPTY: CredentialStoreState = { kind: "empty" };

function cookies(map: Record<string, string>): {
  get(n: string): { value: string } | undefined;
} {
  return { get: (n) => (n in map ? { value: map[n] } : undefined) };
}

function classify(
  over: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    env?: Record<string, string | undefined>;
    store?: CredentialStoreState;
    method?: string;
  } = {},
): Classification {
  return classifyRequest({
    headers: new Headers(over.headers ?? {}),
    cookies: cookies(over.cookies ?? {}),
    method: over.method ?? "GET",
    env: over.env ?? ON,
    store: over.store ?? EMPTY,
  });
}

describe("constants", () => {
  it("names the window header and device cookie", () => {
    expect(WINDOW_HEADER).toBe("x-getwrite-window");
    expect(DEVICE_COOKIE).toBe("getwrite_device");
    expect(CLASSIFICATION_HEADER).not.toBe(WINDOW_HEADER);
  });
});

describe("classifyRequest, sharing off", () => {
  it("is off for every input when GETWRITE_SHARING is unset or not 1", () => {
    for (const flag of [undefined, "0", "", "true", "01"]) {
      const env = { GETWRITE_SHARING: flag, GETWRITE_WINDOW_SECRET: SECRET };
      expect(classify({ env, headers: { [WINDOW_HEADER]: SECRET } })).toEqual({
        kind: "off",
      });
      expect(classify({ env, store: { kind: "corrupt" } })).toEqual({
        kind: "off",
      });
    }
  });
});

describe("classifyRequest, window", () => {
  it("accepts the correct window header", () => {
    expect(classify({ headers: { [WINDOW_HEADER]: SECRET } })).toEqual({
      kind: "window",
    });
  });
  it("rejects wrong, empty and different-length values", () => {
    for (const v of ["x".repeat(64), "", SECRET.slice(1), SECRET + "a"]) {
      expect(classify({ headers: { [WINDOW_HEADER]: v } }).kind).toBe(
        "not-confirmed",
      );
    }
  });
  it("fails closed when the secret is missing or empty in env", () => {
    for (const s of [undefined, ""]) {
      const env = { GETWRITE_SHARING: "1", GETWRITE_WINDOW_SECRET: s };
      expect(classify({ env, headers: { [WINDOW_HEADER]: "" } }).kind).toBe(
        "not-confirmed",
      );
      expect(
        classify({ env, headers: { [WINDOW_HEADER]: "anything" } }).kind,
      ).toBe("not-confirmed");
    }
  });
  it("does not treat the secret in a cookie as the window", () => {
    expect(classify({ cookies: { [WINDOW_HEADER]: SECRET } }).kind).toBe(
      "not-confirmed",
    );
  });
  it("treats forged address and origin headers as not confirmed", () => {
    const r = classify({
      headers: {
        "x-forwarded-for": "127.0.0.1",
        host: "localhost",
        origin: "http://localhost:3000",
      },
    });
    expect(r.kind).toBe("not-confirmed");
  });
  it("a window request is still window when the store is corrupt", () => {
    expect(
      classify({
        headers: { [WINDOW_HEADER]: SECRET },
        store: { kind: "corrupt" },
      }),
    ).toEqual({ kind: "window" });
  });
});

describe("classifyRequest, device credential", () => {
  it("confirms a valid device cookie with its id", () => {
    const { token, device } = mintCredential("Safari on iPad");
    const r = classify({
      cookies: { [DEVICE_COOKIE]: token },
      store: { kind: "ok", devices: [device] },
    });
    expect(r).toEqual({ kind: "confirmed", deviceId: device.id });
  });
  it("rejects unknown, empty, malformed and other-install credentials", () => {
    const { device } = mintCredential("a");
    const other = mintCredential("b");
    const store: CredentialStoreState = { kind: "ok", devices: [device] };
    for (const v of ["", "short", "!".repeat(43), other.token]) {
      expect(classify({ cookies: { [DEVICE_COOKIE]: v }, store }).kind).toBe(
        "not-confirmed",
      );
    }
  });
  it("is not confirmed with no cookie", () => {
    expect(classify().kind).toBe("not-confirmed");
  });
  it("a corrupt store makes a non-window request not-confirmed with store-corrupt", () => {
    const { token } = mintCredential("a");
    expect(
      classify({
        cookies: { [DEVICE_COOKIE]: token },
        store: { kind: "corrupt" },
      }),
    ).toEqual({ kind: "not-confirmed", reason: "store-corrupt" });
  });
  it("an empty store gives a non-corrupt reason", () => {
    const r = classify({ cookies: { [DEVICE_COOKIE]: "x" } });
    expect(r.kind).toBe("not-confirmed");
    if (r.kind === "not-confirmed") expect(r.reason).not.toBe("store-corrupt");
  });
});

describe("classification serialization", () => {
  const cases: Classification[] = [
    { kind: "off" },
    { kind: "window" },
    { kind: "confirmed", deviceId: "3f2b9c1e-aaaa-bbbb-cccc-1234567890ab" },
    { kind: "not-confirmed", reason: "store-corrupt" },
    { kind: "not-confirmed", reason: "no-credential" },
  ];
  it("round-trips every kind", () => {
    for (const c of cases) {
      expect(parseClassification(serializeClassification(c))).toEqual(c);
    }
  });
  it("parses unrecognised or empty values to undefined", () => {
    for (const v of [
      "",
      "garbage",
      "confirmed",
      "confirmed:",
      "window:extra",
      "not-confirmed:bogus",
      "{}",
      undefined,
      null,
    ]) {
      expect(parseClassification(v)).toBeUndefined();
    }
  });
});
