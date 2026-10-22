// Last Updated: 2026-10-22

/**
 * Feature 91, Task 10 (FR-18): every bundled face resolves to a file present in
 * the build inputs, and a face that fails at runtime is reported through
 * `console.error` with the family name and no network text.
 *
 * The resolution check never deletes anything: the loud-failure case runs the
 * same function over a temporary copy whose font file is absent.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reportFontFailure,
  watchFontFailures,
} from "../../src/lib/fonts/report-font-failures";

const ROOT = path.resolve(__dirname, "../..");

/** Specifiers imported by a stylesheet, resolved under `<root>/node_modules`. */
function importedCssFiles(cssPath: string, root: string): string[] {
  const css = readFileSync(cssPath, "utf8");
  return [...css.matchAll(/@import\s+["']([^"']+)["']\s*;/g)].map((m) =>
    path.join(root, "node_modules", m[1]),
  );
}

/** Every `url(...)` file referenced by the imported @fontsource stylesheets. */
function referencedFontFiles(cssPath: string, root: string): string[] {
  const files: string[] = [];
  for (const cssFile of importedCssFiles(cssPath, root)) {
    if (!existsSync(cssFile)) {
      files.push(cssFile);
      continue;
    }
    const body = readFileSync(cssFile, "utf8");
    for (const m of body.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) {
      files.push(path.resolve(path.dirname(cssFile), m[1]));
    }
  }
  return files;
}

/** Throws, naming each missing file, when a referenced face file is absent. */
function assertFacesResolve(cssPath: string, root: string): number {
  const files = referencedFontFiles(cssPath, root);
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) {
    throw new Error(`Bundled font files missing: ${missing.join(", ")}`);
  }
  return files.length;
}

describe("bundled faces resolve (FR-18)", () => {
  it("every face in styles/bundled-fonts.css references files present in node_modules", () => {
    const count = assertFacesResolve(
      path.join(ROOT, "styles/bundled-fonts.css"),
      ROOT,
    );
    expect(count).toBeGreaterThan(0);
  });

  it("fails loudly when a referenced file is missing (temp copy)", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "gw-fonts-"));
    try {
      const pkg = path.join(tmp, "node_modules/@fontsource/fake");
      mkdirSync(path.join(pkg, "files"), { recursive: true });
      writeFileSync(
        path.join(pkg, "latin-400.css"),
        "@font-face{font-family:'Fake';src:url(./files/fake-latin-400-normal.woff2) format('woff2');}",
      );
      const css = path.join(tmp, "bundled.css");
      writeFileSync(css, '@import "@fontsource/fake/latin-400.css";\n');
      expect(() => assertFacesResolve(css, tmp)).toThrow(
        /fake-latin-400-normal\.woff2/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

type Listener = (event: { fontfaces: { family: string }[] }) => void;

function fakeFontSet(): {
  fonts: {
    addEventListener: (t: string, l: Listener) => void;
    removeEventListener: (t: string, l: Listener) => void;
  };
  emit: (type: string, families: string[]) => void;
  count: () => number;
} {
  const listeners = new Map<string, Set<Listener>>();
  return {
    fonts: {
      addEventListener: (t, l) => {
        if (!listeners.has(t)) listeners.set(t, new Set());
        listeners.get(t)?.add(l);
      },
      removeEventListener: (t, l) => {
        listeners.get(t)?.delete(l);
      },
    },
    emit: (type, families) => {
      for (const l of listeners.get(type) ?? [])
        l({ fontfaces: families.map((family) => ({ family })) });
    },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe("runtime font failure report (FR-18)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("a loadingerror calls console.error naming the family, with no URL or network text", () => {
    const set = fakeFontSet();
    watchFontFailures(set.fonts);
    set.emit("loadingerror", ["'Playfair Display'"]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    expect(message).toContain("Playfair Display");
    expect(message).not.toMatch(/https?:|\/\/|network|url/i);
  });

  it("a successful load logs nothing", () => {
    const set = fakeFontSet();
    watchFontFailures(set.fonts);
    set.emit("loadingdone", ["Inter"]);
    set.emit("loading", ["Inter"]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("the returned cleanup removes the listener", () => {
    const set = fakeFontSet();
    const stop = watchFontFailures(set.fonts);
    expect(set.count()).toBe(1);
    stop();
    expect(set.count()).toBe(0);
  });

  it("is a no-op without document.fonts (SSR or unsupported)", () => {
    expect(() => watchFontFailures(undefined)()).not.toThrow();
  });

  it("reportFontFailure strips quotes from the family", () => {
    reportFontFailure('"Lato"');
    expect(String(errorSpy.mock.calls[0][0])).toContain("Lato");
    expect(String(errorSpy.mock.calls[0][0])).not.toContain('"');
  });
});
