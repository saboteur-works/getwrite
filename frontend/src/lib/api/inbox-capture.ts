/**
 * @module api/inbox-capture
 *
 * Client for the Inbox capture call (Feature 106, FR-2, FR-9, FR-10). One
 * request creates the item and everything it needs; this module never
 * composes the existing create, config or writing-log calls. HTTP
 * (`POST /api/project/capture`) on web/desktop, an in-process backend
 * (`native-inbox-capture-backend`) on native, resolved through
 * `createTransport`.
 *
 * Result contract: the three typed results (`created`, `needs-choice`,
 * `refused`) are returned unchanged on both transports. A `created` result
 * carries `inboxFolderId`; this client does not touch the store, so the host
 * must refresh `StoredProject.inboxFolderId` when a capture created the Inbox.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): a locked project
 * rejects with the locked-access error on both transports (over HTTP a 401 or
 * 409 is mapped back by `lockedAccessErrorFromResponse`); any other failure
 * rejects with the server's message; a malformed body is reported through
 * `reportTransportValidationFailure` (which never receives the body) and
 * rejects. Nothing is returned as an empty or fabricated result.
 */
import { z } from "zod";
import { createTransport } from "../../store/transport/create-transport";
import { lockedAccessErrorFromResponse } from "./locked-response";
import { reportTransportValidationFailure } from "./transport-validation";
import type { CaptureRequest, CaptureResult } from "./inbox-capture-types";

/** The capture operation both platforms implement. */
export interface InboxCaptureTransport {
  capture(request: CaptureRequest): Promise<CaptureResult>;
}

const ENDPOINT = "/api/project/capture";

const NoticeSchema = z.object({
  code: z.enum([
    "empty",
    "text-too-long",
    "link-invalid",
    "seeding",
    "writing-log",
    "inbox-relocated",
    "inbox-renamed",
  ]),
  severity: z.enum(["info", "error"]),
  message: z.string(),
});

const CaptureResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    resourceId: z.string(),
    inboxFolderId: z.string(),
    notices: z.array(NoticeSchema),
  }),
  z.object({
    status: z.literal("needs-choice"),
    state: z.literal("inbox-in-trash"),
  }),
  z.object({ status: z.literal("refused"), notices: z.array(NoticeSchema) }),
]);

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/** HTTP transport: the hosted/desktop path. */
export const httpInboxCaptureTransport: InboxCaptureTransport = {
  async capture(request) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const locked = lockedAccessErrorFromResponse(response, request.projectId);
      if (locked) throw locked;
      throw new Error(
        await errorMessage(
          response,
          `Failed to capture the note (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = CaptureResultSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportTransportValidationFailure(
        "inbox-capture.captureToInbox",
        parsed.error.issues,
      );
      throw new Error("The capture response was malformed.");
    }
    return parsed.data;
  },
};

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-inbox-capture-backend")` specifier so
 * `next.config.mjs`'s `turbopack.resolveAlias` can substitute a `node:*`-free
 * web-stub at build time.
 */
const resolveInboxCaptureTransport: () => Promise<InboxCaptureTransport> =
  createTransport(httpInboxCaptureTransport, () =>
    import("../../store/transport/native-inbox-capture-backend").then(
      ({ createNativeInboxCaptureTransport }) =>
        createNativeInboxCaptureTransport(),
    ),
  );

/**
 * Captures one note into the project's Inbox. Rejects on any failure,
 * including a locked project.
 *
 * @param request - Project id, text, optional link, origin and, on the second
 *   call after `needs-choice`, the writer's choice.
 * @returns The core's typed result, unchanged.
 */
export async function captureToInbox(
  request: CaptureRequest,
): Promise<CaptureResult> {
  const transport = await resolveInboxCaptureTransport();
  return transport.capture(request);
}
