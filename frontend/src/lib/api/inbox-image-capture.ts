/**
 * @module api/inbox-image-capture
 *
 * Client for the native image capture call (Feature 107, FR-7). In-process on
 * native only (`native-inbox-image-capture-backend`, resolved through
 * `createTransport`); there is no HTTP route, so on web and desktop the call
 * rejects with a native-only message and makes no request.
 *
 * Result contract: the core's typed results (`created`, `needs-choice`,
 * `refused`) are returned unchanged. Errors, including the typed
 * encrypted-project refusal and the locked-access error, propagate unchanged.
 * Nothing is returned as an empty or fabricated result.
 */
import { createTransport } from "../../store/transport/create-transport";
import type {
  ImageCaptureRequest,
  ImageCaptureResult,
} from "../models/inbox-image-capture-core";

export type { ImageCaptureRequest, ImageCaptureResult };

/** The image capture operation the native backend implements. */
export interface InboxImageCaptureTransport {
  capture(request: ImageCaptureRequest): Promise<ImageCaptureResult>;
}

/** Non-native stand-in: image capture has no HTTP path. */
const nativeOnlyTransport: InboxImageCaptureTransport = {
  capture(): Promise<ImageCaptureResult> {
    return Promise.reject(
      new Error("Image capture is native-only: it is not available here."),
    );
  },
};

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-inbox-image-capture-backend")`
 * specifier so `next.config.mjs` can substitute a `node:*`-free web-stub.
 */
const resolveInboxImageCaptureTransport: () => Promise<InboxImageCaptureTransport> =
  createTransport(nativeOnlyTransport, () =>
    import("../../store/transport/native-inbox-image-capture-backend").then(
      ({ createNativeInboxImageCaptureTransport }) =>
        createNativeInboxImageCaptureTransport(),
    ),
  );

/**
 * Captures one image into the project's Inbox (native only).
 *
 * @param request - Directory project id, bytes, name, MIME type, size and, on
 *   the second call after `needs-choice`, the writer's choice.
 * @returns The core's typed result, unchanged.
 */
export async function captureImageToInbox(
  request: ImageCaptureRequest,
): Promise<ImageCaptureResult> {
  const transport = await resolveInboxImageCaptureTransport();
  return transport.capture(request);
}
