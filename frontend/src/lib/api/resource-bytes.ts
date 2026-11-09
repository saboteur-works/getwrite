/**
 * @module api/resource-bytes
 *
 * Client for reading one image or audio resource's own file bytes
 * (Feature 105, FR-2, FR-5, FR-12). Resolved through `createTransport`: the
 * native build runs an in-process backend
 * (`native-resource-bytes-backend`) over `resource-bytes-core`; every other
 * runtime gets {@link ResourceBytesUnsupportedError}.
 *
 * Web decision: the web/desktop transport is a typed unsupported error, not
 * an HTTP read. Web and desktop display a resource through the resource file
 * route as an element `src`, and no web caller reads these bytes. This module
 * never calls `fetch` and never builds that URL.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): the core's typed
 * refusal and failure errors, and the locked-access error, propagate
 * unchanged; nothing is returned as empty bytes on failure.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { ResourceBytes } from "../models/resource-bytes-core";

export type { ResourceBytes };

/** The byte-read operation the native platform implements. */
export interface ResourceBytesTransport {
  readResourceBytes(
    projectId: string,
    resourceId: string,
  ): Promise<ResourceBytes>;
}

/** Raised when the in-process read is called outside a native build. */
export class ResourceBytesUnsupportedError extends Error {
  constructor() {
    super("Reading a resource's bytes in process is only supported on native.");
    this.name = "ResourceBytesUnsupportedError";
  }
}

const unsupportedResourceBytesTransport: ResourceBytesTransport = {
  readResourceBytes() {
    return Promise.reject(new ResourceBytesUnsupportedError());
  },
};

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-resource-bytes-backend")` specifier
 * so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveResourceBytesTransport: () => Promise<ResourceBytesTransport> =
  createTransport(unsupportedResourceBytesTransport, () =>
    import("../../store/transport/native-resource-bytes-backend").then(
      ({ createNativeResourceBytesTransport }) =>
        createNativeResourceBytesTransport(),
    ),
  );

/** One media resource's bytes, kind and mime. Rejects on any failure. */
export async function readResourceBytes(
  projectId: string,
  resourceId: string,
): Promise<ResourceBytes> {
  const transport = await resolveResourceBytesTransport();
  return transport.readResourceBytes(projectId, resourceId);
}
