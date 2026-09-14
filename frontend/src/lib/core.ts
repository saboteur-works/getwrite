/**
 * @module core
 *
 * Public "core" API surface — the framework-free model/logic layer consumed by
 * non-frontend packages (currently the standalone `getwrite-cli`). It is the
 * single import boundary those packages depend on, so they never deep-import
 * frontend internals.
 *
 * This barrel deliberately pre-stages the future extraction of these modules
 * into a standalone `@gw/core` package: when that happens, this file becomes
 * the package entrypoint and consumers' imports stay unchanged. See
 * docs/architecture/ADRs/adr-016-cli-extraction-and-deferred-core-package.md.
 *
 * Keep this surface intentional: add a named re-export only when an external
 * consumer needs it. Use named (not `export *`) re-exports for the additions
 * below because some modules share symbol names (e.g. both `backlinks` and
 * `pruneExecutor` export `listResourceIds`).
 */

// Curated model barrel (types, project, resource, resource-templates,
// media-validation — includes getLocalResources / writeResourceToFile).
export * from "./models";

// Projects
export { createProjectFromType } from "./models/project-creator";

// Folders
export { readFolderTree, renameFolderById } from "./models/folder-utils";

// Sidecars
export { readSidecar, writeSidecar } from "./models/sidecar";

// Trash — FR-8 nullified-reference record
export {
  writeTrashRefRecord,
  readTrashRefRecord,
  type TrashRefRecord,
} from "./models/trash";

// Trash — FR-18 ordered, resumable purge sweep
export {
  purgeResource,
  purgeFolder,
  PurgeSweepError,
  type PurgeStepName,
} from "./models/trash";

// Revisions (pruning)
export { runCli as runPruneCli } from "./models/pruneExecutor";

// Index & backlinks
export { indexResource } from "./models/inverted-index";
export {
  listResourceIds,
  computeBacklinks,
  persistBacklinks,
} from "./models/backlinks";

// Content loading (lib sibling; moves into core alongside the models on
// extraction).
export { loadResourceContent } from "./tiptap-utils";

// Storage context (imperative helper for non-route entry points, e.g. the CLI)
export { runForTenant } from "./models/io";

// Entity mentions (alias table, offset detection, mention index persistence —
// needed by the CLI's `reindex` command to rebuild meta/index/mentions.json)
export { buildEntityAliasTable } from "./models/entity-alias-table";
export { findMentionOffsets } from "./models/entity-detection";
export {
  loadMentionIndex,
  persistMentionIndex,
  type MentionRecord,
  type MentionIndex,
} from "./models/mention-index";

// Scrivener import (CLI's `project import-scrivener` command)
export {
  importScrivenerProject,
  UnsupportedScrivenerProjectError,
  DestinationNotEmptyError,
  type ImportScrivenerProjectOptions,
  type ImportScrivenerProjectResult,
} from "./models/scrivener/import-scrivener-project";

// DOCX import (CLI's `project import-docx` command)
export {
  importDocxProject,
  UnknownProjectTypeError,
  DocxDestinationNotEmptyError,
  type ImportDocxProjectOptions,
  type ImportDocxProjectResult,
} from "./models/docx/import-docx-project";

// DOCX source detection (needed by the CLI to refuse --split-level against a
// directory source before calling the orchestrator).
export {
  detectDocxSource,
  NoDocxFilesFoundError,
} from "./models/docx/source-detection";
