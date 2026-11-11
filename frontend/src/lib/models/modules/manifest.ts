/**
 * Static module manifest (Feature 103, FR-2): the modules this build ships,
 * declared in code. The Sources module is the first entry. It owns no derived
 * index (OQ-9), recorded as an empty `indexSteps` list. No React, JSX or JSON.
 */
import type { ModuleManifestEntry } from "./registry";

const SOURCES_MODULE_ID = "sources";
const CLAIMS_MODULE_ID = "claims";

export const MODULE_MANIFEST: readonly ModuleManifestEntry[] = [
  {
    id: SOURCES_MODULE_ID,
    view: { id: "sources", label: "Sources" },
    indexSteps: [],
  },
  // Feature 108 (FR-3): off until the writer turns it on; owns no index.
  {
    id: CLAIMS_MODULE_ID,
    view: { id: "claims", label: "Claims" },
    indexSteps: [],
    defaultEnabled: false,
  },
];
