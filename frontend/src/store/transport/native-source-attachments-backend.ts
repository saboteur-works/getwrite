/**
 * @module store/transport/native-source-attachments-backend
 *
 * In-process {@link AttachmentTransport} for a native (Capacitor) build: runs
 * the same cores the HTTP route uses (`source-attachments-core.ts`) inside the
 * native storage context. Validation lives in the core (the same
 * `validateAttachmentFile` the route pre-checks with), so the same bad input
 * throws the same message here as it maps to 400/404/409 on the route. The
 * one boundary check the route makes itself, a malformed attachment id on
 * replace and remove, is repeated here with the shared message. Every error
 * propagates; nothing is returned as empty on failure.
 *
 * The file arrives as a `File` (the webview has one) and is read to bytes
 * here, as native media upload hands bytes to the core. Restore is the native
 * Trash backend's `restore` (`restoreOneCore`).
 *
 * Lock parity with the server is reasoned from the shared core, not run.
 *
 * Imported only on the native path (`lib/api/source-attachments.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import {
  addAttachmentCore,
  listAttachmentsCore,
  removeAttachmentCore,
  reorderAttachmentsCore,
  replaceAttachmentCore,
  type AddAttachmentInput,
} from "../../lib/models/source-attachments-core";
import {
  INVALID_RESOURCE_ID_MESSAGE,
  isResourceId,
} from "../../lib/models/resource-id";
import type { AttachmentTransport } from "../../lib/api/source-attachments";

async function toInput(file: File): Promise<AddAttachmentInput> {
  return {
    fileName: file.name,
    mimeType: file.type || undefined,
    fileBytes: new Uint8Array(await file.arrayBuffer()),
  };
}

function requireAttachmentId(attachmentId: string): void {
  if (!isResourceId(attachmentId)) {
    throw new Error(INVALID_RESOURCE_ID_MESSAGE);
  }
}

/**
 * Builds the in-process attachment transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeAttachmentsTransport(
  deps: NativeBackendDeps = {},
): AttachmentTransport {
  const run = createNativeRunner(deps);
  return {
    listAttachments: (projectId, resourceId) =>
      run(() => listAttachmentsCore(projectId, resourceId)),
    addAttachment: async (projectId, resourceId, file) => {
      const input = await toInput(file);
      return run(() => addAttachmentCore(projectId, resourceId, input));
    },
    replaceAttachment: async (projectId, resourceId, attachmentId, file) => {
      requireAttachmentId(attachmentId);
      const input = await toInput(file);
      return run(() =>
        replaceAttachmentCore(projectId, resourceId, attachmentId, input),
      );
    },
    removeAttachment: async (projectId, resourceId, attachmentId) => {
      requireAttachmentId(attachmentId);
      return run(() =>
        removeAttachmentCore(projectId, resourceId, attachmentId),
      );
    },
    reorderAttachments: (projectId, resourceId, orderedIds) =>
      run(() => reorderAttachmentsCore(projectId, resourceId, orderedIds)),
  };
}
