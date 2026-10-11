/**
 * @module limit-gate
 *
 * Pure check used by the disabled-with-reason controls (Feature 77, FR-24):
 * a control is limited only when the shared read positively says `paired` and
 * that limit is on. `unknown` and `exempt` never limit.
 */
import type { SharingLimitsAnswer } from "../../src/store/sharing-limits-transport-service";
import type { LimitKey } from "../../src/lib/sharing/limits-store";

type LimitsState = { state: "unknown" } | SharingLimitsAnswer;

/** True when this caller is paired and `limit` is on. */
export function isLimitOn(state: LimitsState, limit: LimitKey): boolean {
  return state.state === "paired" && state.limits[limit];
}
