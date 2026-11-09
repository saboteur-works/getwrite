/**
 * @module share-session
 *
 * Pure reducer for the Android share flow (Feature 107): receive a share,
 * queue further shares behind it with a visible count, choose a project, run,
 * finish, cancel, refuse the whole share, or discard everything when an unlock
 * is declined or limited.
 *
 * The state is plain data held in memory only. The reducer touches no storage,
 * no `localStorage`, and no plugin; the duplicate guard here (`shareId` already
 * current, queued or finished) covers one process only and is not a substitute
 * for the native consume of the share intent (FR-14).
 *
 * Project ids are the on-disk DIRECTORY ids that the Capture box's project
 * choice produces, never `project.id`.
 *
 * An unlock prompt cannot occur on native (an encrypted-marked project is
 * refused first), so the `unlocking` branch is exercised by the reducer test
 * only and is not reachable on native.
 *
 * Imports only types, so every build can bundle it (no React, no `node:*`).
 */
import type {
  ShareReceivedEvent,
  ShareResult,
} from "./api/share-capture-types";

/** Where the current share stands. */
export type ShareSessionPhase =
  | "idle"
  | "choosing"
  | "needs-project"
  | "running"
  | "unlocking"
  | "ended";

/** How the last share ended, shown until dismissed. */
export type ShareSessionOutcome =
  | { kind: "result"; result: ShareResult }
  | { kind: "refused"; message: string }
  | { kind: "discarded"; message: string };

/** The whole session state. Serialisable, in memory only. */
export interface ShareSessionState {
  phase: ShareSessionPhase;
  /** The share being offered, run or held; `null` when idle or ended. */
  current: ShareReceivedEvent | null;
  /** Shares waiting behind the current one, in arrival order. */
  queue: ShareReceivedEvent[];
  /** Always `queue.length`; kept so a view reads the count from the state. */
  queuedCount: number;
  /** Directory id of the chosen project, once chosen. */
  projectId: string | null;
  /** Whether the held share was already retried after an unlock. */
  unlockRetried: boolean;
  /** Set while `phase` is `ended`. */
  outcome: ShareSessionOutcome | null;
  /** Ids of shares that ended, were cancelled or were discarded, this process. */
  finishedShareIds: string[];
}

/** Why an unlock did not go ahead. */
export type UnlockFailureReason = "declined" | "limited";

/** Everything that can happen to the session. */
export type ShareSessionAction =
  | { type: "received"; share: ShareReceivedEvent }
  | { type: "projectsLoaded"; projectIds: string[] }
  | { type: "projectChosen"; projectId: string }
  | { type: "finished"; result: ShareResult }
  | { type: "refused"; reason: string }
  | { type: "cancel" }
  | { type: "unlockRequired"; projectId: string }
  | { type: "unlockSucceeded" }
  | { type: "unlockDeclined"; reason: UnlockFailureReason }
  | { type: "dismiss" };

/** The state with nothing in progress. */
export const INITIAL_SHARE_SESSION: ShareSessionState = {
  phase: "idle",
  current: null,
  queue: [],
  queuedCount: 0,
  projectId: null,
  unlockRetried: false,
  outcome: null,
  finishedShareIds: [],
};

const UNLOCK_MESSAGES: Record<UnlockFailureReason, string> = {
  declined: "Nothing was captured: the project was not unlocked.",
  limited: "Nothing was captured: unlocking is not allowed from this device.",
};

const UNLOCK_AGAIN_MESSAGE =
  "Nothing was captured: the project locked again after it was unlocked.";

/** Makes the queue and its count agree. */
function withQueue(
  state: ShareSessionState,
  queue: ShareReceivedEvent[],
): ShareSessionState {
  return { ...state, queue, queuedCount: queue.length };
}

/** Whether this process has already seen the share id. */
function isKnown(state: ShareSessionState, shareId: string): boolean {
  return (
    state.current?.shareId === shareId ||
    state.queue.some((q) => q.shareId === shareId) ||
    state.finishedShareIds.includes(shareId)
  );
}

