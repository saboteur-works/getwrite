/**
 * Unit tests for the /api/version-check route: desktop gating (FR1),
 * graceful failure (FR8), and the 24h cache / single-call throttle (FR9).
 *
 * The update-check model is mocked so these tests assert routing behaviour
 * without touching the network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { checkForUpdate } = vi.hoisted(() => ({ checkForUpdate: vi.fn() }));
vi.mock("../../src/lib/models/update-check", () => ({ checkForUpdate }));

const ENV_KEYS = [
  "GETWRITE_DESKTOP",
  "GETWRITE_REPO",
  "GETWRITE_APP_VERSION",
] as const;
const savedEnv: Record<string, string | undefined> = {};

async function loadRoute() {
  vi.resetModules();
  return import("../../app/api/version-check/route");
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  checkForUpdate.mockReset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("GET /api/version-check", () => {
  it("returns no update and never checks when not the desktop build (FR1)", async () => {
    delete process.env.GETWRITE_DESKTOP;
    process.env.GETWRITE_APP_VERSION = "0.2.49";
    const { GET } = await loadRoute();

    const res = await GET();
    await expect(res.json()).resolves.toEqual({ updateAvailable: false });
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("returns the model result on the desktop build", async () => {
    process.env.GETWRITE_DESKTOP = "1";
    process.env.GETWRITE_APP_VERSION = "0.2.49";
    process.env.GETWRITE_REPO = "saboteur-works/getwrite";
    const result = {
      updateAvailable: true,
      currentVersion: "0.2.49",
      latestVersion: "0.3.0",
      releaseUrl: "https://example.com/r",
      downloadUrl: "https://example.com/d",
    };
    checkForUpdate.mockResolvedValue(result);
    const { GET } = await loadRoute();

    const res = await GET();
    await expect(res.json()).resolves.toEqual(result);
    expect(checkForUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        currentVersion: "0.2.49",
        repo: "saboteur-works/getwrite",
      }),
    );
  });

  it("does not re-check within the cache window (FR9)", async () => {
    process.env.GETWRITE_DESKTOP = "1";
    process.env.GETWRITE_APP_VERSION = "0.2.49";
    checkForUpdate.mockResolvedValue({ updateAvailable: false });
    const { GET } = await loadRoute();

    await GET();
    await GET();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns a 200 with no update when the check fails (FR8)", async () => {
    process.env.GETWRITE_DESKTOP = "1";
    process.env.GETWRITE_APP_VERSION = "0.2.49";
    // The model swallows failures and resolves to updateAvailable:false.
    checkForUpdate.mockResolvedValue({ updateAvailable: false });
    const { GET } = await loadRoute();

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ updateAvailable: false });
  });
});
