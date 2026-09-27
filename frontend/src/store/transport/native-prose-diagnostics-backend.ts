/**
 * @module store/transport/native-prose-diagnostics-backend
 *
 * The in-process implementation of {@link ProseDiagnosticsTransport} for a
 * native (Capacitor) build: instead of
 * `fetch('/api/resource/:resourceId/diagnostics')`, it invokes the same
 * transport-agnostic diagnostics model functions the HTTP route uses
 * (`lib/models/diagnostics-index.ts`'s `rebuildDiagnosticsRecordIfStale` and
 * `lib/models/indexer-queue.ts`'s `loadPersistedPlainText`). There is no
 * server and no HTTP — the exact same business logic runs directly in the
 * WebView process.
 *
 * This module is imported *only* on the native path (see
 * `lib/api/prose-diagnostics.ts`'s dynamic import), because it pulls in the
 * server-side diagnostics/indexer model and storage layer, which must never
 * enter the web client bundle.
 *
 * **Storage context binding.** Every operation runs through the shared
 * `createNativeRunner(deps)` helper (`native-runner.ts`), mirroring
 * `native-mentions-backend.ts`.
 *
 * **Project root resolution.** Like `native-mentions-backend.ts`, this
 * backend resolves `projectId` -> project root itself via the shared
 * `resolveProjectRoot()` (`project-root-resolver.ts`).
 *
 * **Degrade-gracefully parity.** The HTTP transport's method never throws —
 * any failure (network, non-2xx, malformed body) yields
 * `EMPTY_PROSE_DIAGNOSTICS`. This backend mirrors that: any error, including
 * an invalid `projectId`, is swallowed and resolves to
 * `EMPTY_PROSE_DIAGNOSTICS`, matching `lib/api/prose-diagnostics.ts`'s HTTP
 * implementation.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import { rebuildDiagnosticsRecordIfStale } from "../../lib/models/diagnostics-index";
import { loadPersistedPlainText } from "../../lib/models/indexer-queue";
import {
  EMPTY_PROSE_DIAGNOSTICS,
  type ProseDiagnosticsTransport,
} from "../../lib/api/prose-diagnostics";

/**
 * Builds the in-process prose-diagnostics transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeProseDiagnosticsTransport(
  deps: NativeBackendDeps = {},
): ProseDiagnosticsTransport {
  const run = createNativeRunner(deps);

  return {
    async getProseDiagnostics(projectId, resourceId) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return EMPTY_PROSE_DIAGNOSTICS;
          const plainText =
            (await loadPersistedPlainText(projectRoot, resourceId)) ?? "";
          const record = await rebuildDiagnosticsRecordIfStale(
            projectRoot,
            resourceId,
            plainText,
          );
          return {
            dialogueRatio: record.dialogueRatio,
            averageSentenceLength: record.averageSentenceLength,
            topRepeatedWords: record.topRepeatedWords,
          };
        } catch {
          // Mirrors the HTTP transport's degrade-gracefully parity.
          return EMPTY_PROSE_DIAGNOSTICS;
        }
      });
    },
  };
}
