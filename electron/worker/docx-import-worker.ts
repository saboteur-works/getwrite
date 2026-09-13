// Last Updated: 2026-09-13

/**
 * Real entry point for the DOCX import `utilityProcess` worker (FR-17).
 * Lives outside `electron/src` so it is never part of `tsc`'s
 * `rootDir: "src"` program (see `electron/tsconfig.json`) — its only compile
 * checking is `tsc --noEmit --project tsconfig.worker.json`, and it is
 * bundled standalone by esbuild (`pnpm build:worker`) into
 * `dist/docx-import-worker.cjs`.
 *
 * Mirrors `electron/worker/scrivener-import-worker.ts`'s own wiring exactly,
 * against the DOCX pipeline instead. This file has no unit-testable logic
 * beyond wiring `process.parentPort` to `handleImportRequest` and is not
 * covered by Vitest — there is no Electron runtime available to exercise
 * `utilityProcess.fork` in that harness.
 */
import {
  importDocxProject,
  runForTenant,
  UnknownProjectTypeError,
  DocxDestinationNotEmptyError,
  NoDocxFilesFoundError,
  type ImportDocxProjectResult,
} from "@gw/core";
import {
  handleImportRequest,
  type ImportOutcomeData,
  type ImportRequest,
} from "../src/docx-import/handle-import-request";
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
  const result: ImportDocxProjectResult = await runForTenant(
    request.projectRoot,
    () =>
      importDocxProject({
        sourcePath: request.sourcePath,
        projectRoot: request.projectRoot,
        name: request.name,
        splitLevel: request.splitLevel,
        projectType: request.projectType,
      }),
  );

  return {
    projectId: result.project.id,
    projectRoot: result.projectRoot,
    folderCount: result.folderCount,
    resourceCount: result.resourceCount,
    report: result.report,
  };
}

process.parentPort.once("message", (event: { data: ImportRequest }) => {
  void handleImportRequest(event.data, {
    runImport,
    isUnsupportedSourceError: (err: unknown) =>
      err instanceof NoDocxFilesFoundError,
    isNonEmptyDestinationError: (err: unknown) =>
      err instanceof DocxDestinationNotEmptyError,
    isUnknownProjectTypeError: (err: unknown) =>
      err instanceof UnknownProjectTypeError,
  }).then((outcome) => {
    process.parentPort.postMessage(outcome);
  });
});
