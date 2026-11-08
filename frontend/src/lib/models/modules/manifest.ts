/**
 * Static module manifest (Feature 103, FR-2): the modules this build ships,
 * declared in code. The Sources module is the first entry. It owns no derived
 * index (OQ-9), recorded as an empty `indexSteps` list. No React, JSX or JSON.
 */
import type { ModuleManifestEntry } from "./registry";

export const SOURCES_MODULE_ID = "sources";

export const MODULE_MANIFEST: readonly ModuleManifestEntry[] = [
  {
    id: SOURCES_MODULE_ID,
    view: { id: "sources", label: "Sources" },
    indexSteps: [],
  },
];
