import type { LimitKey } from "./limits-store";

/**
 * Working copy (Feature 77, FR-13): the plain message a paired device sees
 * when a limited action is refused. One per limit; each says what is limited
 * and that it is done at the desktop. Not yet owner-confirmed.
 */
export const LIMIT_REFUSAL_MESSAGES: Record<LimitKey, string> = {
  projectDeletion:
    "Deleting a project is turned off here. Do it at the desktop.",
  unlocking:
    "Unlocking encrypted projects is turned off here. Do it at the desktop.",
  locking:
    "Locking encrypted projects is turned off here. Do it at the desktop.",
  encryptionChanges:
    "Changing encryption is turned off here. Do it at the desktop.",
  permanentDeletion:
    "Permanently deleting from the trash is turned off here. Do it at the desktop.",
};

/**
 * Working copy (Feature 77, FR-11): creating the workspace passphrase is never
 * allowed from a paired device, whatever the five switches say. Reported with
 * the `encryptionChanges` limit value.
 */
export const PASSPHRASE_CREATION_REFUSAL_MESSAGE =
  "Creating the encryption passphrase has to be done at the desktop.";
