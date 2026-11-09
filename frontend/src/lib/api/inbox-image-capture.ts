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
  /**
   * Runs the encrypted-project guard alone, before any image bytes are read
   * (FR-11). Rejects with the typed refusal; resolves with nothing written.
   */
  assertAllowed(projectId: string): Promise<void>;
}

/** Non-native stand-in: image capture has no HTTP path. */
const nativeOnlyTransport: InboxImageCaptureTransport = {
  capture(): Promise<ImageCaptureResult> {
    return Promise.reject(
      new Error("Image capture is native-only: it is not available here."),
    );
  },
  assertAllowed(): Promise<void> {
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

/**
 * Checks that a project may receive a captured image, before any image bytes
 * are read (native only). Rejects with the typed encrypted-project refusal
 * when the project carries the encrypted marker or its marker cannot be read;
 * writes nothing.
 *
 * @param projectId - The on-disk project directory id.
 */
export async function assertImageCaptureAllowed(
  projectId: string,
): Promise<void> {
  const transport = await resolveInboxImageCaptureTransport();
  return transport.assertAllowed(projectId);
}
