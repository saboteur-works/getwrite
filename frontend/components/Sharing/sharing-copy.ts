/**
 * All user-visible sharing strings (Feature 75), used verbatim from
 * `specs/features/home-network-sharing.md`. The owner reviewed this copy on
 * 2026-10-09 and changed two strings (the unencrypted-HTTP statement and the
 * interim exposure note); the rest was accepted as written.
 */

/** FR-20: shown to a device that is not paired. */
export const NOT_PAIRED_EXPLANATION =
  "This device is not paired. On your computer, open GetWrite, turn on sharing, and enter the code shown there.";

/** FR-19: the code does not match. */
export const PAIRING_CODE_WRONG =
  "That code is not right. Check the code on your computer and try again.";

/** FR-19: the code is expired, used up, or pairing is locked. */
export const PAIRING_CODE_UNUSABLE =
  "That code can no longer be used. Show a new code on your computer and try again.";

/** FR-19: the request failed or the reply was not understood; says nothing about the code. */
export const PAIRING_UNREACHABLE =
  "Could not reach GetWrite. Check your connection and try again.";

/** Pairing screen heading, field label and submit button. */
export const PAIRING_HEADING = "Pair this device";
export const PAIRING_CODE_LABEL = "Pairing code";
export const PAIRING_SUBMIT = "Pair";
export const PAIRING_SUBMITTING = "Pairing…";

// ---------------------------------------------------------------------------
// Desktop sharing controls (Task 20). Strings marked "spec" come from the
// spec, verbatim; strings marked "working copy" were this task's own wording.
// The owner reviewed both kinds on 2026-10-09 (see the note at the top).
// ---------------------------------------------------------------------------

/** FR-7(a), spec. */
export const SHARING_STATEMENT_UNENCRYPTED =
  "Sharing uses unencrypted HTTP. Enable it only on a network you trust.";

/** FR-7(b), spec. */
export const SHARING_STATEMENT_AVAILABILITY =
  "Your other devices can reach your projects only while GetWrite is open and awake on this computer, and the device is on the same network.";

/**
 * FR-30, spec. A separable piece of copy: Feature 77 removes it (delete this
 * constant and its render sites when that feature ships).
 */
export const INTERIM_EXPOSURE_NOTE =
  "A paired device can also lock, unlock and delete your projects.";

/** FR-6, spec: shown instead of a blank address list. */
export const NO_NETWORK_ADDRESS = "No network address found.";

/** FR-6, task wording: the state text while sharing is in effect. */
export const SHARING_IS_ON = "Sharing is on";

/** Working copy. */
export const SHARING_HEADING = "Home network sharing";
/** Working copy. */
export const SHARING_SWITCH_LABEL = "Share my projects on this network";
/** Working copy. */
export const SHARING_IS_OFF = "Sharing is off";
/** Working copy: heading of the address list. */
export const SHARING_ADDRESSES_HEADING =
  "Open one of these on your other devices";
/** Working copy: shown once the setting is recorded and a restart is due. */
export const SHARING_RESTART_TO_APPLY =
  "Your sharing change is saved. Restart to apply it.";
/** Working copy: shown before the relaunch call is made (FR-4). */
export const SHARING_RESTARTING =
  "Restarting GetWrite now. This window will close and reopen.";
/** Working copy. */
export const SHARING_RESTART_BUTTON = "Restart now";
/** Working copy: FR-24, shown when hosted auth blocks sharing. */
export const SHARING_BLOCKED_BY_HOSTED_AUTH =
  "Sharing stays off because this install uses hosted sign-in. Sharing and hosted sign-in never run together.";
/** Working copy: a code cannot be made while sharing is not in effect. */
export const SHARING_WRONG_STATE =
  "A pairing code can be made only while sharing is on. Restart to apply your change first.";
/** Working copy: the status could not be read. */
export const SHARING_STATUS_ERROR = "Could not read the sharing settings.";
/** Working copy: the setting could not be recorded. */
export const SHARING_CHANGE_ERROR = "Could not change the sharing setting.";
/** Working copy: the relaunch call failed. */
export const SHARING_RESTART_ERROR = "Could not restart GetWrite.";
/** Working copy: generating a code failed. */
export const SHARING_CODE_ERROR = "Could not make a pairing code.";
/** Working copy. */
export const PAIRING_CODE_HEADING = "Pairing code";
/** Working copy. */
export const PAIRING_CODE_GENERATE = "Show a pairing code";
/** Working copy. */
export const PAIRING_CODE_GENERATE_NEW = "Generate a new code";
/** Working copy: prefix of the countdown, followed by m:ss. */
export const PAIRING_CODE_EXPIRES_IN = "Expires in";
/** Working copy: the expired state. */
export const PAIRING_CODE_EXPIRED =
  "This code has expired. Generate a new one to pair a device.";
/** Working copy: live-region announcements. */
export const PAIRING_CODE_ANNOUNCE_GENERATED = "Pairing code generated.";
export const PAIRING_CODE_ANNOUNCE_EXPIRED = "Pairing code expired.";

