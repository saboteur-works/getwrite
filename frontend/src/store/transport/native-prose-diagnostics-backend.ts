/**
 * @module store/transport/native-prose-diagnostics-backend
 *
 * The in-process implementation of {@link ProseDiagnosticsTransport} for a
 * native (Capacitor) build: instead of
 * `fetch('/api/resource/:resourceId/diagnostics')` /
 * `fetch('/api/resource/:resourceId/diagnostics-detail')`, it invokes the
 * same transport-agnostic diagnostics model functions the HTTP routes use
 * (`lib/models/diagnostics-index.ts`'s `rebuildDiagnosticsRecordIfStale`,
 * `lib/models/indexer-queue.ts`'s `loadPersistedPlainText`, and — for the
 * FR-8 located detail (Task 5) — `lib/models/prose-diagnostics.ts`'s
 * `locateRepeatedPhrases`). There is no server and no HTTP — the exact same
 * business logic runs directly in the WebView process.
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
 * **Degrade-gracefully parity — with a fail-closed carve-out for locked
 * access.** The HTTP transport's method never throws — any failure
 * (network, non-2xx, malformed body) yields `EMPTY_PROSE_DIAGNOSTICS`. This
 * backend mirrors that for every *ordinary* failure, including an invalid
 * `projectId`. It deliberately does NOT extend that degrade to a
 * locked-access failure (`isLockedAccessError` —
 * `ProjectLockedError`/`MissingProjectKeyError`): that is rethrown instead,
 * mirroring `lib/models/diagnostics-index.ts`'s `loadDiagnosticsIndex` and
 * `lib/models/indexer-queue.ts`'s `loadPersistedPlainText`, both of which
 * already draw this same distinction. A locked or keyless project is not the
 * same fact as "this resource genuinely has no diagnostics yet", and
 * swallowing the former into the latter's empty default would misreport a
 * locked project as one with none (`docs/standards/failure-visibility.md`).
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import { rebuildDiagnosticsRecordIfStale } from "../../lib/models/diagnostics-index";
import { loadPersistedPlainText } from "../../lib/models/indexer-queue";
import { locateRepeatedPhrases } from "../../lib/models/prose-diagnostics";
import { isLockedAccessError } from "../../lib/models/locked-access";
import {
  EMPTY_PROSE_DIAGNOSTICS,
  EMPTY_PROSE_DIAGNOSTICS_DETAIL,
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
        } catch (err) {
          if (isLockedAccessError(err)) throw err;
          // Mirrors the HTTP transport's degrade-gracefully parity.
          return EMPTY_PROSE_DIAGNOSTICS;
        }
      });
    },

    async getProseDiagnosticsDetail(projectId, resourceId) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return EMPTY_PROSE_DIAGNOSTICS_DETAIL;
          // Reads the exact same persisted plain text the FR-7 summary
          // method above reads, then computes the FR-8 located detail
          // fresh, never persisting it — mirroring the
          // diagnostics-detail HTTP route's own read+compute contract.
          const plainText =
            (await loadPersistedPlainText(projectRoot, resourceId)) ?? "";
          return locateRepeatedPhrases(plainText);
        } catch (err) {
          if (isLockedAccessError(err)) throw err;
          // Mirrors the HTTP transport's degrade-gracefully parity.
          return EMPTY_PROSE_DIAGNOSTICS_DETAIL;
        }
      });
    },
  };
}
