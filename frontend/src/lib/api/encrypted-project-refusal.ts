/**
 * @module api/encrypted-project-refusal
 *
 * The typed error the native capture guard raises for a project that carries
 * the encrypted marker, or whose marker cannot be read (Feature 107, FR-11).
 * Kept in its own import-free module so a component can recognise it without
 * pulling the guard's storage imports into the web bundle.
 *
 * Native storage has no encrypting layer (Feature 107 FR-1(c)), so a native
 * write into such a project would be stored in plain; the guard refuses
 * before any write instead.
 */

/** Why the project was refused. */
export type EncryptedProjectRefusalReason = "encrypted" | "marker-unreadable";

const ERROR_NAME = "EncryptedProjectCaptureRefusedError";

/** Nothing was captured because the project is encrypted-marked. */
export class EncryptedProjectCaptureRefusedError extends Error {
  readonly reason: EncryptedProjectRefusalReason;

  constructor(reason: EncryptedProjectRefusalReason, options?: ErrorOptions) {
    super(
      reason === "encrypted"
        ? "Nothing was captured: this project is encrypted, and this device cannot yet encrypt what it writes. Capture into an unencrypted project instead."
        : "Nothing was captured: this project's encryption marker could not be read, so the project was treated as encrypted. Try again, or choose another project.",
      options,
    );
    this.name = ERROR_NAME;
    this.reason = reason;
  }
}

/** True for the typed refusal; matched by name so a bundle copy still matches. */
export function isEncryptedProjectCaptureRefusal(
  error: unknown,
): error is EncryptedProjectCaptureRefusedError {
  return error instanceof Error && error.name === ERROR_NAME;
}
