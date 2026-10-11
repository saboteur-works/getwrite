/**
 * @module unlock-prompt-gate
 *
 * The exact state table of Feature 77 FR-21 for the workspace passphrase
 * prompt, as pure functions over the shared limits state.
 *
 * The prompt may be mounted only when the read says `exempt`, or says
 * `paired` with unlocking not limited, or (read not yet conclusive) the
 * desktop bridge is present. A positive `paired` answer wins over the bridge:
 * a paired answer with unlocking limited never shows the prompt.
 */
import type { SharingLimitsAnswer } from "../../src/store/sharing-limits-transport-service";

type LimitsState = { state: "unknown" } | SharingLimitsAnswer;

/** True when the read positively says unlocking is limited for this caller. */
export function isUnlockingLimited(state: LimitsState): boolean {
  return state.state === "paired" && state.limits.unlocking;
}

/** True when the passphrase prompt may be mounted in this state. */
export function isUnlockPromptAllowed(
  state: LimitsState,
  hasDesktopBridge: boolean,
): boolean {
  if (state.state === "exempt") return true;
  if (state.state === "paired") return !state.limits.unlocking;
  return hasDesktopBridge;
}
