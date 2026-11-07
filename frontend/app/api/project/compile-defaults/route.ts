/**
 * @module app/api/project/compile-defaults/route
 *
 * `PUT /api/project/compile-defaults` — body `{ projectId, excludedResourceIds }`
 * (list of ids, or `null` to clear). Feature 101, FR-2. See
 * `../_saved-defaults/handler.ts`.
 */
import { setCompileDefaultsCore } from "../../../../src/lib/models/saved-defaults-core";
import { withStorageContext } from "../../_tenant/with-storage-context";
import { createSavedDefaultsPutHandler } from "../_saved-defaults/handler";

export const PUT = withStorageContext(
  createSavedDefaultsPutHandler(() => setCompileDefaultsCore),
);

export const dynamic = "force-dynamic";
