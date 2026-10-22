// Last Updated: 2026-10-21

/**
 * Feature 91 (FR-9): the one place a font-family declaration value is built
 * from a stored family, plus the validator for newly typed "Other..." names.
 * Pure; no DOM or Node-only imports.
 *
 * Security (docs/standards/security.md section 6): the result reaches an
 * inline style. The helper never validates or rewrites a stored value, so an
 * existing project keeps working; only a newly typed name goes through
 * `validateTypedFontName`.
 */

const FALLBACK_FAMILY = "IBM Plex Serif";
const FALLBACK_STACK = `"${FALLBACK_FAMILY}", serif`;
const GENERIC_KEYWORDS: ReadonlySet<string> = new Set([
  "serif",
  "sans-serif",
  "monospace",
]);
// Quote, apostrophe, semicolon, braces, backslash, parens, angle brackets, comma.
const REFUSED_CHARACTERS = /["';{}\\()<>,]/;
// C0 controls and DEL.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type TypedFontNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Build the `font-family` value for a stored family, or undefined when there
 * is nothing to declare. A generic keyword is bare; a value containing a comma
 * is returned as stored; any other name is quoted with the Plex Serif fallback,
 * which is not repeated when the name is Plex Serif itself.
 * The name is never re-cased.
 */
export function buildFontFamilyValue(
  stored: string | null | undefined,
): string | undefined {
  const value = (stored ?? "").trim();
  if (value === "") return undefined;
  if (GENERIC_KEYWORDS.has(value)) return value;
  if (value.includes(",")) return value;
  if (value.toLowerCase() === FALLBACK_FAMILY.toLowerCase()) {
    return `"${value}", serif`;
  }
  return `"${value}", ${FALLBACK_STACK}`;
}

/** Validate a newly typed "Other..." name. Empty is accepted and clears. */
export function validateTypedFontName(typed: string): TypedFontNameResult {
  const value = typed.trim();
  if (value === "") return { ok: true, value: "" };
  if (CONTROL_CHARACTERS.test(value) || REFUSED_CHARACTERS.test(value)) {
    return {
      ok: false,
      error:
        "A font name cannot contain quotes, semicolons, braces, backslashes, parentheses, angle brackets, commas or control characters.",
    };
  }
  return { ok: true, value };
}
