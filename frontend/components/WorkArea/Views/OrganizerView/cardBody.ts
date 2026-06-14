import type {
  AnyResource,
  OrganizerCardBodyConfig,
  TextResource,
} from "../../../../src/lib/models/types";

/**
 * @module cardBody
 * Pure resolution of the body text an {@link OrganizerCard} should display for a
 * resource, driven by the project's `config.organizerCardBody` configuration.
 * Kept free of React/store concerns so the three source modes can be unit
 * tested in isolation.
 */

/**
 * Default excerpt cap (characters) for `text-excerpt` mode when the config
 * omits a length. Matches the slice used by `previews.ts`.
 */
export const DEFAULT_CARD_EXCERPT_LENGTH = 200;

/**
 * Truncate text to a maximum length, appending an ellipsis when clipped.
 * Whitespace is trimmed from both ends first so the cap measures visible text.
 *
 * @param text - Source text.
 * @param maxLength - Maximum number of characters to keep.
 * @returns The (possibly truncated) excerpt.
 */
export function makeTextExcerpt(text: string, maxLength: number): string {
  const clean = text.trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).trimEnd() + "…";
}

/**
 * Format an arbitrary metadata value into a single display string, or
 * `undefined` when it carries no meaningful text (empty, null, or a structured
 * value like a resource reference that has no plain rendering here).
 *
 * @param value - Raw `userMetadata` value.
 * @returns A display string, or `undefined`.
 */
function formatFieldValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => formatFieldValue(entry))
      .filter((entry): entry is string => entry !== undefined);
    return parts.length ? parts.join(", ") : undefined;
  }
  return undefined;
}

/** Options that influence body resolution beyond the resource and config. */
export interface ResolveCardBodyOptions {
  /**
   * Whether the Notes feature is enabled for the project. Governs the
   * back-compat default applied when no `organizerCardBody` config is set.
   */
  notesEnabled: boolean;
}

/**
 * Resolve the body text an Organizer card should show for a resource.
 *
 * - `none` → no body.
 * - `field` → the configured `userMetadata` field's value, formatted to a
 *   single string.
 * - `text-excerpt` → an excerpt of the resource's text content, truncated to
 *   the configured cap.
 *
 * When `config` is `null` (unconfigured project), this mirrors the historical
 * behavior of showing the Notes field — but only when the Notes feature is
 * enabled; otherwise it shows nothing.
 *
 * @param resource - Resource being rendered.
 * @param config - The project's card-body configuration, or `null` when unset.
 * @param options - Resolution options (see {@link ResolveCardBodyOptions}).
 * @returns The body string, or `undefined` when nothing should be shown.
 */
export function resolveOrganizerCardBody(
  resource: AnyResource,
  config: OrganizerCardBodyConfig | null,
  options: ResolveCardBodyOptions,
): string | undefined {
  const effective: OrganizerCardBodyConfig =
    config ??
    (options.notesEnabled
      ? { source: "field", fieldKey: "notes" }
      : { source: "none" });

  switch (effective.source) {
    case "none":
      return undefined;
    case "field": {
      if (!effective.fieldKey) return undefined;
      return formatFieldValue(resource.userMetadata?.[effective.fieldKey]);
    }
    case "text-excerpt": {
      const text = (resource as TextResource).plainText;
      if (typeof text !== "string" || text.trim() === "") return undefined;
      const cap =
        effective.excerptLength && effective.excerptLength > 0
          ? effective.excerptLength
          : DEFAULT_CARD_EXCERPT_LENGTH;
      return makeTextExcerpt(text, cap);
    }
    default:
      return undefined;
  }
}
