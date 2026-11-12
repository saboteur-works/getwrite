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

/** What the refused write was for; picks the message's wording. */
export type EncryptedProjectRefusalSubject =
  | "capture"
  | "claims"
  | "fields"
  | "arrangements";

const ERROR_NAME = "EncryptedProjectCaptureRefusedError";

const MESSAGES: Record<
  EncryptedProjectRefusalSubject,
  Record<EncryptedProjectRefusalReason, string>
> = {
  capture: {
    encrypted:
      "Nothing was captured: this project is encrypted, and this device cannot yet encrypt what it writes. Capture into an unencrypted project instead.",
    "marker-unreadable":
      "Nothing was captured: this project's encryption marker could not be read, so the project was treated as encrypted. Try again, or choose another project.",
  },
  fields: {
    encrypted:
      "Fields can't be changed in an encrypted project on this device. It cannot yet encrypt what it writes, so nothing was saved.",
    "marker-unreadable":
      "Fields can't be changed right now: this project's encryption marker could not be read, so the project was treated as encrypted. Nothing was saved. Try again.",
  },
  arrangements: {
    encrypted:
      "Arrangements can't be changed in an encrypted project on this device. It cannot yet encrypt what it writes, so nothing was saved.",
    "marker-unreadable":
      "Arrangements can't be changed right now: this project's encryption marker could not be read, so the project was treated as encrypted. Nothing was saved. Try again.",
  },
  claims: {
    encrypted:
      "Claims can't be changed in an encrypted project on this device. It cannot yet encrypt what it writes, so nothing was saved.",
    "marker-unreadable":
      "Claims can't be changed right now: this project's encryption marker could not be read, so the project was treated as encrypted. Nothing was saved. Try again.",
  },
};

/**
 * The write was refused because the project is encrypted-marked (or its
 * marker is unreadable). The wording follows `subject`, default "capture".
 */
export class EncryptedProjectCaptureRefusedError extends Error {
  readonly reason: EncryptedProjectRefusalReason;

  constructor(
    reason: EncryptedProjectRefusalReason,
    options?: ErrorOptions & { subject?: EncryptedProjectRefusalSubject },
  ) {
    super(MESSAGES[options?.subject ?? "capture"][reason], options);
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
