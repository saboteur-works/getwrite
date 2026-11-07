/**
 * @module api/folder-metadata
 *
 * Client transport for a folder's metadata sidecar (Feature 102, Task 9,
 * FR-8), mirroring `goal-filter.ts` and `project-spelling.ts`.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): every method
 * REJECTS on a network error, a non-2xx status (the server's refusal message
 * is the error message) or a malformed body (reported through
 * `reportTransportValidationFailure`, which never receives the body). A failed
 * read never resolves to an empty value.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-folder-metadata-backend`) on native.
 */
import type { FolderSidecarValue } from "../models/folder-metadata-core";
import { createTransport } from "../../store/transport/create-transport";
import { FolderMetadataResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { FolderSidecarValue };

/** The folder-metadata operations both platforms implement. */
export interface FolderMetadataTransport {
  /** Notes, field values and subtype; an absent sidecar reads as empty. */
  getFolderMetadata(
    projectId: string,
    folderId: string,
  ): Promise<FolderSidecarValue>;
  /** Merges a client write (`notes`, `fieldValues`, `resourceSubtype`). */
  updateFolderMetadata(
    projectId: string,
    folderId: string,
    metadata: unknown,
  ): Promise<FolderSidecarValue>;
}

const ENDPOINT = "/api/project/folder-metadata";

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

async function parseResponse(
  callSite: string,
  response: Response,
  failureMessage: string,
): Promise<FolderSidecarValue> {
  if (!response.ok) {
    throw new Error(
      await errorMessage(
        response,
        `${failureMessage} (HTTP ${response.status}).`,
      ),
    );
  }
  const parsed = FolderMetadataResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    reportTransportValidationFailure(callSite, parsed.error.issues);
    throw new Error("The folder metadata response was malformed.");
  }
  return {
    notes: parsed.data.notes,
    fieldValues: parsed.data.fieldValues as FolderSidecarValue["fieldValues"],
    resourceSubtype: parsed.data.resourceSubtype,
  };
}

/** HTTP transport: the hosted/desktop path. */
export const httpFolderMetadataTransport: FolderMetadataTransport = {
  async getFolderMetadata(projectId, folderId) {
    const query = new URLSearchParams({ projectId, folderId });
    const response = await fetch(`${ENDPOINT}?${query.toString()}`);
    return parseResponse(
      "folder-metadata.getFolderMetadata",
      response,
      "Failed to load the folder's metadata",
    );
  },
  async updateFolderMetadata(projectId, folderId, metadata) {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, folderId, metadata }),
    });
    return parseResponse(
      "folder-metadata.updateFolderMetadata",
      response,
      "Failed to save the folder's metadata",
    );
  },
};

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-folder-metadata-backend")` specifier
 * so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveFolderMetadataTransport: () => Promise<FolderMetadataTransport> =
  createTransport(httpFolderMetadataTransport, () =>
    import("../../store/transport/native-folder-metadata-backend").then(
      ({ createNativeFolderMetadataTransport }) =>
        createNativeFolderMetadataTransport(),
    ),
  );

/** Reads a folder's metadata. Rejects on any failure. */
export async function getFolderMetadata(
  projectId: string,
  folderId: string,
): Promise<FolderSidecarValue> {
  const transport = await resolveFolderMetadataTransport();
  return transport.getFolderMetadata(projectId, folderId);
}

/** Writes a folder's metadata. Rejects on any failure, including a refusal. */
export async function updateFolderMetadata(
  projectId: string,
  folderId: string,
  metadata: unknown,
): Promise<FolderSidecarValue> {
  const transport = await resolveFolderMetadataTransport();
  return transport.updateFolderMetadata(projectId, folderId, metadata);
}
