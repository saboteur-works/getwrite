import { describe, it, expect, vi } from "vitest";
import { checkForUpdate } from "../src/lib/models/update-check";

function makeRelease(overrides: Record<string, unknown> = {}): unknown {
  return {
    tag_name: "v0.3.0",
    html_url: "https://github.com/saboteur-works/getwrite/releases/tag/v0.3.0",
    draft: false,
    prerelease: false,
    assets: [
      {
        name: "GetWrite-0.3.0-arm64.dmg",
        browser_download_url: "https://example.com/GetWrite-0.3.0-arm64.dmg",
      },
      {
        name: "GetWrite-Setup-0.3.0.exe",
        browser_download_url: "https://example.com/GetWrite-Setup-0.3.0.exe",
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe("checkForUpdate", () => {
  it("reports an available update with release and platform-matched download URLs", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(makeRelease()));
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "darwin",
      fetchImpl,
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.currentVersion).toBe("0.2.49");
    expect(result.latestVersion).toBe("0.3.0");
    expect(result.releaseUrl).toBe(
      "https://github.com/saboteur-works/getwrite/releases/tag/v0.3.0",
    );
    expect(result.downloadUrl).toBe(
      "https://example.com/GetWrite-0.3.0-arm64.dmg",
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/saboteur-works/getwrite/releases/latest",
      expect.any(Object),
    );
  });

  it("picks the Windows asset on win32", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(makeRelease()));
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "win32",
      fetchImpl,
    });
    expect(result.downloadUrl).toBe(
      "https://example.com/GetWrite-Setup-0.3.0.exe",
    );
  });

  it("falls back to the release page when no asset matches the platform", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(makeRelease({ assets: [] })),
    );
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "darwin",
      fetchImpl,
    });
    expect(result.updateAvailable).toBe(true);
    expect(result.downloadUrl).toBe(
      "https://github.com/saboteur-works/getwrite/releases/tag/v0.3.0",
    );
  });

  it("reports no update when the latest is not newer than current", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(makeRelease({ tag_name: "v0.2.49" })),
    );
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "darwin",
      fetchImpl,
    });
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe("0.2.49");
  });

  it("ignores draft/prerelease payloads", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(makeRelease({ prerelease: true })),
    );
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "darwin",
      fetchImpl,
    });
    expect(result.updateAvailable).toBe(false);
  });

  it("returns updateAvailable:false on a non-200 response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503));
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "darwin",
      fetchImpl,
    });
    expect(result.updateAvailable).toBe(false);
  });

  it("returns updateAvailable:false when fetch throws (offline)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "darwin",
      fetchImpl,
    });
    expect(result.updateAvailable).toBe(false);
  });

  it("returns updateAvailable:false on an unparseable body", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bad json");
          },
        }) as unknown as Response,
    );
    const result = await checkForUpdate({
      currentVersion: "0.2.49",
      repo: "saboteur-works/getwrite",
      platform: "darwin",
      fetchImpl,
    });
    expect(result.updateAvailable).toBe(false);
  });
});
