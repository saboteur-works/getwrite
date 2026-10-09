// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

import * as pairingVerify from "../../src/lib/sharing/pairing-verify";
import {
  CREDENTIALS_FILE_NAME,
  readCredentialStore,
} from "../../src/lib/sharing/credential-store";
import { classifyRequest } from "../../src/lib/sharing/classify-request";
import { POST } from "../../app/api/sharing/pair/route";

const CODE = "123456";
const SALT = "00112233445566778899aabbccddeeff";
const HOST = "192.168.1.20:3000";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

let dir: string;

async function writeState(patch: Record<string, unknown> = {}): Promise<void> {
  const codeHash = createHmac("sha256", Buffer.from(SALT, "hex"))
    .update(CODE)
    .digest("hex");
  await writeFile(
    path.join(dir, pairingVerify.PAIRING_STATE_FILE),
    JSON.stringify({
      version: 1,
      salt: SALT,
      codeHash,
      expiresAt: Date.now() + 5 * 60_000,
      attempts: 0,
      dead: false,
      used: false,
      generatedAt: 1,
      ...patch,
    }),
  );
}

function pairRequest(
  body: string | undefined,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://${HOST}/api/sharing/pair`, {
    method: "POST",
    body,
    headers: {
      host: HOST,
      origin: `http://${HOST}`,
      "user-agent": IPAD_UA,
      "content-type": "application/json",
      ...headers,
    },
  });
}

