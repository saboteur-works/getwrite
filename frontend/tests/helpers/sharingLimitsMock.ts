import type { SharingLimitsAnswer } from "../../src/store/sharing-limits-transport-service";
import type { Limits } from "../../src/lib/sharing/limits-store";

type LimitsState = { state: "unknown" } | SharingLimitsAnswer;

/** The four states every Task 18 control is tested in. */
export const LIMITS_CASES: ReadonlyArray<{
  name: string;
  state: LimitsState;
  limited: (key: keyof Limits) => boolean;
}> = [
  { name: "exempt", state: { state: "exempt" }, limited: () => false },
  { name: "unknown", state: { state: "unknown" }, limited: () => false },
  {
    name: "paired, limit off",
    state: { state: "paired", limits: allLimits(false) },
    limited: () => false,
  },
  {
    name: "paired, limit on",
    state: { state: "paired", limits: allLimits(true) },
    limited: () => true,
  },
];

function allLimits(value: boolean): Limits {
  return {
    locking: value,
    unlocking: value,
    encryptionChanges: value,
    projectDeletion: value,
    permanentDeletion: value,
  } as Limits;
}
