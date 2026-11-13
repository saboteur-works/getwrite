/**
 * @module api/folklore
 *
 * Client transport for the Narratives module's variant read (Feature 110,
 * FR-13, FR-21): one variant's canonical-revision text as a typed
 * `VariantTextResult`. HTTP on web/desktop (`GET /api/folklore/variant-text`),
 * an in-process backend (`native-folklore-backend`) on native, resolved
 * through `createTransport`.
 *
 * Requests carry `projectId` and `resourceId`, never a path. The shared
 * `fetchResourceContent` is not used or edited.
 *
 * Failure contract: a thrown fetch, a non-ok response, a malformed body or any
 * native error resolves as `{ kind: "unreadable", reason }`, never as `none`
 * (an empty body). A locked project (HTTP 401/409, or the native locked-access
 * error) is rethrown as the locked-access error and never read as "no text".
 * The reason is a fixed sentence or the server's own refusal message; it never
 * echoes the request or a stored body.
 */
import { z } from "zod";
import { createTransport } from "../../store/transport/create-transport";
import type { VariantTextResult } from "../models/folklore-types";
import { isLockedAccessError } from "../models/locked-access";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";

export type { VariantTextResult };

/** The variant-read operation both platforms implement. */
interface FolkloreTransport {
  readVariantText(
    projectId: string,
    resourceId: string,
  ): Promise<VariantTextResult>;
}

const ENDPOINT = "/api/folklore/variant-text";

const ResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("unreadable"), reason: z.string() }),
  z.object({ kind: z.literal("locked") }),
]);

function unreadable(reason: string): VariantTextResult {
  return { kind: "unreadable", reason };
}

async function serverMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/** HTTP transport: the hosted/desktop path. */
const httpFolkloreTransport: FolkloreTransport = {
  async readVariantText(projectId, resourceId) {
    const query = `projectId=${encodeURIComponent(projectId)}&resourceId=${encodeURIComponent(resourceId)}`;
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}?${query}`);
    } catch {
      return unreadable("The variant could not be read: the request failed.");
    }
    if (!response.ok) {
      const locked = lockedAccessErrorFromResponse(response, projectId);
      if (locked) throw locked;
      return unreadable(
        await serverMessage(
          response,
          `The variant could not be read (HTTP ${response.status}).`,
        ),
      );
    }
    const body: unknown = await response.json().catch(() => null);
    const parsed = ResultSchema.safeParse(body);
    if (!parsed.success) {
      reportTransportValidationFailure(
        "folklore.readVariantText",
        parsed.error.issues,
      );
      return unreadable("The variant response was malformed.");
    }
    return parsed.data;
  },
};

/**
 * The thunk carries the literal `import(...)` specifier so
 * `next.config.mjs`'s `turbopack.resolveAlias` can substitute a `node:*`-free
 * web-stub at build time.
 */
const resolveFolkloreTransport: () => Promise<FolkloreTransport> =
  createTransport(httpFolkloreTransport, () =>
    import("../../store/transport/native-folklore-backend").then(
      ({ createNativeFolkloreTransport }) => createNativeFolkloreTransport(),
    ),
  );

/**
 * Reads one variant's canonical-revision text.
 *
 * @returns the typed result; a failure is `unreadable` with a reason.
 * @throws the locked-access error when the project is locked.
 */
export async function readVariantText(
  projectId: string,
  resourceId: string,
): Promise<VariantTextResult> {
  try {
    return await (
      await resolveFolkloreTransport()
    ).readVariantText(projectId, resourceId);
  } catch (error) {
    if (isLockedAccessError(error)) throw error;
    return unreadable(
      error instanceof Error && error.message
        ? error.message
        : "The variant could not be read.",
    );
  }
}
