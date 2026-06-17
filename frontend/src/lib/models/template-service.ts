import Schemas from "./schemas";
import type { ResourceType } from "./types";
import type { ResourceTemplate } from "./resource-templates";

export interface TemplateInspection {
  id: string;
  name: string;
  type: ResourceType;
  placeholders: string[];
  metadataKeys: string[];
}

export type TemplateValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

function collectPlaceholdersFromString(
  input: string,
  collector: Set<string>,
): void {
  for (const match of input.matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)) {
    collector.add(match[1]);
  }
}

function scanValueForPlaceholders(
  value: unknown,
  collector: Set<string>,
): void {
  if (typeof value === "string") {
    collectPlaceholdersFromString(value, collector);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      scanValueForPlaceholders(entry, collector);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    scanValueForPlaceholders(nestedValue, collector);
  }
}

/**
 * Inspect a template and derive placeholder variables and metadata key hints
 * used by UI flows before template instantiation.
 */
export function inspectTemplate(
  template: ResourceTemplate,
): TemplateInspection {
  const placeholders = new Set<string>();

  scanValueForPlaceholders(template.name, placeholders);
  scanValueForPlaceholders(template.plainText, placeholders);

  return {
    id: template.id,
    name: template.name,
    type: template.type,
    placeholders: Array.from(placeholders),
    metadataKeys: Object.keys(template.userMetadata ?? {}),
  };
}

/**
 * Validate template structure against the runtime schema and return
 * flattened issue messages suitable for CLI and UI feedback.
 */
export function validateTemplate(
  template: ResourceTemplate,
): TemplateValidationResult {
  const parsed = Schemas.ResourceTemplateSchema.safeParse(template);
  if (parsed.success) {
    return { valid: true };
  }

  const errors = parsed.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { valid: false, errors };
}
