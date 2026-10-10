import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_MEDIA_FILE_BYTES } from "../../src/lib/models/media-validation";

const ONE_MIB = 1024 * 1024;

/** Imports the resolved Next config fresh, with the given build target. */
async function loadConfig(
  buildTarget: string | undefined,
): Promise<{ experimental?: { proxyClientMaxBodySize?: unknown } }> {
  const previous = process.env.GETWRITE_BUILD_TARGET;
  if (buildTarget === undefined) delete process.env.GETWRITE_BUILD_TARGET;
  else process.env.GETWRITE_BUILD_TARGET = buildTarget;
  try {
    vi.resetModules();
    // @ts-expect-error next.config.mjs is plain JavaScript with no declaration file
    const mod = (await import("../../next.config.mjs")) as {
      default: { experimental?: { proxyClientMaxBodySize?: unknown } };
    };
    return mod.default;
  } finally {
    if (previous === undefined) delete process.env.GETWRITE_BUILD_TARGET;
    else process.env.GETWRITE_BUILD_TARGET = previous;
  }
}

describe("next.config proxyClientMaxBodySize (FR-32)", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("is a number of bytes", async () => {
    const config = await loadConfig(undefined);
    expect(typeof config.experimental?.proxyClientMaxBodySize).toBe("number");
  });

  it("is at least the media cap plus 1 MiB of multipart framing room", async () => {
    const config = await loadConfig(undefined);
    const limit = config.experimental?.proxyClientMaxBodySize as number;
    expect(limit).toBeGreaterThanOrEqual(MAX_MEDIA_FILE_BYTES + ONE_MIB);
  });

  it("is exactly the media cap plus 1 MiB, so the copy in the config cannot drift", async () => {
    const config = await loadConfig(undefined);
    expect(config.experimental?.proxyClientMaxBodySize).toBe(
      MAX_MEDIA_FILE_BYTES + ONE_MIB,
    );
  });

  it("imports no TypeScript file, so it loads on Node versions without type stripping", () => {
    const source = readFileSync(
      path.join(__dirname, "../../next.config.mjs"),
      "utf8",
    );
    const importLines = source
      .split("\n")
      .filter(
        (line) => /^\s*import\b/.test(line) || /\bfrom\s+["']/.test(line),
      );
    expect(importLines.filter((line) => /\.tsx?["']/.test(line))).toEqual([]);
  });

  it("is also present for the native build target", async () => {
    const config = await loadConfig("native");
    const limit = config.experimental?.proxyClientMaxBodySize as number;
    expect(typeof limit).toBe("number");
    expect(limit).toBeGreaterThanOrEqual(MAX_MEDIA_FILE_BYTES + ONE_MIB);
  });
});
