/**
 * @module entity-kind-fallback-style
 *
 * FR-5/OQ-3's full fallback style for a declared entity whose `entityKind`
 * has no persisted color/shape mapping yet (Feature 69, Task 5): the
 * deterministic hash-assigned shape from Task 1's
 * `hashEntityKindToShapeName`, paired with a fixed neutral default color —
 * never one of the writer-assignable `--entity-kind-0`..`--entity-kind-7`
 * color-token slots a persisted mapping would use.
 *
 * Pure and dependency-free: no I/O, no shared mutable state, so the same
 * `entityKind` string always resolves to the same `{ shape, color }` pair
 * across repeated calls, across a fresh module import ("different device"),
 * and regardless of discovery/iteration order elsewhere in the app. This
 * module deliberately does not reimplement the hash itself — it imports and
 * reuses `hashEntityKindToShapeName` from Task 1's shape module so the
 * fallback shape a caller sees here is always identical to the one Task 1's
 * own module would compute directly.
 */
import {
  hashEntityKindToShapeName,
  type EntityKindShapeName,
} from "../../../components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes";

/**
 * The neutral default color's token-slot reference — resolved later at
 * render time via the `--entity-kind-default` CSS custom property declared
 * in `frontend/styles/getwrite-utilities.css` (Task 1). This is a stable
 * identifier string, never a raw hex value, mirroring the token-slot
 * reference convention every other persisted/returned kind color in this
 * feature uses (e.g. `"entity-kind-0"`).
 */
export const ENTITY_KIND_DEFAULT_COLOR_SLOT = "entity-kind-default";

/** The full fallback color+shape pair FR-5 assigns an unmapped `entityKind`. */
export interface EntityKindFallbackStyle {
  readonly shape: EntityKindShapeName;
  readonly color: string;
}

/**
 * Returns the deterministic fallback `{ shape, color }` pair for an
 * `entityKind` with no persisted kind-style mapping: `shape` is Task 1's
 * djb2-hash-assigned shape from the fixed six-shape set, and `color` is
 * always the neutral `--entity-kind-default` token-slot reference, never one
 * of the eight writer-assignable `--entity-kind-N` slots.
 */
export function getEntityKindFallbackStyle(
  entityKind: string,
): EntityKindFallbackStyle {
  return {
    shape: hashEntityKindToShapeName(entityKind),
    color: ENTITY_KIND_DEFAULT_COLOR_SLOT,
  };
}
