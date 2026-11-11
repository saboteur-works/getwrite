/**
 * @module store/transport/native-encrypted-project-guard
 *
 * Native-only guard (Feature 107, FR-11): refuses a capture into a project
 * that carries the encrypted marker, before any write and before any image
 * bytes are read. Native storage has no encrypting layer (FR-1(c)), so a
 * native write would be stored in plain; the owner decided to refuse and
 * document rather than write. Applied by the native capture backends only;
 * the web and desktop routes are unchanged.
 *
 * Must run inside the native storage context (`createNativeRunner`).
 *
 * Failure visibility: `isProjectEncrypted` reads any marker read failure as
 * "absent", so the guard reads through a wrapper that records a read failure
 * other than ENOENT; such a failure, like a corrupt marker, refuses.
 */
import {
  getPlainStorageAdapter,
  type StorageAdapter,
} from "../../lib/models/io";
import { isProjectEncrypted } from "../../lib/models/crypto/project-marker";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import {
  EncryptedProjectCaptureRefusedError,
  type EncryptedProjectRefusalSubject,
} from "../../lib/api/encrypted-project-refusal";

function isAbsent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Throws {@link EncryptedProjectCaptureRefusedError} when the project carries
 * the encrypted marker or the marker cannot be read. A malformed project id
 * returns without a check so the core raises its own typed error.
 *
 * @param projectId - The on-disk project directory id.
 * @param subject - What the write is for; picks the refusal's wording.
 */
export async function assertProjectNotEncrypted(
  projectId: string,
  subject: EncryptedProjectRefusalSubject = "capture",
): Promise<void> {
  const projectRoot = resolveProjectRoot(projectId);
  if (projectRoot === null) return;

  const plain = getPlainStorageAdapter();
  let readFailure: unknown;
  const recording: StorageAdapter = {
    ...plain,
    readFile: async (target, encoding) => {
      try {
        return await plain.readFile(target, encoding);
      } catch (err: unknown) {
        if (!isAbsent(err)) readFailure = err;
        throw err;
      }
    },
  };

  let isEncrypted: boolean;
  try {
    isEncrypted = await isProjectEncrypted(projectRoot, recording);
  } catch (err: unknown) {
    throw new EncryptedProjectCaptureRefusedError("marker-unreadable", {
      cause: err,
      subject,
    });
  }
  if (isEncrypted)
    throw new EncryptedProjectCaptureRefusedError("encrypted", { subject });
  if (readFailure !== undefined) {
    throw new EncryptedProjectCaptureRefusedError("marker-unreadable", {
      cause: readFailure,
      subject,
    });
  }
}
