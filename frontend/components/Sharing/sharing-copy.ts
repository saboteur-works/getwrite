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