/** Offers the next queued share, or returns to idle when there is none. */
function offerNext(state: ShareSessionState): ShareSessionState {
  const [next, ...rest] = state.queue;
  return withQueue(
    {
      ...state,
      phase: next ? "choosing" : "idle",
      current: next ?? null,
      projectId: null,
      unlockRetried: false,
      outcome: null,
    },
    rest,
  );
}

/** Ends the current share with an outcome, leaving the queue. */
function endCurrent(
  state: ShareSessionState,
  current: ShareReceivedEvent,
  outcome: ShareSessionOutcome,
): ShareSessionState {
  return {
    ...state,
    phase: "ended",
    current: null,
    outcome,
    finishedShareIds: [...state.finishedShareIds, current.shareId],
  };
}

/** Drops the current share and every queued one, with a message. */
function discardAll(
  state: ShareSessionState,
  current: ShareReceivedEvent,
  message: string,
): ShareSessionState {
  const ids = [current.shareId, ...state.queue.map((q) => q.shareId)];
  return withQueue(
    {
      ...state,
      phase: "ended",
      current: null,
      outcome: { kind: "discarded", message },
      finishedShareIds: [...state.finishedShareIds, ...ids],
    },
    [],
  );
}

function onReceived(
  state: ShareSessionState,
  share: ShareReceivedEvent,
): ShareSessionState {
  if (isKnown(state, share.shareId)) return state;
  if (state.phase === "idle") {
    return { ...state, phase: "choosing", current: share };
  }
  return withQueue(state, [...state.queue, share]);
}

function onProjectsLoaded(
  state: ShareSessionState,
  projectIds: string[],
): ShareSessionState {
  if (state.phase === "choosing" && projectIds.length === 0) {
    return { ...state, phase: "needs-project" };
  }
  if (state.phase === "needs-project" && projectIds.length > 0) {
    return { ...state, phase: "choosing" };
  }
  return state;
}

function onUnlockRequired(
  state: ShareSessionState,
  projectId: string,
): ShareSessionState {
  const { current } = state;
  if (!current || (state.phase !== "choosing" && state.phase !== "running")) {
    return state;
  }
  if (state.unlockRetried) {
    return discardAll(state, current, UNLOCK_AGAIN_MESSAGE);
  }
  return { ...state, phase: "unlocking", projectId };
}

/**
 * Advances the share session. Actions that do not apply to the current phase
 * return the same state object.
 *
 * @param state - The current session state; never mutated.
 * @param action - What happened.
 * @returns The next state.
 */
export function shareSessionReducer(
  state: ShareSessionState,
  action: ShareSessionAction,
): ShareSessionState {
  const { current } = state;
  switch (action.type) {
    case "received":
      return onReceived(state, action.share);
    case "projectsLoaded":
      return onProjectsLoaded(state, action.projectIds);
    case "projectChosen":
      if (!current || state.phase !== "choosing") return state;
      return { ...state, phase: "running", projectId: action.projectId };
    case "finished":
      if (!current || state.phase !== "running") return state;
      if (action.result.shareId !== current.shareId) return state;
      return endCurrent(state, current, {
        kind: "result",
        result: action.result,
      });
    case "refused":
      if (!current) return state;
      return endCurrent(state, current, {
        kind: "refused",
        message: `Nothing was captured: ${action.reason}`,
      });
    case "cancel":
      if (
        !current ||
        (state.phase !== "choosing" && state.phase !== "needs-project")
      ) {
        return state;
      }
      return offerNext({
        ...state,
        finishedShareIds: [...state.finishedShareIds, current.shareId],
      });
    case "unlockRequired":
      return onUnlockRequired(state, action.projectId);
    case "unlockSucceeded":
      if (!current || state.phase !== "unlocking") return state;
      return { ...state, phase: "running", unlockRetried: true };
    case "unlockDeclined":
      if (!current || state.phase !== "unlocking") return state;
      return discardAll(state, current, UNLOCK_MESSAGES[action.reason]);
    case "dismiss":
      return state.phase === "ended" ? offerNext(state) : state;
    default:
      return state;
  }
}
