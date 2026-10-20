/**
 * Builds the `GET /api/project-types` response body (Feature 90, FR-6) from
 * bare specs, for tests that stub `fetch`.
 */
export function projectTypesListBody(
  specs: { id: string; name: string; folders: unknown[] }[],
  over: { unusable?: unknown[]; savedStatus?: string } = {},
): unknown {
  return {
    entries: specs.map((spec) => ({
      spec,
      fileName: `${spec.id}.json`,
      source: "built-in",
    })),
    unusable: over.unusable ?? [],
    savedStatus: over.savedStatus ?? "ok",
  };
}
