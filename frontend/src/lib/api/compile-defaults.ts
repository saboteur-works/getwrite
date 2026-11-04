/**
 * @module api/compile-defaults
 *
 * Client transport for the saved compile defaults (Feature 101, FR-3),
 * mirroring `goal-filter.ts`. HTTP on web/desktop, an in-process backend
 * (`native-compile-defaults-backend`) on native. Rejects on any failure; see
 * `saved-defaults-http.ts` for the contract.
 */
import { createTransport } from "../../store/transport/create-transport";
import {
  createHttpSavedDefaultsTransport,
  type SavedDefaultsTransport,
} from "./saved-defaults-http";

/** The compile-defaults operations both platforms implement. */
export type CompileDefaultsTransport = SavedDefaultsTransport;

/** HTTP transport: the hosted/desktop path. */
export const httpCompileDefaultsTransport: CompileDefaultsTransport =
  createHttpSavedDefaultsTransport(
    "/api/project/compile-defaults",
    "compile-defaults.setCompileDefaults",
    "compile defaults",
  );

/**
 * The thunk carries the literal `import(...)` specifier so
 * `next.config.mjs`'s `turbopack.resolveAlias` can substitute a `node:*`-free
 * web-stub at build time.
 */
const resolveCompileDefaultsTransport: () => Promise<CompileDefaultsTransport> =
  createTransport(httpCompileDefaultsTransport, () =>
    import("../../store/transport/native-compile-defaults-backend").then(
      ({ createNativeCompileDefaultsTransport }) =>
        createNativeCompileDefaultsTransport(),
    ),
  );

/** Sets (a list of ids) or clears (`null`) the saved compile exclusions. */
export async function setCompileDefaults(
  projectId: string,
  excludedResourceIds: string[] | null,
): Promise<{ excludedResourceIds: string[] | undefined }> {
  const transport = await resolveCompileDefaultsTransport();
  return transport.setDefaults(projectId, excludedResourceIds);
}
