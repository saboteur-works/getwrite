/**
 * GET /api/sharing/limits (Feature 77, Task 13; FR-16 to FR-19). The role the
 * gate forwarded decides the answer: window and off are exempt and never read
 * the limits file; a confirmed device gets the five limits read fresh; a
 * missing or unparseable classification gets every limit on without a read.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLASSIFICATION_HEADER } from "../../src/lib/sharing/classify-request";
import {
  LIMITS_FILE_NAME,
  readLimits,
} from "../../src/lib/sharing/limits-store";

vi.mock("../../src/lib/sharing/limits-store", async (importActual) => {
  const actual =
    await importActual<typeof import("../../src/lib/sharing/limits-store")>();
  return { ...actual, readLimits: vi.fn(actual.readLimits) };
});

const ALL_ON = {
  projectDeletion: true,
  unlocking: true,
  locking: true,
  encryptionChanges: true,
  permanentDeletion: true,
};
const ALL_OFF = {
  projectDeletion: false,
  unlocking: false,
  locking: false,
  encryptionChanges: false,
  permanentDeletion: false,
};

let dir: string;

function writeLimits(limits: Record<string, boolean>): void {
  fs.writeFileSync(
    path.join(dir, LIMITS_FILE_NAME),
    JSON.stringify({ version: 1, limits }),
  );
}

async function ask(header: string | null): Promise<Response> {
  const { GET } = await import("../../app/api/sharing/limits/route");
  const headers: Record<string, string> = {};
  if (header !== null) headers[CLASSIFICATION_HEADER] = header;
  return GET(
    new Request("http://127.0.0.1:3000/api/sharing/limits", { headers }),
  );
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-limits-route-"));
  vi.stubEnv("GETWRITE_SHARING_DIR", dir);
  vi.mocked(readLimits).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/sharing/limits", () => {
  it.each(["off", "window"])(
    "answers exempt for %s without reading the limits file",
    async (header) => {
      writeLimits(ALL_ON);
      const res = await ask(header);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ role: "exempt" });
      expect(readLimits).not.toHaveBeenCalled();
    },
  );

  it("answers paired with the five limits for a confirmed device", async () => {
    writeLimits({ ...ALL_OFF, locking: true });
    const res = await ask("confirmed:device-1");
    expect(await res.json()).toEqual({
      role: "paired",
      limits: { ...ALL_OFF, locking: true },
    });
    expect(readLimits).toHaveBeenCalledTimes(1);
  });

  it("reads fresh on each call: a changed file changes the answer", async () => {
    writeLimits(ALL_ON);
    expect(await (await ask("confirmed:d")).json()).toEqual({
      role: "paired",
      limits: ALL_ON,
    });
    writeLimits(ALL_OFF);
    expect(await (await ask("confirmed:d")).json()).toEqual({
      role: "paired",
      limits: ALL_OFF,
    });
    expect(readLimits).toHaveBeenCalledTimes(2);
  });

  it("answers paired with every limit on when the file is missing", async () => {
    const res = await ask("confirmed:d");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "paired", limits: ALL_ON });
  });

  it("answers paired with every limit on when the file is unparseable", async () => {
    fs.writeFileSync(path.join(dir, LIMITS_FILE_NAME), "{ not json");
    const res = await ask("confirmed:d");
    expect(await res.json()).toEqual({ role: "paired", limits: ALL_ON });
  });

  it.each([null, "", "garbage", "confirmed:", "WINDOW"])(
    "answers paired with every limit on for classification %j without reading the file",
    async (header) => {
      writeLimits(ALL_OFF);
      const res = await ask(header);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ role: "paired", limits: ALL_ON });
      expect(readLimits).not.toHaveBeenCalled();
    },
  );

  it("sends Cache-Control no-store", async () => {
    for (const header of ["off", "confirmed:d", null]) {
      const res = await ask(header);
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("is force-dynamic", async () => {
    const mod = await import("../../app/api/sharing/limits/route");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
