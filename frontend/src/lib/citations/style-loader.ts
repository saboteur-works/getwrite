/**
 * Bundled citation style and locale loader (Feature 116, Task 33; FR-18, FR-20).
 *
 * The bundled set is exactly the Chicago notes and bibliography style in the
 * en-US locale. Both files are plain CSL XML, the format the vendored
 * Hayagriva engine takes (`render(style_xml, locale_xml, ...)`), and are
 * stored unmodified under `./assets/` with their author and translator
 * metadata. They are read from the app's own files: never fetched, never
 * supplied by the client.
 *
 * Server-side only (`node:fs`). Paths come from a fixed table keyed by a
 * validated style id, never from caller input.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const BUNDLED_STYLE_IDS = ["chicago-notes-bibliography"] as const;

export type BundledStyleId = (typeof BUNDLED_STYLE_IDS)[number];

const STYLE_FILES: Readonly<Record<BundledStyleId, string>> = {
  "chicago-notes-bibliography": "chicago-notes-bibliography.csl",
};

const LOCALE_FILE = "locales-en-US.xml";

/**
 * Bibliography heading per style id. Measured in Task 33: neither the style
 * nor the en-US locale supplies a heading of its own, so it comes from here.
 */
const BIBLIOGRAPHY_HEADINGS: Readonly<Record<BundledStyleId, string>> = {
  "chicago-notes-bibliography": "Bibliography",
};

/** Directories to try, relative to the working directory (frontend or repo root). */
const ASSET_DIR_CANDIDATES: readonly string[] = [
  path.join("src", "lib", "citations", "assets"),
  path.join("frontend", "src", "lib", "citations", "assets"),
];

export type StyleLoadSuccess = {
  ok: true;
  styleId: BundledStyleId;
  /** CSL style XML, exactly as bundled. */
  style: string;
  /** CSL locale XML, exactly as bundled. */
  locale: string;
  bibliographyHeading: string;
};

export type StyleLoadFailure =
  | { ok: false; reason: "unknown-style"; message: string }
  | {
      ok: false;
      reason: "load-failed";
      failed: "style" | "locale";
      message: string;
    };

export type StyleLoadOutcome = StyleLoadSuccess | StyleLoadFailure;

export function isBundledStyleId(value: unknown): value is BundledStyleId {
  return (
    typeof value === "string" &&
    (BUNDLED_STYLE_IDS as readonly string[]).includes(value)
  );
}

async function readAsset(fileName: string): Promise<string | null> {
  for (const dir of ASSET_DIR_CANDIDATES) {
    try {
      return await readFile(path.resolve(process.cwd(), dir, fileName), "utf8");
    } catch {
      // Try the next candidate directory; a total miss is reported by the caller.
    }
  }
  return null;
}

/**
 * Loads a bundled style and the en-US locale. A style id outside the bundled
 * list is refused without being echoed; an unreadable asset is a distinct
 * `load-failed` outcome naming which asset failed, never "no style".
 */
export async function loadBundledStyle(
  styleId: string,
): Promise<StyleLoadOutcome> {
  if (!isBundledStyleId(styleId)) {
    return {
      ok: false,
      reason: "unknown-style",
      message: "That citation style is not available.",
    };
  }
  const style = await readAsset(STYLE_FILES[styleId]);
  if (style === null) {
    return {
      ok: false,
      reason: "load-failed",
      failed: "style",
      message: "The citation style could not be loaded.",
    };
  }
  const locale = await readAsset(LOCALE_FILE);
  if (locale === null) {
    return {
      ok: false,
      reason: "load-failed",
      failed: "locale",
      message: "The citation locale could not be loaded.",
    };
  }
  return {
    ok: true,
    styleId,
    style,
    locale,
    bibliographyHeading: BIBLIOGRAPHY_HEADINGS[styleId],
  };
}
