/**
 * @module store/transport/native-organizer-field-write-backend
 *
 * In-process organizer field-write transport for a native (Capacitor) build
 * (Feature 109, FR-7, FR-13): runs the same core the HTTP route uses
 * (`organizer-field-write-core.ts`) inside the native storage context, so the
 * same bad input yields the same refusal result here as on the route. A
 * refusal is a result value; every thrown error (`ResourceGoneError`, the
 * locked-access error, anything else) propagates unchanged, so a failed write
 * never surfaces as an ok or empty result.
 *
 * Native storage has no encrypting layer, so a write into a project carrying
 * the encrypted marker is refused before the core runs, with the typed error
 * of `native-encrypted-project-guard.ts` (reused), worded for fields.
 *
 * Imported only on the native path (the client transport's dynamic import);
 * `next.config.mjs` aliases it to a `node:*`-free web-stub in web/desktop
 * builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { assertProjectNotEncrypted } from "./native-encrypted-project-guard";
import { setOrganizerFieldsCore } from "../../lib/models/organizer-field-write-core";
import type {
  OrganizerFieldWriteInput,
  OrganizerFieldWriteResult,
} from "../../lib/models/organizer-grid-types";

/** The in-process field-write transport's operation (input validated by the core). */
export interface NativeOrganizerFieldWriteTransport {
  setOrganizerFields(
    projectId: string,
    input: OrganizerFieldWriteInput,
  ): Promise<OrganizerFieldWriteResult>;
}

/**
 * Builds the in-process organizer field-write transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeOrganizerFieldWriteTransport(
  deps: NativeBackendDeps = {},
): NativeOrganizerFieldWriteTransport {
  const run = createNativeRunner(deps);
  return {
    setOrganizerFields: (projectId, input) =>
      run(async () => {
        await assertProjectNotEncrypted(projectId, "fields");
        return setOrganizerFieldsCore(projectId, input);
      }),
  };
}
