// Last Updated: 2026-09-12

/**
 * Real entry point for the Scrivener import `utilityProcess` worker (FR-10,
 * FR-13). Lives outside `electron/src` so it is never part of `tsc`'s
 * `rootDir: "src"` program (see `electron/tsconfig.json`) — its only compile
 * checking is `tsc --noEmit --project tsconfig.worker.json`, and it is
 * bundled standalone by esbuild (`pnpm build:worker`) into
 * `dist/scrivener-import-worker.cjs`.
 *
 * This file has no unit-testable logic beyond wiring `process.parentPort` to
 * `handleImportRequest` and is not covered by Vitest — there is no Electron
 * runtime available to exercise `utilityProcess.fork` in that harness.
 */
import {
  importScrivenerProject,
  runForTenant,
  UnsupportedScrivenerProjectError,
  DestinationNotEmptyError,
  type ImportScrivenerProjectResult,
} from "@gw/core";
import {
  handleImportRequest,
  type ImportOutcomeData,
  type ImportRequest,
} from "../src/scrivener-import/handle-import-request";
// Type-only import for its ambient `NodeJS.Process.parentPort` global
// augmentation — `utilityProcess.fork`'s forked script has no `electron`
// runtime dependency of its own, only this compile-time type.
import type {} from "electron";

/**
 * Runs the real import inside the tenant storage context and narrows its
 * result down to the worker protocol's {@link ImportOutcomeData} shape.
 *
 * @param request - The import request received from the main process.
 * @returns The outcome data for a successful import.
 */
async function runImport(request: ImportRequest): Promise<ImportOutcomeData> {
  const result: ImportScrivenerProjectResult = await runForTenant(
    request.projectRoot,
    () =>
      importScrivenerProject({
        scrivPath: request.scrivPath,
        projectRoot: request.projectRoot,
        name: request.name,
      }),
  );

  return {
    projectId: result.project.id,
    projectRoot: result.projectRoot,
    folderCount: result.folderCount,
    resourceCount: result.resourceCount,
    tagCount: result.tagCount,
    report: result.report,
  };
}

process.parentPort.once("message", (event: { data: ImportRequest }) => {
  void handleImportRequest(event.data, {
    runImport,
    isUnsupportedSourceError: (err: unknown) =>
      err instanceof UnsupportedScrivenerProjectError,
    isNonEmptyDestinationError: (err: unknown) =>
      err instanceof DestinationNotEmptyError,
  }).then((outcome) => {
    process.parentPort.postMessage(outcome);
  });
});
