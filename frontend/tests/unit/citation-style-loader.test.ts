/**
 * Feature 116 (Citations at compile), Task 33: bundled style, locale and the
 * style loader (FR-18, FR-20).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const readFileControl = vi.hoisted(() => ({ failFor: null as string | null }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const patched = {
    ...actual,
    readFile: ((...args: Parameters<typeof actual.readFile>) => {
      const target = String(args[0]);
      if (
        readFileControl.failFor !== null &&
        target.endsWith(readFileControl.failFor)
      ) {
        return Promise.reject(new Error(`boom ${target}`));
      }
      return actual.readFile(...args);
    }) as typeof actual.readFile,
  };
  return { ...patched, default: patched };
});

import {
  BUNDLED_STYLE_IDS,
  isBundledStyleId,
  loadBundledStyle,
} from "../../src/lib/citations/style-loader";

// SHA-256 of the upstream files, from the pinned clones recorded in
// specs/features/citations-at-compile/experiments/task-2.md (styles commit
// 3c3995ba, locales commit 14940e56). Task 2 records the commits, not the
// hashes; these were computed from those clones when Task 33 copied them.
const STYLE_SHA256 =
  "4b6be4bceaf8f3c31b49331c9f9e38c977f666d6ab80e19a2ac8482c7511abeb";
const LOCALE_SHA256 =
  "ac864c7c21166b4390d82c31792cdc509400727fa0060b43d8aa17e07f9cb079";

const assetsDir = path.join(__dirname, "../../src/lib/citations/assets");
const sha = (file: string): string =>
  createHash("sha256")
    .update(readFileSync(path.join(assetsDir, file)))
    .digest("hex");

afterEach(() => {
  readFileControl.failFor = null;
  vi.restoreAllMocks();
});

describe("bundled assets", () => {
  it("style file is byte-identical to the pinned upstream file", () => {
    expect(sha("chicago-notes-bibliography.csl")).toBe(STYLE_SHA256);
  });

  it("locale file is byte-identical to the pinned upstream file", () => {
    expect(sha("locales-en-US.xml")).toBe(LOCALE_SHA256);
  });

  it("style keeps its author metadata and share-alike rights line", () => {
    const style = readFileSync(
      path.join(assetsDir, "chicago-notes-bibliography.csl"),
      "utf8",
    );
    expect(style).toContain("<name>Andrew Dunning</name>");
    expect(style).toContain("creativecommons.org/licenses/by-sa/3.0/");
  });

  it("locale keeps its five translators", () => {
    const locale = readFileSync(
      path.join(assetsDir, "locales-en-US.xml"),
      "utf8",
    );
    for (const name of [
      "Andrew Dunning",
      "Sebastian Karcher",
      "Rintze M. Zelle",
      "Denis Meier",
      "Brenton M. Wiernik",
    ]) {
      expect(locale).toContain(name);
    }
  });

  it("neither the style nor the locale supplies its own bibliography heading", () => {
    // Measured: the locale has no text mentioning "bibliography", and the
    // style's only mentions are metadata and comments. The heading therefore
    // comes from the loader's table.
    const style = readFileSync(
      path.join(assetsDir, "chicago-notes-bibliography.csl"),
      "utf8",
    );
    const locale = readFileSync(
      path.join(assetsDir, "locales-en-US.xml"),
      "utf8",
    );
    expect(locale.toLowerCase()).not.toContain("bibliograph");
    expect(style).not.toMatch(/<term[^>]*bibliograph/i);
    expect(style).not.toMatch(/<text[^>]*term="bibliograph/i);
  });
});

describe("loadBundledStyle", () => {
  it("lists exactly the Chicago notes and bibliography style", () => {
    expect([...BUNDLED_STYLE_IDS]).toEqual(["chicago-notes-bibliography"]);
    expect(isBundledStyleId("chicago-notes-bibliography")).toBe(true);
    expect(isBundledStyleId("apa")).toBe(false);
    expect(isBundledStyleId(undefined)).toBe(false);
  });

  it("returns the style and locale text and the Chicago heading", async () => {
    const outcome = await loadBundledStyle("chicago-notes-bibliography");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.styleId).toBe("chicago-notes-bibliography");
    expect(outcome.bibliographyHeading).toBe("Bibliography");
    expect(createHash("sha256").update(outcome.style).digest("hex")).toBe(
      STYLE_SHA256,
    );
    expect(createHash("sha256").update(outcome.locale).digest("hex")).toBe(
      LOCALE_SHA256,
    );
  });

  it("refuses an id outside the bundled list without echoing it", async () => {
    const probe = "../../etc/passwd-SECRET-PROBE";
    const outcome = await loadBundledStyle(probe);
    expect(outcome).toEqual({
      ok: false,
      reason: "unknown-style",
      message: expect.any(String),
    });
    expect(JSON.stringify(outcome)).not.toContain("SECRET-PROBE");
    expect(JSON.stringify(outcome)).not.toContain("passwd");
  });

  it("refuses non-string input", async () => {
    const outcome = await loadBundledStyle(42 as unknown as string);
    expect(outcome.ok).toBe(false);
  });

  it("makes no network request", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network used"));
    const outcome = await loadBundledStyle("chicago-notes-bibliography");
    expect(outcome.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a distinct failed outcome naming the style when it cannot be read", async () => {
    readFileControl.failFor = "chicago-notes-bibliography.csl";
    const outcome = await loadBundledStyle("chicago-notes-bibliography");
    expect(outcome).toMatchObject({
      ok: false,
      reason: "load-failed",
      failed: "style",
    });
    expect(JSON.stringify(outcome)).not.toContain("boom");
  });

  it("returns a distinct failed outcome naming the locale when it cannot be read", async () => {
    readFileControl.failFor = "locales-en-US.xml";
    const outcome = await loadBundledStyle("chicago-notes-bibliography");
    expect(outcome).toMatchObject({
      ok: false,
      reason: "load-failed",
      failed: "locale",
    });
  });
});
