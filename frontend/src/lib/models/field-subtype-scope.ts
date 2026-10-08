/**
 * Pure helpers for resource-subtype scoping of custom metadata fields
 * (Feature 72, FR-2, FR-13, FR-18).
 *
 * Leaf module: it MUST NOT import from `schemas.ts`, so the subtype-list Zod
 * schema can import `normalizeSubtypeLabel` from here without a cycle.
 */

import { DEFAULT_METADATA_SCHEMA } from "./default-metadata-schema";

/** Keys of every built-in field; a subtype restriction on these is ignored. */
const BUILT_IN_FIELD_KEYS: ReadonlySet<string> = new Set(
  DEFAULT_METADATA_SCHEMA.groups.flatMap((group) =>
    group.fields.map((field) => field.key),
  ),
);

/** The shared comparison key for subtype labels: trimmed, then lowercased. */
export function normalizeSubtypeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** True when `label` equals an entry of `list` under the comparison key. */
export function isLabelInList(label: string, list: readonly string[]): boolean {
  const key = normalizeSubtypeLabel(label);
  return list.some((entry) => normalizeSubtypeLabel(entry) === key);
}

/**
 * Drops later entries equal to an earlier one under the comparison key.
 * Keeps the first occurrence's text and the original order; does not mutate.
 */
export function dedupeSubtypeLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const key = normalizeSubtypeLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

/**
 * Whether a field is shown for a resource with the given subtype (FR-18).
 * Unrestricted (absent or empty `appliesTo`) and built-in fields are always
 * visible; a restricted field needs a subtype equal to an entry under the
 * comparison key. Never consults the project's subtype list.
 */
export function isFieldVisibleForSubtype(
  fieldKey: string,
  appliesTo: readonly string[] | undefined,
  resourceSubtype: string | undefined,
): boolean {
  if (BUILT_IN_FIELD_KEYS.has(fieldKey)) return true;
  if (!appliesTo || appliesTo.length === 0) return true;
  if (resourceSubtype === undefined) return false;
  return isLabelInList(resourceSubtype, appliesTo);
}