const submit = (code: unknown): NextRequest =>
  pairRequest(JSON.stringify({ code }));

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "gw-pairroute-"));
  vi.stubEnv("GETWRITE_SHARING", "1");
  vi.stubEnv("GETWRITE_SHARING_DIR", dir);
  vi.stubEnv("GETWRITE_WINDOW_SECRET", "window-secret-for-tests");
  await writeState();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("POST /api/sharing/pair", () => {
  it("a valid code returns 200 { ok: true } and sets the device cookie", async () => {
    const res = await POST(submit(CODE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^getwrite_device=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).not.toMatch(/Max-Age/i);
    expect(cookie).not.toMatch(/Expires/i);
  });

  it("never puts the token or a hash in the body, and stores a hash with a name from the User-Agent", async () => {
    const res = await POST(submit(CODE));
    const text = await res.clone().text();
    const token = /getwrite_device=([^;]+)/.exec(
      res.headers.get("set-cookie") ?? "",
    )?.[1];
    expect(token).toBeDefined();
    expect(text).not.toContain(token as string);
    expect(text).not.toMatch(/[0-9a-f]{64}/);

    const state = await readCredentialStore(dir);
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0].name).toBe("Safari on iPad");
    expect(state.devices[0].credentialHash).toMatch(/^[0-9a-f]{64}$/);
    const raw = await readFile(path.join(dir, CREDENTIALS_FILE_NAME), "utf8");
    expect(raw).not.toContain(token as string);
  });

  it("never reads the device name from the request body", async () => {
    const res = await POST(
      pairRequest(
        JSON.stringify({ code: CODE, name: "Evil", deviceName: "X" }),
      ),
    );
    expect(res.status).toBe(200);
    const state = await readCredentialStore(dir);
    if (state.kind !== "ok") throw new Error("store not ok");
    expect(state.devices[0].name).toBe("Safari on iPad");
  });

  it("a minted credential is classified confirmed", async () => {
    const res = await POST(submit(CODE));
    const token = /getwrite_device=([^;]+)/.exec(
      res.headers.get("set-cookie") ?? "",
    )?.[1] as string;
    const store = await readCredentialStore(dir);
    const result = classifyRequest({
      headers: new Headers(),
      cookies: {
        get: (n) => (n === "getwrite_device" ? { value: token } : undefined),
      },
      method: "GET",
      env: {
        GETWRITE_SHARING: "1",
        GETWRITE_SHARING_DIR: dir,
        GETWRITE_WINDOW_SECRET: "window-secret-for-tests",
      },
      store,
    });
    expect(result.kind).toBe("confirmed");
  });

  it("a wrong code returns 400 { ok: false, reason: 'wrong' } and sets no cookie", async () => {
    const res = await POST(submit("000000"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "wrong" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["expired", { expiresAt: 1 }],
    ["used", { used: true }],
    ["dead", { dead: true }],
  ])("a %s code returns 400 unusable", async (_label, patch) => {
    await writeState(patch);
    const res = await POST(submit(CODE));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "unusable" });
  });

  it("expired, used and over-limit responses are byte-identical", async () => {
    const bodies: string[] = [];
    for (const patch of [
      { expiresAt: 1 },
      { used: true },
      { attempts: 5, dead: true },
    ]) {
      await writeState(patch);
      const res = await POST(submit(CODE));
      bodies.push(`${res.status} ${await res.text()}`);
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it("missing pairing state returns unusable", async () => {
    await rm(path.join(dir, pairingVerify.PAIRING_STATE_FILE));
    const res = await POST(submit(CODE));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "unusable" });
  });

  it("a corrupt credential store returns unusable and the code is not consumed", async () => {
    await writeFile(path.join(dir, CREDENTIALS_FILE_NAME), "{not json");
    const res = await POST(submit(CODE));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "unusable" });
    const state = JSON.parse(
      await readFile(path.join(dir, pairingVerify.PAIRING_STATE_FILE), "utf8"),
    ) as { used: boolean };
    expect(state.used).toBe(false);
  });

  it("returns unusable when the sharing directory is not configured", async () => {
    vi.stubEnv("GETWRITE_SHARING_DIR", "");
    const res = await POST(submit(CODE));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "unusable" });
  });

  it.each([
    ["a non-JSON body", "not json"],
    ["a missing code", JSON.stringify({})],
    ["a numeric code", JSON.stringify({ code: 123456 })],
    ["a null body", "null"],
    ["an empty body", undefined],
  ])("%s returns 400 wrong without reading the state", async (_l, body) => {
    const verify = vi.spyOn(pairingVerify, "verifyAndConsume");
    const res = await POST(pairRequest(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "wrong" });
    expect(verify).not.toHaveBeenCalled();
    const state = JSON.parse(
      await readFile(path.join(dir, pairingVerify.PAIRING_STATE_FILE), "utf8"),
    ) as { attempts: number };
    expect(state.attempts).toBe(0);
  });

  it("5 wrong submissions kill the code; the correct code is then unusable", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(submit("000000"));
      expect(await res.json()).toEqual({ ok: false, reason: "wrong" });
    }
    const res = await POST(submit(CODE));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "unusable" });
  });

  it("a cross-origin request is refused before verification", async () => {
    const verify = vi.spyOn(pairingVerify, "verifyAndConsume");
    const res = await POST(
      pairRequest(JSON.stringify({ code: CODE }), {
        origin: "http://evil.example",
      }),
    );
    expect(res.status).toBe(403);
    expect(verify).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a request with neither Origin nor Referer is refused before verification", async () => {
    const verify = vi.spyOn(pairingVerify, "verifyAndConsume");
    const req = new NextRequest(`http://${HOST}/api/sharing/pair`, {
      method: "POST",
      body: JSON.stringify({ code: CODE }),
      headers: { host: HOST },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns 404 with no body detail when sharing is off", async () => {
    vi.stubEnv("GETWRITE_SHARING", "0");
    const verify = vi.spyOn(pairingVerify, "verifyAndConsume");
    const res = await POST(submit(CODE));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    const store = await readCredentialStore(dir);
    expect(store.kind).toBe("empty");
  });

  it("reports an I/O failure as a 500, not as an answer about the code", async () => {
    vi.spyOn(pairingVerify, "verifyAndConsume").mockRejectedValue(
      new Error("disk failure"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await POST(submit(CODE));
    expect(res.status).toBe(500);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("logs no code, token or hash", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    vi.spyOn(pairingVerify, "verifyAndConsume").mockRejectedValueOnce(
      new Error("disk failure"),
    );
    await POST(submit(CODE));
    await POST(submit("000000"));
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(CODE);
    expect(logged).not.toMatch(/[0-9a-f]{64}/);
  });
});
