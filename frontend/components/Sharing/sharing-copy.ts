/**
 * All user-visible sharing strings (Feature 75). Working copy from
 * `specs/features/home-network-sharing.md`; used verbatim. Later tasks add
 * their strings here as named exports.
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
// Desktop sharing controls (Task 20). Strings marked "spec" are the spec's
// working copy, used verbatim; strings marked "working copy" are this task's
// own wording and are proposals, not owner-approved copy.
// ---------------------------------------------------------------------------

/** FR-7(a), spec. */
export const SHARING_STATEMENT_UNENCRYPTED =
  "Sharing uses unencrypted HTTP. Turn it on only on a network you trust.";

/** FR-7(b), spec. */
export const SHARING_STATEMENT_AVAILABILITY =
  "Your other devices can reach your projects only while GetWrite is open and awake on this computer, and the device is on the same network.";

/**
 * FR-30, spec. A separable piece of copy: Feature 77 removes it (delete this
 * constant and its render sites when that feature ships).
 */
export const INTERIM_EXPOSURE_NOTE =
  "For now, a paired device can also lock, unlock and delete your projects.";

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
/** Working copy: FR-27, shown when the paired-device store is damaged. */
export const SHARING_STORE_CORRUPT =
  "The list of paired devices is damaged, so every other device is refused until it is repaired.";
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
