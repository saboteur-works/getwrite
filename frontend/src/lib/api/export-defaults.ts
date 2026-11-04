/**
 * @module api/export-defaults
 *
 * Client transport for the saved export defaults (Feature 101, FR-3),
 * mirroring `compile-defaults.ts`. HTTP on web/desktop, an in-process backend
 * (`native-export-defaults-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import {
  createHttpSavedDefaultsTransport,
  type SavedDefaultsTransport,
} from "./saved-defaults-http";

/** The export-defaults operations both platforms implement. */
export type ExportDefaultsTransport = SavedDefaultsTransport;

/** HTTP transport: the hosted/desktop path. */
export const httpExportDefaultsTransport: ExportDefaultsTransport =
  createHttpSavedDefaultsTransport(
    "/api/project/export-defaults",
    "export-defaults.setExportDefaults",
    "export defaults",
  );

const resolveExportDefaultsTransport: () => Promise<ExportDefaultsTransport> =
  createTransport(httpExportDefaultsTransport, () =>
    import("../../store/transport/native-export-defaults-backend").then(
      ({ createNativeExportDefaultsTransport }) =>
        createNativeExportDefaultsTransport(),
    ),
  );

/** Sets (a list of ids) or clears (`null`) the saved export exclusions. */
export async function setExportDefaults(
  projectId: string,
  excludedResourceIds: string[] | null,
): Promise<{ excludedResourceIds: string[] | undefined }> {
  const transport = await resolveExportDefaultsTransport();
  return transport.setDefaults(projectId, excludedResourceIds);
}
