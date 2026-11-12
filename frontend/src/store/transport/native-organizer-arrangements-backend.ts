/**
 * @module store/transport/native-organizer-arrangements-backend
 *
 * In-process organizer arrangements transport for a native (Capacitor) build
 * (Feature 109, FR-14): runs the same cores the HTTP route uses
 * (`organizer-arrangements-core.ts`) inside the native storage context, so the
 * same bad input yields the same refusal result here as on the route. A
 * refusal is a result value; every thrown error (the locked-access error,
 * anything else) propagates unchanged, so a failed write never surfaces as an
 * ok or empty result.
 *
 * Native storage has no encrypting layer, so a write into a project carrying
 * the encrypted marker is refused before the core runs, with the typed error
 * of `native-encrypted-project-guard.ts` (reused), worded for arrangements.
 *
 * Imported only on the native path (the client transport's dynamic import);
 * `next.config.mjs` aliases it to a `node:*`-free web-stub in web/desktop
 * builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { assertProjectNotEncrypted } from "./native-encrypted-project-guard";
import {
  addOrganizerArrangementCore,
  deleteOrganizerArrangementCore,
  renameOrganizerArrangementCore,
} from "../../lib/models/organizer-arrangements-core";
import type {
  OrganizerArrangementAddInput,
  OrganizerArrangementAddResult,
  OrganizerArrangementDeleteInput,
  OrganizerArrangementDeleteResult,
  OrganizerArrangementRenameInput,
  OrganizerArrangementRenameResult,
} from "../../lib/models/organizer-grid-types";

/** The in-process arrangements transport's operations (input validated by the cores). */
export interface NativeOrganizerArrangementsTransport {
  add(
    projectId: string,
    input: OrganizerArrangementAddInput,
  ): Promise<OrganizerArrangementAddResult>;
  rename(
    projectId: string,
    input: OrganizerArrangementRenameInput,
  ): Promise<OrganizerArrangementRenameResult>;
  delete(
    projectId: string,
    input: OrganizerArrangementDeleteInput,
  ): Promise<OrganizerArrangementDeleteResult>;
}

/**
 * Builds the in-process organizer arrangements transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeOrganizerArrangementsTransport(
  deps: NativeBackendDeps = {},
): NativeOrganizerArrangementsTransport {
  const run = createNativeRunner(deps);
  return {
    add: (projectId, input) =>
      run(async () => {
        await assertProjectNotEncrypted(projectId, "arrangements");
        return addOrganizerArrangementCore(projectId, input);
      }),
    rename: (projectId, input) =>
      run(async () => {
        await assertProjectNotEncrypted(projectId, "arrangements");
        return renameOrganizerArrangementCore(projectId, input);
      }),
    delete: (projectId, input) =>
      run(async () => {
        await assertProjectNotEncrypted(projectId, "arrangements");
        return deleteOrganizerArrangementCore(projectId, input);
      }),
  };
}
