// Last Updated: 2026-09-12

/**
 * Pure request handler for the Scrivener import worker (FR-12).
 *
 * This file lives under `electron/src` and is compiled by `electron/tsconfig.json`
 * (`rootDir: "src"`). It must import nothing from `@gw/core` or any frontend
 * path — doing so would pull a file outside `rootDir` into that program and
 * fail the real emitting `tsc` build with TS6059. All shapes it needs are
 * declared locally, and the real `@gw/core` calls are injected via `deps` by
 * the actual worker entry point (`electron/worker/scrivener-import-worker.ts`),
 * which is built by a separate esbuild bundle and never shares a tsconfig
 * program with this file.
 */

/** Request to import a single Scrivener project, as sent by the main process. */
export interface ImportRequest {
  /** Absolute path to the source `.scriv` package directory. */
  readonly scrivPath: string;
  /** Absolute path where the new destination GetWrite project should be created. */
  readonly projectRoot: string;
  /** Destination project name. */
  readonly name: string;
}

/** Structural mirror of the fields consumers of a successful import need. */
export interface ImportOutcomeData {
  readonly projectId: string;
  readonly projectRoot: string;
  readonly folderCount: number;
  readonly resourceCount: number;
  readonly tagCount: number;
  readonly report: string;
}

/** A successful import. */
export interface ImportSuccessOutcome extends ImportOutcomeData {
  readonly kind: "success";
}

/** The source `.scriv` project was refused as unsupported (FR-2). */
export interface ImportRefusalUnsupportedOutcome {
  readonly kind: "refusal-unsupported";
  readonly message: string;
}

/** The destination project root already exists and is non-empty. */
export interface ImportRefusalDestinationNotEmptyOutcome {
  readonly kind: "refusal-destination-not-empty";
  readonly message: string;
}

/** Any other error raised while importing. */
export interface ImportFatalOutcome {
  readonly kind: "fatal";
  readonly message: string;
}

/** The four-kind discriminated outcome protocol the worker replies with (FR-12). */
export type ImportOutcome =
  | ImportSuccessOutcome
  | ImportRefusalUnsupportedOutcome
  | ImportRefusalDestinationNotEmptyOutcome
  | ImportFatalOutcome;

/** Injected dependencies, kept free of any `@gw/core` type. */
export interface HandleImportRequestDeps {
  /** Runs the actual import and resolves to its outcome data. */
  runImport(request: ImportRequest): Promise<ImportOutcomeData>;
  /** True when `err` indicates an unsupported source project. */
  isUnsupportedSourceError(err: unknown): boolean;
  /** True when `err` indicates a non-empty destination. */
  isNonEmptyDestinationError(err: unknown): boolean;
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * @param err - The thrown value.
 * @returns Its `message` if it is an `Error`, otherwise its string form.
 */
function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs `deps.runImport` for `request` and resolves to one of the four
 * discriminated outcomes, never rejecting.
 *
 * @param request - The import request to run.
 * @param deps - Injected import runner and error predicates.
 * @returns The discriminated outcome.
 */
export async function handleImportRequest(
  request: ImportRequest,
  deps: HandleImportRequestDeps,
): Promise<ImportOutcome> {
  try {
    const data = await deps.runImport(request);
    return { kind: "success", ...data };
  } catch (err) {
    if (deps.isUnsupportedSourceError(err)) {
      return { kind: "refusal-unsupported", message: messageFor(err) };
    }
    if (deps.isNonEmptyDestinationError(err)) {
      return {
        kind: "refusal-destination-not-empty",
        message: messageFor(err),
      };
    }
    return { kind: "fatal", message: messageFor(err) };
  }
}
