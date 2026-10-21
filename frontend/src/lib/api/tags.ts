import { z } from "zod";
import type { Tag } from "../models/types";
import { createTransport } from "../../store/transport/create-transport";
import { ApiTagSchema, TagAssignmentsResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

const TagsListResponseSchema = z.object({
  tags: z.array(ApiTagSchema).optional(),
});

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021 Phase 2, Task 4)
//
// One TagsTransport contract with two implementations selected by the
// build-time runtime, mirroring lib/api/projects.ts:
//
// - Web/hosted/desktop -> httpTagsTransport, which carries the original
//   `fetch(...)` calls byte-for-byte, including `listTags`/
//   `listTagAssignments`'s degrade-to-`[]`-on-`!response.ok` behavior and
//   `createTag`/`deleteTag`/`assignTag`'s fire-and-forget (no response
//   check, no return value) behavior.
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-tags-backend`), dynamically imported
//   only when `runtime === "native"`, reusing the shared tags CRUD core
//   (`../models/tags-crud-core.ts`) instead of HTTP.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/**
 * The tags-route-backed operations both platforms implement. Shared with
 * `../../store/transport/native-tags-backend`, which imports this type
 * rather than duplicating it.
 */
export interface TagsTransport {
  /** Lists every project-level tag. Degrades to `[]` on failure. */
  list(projectId: string): Promise<Tag[]>;
  /**
   * Lists every project-level tag, REJECTING on any failure (network error,
   * non-2xx, malformed body, and on native any error the core throws,
   * a locked-access error included). For the caller that must tell "this
   * project has no tags" from "the read failed"
   * (`docs/standards/failure-visibility.md`); `list` is unchanged.
   */
  listOrThrow(projectId: string): Promise<Tag[]>;
  /** Lists the tag ids assigned to a resource. Degrades to `[]` on failure. */
  listAssignments(projectId: string, resourceId: string): Promise<string[]>;
  /**
   * Creates a new project-level tag. A blank name, an existing tag's name
   * (ignoring capitals) or a non-hex colour rejects with
   * {@link TagChangeRefusedError}.
   *
   * REJECTS on failure. These three writes used to be fire-and-forget: no
   * response check, no throw, so a failed write resolved exactly like a
   * successful one and the UI showed a tag that was never persisted until the
   * next reload. `TagsSection.tsx` even carried a revert-on-failure `catch`
   * that nothing could ever reach (`docs/standards/failure-visibility.md`).
   */
  create(projectId: string, name: string, color?: string): Promise<void>;
  /** Deletes a project-level tag. Rejects on failure — see {@link create}. */
  remove(projectId: string, tagId: string): Promise<void>;
  /**
   * Renames and recolours a tag; an absent `changes.color` clears the colour.
   * Resolves the updated tag. A refused name or colour (blank, a duplicate
   * name, a non-hex colour) rejects with {@link TagChangeRefusedError}, whose
   * message is written for the writer; any other failure rejects with a
   * plain `Error`.
   */
  update(projectId: string, tagId: string, changes: TagChanges): Promise<Tag>;
  /**
   * Assigns or unassigns a tag to/from a resource. Rejects on failure — see
   * {@link create}.
   */
  assign(
    projectId: string,
    resourceId: string,
    tagId: string,
    assign: boolean,
  ): Promise<void>;
}

/** The editable fields of a tag. An absent `color` means no colour. */
export interface TagChanges {
  name: string;
  color?: string;
}

/**
 * A tag change the project refused, such as a blank or duplicate name. The
 * message is the project's own refusal, written for the writer.
 */
export class TagChangeRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagChangeRefusedError";
  }
}

const TagUpdateResponseSchema = z.object({ tag: ApiTagSchema });
const TagRefusalResponseSchema = z.object({ details: z.string() });

/**
 * Throws {@link TagChangeRefusedError} when the route refused a tag create or
 * update (400 with a `details` reason). The refusal body carries only the
 * route's own message, never project content, so it is safe to show.
 */
async function throwIfRefused(response: Response): Promise<void> {
  if (response.status !== 400) return;
  const refusal = TagRefusalResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (refusal.success) throw new TagChangeRefusedError(refusal.data.details);
}

/**
 * Throws when a tag write did not succeed.
 *
 * The message names the attempted action so a caller can say what failed
 * without re-deriving it, and carries the status for the console — never the
 * response body, which on an encrypted project can hold decrypted user prose
 * (`docs/standards/security.md`).
 */
function throwIfWriteFailed(response: Response, action: string): void {
  if (response.ok) return;
  throw new Error(`Could not ${action} (${response.status}).`);
}

/**
 * HTTP transport — the hosted/desktop path. Every method body below is the
 * original public function's `fetch` call verbatim; preserving it exactly is
 * what keeps the server build unchanged.
 */
export const httpTagsTransport: TagsTransport = {
  async list(projectId) {
    const response = await fetch("/api/project/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", projectId }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as unknown;
    const result = TagsListResponseSchema.safeParse(data);
    if (!result.success) {
      reportTransportValidationFailure("tags.list", result.error.issues);
      return [];
    }
    return result.data.tags ?? [];
  },

  async listOrThrow(projectId) {
    const response = await fetch("/api/project/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", projectId }),
    });
    if (!response.ok) {
      throw new Error(
        `Could not load the project's tags (${response.status}).`,
      );
    }
    const data = (await response.json()) as unknown;
    const result = TagsListResponseSchema.safeParse(data);
    if (!result.success) {
      reportTransportValidationFailure("tags.listOrThrow", result.error.issues);
      throw new Error("Malformed tags response.");
    }
    return result.data.tags ?? [];
  },

  async listAssignments(projectId, resourceId) {
    const response = await fetch("/api/project/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assignments", projectId, resourceId }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as unknown;
    const result = TagAssignmentsResponseSchema.safeParse(data);
    if (!result.success) {
      reportTransportValidationFailure(
        "tags.listAssignments",
        result.error.issues,
      );
      return [];
    }
    return result.data.tagIds ?? [];
  },

  async create(projectId, name, color) {
    const response = await fetch("/api/project/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", projectId, name, color }),
    });
    await throwIfRefused(response);
    throwIfWriteFailed(response, "create the tag");
  },

  async remove(projectId, tagId) {
    const response = await fetch("/api/project/tags/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, tagId }),
    });
    throwIfWriteFailed(response, "delete the tag");
  },

  async update(projectId, tagId, changes) {
    const response = await fetch("/api/project/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", projectId, tagId, ...changes }),
    });
    await throwIfRefused(response);
    throwIfWriteFailed(response, "update the tag");
    const result = TagUpdateResponseSchema.safeParse(await response.json());
    if (!result.success) {
      reportTransportValidationFailure("tags.update", result.error.issues);
      throw new Error("Malformed tag update response.");
    }
    return result.data.tag;
  },

  async assign(projectId, resourceId, tagId, assign) {
    const response = await fetch("/api/project/tags/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, resourceId, tagId, assign }),
    });
    throwIfWriteFailed(response, assign ? "assign the tag" : "remove the tag");
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-tags-backend")` specifier so
 * Turbopack's `resolveAlias` (`next.config.mjs`) can substitute a
 * `node:*`-free web-stub for it at build time.
 */
