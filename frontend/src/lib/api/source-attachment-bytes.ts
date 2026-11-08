/**
 * @module api/source-attachment-bytes
 *
 * Client for reading one Source attachment's bytes (Feature 103, FR-18
 * storage half, FR-30). Resolved through `createTransport`: HTTP on
 * web/desktop, an in-process backend (`native-source-attachment-bytes-backend`)
 * on native, both over `source-attachment-bytes-core`.
 *
 * Failure contract (`docs/standards/failure-visibility.md`): rejects on a
 * network error, a non-2xx status (the server's refusal message is the error
 * message) or a response without a usable kind. A locked project (HTTP 401 or
 * 409) is turned back into the locked-access error the native backend throws,
 * through `locked-response.ts`. No request carries a path: three ids only.
 */
import { createTransport } from "../../store/transport/create-transport";
import { lockedAccessErrorFromResponse } from "./locked-response";

/** An attachment's bytes and the kind the storage layer reports for them. */
export interface AttachmentBytesView {
  kind: "image" | "audio";
  mime: string;
  size: number;
  bytes: Uint8Array;
}

/** The byte-read operation both platforms implement. */
export interface AttachmentBytesTransport {
  readAttachmentBytes(
    projectId: string,
    resourceId: string,
    attachmentId: string,
  ): Promise<AttachmentBytesView>;
}

const ENDPOINT = "/api/project/source-attachments/bytes";

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
const httpAttachmentBytesTransport: AttachmentBytesTransport = {
  async readAttachmentBytes(projectId, resourceId, attachmentId) {
    const query = new URLSearchParams({ projectId, resourceId, attachmentId });
    const response = await fetch(`${ENDPOINT}?${query.toString()}`);
    if (!response.ok) {
      const locked = lockedAccessErrorFromResponse(response, projectId);
      if (locked) throw locked;
      throw new Error(
        await errorMessage(
          response,
          `Failed to read the attachment (HTTP ${response.status}).`,
        ),
      );
    }
    const kind = response.headers.get("x-attachment-kind");
    const mime = response.headers.get("content-type");
    if ((kind !== "image" && kind !== "audio") || !mime) {
      throw new Error("The attachment response was malformed.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { kind, mime, size: bytes.byteLength, bytes };
  },
};

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-source-attachment-bytes-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveAttachmentBytesTransport: () => Promise<AttachmentBytesTransport> =
  createTransport(httpAttachmentBytesTransport, () =>
    import("../../store/transport/native-source-attachment-bytes-backend").then(
      ({ createNativeAttachmentBytesTransport }) =>
        createNativeAttachmentBytesTransport(),
    ),
  );

/** One attachment's bytes, kind and mime. Rejects on any failure. */
export async function readAttachmentBytes(
  projectId: string,
  resourceId: string,
  attachmentId: string,
): Promise<AttachmentBytesView> {
  const transport = await resolveAttachmentBytesTransport();
  return transport.readAttachmentBytes(projectId, resourceId, attachmentId);
}
