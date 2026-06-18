import type { MetadataSchema, MetadataField } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A field together with its containing group metadata. */
export interface FieldMatch {
  field: MetadataField;
  /** ID of the group that contains this field. */
  groupId: string;
  /** Display label of the containing group. */
  groupLabel: string;
}

// ─── deriveLabel ─────────────────────────────────────────────────────────────

/**
 * Derives a display label from a raw name string by title-casing each word.
 *
 * "tension"     → "Tension"
 * "word count"  → "Word Count"
 * "POV"         → "POV" (all-caps preserved)
 */
export function deriveLabel(name: string): string {
  return name.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── slugifyName ──────────────────────────────────────────────────────────────

/**
 * Converts a display name into a URL-safe field key slug.
 *
 * Applies the project-wide `/^[a-z0-9-]+$/` constraint:
 * - lowercases all characters
 * - replaces any run of non-alphanumeric characters with a single hyphen
 * - strips leading and trailing hyphens
 *
 * Returns an empty string if the input produces no valid characters.
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function allMatches(schema: MetadataSchema): FieldMatch[] {
  return schema.groups.flatMap((group) =>
    group.fields.map((field) => ({
      field,
      groupId: group.id,
      groupLabel: group.label,
    })),
  );
}

// ─── findExisting ─────────────────────────────────────────────────────────────

/**
 * Returns the field whose key exactly matches `slugifyName(name)`, or null if
 * no such field exists in the schema.
 *
 * Enables "exact-name collapse to existing": typing "Word Count" or "word count"
 * or "WORD_COUNT" all route to the existing `word-count` field rather than
 * creating a duplicate.
 *
 * Searches across all groups, including locked builtin fields.
 */
export function findExisting(
  name: string,
  schema: MetadataSchema,
): FieldMatch | null {
  const slug = slugifyName(name);
  if (!slug) return null;
  return allMatches(schema).find((m) => m.field.key === slug) ?? null;
}

// ─── fuzzyMatch ───────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function fuzzyThreshold(slugLen: number): number {
  if (slugLen <= 3) return 0;
  if (slugLen <= 5) return 1;
  return 2;
}

/**
 * Returns the closest existing field if its key is within the fuzzy-match
 * threshold of `slugifyName(name)`, or null if no close enough match exists.
 *
 * Used to surface "Did you mean `tone`?" warnings when the user types a name
 * that is typographically close but not identical to an existing key.
 *
 * Returns null when `findExisting` would find an exact slug match — the
 * exact-match path takes precedence over the fuzzy warning.
 *
 * Threshold by input slug length:
 * - ≤ 3 chars: no fuzzy (too short, too many false positives)
 * - 4–5 chars: edit distance ≤ 1
 * - 6+ chars: edit distance ≤ 2
 */
export function fuzzyMatch(
  name: string,
  schema: MetadataSchema,
): FieldMatch | null {
  const slug = slugifyName(name);
  if (!slug) return null;
  if (findExisting(name, schema)) return null;

  const threshold = fuzzyThreshold(slug.length);
  if (threshold === 0) return null;

  let best: FieldMatch | null = null;
  let bestDist = threshold + 1;

  for (const match of allMatches(schema)) {
    const dist = levenshtein(slug, match.field.key);
    if (dist > 0 && dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = match;
    }
  }

  return best;
}
