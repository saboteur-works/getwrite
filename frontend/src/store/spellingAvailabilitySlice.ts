/**
 * @module spellingAvailabilitySlice
 *
 * Why the spell checker is unavailable (spell-checker FR-19, FR-23, FR-26).
 * This slice holds only the two reasons that are not project data: the
 * worker or engine failed, and the browser is older than the minimum. The
 * lists and alias-table reasons are derived from `spellingSlice` by
 * `selectSpellCheckerState`, so they clear when the data loads and cannot
 * drift from it. The slice is separate from `spellingSlice` because that one
 * resets on every project change, while an engine or browser failure belongs
 * to the device, not the project.
 *
 * `selectSpellCheckerState` is the single gate: `active` is the only state in
 * which decorations may be produced; `paused` carries every reason. A
 * `loading` reason (nothing failed yet) pauses the checker but is not an
 * unavailable reason, so it raises no toast. Every other reason is surfaced by
 * `startUnavailableToasts` once per reason until it clears, and remains in
 * the selector for the status line (rendered by the App Settings row).
 */
import {
  createSelector,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { SpellClient } from "../lib/spelling/spell-client";
import { toastService } from "../lib/toast-service";
import type { SpellingLoadStatus } from "./spellingSlice";

/** Lowest Chrome version the app supports (`.browserslistrc`); not raised. */
export const MIN_CHROME_VERSION = 67;

type UnavailableKind =
  | "lists-failed"
  | "alias-table-failed"
  | "engine-failed"
  | "browser-unsupported";

type PausedKind = UnavailableKind | "loading";

export interface PausedReason {
  kind: PausedKind;
  /** Human-readable reason for the status line and toast. */
  message: string;
}

export type SpellCheckerState =
  | { status: "active" }
  | { status: "paused"; reasons: PausedReason[] };

export interface UnsupportedBrowser {
  detected: number;
  minimum: number;
}

interface SpellingAvailabilityState {
  /** Reason the worker or engine failed, or null. */
  engineFailure: string | null;
  /** Set when the browser is below the minimum, or null. */
  unsupportedBrowser: UnsupportedBrowser | null;
}

const initialState: SpellingAvailabilityState = {
  engineFailure: null,
  unsupportedBrowser: null,
};

const slice = createSlice({
  name: "spellingAvailability",
  initialState,
  reducers: {
    engineFailed(state, action: PayloadAction<string>) {
      state.engineFailure = action.payload;
    },
    clearEngineFailure(state) {
      state.engineFailure = null;
    },
    browserUnsupported(state, action: PayloadAction<UnsupportedBrowser>) {
      state.unsupportedBrowser = action.payload;
    },
    clearBrowserUnsupported(state) {
      state.unsupportedBrowser = null;
    },
  },
});

export const {
  engineFailed,
  clearEngineFailure,
  browserUnsupported,
  clearBrowserUnsupported,
} = slice.actions;
export default slice.reducer;

/**
 * Returns the detected and minimum versions when `userAgent` names a Chrome
 * (or Chromium WebView) older than `MIN_CHROME_VERSION`; null otherwise,
 * including when no Chrome version can be read (not provably unsupported).
 */
export function detectUnsupportedBrowser(
  userAgent: string,
): UnsupportedBrowser | null {
  const match = /\bChrome\/(\d+)/.exec(userAgent.slice(0, 512));
  if (!match) return null;
  const detected = Number(match[1]);
  return detected < MIN_CHROME_VERSION
    ? { detected, minimum: MIN_CHROME_VERSION }
    : null;
}

/** Records the client's `unavailable` events as an engine failure. */
export function connectSpellClientAvailability(
  client: Pick<SpellClient, "subscribe">,
  dispatch: (action: ReturnType<typeof engineFailed>) => unknown,
): () => void {
  return client.subscribe((event) => {
    if (event.type === "unavailable") dispatch(engineFailed(event.reason));
  });
}

interface AvailabilityRoot {
  spelling: {
    status: SpellingLoadStatus;
    errorMessage: string;
    aliasTableStatus: SpellingLoadStatus;
    aliasTableErrorMessage: string;
  };
  spellingAvailability: SpellingAvailabilityState;
}

const select = {
  listsStatus: (s: AvailabilityRoot) => s.spelling.status,
  listsError: (s: AvailabilityRoot) => s.spelling.errorMessage,
  aliasStatus: (s: AvailabilityRoot) => s.spelling.aliasTableStatus,
  aliasError: (s: AvailabilityRoot) => s.spelling.aliasTableErrorMessage,
  engine: (s: AvailabilityRoot) => s.spellingAvailability.engineFailure,
  browser: (s: AvailabilityRoot) => s.spellingAvailability.unsupportedBrowser,
};

/** Pauses on a list status: failed is a reason, not-loaded is loading. */
function listReason(
  status: SpellingLoadStatus,
  kind: "lists-failed" | "alias-table-failed",
  label: string,
  error: string,
): PausedReason | null {
  if (status === "loaded") return null;
  if (status === "failed") {
    return {
      kind,
      message: `${label} could not be loaded${error ? ` (${error})` : ""}.`,
    };
  }
  return { kind: "loading", message: `${label} is loading.` };
}

/**
 * The checker's state. `active` only when both lists and the alias table are
 * loaded, the engine has not failed, and the browser is supported. An empty
 * loaded table is `loaded`, so it underlines as normal.
 */
export const selectSpellCheckerState = createSelector(
  [
    select.listsStatus,
    select.listsError,
    select.aliasStatus,
    select.aliasError,
    select.engine,
    select.browser,
  ],
  (
    listsStatus,
    listsError,
    aliasStatus,
    aliasError,
    engine,
    browser,
  ): SpellCheckerState => {
    const reasons: PausedReason[] = [];
    const lists = listReason(
      listsStatus,
      "lists-failed",
      "The project's spelling lists",
      listsError,
    );
    const alias = listReason(
      aliasStatus,
      "alias-table-failed",
      "The entity names",
      aliasError,
    );
    // Loading is reported once, even when both inputs are still loading.
    if (lists?.kind !== "loading" || alias?.kind !== "loading") {
      if (lists) reasons.push(lists);
      if (alias) reasons.push(alias);
    } else {
      reasons.push({ kind: "loading", message: "Spelling data is loading." });
    }
    if (engine !== null) {
      reasons.push({
        kind: "engine-failed",
        message: `The spell checker stopped working (${engine}).`,
      });
    }
    if (browser !== null) {
      reasons.push({
        kind: "browser-unsupported",
        message: `Spell checking needs Chrome ${browser.minimum} or newer; this is Chrome ${browser.detected}.`,
      });
    }
    return reasons.length === 0
      ? { status: "active" }
      : { status: "paused", reasons };
  },
);

interface ToastableStore {
  getState: () => AvailabilityRoot;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Raises one `toastService` toast per unavailable kind and re-arms the kind
 * only after it has cleared, so a reason that persists never toasts twice.
 * Reasons already present at start are toasted. Returns an unsubscribe.
 */
export function startUnavailableToasts(store: ToastableStore): () => void {
  const toasted = new Set<PausedKind>();
  const sync = (): void => {
    const state = selectSpellCheckerState(store.getState());
    const present = new Map<PausedKind, PausedReason>();
    if (state.status === "paused") {
      for (const reason of state.reasons) {
        if (reason.kind !== "loading") present.set(reason.kind, reason);
      }
    }
    for (const kind of [...toasted]) {
      if (!present.has(kind)) toasted.delete(kind);
    }
    for (const [kind, reason] of present) {
      if (toasted.has(kind)) continue;
      toasted.add(kind);
      toastService.error(reason.message, undefined, {
        id: `spell-checker-${kind}`,
      });
    }
  };
  sync();
  return store.subscribe(sync);
}
