import fs from "node:fs/promises";
import path from "node:path";
import { readSidecar } from "./sidecar";
import type { MetadataValue } from "./types";
export { NULL_VALUE_KEY, MISSING_VALUE_KEY } from "./field-value-keys";
import { NULL_VALUE_KEY, MISSING_VALUE_KEY } from "./field-value-keys";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldValueCount {
  /** Number of resources that have this value. */
  count: number;
  /** One representative value for display and type introspection. */
  sample: MetadataValue;
}

// ─── Canonical key ────────────────────────────────────────────────────────────

/**
 * Produces a stable string key for any MetadataValue so that structurally
 * identical values map to the same entry in the frequency map.
 *
 * - `null` → `NULL_VALUE_KEY` sentinel
 * - string → the string itself (empty string is distinct from null/missing)
 * - number → String(n)
 * - boolean → "true" | "false"
 * - ResourceRef / arrays / objects → JSON.stringify
 */
export function canonicalValueKey(value: MetadataValue): string {
  if (value === null) return NULL_VALUE_KEY;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

// ─── Pure enumeration ─────────────────────────────────────────────────────────

/**
 * Scans a list of pre-loaded sidecar records and returns a frequency map of
 * the distinct values stored under `fieldKey`.
 *
 * - A `null` sidecar (unreadable resource) contributes to `MISSING_VALUE_KEY`.
 * - A sidecar that does not contain `fieldKey` contributes to `MISSING_VALUE_KEY`.
 * - An explicit `null` field value contributes to `NULL_VALUE_KEY`.
 * - All other values are bucketed by `canonicalValueKey`.
 */
export function enumerateFieldValues(
  sidecars: ReadonlyArray<Record<string, MetadataValue> | null>,
  fieldKey: string,
): Map<string, FieldValueCount> {
  const result = new Map<string, FieldValueCount>();

  function increment(key: string, sample: MetadataValue): void {
    const existing = result.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      result.set(key, { count: 1, sample });
    }
  }

  for (const sidecar of sidecars) {
    if (sidecar === null || !(fieldKey in sidecar)) {
      increment(MISSING_VALUE_KEY, null);
      continue;
    }
    const value = sidecar[fieldKey];
    if (value === null) {
      increment(NULL_VALUE_KEY, null);
    } else {
      increment(canonicalValueKey(value), value);
    }
  }

  return result;
}

// ─── Async filesystem scan ────────────────────────────────────────────────────

/**
 * Scans the `meta/` directory of a project and returns a frequency map of
 * distinct values for `fieldKey` across all resources.
 *
 * Unreadable or missing sidecars are counted under `MISSING_VALUE_KEY`.
 */
export async function scanAllFieldValues(
  projectRoot: string,
  fieldKey: string,
): Promise<Map<string, FieldValueCount>> {
  const metaDir = path.join(projectRoot, "meta");
  let entries: string[];
  try {
    entries = await fs.readdir(metaDir);
  } catch {
    return new Map();
  }
  const resourceIds = entries
    .filter((e) => e.startsWith("resource-") && e.endsWith(".meta.json"))
    .map((e) => e.slice("resource-".length, -".meta.json".length));
  return scanFieldValues(projectRoot, resourceIds, fieldKey);
}

/**
 * Reads the sidecar for each resource ID in `resourceIds` and returns a
 * frequency map of distinct values for `fieldKey` across the project.
 *
 * Unreadable or missing sidecars are counted under `MISSING_VALUE_KEY` rather
 * than throwing, so partial results are always returned.
 */
export async function scanFieldValues(
  projectRoot: string,
  resourceIds: readonly string[],
  fieldKey: string,
): Promise<Map<string, FieldValueCount>> {
  const sidecars = await Promise.all(
    resourceIds.map(async (id) => {
      try {
        return flattenUserMetadata(await readSidecar(projectRoot, id));
      } catch {
        return null;
      }
    }),
  );
  return enumerateFieldValues(sidecars, fieldKey);
}

/**
 * Flattens a sidecar's nested `userMetadata` map onto the top level so a
 * field value can be looked up by key. Metadata field values are stored under
 * `userMetadata` on disk; `enumerateFieldValues` (and the query evaluator) read
 * by top-level key, so this must run on every raw sidecar before enumeration —
 * otherwise the field-value scan (e.g. the SchemaManager change-type /
 * option-removal preview) reports every value as MISSING while the actual
 * migration, which reads `userMetadata`, would change them.
 */
function flattenUserMetadata(
  sidecar: Record<string, MetadataValue> | null,
): Record<string, MetadataValue> | null {
  if (!sidecar) return null;
  const userMeta = sidecar.userMetadata;
  if (
    userMeta === null ||
    typeof userMeta !== "object" ||
    Array.isArray(userMeta)
  ) {
    return sidecar;
  }
  return { ...sidecar, ...(userMeta as Record<string, MetadataValue>) };
}