// ---------------------------------------------------------------------------
// Paired devices (Feature 76, Task 7). "Spec" strings are from
// `specs/features/paired-device-management.md` FR-22, verbatim. Everything
// marked "Working copy" is wording this task added, not in the spec, and is
// awaiting owner confirmation at the exercise stage.
// ---------------------------------------------------------------------------

/** Spec. */
export const PAIRED_DEVICES_HEADING = "Paired devices";
/** Spec. */
export const PAIRED_DEVICES_EMPTY = "No devices are paired.";
/** Spec. */
export const PAIRED_DEVICES_UNREADABLE =
  "The list of paired devices cannot be read, so every other device is refused until it is repaired.";
/**
 * Working copy, for the owner to confirm: the unreadable text shown while
 * sharing is off, when nothing is being refused (OQ-17, FR-22).
 */
export const PAIRED_DEVICES_UNREADABLE_SHARING_OFF =
  "The list of paired devices cannot be read. When sharing is turned on, every other device will be refused until it is repaired.";
/** Spec: the location sentence; the path comes from the app at runtime. */
export function pairedDeviceLocation(path: string): string {
  return `The file is in ${path}.`;
}
/** Spec: the row action. */
export const PAIRED_DEVICE_RENAME = "Rename";
/** Spec. */
export const PAIRED_DEVICE_RENAME_ERROR = "Could not rename this device.";
/** Spec. */
export const PAIRED_DEVICE_ALREADY_GONE = "This device was already removed.";

/** Working copy: the list read failed (neither empty nor unreadable). */
export const PAIRED_DEVICES_LOAD_ERROR =
  "Could not read the list of paired devices.";
/** Working copy: shown while the first read is in flight. */
export const PAIRED_DEVICES_LOADING = "Reading paired devices…";
/** Working copy: rename form buttons. */
export const PAIRED_DEVICE_SAVE = "Save";
export const PAIRED_DEVICE_CANCEL = "Cancel";
/** Working copy: visible label of the rename field. */
export const PAIRED_DEVICE_NAME_LABEL = "Device name";
/** Working copy: the paired date, as the row shows it. */
export function pairedDevicePairedOn(formattedDate: string): string {
  return `Paired ${formattedDate}`;
}
/** Working copy: accessible name of a row's rename button. */
export function pairedDeviceRenameLabel(name: string): string {
  return `${PAIRED_DEVICE_RENAME} ${name}`;
}
/** Working copy: the same, when another device has the same name. */
export function pairedDeviceRenameLabelWithDate(
  name: string,
  formattedDate: string,
): string {
  return `${PAIRED_DEVICE_RENAME} ${name}, paired ${formattedDate}`;
}
/** Working copy: validation reasons from the main process. */
export const PAIRED_DEVICE_NAME_NOT_TEXT = "That name is not valid text.";
export const PAIRED_DEVICE_NAME_EMPTY = "Enter a name for this device.";
export const PAIRED_DEVICE_NAME_TOO_LONG =
  "Use 64 characters or fewer for the name.";
export const PAIRED_DEVICE_NAME_CONTROL =
  "Remove control characters from the name.";
/** Working copy: live-region announcement after a successful rename. */
export function pairedDeviceRenamed(storedName: string): string {
  return `Device renamed to ${storedName}.`;
}

// ---------------------------------------------------------------------------
// Revoke (Feature 76, Task 8). "Spec" strings are the working copy in
// `specs/features/paired-device-management.md`, verbatim. The name is
// interpolated by functions, never by `String.replace`, so a name containing
// `{`, `}` or `$` is shown as typed.
// ---------------------------------------------------------------------------

/** Spec. */
export const PAIRED_DEVICE_REVOKE = "Revoke";
/** Spec: dialog title. */
export const PAIRED_DEVICE_REVOKE_TITLE = "Revoke this device?";
/** Spec: dialog description. */
export function pairedDeviceRevokeDescription(name: string): string {
  return `${name} will be refused from now on. It can pair again with a new code. Your other devices are not affected. Unsaved edits on that device will be lost.`;
}
/** Spec: dialog confirm button. */
export function pairedDeviceRevokeConfirm(name: string): string {
  return `Revoke ${name}`;
}
/** Spec: dialog cancel button. */
export function pairedDeviceRevokeKeep(name: string): string {
  return `Keep ${name}`;
}
/** Spec: announcement after a successful revoke. */
export function pairedDeviceRevoked(name: string): string {
  return `${name} was revoked.`;
}
/** Spec: corrupt, lock-not-acquired and write-failed. */
export const PAIRED_DEVICE_REVOKE_ERROR =
  "Could not revoke this device. It is still paired.";
/** Working copy: accessible name of a row's Revoke button. */
export function pairedDeviceRevokeLabel(name: string): string {
  return `${PAIRED_DEVICE_REVOKE} ${name}`;
}
/** Working copy: the same, when another device has the same name. */
export function pairedDeviceRevokeLabelWithDate(
  name: string,
  formattedDate: string,
): string {
  return `${PAIRED_DEVICE_REVOKE} ${name}, paired ${formattedDate}`;
}