export const resolveTagsTransport: () => Promise<TagsTransport> =
  createTransport(httpTagsTransport, () =>
    import("../../store/transport/native-tags-backend").then(
      ({ createNativeTagsTransport }) => createNativeTagsTransport(),
    ),
  );

type TagsChangedListener = (projectId: string) => void;
const tagsChangedListeners = new Set<TagsChangedListener>();

/**
 * Subscribes to successful tag-list changes (create, update, delete) made
 * through this module, so a view holding its own copy of the list, such as
 * the sidebar Tags section, can reload it. Returns the unsubscribe function.
 */
export function onTagsChanged(listener: TagsChangedListener): () => void {
  tagsChangedListeners.add(listener);
  return () => {
    tagsChangedListeners.delete(listener);
  };
}

function notifyTagsChanged(projectId: string): void {
  tagsChangedListeners.forEach((listener) => listener(projectId));
}

/**
 * Fetches all project-level tags.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function listTags(projectId: string): Promise<Tag[]> {
  const transport = await resolveTagsTransport();
  return transport.list(projectId);
}

/**
 * Fetches all project-level tags, rejecting on any failure instead of
 * degrading to `[]` like {@link listTags}. A locked or keyless encrypted
 * project fails here too (HTTP 401/409, or the thrown locked-access error on
 * native), so a caller can show a failure rather than "no tags".
 *
 * @param projectId - The project's on-disk directory basename.
 */
export async function listTagsOrThrow(projectId: string): Promise<Tag[]> {
  const transport = await resolveTagsTransport();
  return transport.listOrThrow(projectId);
}

/**
 * Fetches the tag ids assigned to a given resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function listTagAssignments(
  projectId: string,
  resourceId: string,
): Promise<string[]> {
  const transport = await resolveTagsTransport();
  return transport.listAssignments(projectId, resourceId);
}

/**
 * Creates a new project-level tag.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function createTag(
  projectId: string,
  name: string,
  color?: string,
): Promise<void> {
  const transport = await resolveTagsTransport();
  await transport.create(projectId, name, color);
  notifyTagsChanged(projectId);
}

/**
 * Renames and recolours a project-level tag; leaving out `changes.color`
 * clears its colour. The tag keeps its id, so its assignments are unchanged.
 * Rejects with {@link TagChangeRefusedError} when the change is refused.
 *
 * @param projectId - The project's on-disk directory basename.
 */
export async function updateTag(
  projectId: string,
  tagId: string,
  changes: TagChanges,
): Promise<Tag> {
  const transport = await resolveTagsTransport();
  const tag = await transport.update(projectId, tagId, changes);
  notifyTagsChanged(projectId);
  return tag;
}

/**
 * Deletes a project-level tag.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags/delete` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function deleteTag(
  projectId: string,
  tagId: string,
): Promise<void> {
  const transport = await resolveTagsTransport();
  await transport.remove(projectId, tagId);
  notifyTagsChanged(projectId);
}

/**
 * Assigns or unassigns a tag to/from a resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags/assign` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function assignTag(
  projectId: string,
  resourceId: string,
  tagId: string,
  assign: boolean,
): Promise<void> {
  const transport = await resolveTagsTransport();
  await transport.assign(projectId, resourceId, tagId, assign);
}
