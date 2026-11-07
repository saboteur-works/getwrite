/**
 * @module store/transport/native-folder-metadata-backend.web-stub
 *
 * Web-build substitute for `native-folder-metadata-backend.ts`, which reaches
 * `node:path` and the storage layer through `folder-metadata-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free
 * module in for the literal specifier in `lib/api/folder-metadata.ts`'s
 * dynamic import. It is never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { FolderMetadataTransport } from "../../lib/api/folder-metadata";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeFolderMetadataTransport(): FolderMetadataTransport {
  throw new Error(
    "native-folder-metadata-backend.web-stub: the native folder-metadata " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
