/**
 * @module folklore-variant-read-core
 *
 * Feature 110 (folklore variants), Task 8 (FR-13, FR-16): the typed read of
 * one variant's canonical-revision text.
 *
 * - The text is the canonical revision's `content.bin`, the authoritative
 *   document as `useRevisionContent.ts` treats it, not `content.txt` (which
 *   Task 1 (g) observed can differ). The stored string is returned as is.
 * - A payload that is not JSON is plain text and is returned as `text` (the
 *   editor converts it the same way). A payload that starts like JSON but is
 *   not a parseable `doc` is `unreadable`; the editor would salvage it, a
 *   comparison must not present it as the variant's text.
 * - `none` is only an empty body: blank content, or a document with no text.
 *   A missing canonical revision, a missing revision file and an unusable
 *   document are `unreadable` with distinct fixed reasons, never `none`
 *   (`docs/standards/failure-visibility.md`). Reasons carry no stored content
 *   and no path.
 * - A locked-access error is rethrown unchanged, so a locked project is never
 *   `none` or `unreadable`. Any other unexpected read error also propagates.
 * - Read only: nothing is written. Reads go through the storage adapter
 *   (`io.ts`, `revision.ts`); `node:*` is not imported here.
 * - Takes a `projectId` and `resourceId` only; both are validated.
 *
 * Reachable from the CLI and the Electron workers: no React, JSX or JSON.
 */
import { readFile } from "./io";
import { isLockedAccessError } from "./locked-access";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { PROJECT_FILENAME } from "./project-config";
import { resolveProjectRoot } from "./project-root-resolver";
import { getCanonicalRevision, revisionDir } from "./revision";
import { isValidUUID } from "./uuid";
import type { VariantTextResult } from "./folklore-types";

export { InvalidProjectIdCoreError };

/** The project does not exist in the caller's storage scope. Map to HTTP 404. */
export class VariantProjectNotFoundError extends Error {
  constructor() {
    super("The project was not found.");
    this.name = "VariantProjectNotFoundError";
  }
}

/** `resourceId` is not a well-formed UUID. The value is never echoed. */
export class InvalidVariantResourceIdError extends Error {
  constructor() {
    super("Invalid resourceId");
    this.name = "InvalidVariantResourceIdError";
  }
}

/** Fixed reasons shown for an unreadable variant, one per failure. */
export const VARIANT_UNREADABLE_REASONS = {
  noCanonicalRevision: "This variant has no canonical revision to read.",
  revisionFileMissing: "This variant's canonical revision file is missing.",
  documentUnusable: "This variant's stored document could not be read.",
} as const;

/** Whether any text node in a document holds a non-blank string. */
function hasText(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const { text, content } = node as { text?: unknown; content?: unknown };
  if (typeof text === "string" && text.trim() !== "") return true;
  return Array.isArray(content) && content.some(hasText);
}

function classify(raw: string): VariantTextResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "none" };
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { kind: "text", text: raw };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.documentUnusable,
    };
  }
  const isDoc =
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { type?: unknown }).type === "doc";
  if (!isDoc) {
    return {
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.documentUnusable,
    };
  }
  return hasText(parsed) ? { kind: "text", text: raw } : { kind: "none" };
}

async function assertProjectExists(projectRoot: string): Promise<void> {
  try {
    await readFile(`${projectRoot}/${PROJECT_FILENAME}`, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VariantProjectNotFoundError();
    }
    throw err;
  }
}

/**
 * Read one variant's canonical-revision text as a typed result. Never returns
 * `locked`: a locked project throws (the route and clients map it).
 *
 * @param projectId Server-validated project id.
 * @param resourceId The variant's resource id.
 * @throws InvalidProjectIdCoreError, InvalidVariantResourceIdError,
 *   VariantProjectNotFoundError, and a locked-access error unchanged.
 */
export async function readVariantTextCore(
  projectId: string,
  resourceId: string,
): Promise<VariantTextResult> {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
  if (!isValidUUID(resourceId)) throw new InvalidVariantResourceIdError();
  await assertProjectExists(projectRoot);
  const canonical = await getCanonicalRevision(projectRoot, resourceId);
  if (canonical === null) {
    return {
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.noCanonicalRevision,
    };
  }
  let raw: string;
  try {
    raw = await readFile(
      `${revisionDir(projectRoot, resourceId, canonical.versionNumber)}/content.bin`,
      "utf8",
    );
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        kind: "unreadable",
        reason: VARIANT_UNREADABLE_REASONS.revisionFileMissing,
      };
    }
    throw err;
  }
  return classify(raw);
}
