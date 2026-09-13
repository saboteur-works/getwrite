// Last Updated: 2026-09-13

/**
 * Pure request handler for the DOCX import worker (FR-17).
 *
 * This file lives under `electron/src` and is compiled by `electron/tsconfig.json`
 * (`rootDir: "src"`). It must import nothing from `@gw/core` or any frontend
 * path — doing so would pull a file outside `rootDir` into that program and
 * fail the real emitting `tsc` build with TS6059. All shapes it needs are
 * declared locally, and the real `@gw/core` calls are injected via `deps` by
 * the actual worker entry point (`electron/worker/docx-import-worker.ts`),
 * which is built by a separate esbuild bundle and never shares a tsconfig
 * program with this file.
 *
 * Structured on the identical `electron/src` (`@gw/core`-free) vs.
 * `electron/worker` (`@gw/core`-allowed) split
 * `electron/src/scrivener-import/handle-import-request.ts` established, for
 * the same TS6059 `rootDir` reason recorded there. This is a new, parallel
 * pair of files — it does not modify the Scrivener worker or its handler.
 */
import path from "node:path";

/** Request to import a single DOCX source, as sent by the main process. */
export interface ImportRequest {
  /** Absolute path to the source: either a single `.docx` file or a directory containing one or more `.docx` files (FR-1). */
  readonly sourcePath: string;
  /** Absolute path where the new destination GetWrite project should be created. */
  readonly projectRoot: string;
  /** Destination project name. */
  readonly name: string;
  /**
   * Heading level to split a single-file source at (FR-2, FR-9); ignored
   * for a folder source. Mirrors `HeadingSplitLevel` from
   * `frontend/src/lib/models/docx/heading-split.ts` structurally — that
   * type is not imported here to keep this file `@gw/core`-free.
   */
  readonly splitLevel?: 1 | 2 | 3 | 4 | 5 | 6 | "none";
  /** Project-type spec `id` (FR-8, FR-9). */
  readonly projectType?: string;
}

/** Structural mirror of the fields consumers of a successful import need. */
export interface ImportOutcomeData {
  readonly projectId: string;
  readonly projectRoot: string;
  readonly folderCount: number;
  readonly resourceCount: number;
  readonly report: string;
}

/** A successful import. */
export interface ImportSuccessOutcome extends ImportOutcomeData {
  readonly kind: "success";
}

/** The source contained no `.docx` file anywhere in its tree (FR-1). */
export interface ImportRefusalNoDocxFoundOutcome {
  readonly kind: "refusal-no-docx-found";
  readonly message: string;
}

/** The destination project root already exists and is non-empty (FR-7). */
export interface ImportRefusalDestinationNotEmptyOutcome {
  readonly kind: "refusal-destination-not-empty";
  readonly message: string;
}

/** The requested project type did not match an existing project-type spec (FR-8). */
export interface ImportRefusalUnknownProjectTypeOutcome {
  readonly kind: "refusal-unknown-project-type";
  readonly message: string;
}

/** Any other error raised while importing. */
export interface ImportFatalOutcome {
  readonly kind: "fatal";
  readonly message: string;
}

/** The five-kind discriminated outcome protocol the worker replies with (FR-17). */
export type ImportOutcome =
  | ImportSuccessOutcome
  | ImportRefusalNoDocxFoundOutcome
  | ImportRefusalDestinationNotEmptyOutcome
  | ImportRefusalUnknownProjectTypeOutcome
  | ImportFatalOutcome;

/** Injected dependencies, kept free of any `@gw/core` type. */
export interface HandleImportRequestDeps {
  /** Runs the actual import and resolves to its outcome data. */
  runImport(request: ImportRequest): Promise<ImportOutcomeData>;
  /** True when `err` indicates the source contained no `.docx` file. */
  isUnsupportedSourceError(err: unknown): boolean;
  /** True when `err` indicates a non-empty destination. */
  isNonEmptyDestinationError(err: unknown): boolean;
  /** True when `err` indicates an unrecognized project type. */
  isUnknownProjectTypeError(err: unknown): boolean;
}

/**
 * Extracts a human-readable message from an unknown thrown value, for
 * server-side logging only. Never forward this value into an
 * {@link ImportOutcome} — a thrown error's message can embed the absolute
 * source path, which must never reach the renderer.
 *
 * @param err - The thrown value.
 * @returns Its `message` if it is an `Error`, otherwise its string form.
 */
function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Fixed, path-free message for a refused no-docx-found import. */
const NO_DOCX_FOUND_MESSAGE =
  "No .docx files were found at the selected location, so there's nothing to import.";

/** Fixed, path-free message for a refused non-empty-destination import. */
const DESTINATION_NOT_EMPTY_MESSAGE =
  "A project already exists at the destination and won't be overwritten.";

/** Fixed message for a refused unknown-project-type import. */
const UNKNOWN_PROJECT_TYPE_MESSAGE =
  "The selected project type isn't recognized, so the import couldn't start.";

/** Fixed, path-free message for any other import failure. */
const FATAL_IMPORT_MESSAGE =
  "The import couldn't complete due to an unexpected error. Check the application logs for details.";

/**
 * Runs `deps.runImport` for `request` and resolves to one of the five
 * discriminated outcomes, never rejecting.
 *
 * The success outcome's `projectId` is always derived from `request
 * .projectRoot`'s basename — the destination directory id the frontend's
 * `openProject`/`handleOpen` expect (FR-7, mirroring the Scrivener worker's
 * own FR-7 handling) — rather than trusted from whatever `deps.runImport`
 * returns, since a project's on-disk directory id and its `project.json` id
 * are two different UUIDs in this codebase.
 *
 * No outcome ever carries a thrown error's raw `message`: it can embed the
 * absolute source path, so every non-success branch uses a fixed, generic
 * message instead and logs the real error to the console for server-side
 * diagnosis.
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
    return {
      kind: "success",
      ...data,
      projectId: path.basename(request.projectRoot),
    };
  } catch (err) {
    if (deps.isUnsupportedSourceError(err)) {
      console.error(`DOCX import refused (no .docx found): ${messageFor(err)}`);
      return { kind: "refusal-no-docx-found", message: NO_DOCX_FOUND_MESSAGE };
    }
    if (deps.isNonEmptyDestinationError(err)) {
      console.error(
        `DOCX import refused (destination not empty): ${messageFor(err)}`,
      );
      return {
        kind: "refusal-destination-not-empty",
        message: DESTINATION_NOT_EMPTY_MESSAGE,
      };
    }
    if (deps.isUnknownProjectTypeError(err)) {
      console.error(
        `DOCX import refused (unknown project type): ${messageFor(err)}`,
      );
      return {
        kind: "refusal-unknown-project-type",
        message: UNKNOWN_PROJECT_TYPE_MESSAGE,
      };
    }
    console.error(`DOCX import failed: ${messageFor(err)}`);
    return { kind: "fatal", message: FATAL_IMPORT_MESSAGE };
  }
}
