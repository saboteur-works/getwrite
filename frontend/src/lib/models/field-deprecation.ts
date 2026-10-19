/**
 * Pure predicate for deprecated custom metadata fields (Feature 89, FR-14).
 *
 * Leaf module beside `field-subtype-scope.ts`. A deprecated field is hidden
 * from the resource sidebar but stays queryable and flagged in the chip UI;
 * its stored values are never touched. `MetadataSidebar.tsx` is the only
 * non-test consumer.
 */

import type { MetadataField } from "./types";

/** True only when the field carries `deprecated: true`. */
export function isFieldDeprecated(
  field: Pick<MetadataField, "deprecated">,
): boolean {
  return field.deprecated === true;
}
