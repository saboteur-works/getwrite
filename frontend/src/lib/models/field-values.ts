import { readSidecar } from "./sidecar";
import type { MetadataValue } from "./types";

// ─── Sentinel keys ────────────────────────────────────────────────────────────

/** Map key used when a sidecar explicitly stores `null` for the field. */
export const NULL_VALUE_KEY = "\0null";

/** Map key used when a sidecar is absent (read failure) or does not contain the field key at all. */
export const MISSING_VALUE_KEY = "\0missing";

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
                return await readSidecar(projectRoot, id);
            } catch {
                return null;
            }
        }),
    );
    return enumerateFieldValues(sidecars, fieldKey);
}
