/**
 * Static module manifest (Feature 103, FR-2): the modules this build ships,
 * declared in code. The Sources module is the first entry. It owns no derived
 * index (OQ-9), recorded as an empty `indexSteps` list. No React, JSX or JSON.
 */
import { FOLKLORE_MODULE_ID, FOLKLORE_VIEW_LABEL } from "../folklore-types";
import {
  CITATIONS_MODULE_ID,
  CITATIONS_MODULE_LABEL,
} from "../citations-types";
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
  // Feature 110 (FR-2): the Narratives module; off until the writer turns it
  // on; owns no index and seeds no subtype, field or list.
  {
    id: FOLKLORE_MODULE_ID,
    view: { id: FOLKLORE_MODULE_ID, label: FOLKLORE_VIEW_LABEL },
    indexSteps: [],
    defaultEnabled: false,
  },
  // Feature 116 (FR-3, FR-4): the Citations module; off until the writer turns
  // it on; owns no index and no view, so the Modules screen reads `label`.
  {
    id: CITATIONS_MODULE_ID,
    label: CITATIONS_MODULE_LABEL,
    indexSteps: [],
    defaultEnabled: false,
  },
];
